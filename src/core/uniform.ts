/**
 * A uniform integer below a bound, by rejection.
 *
 * `src/ui/collusion.ts` drew its scenario seed with
 *
 *     1 + (crypto.getRandomValues(new Uint32Array(1))[0] % 999_999)
 *
 * and CodeQL flagged the modulo: js/biased-cryptographic-random, high,
 * src/ui/collusion.ts:68, raised 2026-10-28.
 *
 * The bias is real and small. 2^32 is not a multiple of 999,999 — the remainder is
 * 971,590 — so seeds 1 to 971,590 were reachable by one more 32-bit draw than seeds
 * 971,591 to 999,999, about one part in 4,294. Nothing here is a key: the seed is
 * published in the scenario URL on purpose, because reproducibility is the feature.
 *
 * It is worth a function rather than a comment anyway. A lab that teaches tracing
 * should not leave a skewed draw in the one place a reader looks to see how its
 * randomness is made, and the correction is four lines: reject the tail that no
 * multiple of the bound can reach, and draw again.
 */

/** The number of distinct values one 32-bit draw can take. */
export const DRAW_RANGE = 0x1_0000_0000

/** Fills `out` with cryptographically random 32-bit values. */
export type Uint32Source = (out: Uint32Array<ArrayBuffer>) => void

export const cryptoUint32Source: Uint32Source = (out) => {
  crypto.getRandomValues(out)
}

/**
 * The largest multiple of `bound` that fits in one 32-bit draw. Draws at or above it
 * are the tail that would make the low residues likelier, so they are rejected.
 */
export function rejectionLimit(bound: number): number {
  return DRAW_RANGE - (DRAW_RANGE % bound)
}

/** A uniform integer in [0, bound), with no modulo bias for any bound in range. */
export function uniformBelow(bound: number, source: Uint32Source = cryptoUint32Source): number {
  if (!Number.isInteger(bound) || bound < 1 || bound > DRAW_RANGE) {
    throw new RangeError(`bound must be an integer in [1, ${DRAW_RANGE}]`)
  }
  const limit = rejectionLimit(bound)
  const draw = new Uint32Array(1) as Uint32Array<ArrayBuffer>
  for (;;) {
    source(draw)
    if (draw[0] < limit) return draw[0] % bound
  }
}
