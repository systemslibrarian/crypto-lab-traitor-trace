/**
 * Key-derivation consistency: for every cover subset, every member
 * subscriber derives byte-for-byte the same key the center used, and every
 * non-member derivation fails closed (null) — for both CS and SD.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { bytesEq, randomBytes } from './bytes'
import { csCover, csNodeKey, csUserKeys } from './cs'
import {
  sdCover,
  sdMember,
  sdSubsetKey,
  sdUserDeriveKey,
  sdUserKeys,
  type SDUserKeys,
} from './sd'
import { isAncestorOrSelf, leafNode, N } from './tree'

let master: Uint8Array
let sdRings: SDUserKeys[]
let csRings: Map<number, Uint8Array>[]

beforeAll(async () => {
  master = randomBytes(32)
  sdRings = []
  csRings = []
  for (let u = 0; u < N; u++) {
    sdRings.push(await sdUserKeys(master, u))
    csRings.push(await csUserKeys(master, u))
  }
})

describe('complete-subtree keys', () => {
  it('each subscriber holds exactly its 5 path keys and they match the center', async () => {
    for (let u = 0; u < N; u++) {
      expect(csRings[u].size).toBe(5)
      for (const [node, key] of csRings[u]) {
        expect(isAncestorOrSelf(node, leafNode(u))).toBe(true)
        expect(bytesEq(key, await csNodeKey(master, node))).toBe(true)
      }
    }
  })

  it('cover keys are reachable exactly by cover membership', async () => {
    const revoked = new Set([2, 9, 10])
    const cover = csCover(revoked)
    for (let u = 0; u < N; u++) {
      const reachable = cover.filter((node) => csRings[u].has(node))
      expect(reachable.length).toBe(revoked.has(u) ? 0 : 1)
    }
  })
})

describe('subset-difference keys (GGM labels)', () => {
  it('each subscriber stores 10 labels (log^2 N / 2 shape) plus the full key', () => {
    for (let u = 0; u < N; u++) expect(sdRings[u].labels.length).toBe(10)
  })

  it('members derive the center key; non-members fail closed — across revocation pairs', async () => {
    // Every LCA depth and both adjacency extremes are represented.
    const pairs: Array<[number, number]> = [
      [0, 1], [0, 15], [2, 3], [3, 12], [4, 6], [6, 11], [7, 8], [9, 13], [14, 15],
    ]
    for (const [a, b] of pairs) {
      {
        const cover = sdCover(new Set([a, b]))
        for (const s of cover) {
          const centerKey = await sdSubsetKey(master, s)
          for (let u = 0; u < N; u++) {
            const derived = await sdUserDeriveKey(sdRings[u], s)
            if (sdMember(u, s)) {
              expect(derived, `user ${u} should derive S(${s.i},${s.j})`).not.toBeNull()
              expect(bytesEq(derived!, centerKey)).toBe(true)
            } else {
              expect(derived, `user ${u} must NOT derive S(${s.i},${s.j})`).toBeNull()
            }
          }
        }
      }
    }
  })

  it('the full-set key is shared by everyone', async () => {
    const s = { i: 1, j: null }
    const centerKey = await sdSubsetKey(master, s)
    for (let u = 0; u < N; u++) {
      const derived = await sdUserDeriveKey(sdRings[u], s)
      expect(derived).not.toBeNull()
      expect(bytesEq(derived!, centerKey)).toBe(true)
    }
  })
})
