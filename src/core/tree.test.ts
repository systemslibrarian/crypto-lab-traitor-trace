import { describe, expect, it } from 'vitest'
import {
  depth,
  isAncestorOrSelf,
  isLeaf,
  lca,
  leafIndex,
  leafNode,
  leavesUnder,
  N,
  parent,
  pathToRoot,
  ROOT,
} from './tree'

describe('tree arithmetic', () => {
  it('maps subscribers to leaves and back', () => {
    for (let u = 0; u < N; u++) {
      expect(leafNode(u)).toBe(16 + u)
      expect(leafIndex(leafNode(u))).toBe(u)
      expect(isLeaf(leafNode(u))).toBe(true)
    }
    expect(() => leafNode(16)).toThrow()
    expect(() => leafNode(-1)).toThrow()
    expect(() => leafIndex(5)).toThrow()
  })

  it('computes depths', () => {
    expect(depth(ROOT)).toBe(0)
    expect(depth(2)).toBe(1)
    expect(depth(3)).toBe(1)
    expect(depth(15)).toBe(3)
    expect(depth(16)).toBe(4)
    expect(depth(31)).toBe(4)
  })

  it('walks paths to the root', () => {
    expect(pathToRoot(23)).toEqual([23, 11, 5, 2, 1])
    expect(pathToRoot(1)).toEqual([1])
    for (let u = 0; u < N; u++) {
      const p = pathToRoot(leafNode(u))
      expect(p).toHaveLength(5)
      expect(p[0]).toBe(leafNode(u))
      expect(p[4]).toBe(ROOT)
      for (let k = 1; k < p.length; k++) expect(p[k]).toBe(parent(p[k - 1]))
    }
  })

  it('answers ancestor queries', () => {
    expect(isAncestorOrSelf(1, 23)).toBe(true)
    expect(isAncestorOrSelf(2, 23)).toBe(true)
    expect(isAncestorOrSelf(3, 23)).toBe(false)
    expect(isAncestorOrSelf(23, 23)).toBe(true)
    expect(isAncestorOrSelf(23, 11)).toBe(false) // child is not an ancestor
    expect(isAncestorOrSelf(4, 5)).toBe(false) // same depth, different node
  })

  it('computes LCAs', () => {
    expect(lca(23, 28)).toBe(1)
    expect(lca(16, 17)).toBe(8)
    expect(lca(22, 23)).toBe(11)
    expect(lca(11, 23)).toBe(11)
    expect(lca(1, 31)).toBe(1)
  })

  it('enumerates leaves under a node', () => {
    expect(leavesUnder(ROOT)).toEqual([...Array(16).keys()])
    expect(leavesUnder(2)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(leavesUnder(11)).toEqual([6, 7])
    expect(leavesUnder(23)).toEqual([7])
  })
})
