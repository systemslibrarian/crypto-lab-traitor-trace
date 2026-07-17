/**
 * Cover correctness for BOTH methods: for every revocation set tested, the
 * cover subsets partition exactly the non-revoked subscribers — every
 * authorized subscriber lands in exactly one subset, every revoked one in
 * none — and the size bounds from NNL hold.
 */

import { describe, expect, it } from 'vitest'
import { csCover, csCoverBound } from './cs'
import { sdCover, sdCoverBound, sdMember } from './sd'
import { leafNode, isAncestorOrSelf, leavesUnder, N } from './tree'

function csMembership(u: number, cover: number[]): number {
  return cover.filter((node) => isAncestorOrSelf(node, leafNode(u))).length
}

function sdMembership(u: number, cover: ReturnType<typeof sdCover>): number {
  return cover.filter((s) => sdMember(u, s)).length
}

function checkPartition(revoked: Set<number>): void {
  const cs = csCover(revoked)
  const sd = sdCover(revoked)
  for (let u = 0; u < N; u++) {
    const want = revoked.has(u) ? 0 : 1
    expect(csMembership(u, cs), `CS user ${u} revoked=${[...revoked]}`).toBe(want)
    expect(sdMembership(u, sd), `SD user ${u} revoked=${[...revoked]}`).toBe(want)
  }
  expect(cs.length).toBeLessThanOrEqual(csCoverBound(revoked.size))
  expect(sd.length).toBeLessThanOrEqual(sdCoverBound(revoked.size))
}

describe('subset covers partition the non-revoked subscribers', () => {
  it('nobody revoked', () => {
    expect(csCover(new Set())).toEqual([1])
    expect(sdCover(new Set())).toEqual([{ i: 1, j: null }])
    checkPartition(new Set())
  })

  it('every single revocation', () => {
    for (let u = 0; u < N; u++) checkPartition(new Set([u]))
  })

  it('every pair of revocations', () => {
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) checkPartition(new Set([a, b]))
    }
  })

  it('random revocation sets of every size', () => {
    let seed = 0xc0ffee
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x80000000
    }
    for (let r = 3; r <= N; r++) {
      for (let trial = 0; trial < 40; trial++) {
        const revoked = new Set<number>()
        while (revoked.size < r) revoked.add(Math.floor(rand() * N))
        checkPartition(revoked)
      }
    }
  })

  it('everyone revoked -> empty covers', () => {
    const all = new Set([...Array(N).keys()])
    expect(csCover(all)).toEqual([])
    expect(sdCover(all)).toEqual([])
  })

  it('the headline example: revoke subscribers #7 and #12 (1-indexed)', () => {
    const revoked = new Set([6, 11]) // 0-indexed
    const cs = csCover(revoked)
    const sd = sdCover(revoked)
    // Real numbers for the exact construction: CS needs 6 wraps, SD needs 2,
    // per-recipient needs 14. These are the figures the UI must show.
    expect(cs.length).toBe(6)
    expect(sd.length).toBe(2)
    checkPartition(revoked)
  })

  it('SD cover subsets are well-formed (j a strict descendant of i)', () => {
    for (let a = 0; a < N; a++) {
      for (let b = a + 1; b < N; b++) {
        for (const s of sdCover(new Set([a, b]))) {
          if (s.j === null) continue
          expect(s.j).not.toBe(s.i)
          expect(isAncestorOrSelf(s.i, s.j)).toBe(true)
          expect(leavesUnder(s.i).length).toBeGreaterThan(leavesUnder(s.j).length)
        }
      }
    }
  })
})
