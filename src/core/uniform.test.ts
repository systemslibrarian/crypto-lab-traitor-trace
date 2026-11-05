import { describe, expect, it } from 'vitest'

import { DRAW_RANGE, rejectionLimit, uniformBelow, type Uint32Source } from './uniform'

/**
 * A source that hands out exactly the values it was given, counts the draws, and THROWS
 * when it runs dry. Repeating its last value would make a wrong bound spin forever
 * instead of failing, which is how a boundary test stops being one.
 */
function scripted(values: readonly number[]): { source: Uint32Source; draws: () => number } {
  let index = 0
  return {
    source: (out) => {
      if (index >= values.length) throw new Error(`the scripted source ran dry after ${index} draws`)
      out[0] = values[index]
      if (out[0] !== values[index]) throw new Error(`${values[index]} does not fit a 32-bit draw`)
      index += 1
    },
    draws: () => index,
  }
}

/** Derived here by a different route than the code's: floor division, not remainder. */
function expectedLimit(bound: number): number {
  return Math.floor(DRAW_RANGE / bound) * bound
}

describe('uniform bounded draws', () => {
  it('accepts exactly a whole number of copies of the bound, so every residue has equal pre-images', () => {
    // This IS the uniformity argument rather than a sample of it: an accepted range that
    // is an exact multiple of the bound gives every residue the same count, and the
    // rejected tail is smaller than one more copy of the bound.
    for (const bound of [1, 2, 3, 5, 999_999, 0xffff_ffff, DRAW_RANGE]) {
      const limit = rejectionLimit(bound)
      expect(limit).toBe(expectedLimit(bound))
      expect(limit % bound).toBe(0)
      expect(limit / bound).toBe(Math.floor(DRAW_RANGE / bound))
      expect(DRAW_RANGE - limit).toBeLessThan(bound)
    }
  })

  it('measures the tail the old modulo favoured', () => {
    // 2^32 mod 999999 = 971590, so under `% 999_999` the first 971,590 seeds were each
    // reachable by 4,295 draws and the rest by 4,294. That is the bias, stated.
    expect(DRAW_RANGE % 999_999).toBe(971_590)
    expect(DRAW_RANGE - rejectionLimit(999_999)).toBe(971_590)
  })

  it('spends a draw on a value at the limit, and returns the next one below it', () => {
    const bound = 999_999
    const limit = expectedLimit(bound)
    expect(limit).toBe(4_293_995_706)
    const { source, draws } = scripted([limit, limit + 7, 1_000_000])
    expect(uniformBelow(bound, source)).toBe(1)
    expect(draws()).toBe(3)
  })

  it('accepts the value immediately below the limit, on the first draw', () => {
    const bound = 999_999
    const { source, draws } = scripted([expectedLimit(bound) - 1])
    expect(uniformBelow(bound, source)).toBe(999_998)
    expect(draws()).toBe(1)
  })

  it('maps a contiguous block of accepted draws onto each residue equally often', () => {
    const counts = new Array<number>(5).fill(0)
    for (let value = 0; value < 5 * 400; value += 1) {
      counts[uniformBelow(5, scripted([value]).source)] += 1
    }
    expect(counts).toEqual([400, 400, 400, 400, 400])
  })

  it('refuses a bound it cannot draw uniformly', () => {
    for (const bound of [0, -1, 1.5, Number.NaN, DRAW_RANGE + 1]) {
      expect(() => uniformBelow(bound, scripted([0]).source)).toThrow(/bound must be an integer/)
    }
  })

  it('draws from the real CSPRNG by default, in range', () => {
    for (let i = 0; i < 50; i += 1) {
      const value = uniformBelow(999_999)
      expect(Number.isInteger(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(999_999)
    }
  })
})
