/**
 * Complete Subtree method (Naor–Naor–Lotspiech 2001, §3.1).
 *
 * Every node of the tree gets an independent key (here derived from the
 * center's master seed with HKDF-SHA-256, one derivation per node). A
 * subscriber holds the keys of the log N + 1 nodes on its leaf-to-root path.
 * To broadcast with a set R of leaves revoked, the center covers the
 * non-revoked leaves with the maximal subtrees containing no revoked leaf
 * and wraps the session key once per cover subtree.
 */

import { utf8 } from './bytes'
import { hkdfSha256 } from './primitives'
import { isLeaf, leafNode, left, N, pathToRoot, right, ROOT } from './tree'

const NO_SALT = new Uint8Array(0)

// Node-key memo per master seed (probes re-derive all 16 leaf keys; this
// turns those repeat HKDF calls into map hits — same bytes, same crypto).
const nodeKeyCache = new WeakMap<Uint8Array, Map<number, Promise<Uint8Array>>>()

/** Center-side key for one tree node. */
export function csNodeKey(master: Uint8Array, node: number): Promise<Uint8Array> {
  let perMaster = nodeKeyCache.get(master)
  if (!perMaster) {
    perMaster = new Map()
    nodeKeyCache.set(master, perMaster)
  }
  let key = perMaster.get(node)
  if (!key) {
    key = hkdfSha256(master, NO_SALT, utf8(`crypto-lab-traitor-trace/cs-node/${node}`), 32)
    perMaster.set(node, key)
  }
  return key
}

/** The key material subscriber u walks away from setup with: its path keys. */
export async function csUserKeys(
  master: Uint8Array,
  u: number,
): Promise<Map<number, Uint8Array>> {
  const keys = new Map<number, Uint8Array>()
  for (const node of pathToRoot(leafNode(u))) {
    keys.set(node, await csNodeKey(master, node))
  }
  return keys
}

/**
 * Complete-subtree cover: the children of Steiner-tree nodes that are not
 * themselves on the Steiner tree of the revoked leaves. Returns tree nodes,
 * ascending. Empty revocation set -> [ROOT]; everyone revoked -> [].
 */
export function csCover(revoked: ReadonlySet<number>): number[] {
  if (revoked.size === 0) return [ROOT]
  const steiner = new Set<number>()
  for (const u of revoked) {
    for (const node of pathToRoot(leafNode(u))) steiner.add(node)
  }
  const cover: number[] = []
  for (const node of steiner) {
    if (isLeaf(node)) continue
    for (const child of [left(node), right(node)]) {
      if (!steiner.has(child)) cover.push(child)
    }
  }
  return cover.sort((a, b) => a - b)
}

/** Upper bound on cover size for r revoked out of N=16: r·log2(N/r). */
export function csCoverBound(r: number): number {
  if (r === 0) return 1
  return Math.max(1, Math.ceil(r * Math.log2(N / r)))
}
