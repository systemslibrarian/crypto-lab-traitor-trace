/**
 * Subset Difference method (Naor–Naor–Lotspiech 2001, §3.2).
 *
 * A subset S_{i,j} is "all leaves under node i EXCEPT those under its
 * descendant j". Keys come from a GGM tree of labels: each internal node i
 * gets an initial label; walking one step left/right applies a PRF
 * (HMAC-SHA-256 here), and the subset key for S_{i,j} is a third PRF branch
 * of the label reached at j. A subscriber u stores, for every internal node
 * i on its path, the labels of the nodes that "hang off" the path from i to
 * u — enough to derive the key of every S_{i,j} it belongs to, and provably
 * nothing else. For N=16 that is 4+3+2+1 = 10 labels plus one "nobody
 * revoked" key.
 *
 * Cover algorithm: the NNL reduction of the Steiner tree of revoked leaves,
 * which yields at most 2r-1 subsets for r revoked subscribers.
 */

import { utf8 } from './bytes'
import { hkdfSha256, hmacSha256 } from './primitives'
import { depth, isAncestorOrSelf, isLeaf, lca, leafNode, left, right, ROOT } from './tree'

const NO_SALT = new Uint8Array(0)
const PRG_LEFT = utf8('left')
const PRG_RIGHT = utf8('right')
const PRG_KEY = utf8('key')

/** j === null means "the full subtree of i, nobody excluded" (used when r=0). */
// [extension] point: Layered SD (Halevy-Shamir LSD) reuses this subset shape
// with a restricted (i,j) family; only sdCover and sdUserKeys would change.
export interface SDSubset {
  i: number
  j: number | null
}

/** True if subscriber u belongs to S_{i,j}. */
export function sdMember(u: number, s: SDSubset): boolean {
  const leaf = leafNode(u)
  if (!isAncestorOrSelf(s.i, leaf)) return false
  if (s.j === null) return true
  return !isAncestorOrSelf(s.j, leaf)
}

/** Center-side initial label of internal node i (independent per node). */
export async function sdInitialLabel(master: Uint8Array, i: number): Promise<Uint8Array> {
  return hkdfSha256(master, NO_SALT, utf8(`crypto-lab-traitor-trace/sd-label/${i}`), 32)
}

/** The dedicated key used when the revocation set is empty. Everyone holds it. */
export async function sdFullKey(master: Uint8Array): Promise<Uint8Array> {
  return hkdfSha256(master, NO_SALT, utf8('crypto-lab-traitor-trace/sd-full'), 32)
}

/** Walk a GGM label from node `from` down to descendant `to` (L/R PRF steps). */
export async function sdLabelWalk(
  label: Uint8Array,
  from: number,
  to: number,
): Promise<Uint8Array> {
  // Recover the branch directions by reading `to`'s bits below `from`'s depth.
  const steps = depth(to) - depth(from)
  let out = label
  for (let s = steps - 1; s >= 0; s--) {
    const goRight = ((to >> s) & 1) === 1
    out = await hmacSha256(out, goRight ? PRG_RIGHT : PRG_LEFT)
  }
  return out
}

/** Center-side key for subset S_{i,j}. */
export async function sdSubsetKey(master: Uint8Array, s: SDSubset): Promise<Uint8Array> {
  if (s.j === null) return sdFullKey(master)
  const initial = await sdInitialLabel(master, s.i)
  const labelAtJ = await sdLabelWalk(initial, s.i, s.j)
  return hmacSha256(labelAtJ, PRG_KEY)
}

export interface SDUserLabel {
  i: number // subtree root the label belongs to
  a: number // the node hanging off the path from i to the subscriber's leaf
  label: Uint8Array
}

export interface SDUserKeys {
  labels: SDUserLabel[]
  fullKey: Uint8Array
}

/** Key material subscriber u receives at setup (10 labels + full key for N=16). */
export async function sdUserKeys(master: Uint8Array, u: number): Promise<SDUserKeys> {
  const leaf = leafNode(u)
  const labels: SDUserLabel[] = []
  for (let i = ROOT; !isLeaf(i); ) {
    const goRight = isAncestorOrSelf(right(i), leaf)
    // Every node on the path from i down to the leaf sheds one sibling; u
    // gets the label of each such sibling, derived from i's initial label.
    const initial = await sdInitialLabel(master, i)
    for (let n = i; !isLeaf(n); ) {
      const nextOnPath = isAncestorOrSelf(right(n), leaf) ? right(n) : left(n)
      const sibling = nextOnPath === left(n) ? right(n) : left(n)
      labels.push({ i, a: sibling, label: await sdLabelWalk(initial, i, sibling) })
      n = nextOnPath
    }
    i = goRight ? right(i) : left(i)
  }
  return { labels, fullKey: await sdFullKey(master) }
}

/**
 * Subscriber-side derivation of the key for S_{i,j}: find the stored label
 * whose node is an ancestor-or-self of j, walk down to j, apply the key
 * branch. Returns null (fail-closed) when u is not a member of the subset.
 */
export async function sdUserDeriveKey(
  keys: SDUserKeys,
  s: SDSubset,
): Promise<Uint8Array | null> {
  if (s.j === null) return keys.fullKey
  const j = s.j
  const entry = keys.labels.find((e) => e.i === s.i && isAncestorOrSelf(e.a, j))
  if (!entry) return null
  const labelAtJ = await sdLabelWalk(entry.label, entry.a, j)
  return hmacSha256(labelAtJ, PRG_KEY)
}

/**
 * NNL subset-difference cover: at most 2r-1 subsets whose disjoint union is
 * exactly the set of non-revoked leaves. Empty revocation -> the full set.
 */
export function sdCover(revoked: ReadonlySet<number>): SDSubset[] {
  if (revoked.size === 0) return [{ i: ROOT, j: null }]
  // Current "leaves" of the reduced Steiner tree, sorted left to right.
  let nodes = [...revoked].sort((a, b) => a - b).map(leafNode)
  const cover: SDSubset[] = []
  while (nodes.length > 1) {
    // The adjacent pair with the deepest LCA merges first (no other Steiner
    // node can sit between them).
    let best = 0
    let bestDepth = -1
    for (let k = 0; k + 1 < nodes.length; k++) {
      const d = depth(lca(nodes[k], nodes[k + 1]))
      if (d > bestDepth) {
        bestDepth = d
        best = k
      }
    }
    const vi = nodes[best]
    const vj = nodes[best + 1]
    const v = lca(vi, vj)
    const vl = left(v)
    const vr = right(v)
    if (vl !== vi) cover.push({ i: vl, j: vi })
    if (vr !== vj) cover.push({ i: vr, j: vj })
    nodes.splice(best, 2, v)
  }
  const last = nodes[0]
  if (last !== ROOT) cover.push({ i: ROOT, j: last })
  return cover
}

/** Upper bound on SD cover size for r revoked: 2r-1 (1 when r=0). */
export function sdCoverBound(r: number): number {
  return r === 0 ? 1 : 2 * r - 1
}
