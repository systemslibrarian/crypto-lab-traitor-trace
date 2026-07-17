/**
 * Binary-tree arithmetic for the 16-subscriber key tree.
 *
 * Nodes use heap numbering: root = 1, children of i are 2i and 2i+1.
 * Leaves are nodes 16..31; subscriber u (0..15) sits at leaf node 16+u.
 */

// [extension] point: N is the single knob for a deeper tree; the crypto core
// is N-generic, only the UI layout assumes 16.
export const N = 16 // number of subscribers / leaves
export const ROOT = 1
export const TREE_DEPTH = 4 // log2(N)

export function leafNode(u: number): number {
  if (u < 0 || u >= N) throw new Error(`subscriber index out of range: ${u}`)
  return N + u
}

export function leafIndex(node: number): number {
  if (!isLeaf(node)) throw new Error(`not a leaf node: ${node}`)
  return node - N
}

export function isLeaf(node: number): boolean {
  return node >= N && node < 2 * N
}

export function parent(node: number): number {
  return node >> 1
}

export function left(node: number): number {
  return 2 * node
}

export function right(node: number): number {
  return 2 * node + 1
}

/** Depth of a node: root = 0, leaves = 4. */
export function depth(node: number): number {
  return 31 - Math.clz32(node)
}

/** Path from a node up to the root, inclusive: [node, parent, ..., 1]. */
export function pathToRoot(node: number): number[] {
  const path: number[] = []
  for (let i = node; i >= 1; i >>= 1) path.push(i)
  return path
}

/** True if `anc` is `node` or an ancestor of `node`. */
export function isAncestorOrSelf(anc: number, node: number): boolean {
  let n = node
  while (n > anc) n >>= 1
  return n === anc
}

/** Lowest common ancestor of two nodes. */
export function lca(a: number, b: number): number {
  let x = a
  let y = b
  while (depth(x) > depth(y)) x >>= 1
  while (depth(y) > depth(x)) y >>= 1
  while (x !== y) {
    x >>= 1
    y >>= 1
  }
  return x
}

/** Subscriber indices (0..15) of all leaves in the subtree rooted at `node`. */
export function leavesUnder(node: number): number[] {
  let lo = node
  let hi = node
  while (!isLeaf(lo)) {
    lo = left(lo)
    hi = right(hi)
  }
  const out: number[] = []
  for (let n = lo; n <= hi; n++) out.push(leafIndex(n))
  return out
}
