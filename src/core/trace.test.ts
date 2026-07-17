/**
 * Tracing tests, including the honest-limit demonstration:
 *  - a single traitor is identified exactly, for all 16 subscribers;
 *  - a coalition whose decoder always decrypts when it can is traced to a
 *    coalition member, and trace-and-revoke then catches the rest;
 *  - an evasive coalition decoder (answers detected probes by coin flip)
 *    can steer the binary search onto an INNOCENT subscriber — the flaw the
 *    collusion exhibit demonstrates, verified here with adversarial coins.
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { randomBytes } from './bytes'
import { buildUserKeyRing, encryptBroadcast, type UserKeyRing } from './broadcast'
import {
  decoderOpens,
  makeProbe,
  makeXorshift,
  pirateDecode,
  probeSelfTest,
  traceTraitor,
} from './trace'
import { N } from './tree'

let master: Uint8Array
let rings: UserKeyRing[]

beforeAll(async () => {
  master = randomBytes(32)
  rings = []
  for (let u = 0; u < N; u++) rings.push(await buildUserKeyRing(master, u))
})

const heads = () => 0 // coin < 0.5 -> decrypt anyway
const tails = () => 1 // coin >= 0.5 -> refuse

describe('probe construction', () => {
  it('probes are real GCM end to end', async () => {
    expect(await probeSelfTest(master, 0)).toBe(true)
    expect(await probeSelfTest(master, 5)).toBe(true)
  })

  it('probe(b): subscriber u decrypts iff u >= b, every corrupted entry still authenticates', async () => {
    const probe = await makeProbe(master, 9, 'boundary 9')
    for (const ring of rings) {
      const answer = await pirateDecode({ rings: [ring] }, probe.bc, 'greedy', heads)
      expect(answer.output !== null).toBe(ring.u >= 9)
      // the entry itself always unwraps — corruption is a dud key, not a broken wrap
      expect(answer.outcomes[0].hadEntry).toBe(true)
    }
  })

  it('probe(0) behaves like a normal broadcast; probe(16) defeats everyone', async () => {
    const clean = await makeProbe(master, 0, 'clean')
    const dead = await makeProbe(master, N, 'dead')
    for (const ring of rings) {
      expect((await pirateDecode({ rings: [ring] }, clean.bc, 'greedy', heads)).output).toBe('clean')
      expect((await pirateDecode({ rings: [ring] }, dead.bc, 'greedy', heads)).output).toBeNull()
    }
  })
})

describe('tracing a single traitor', () => {
  it('identifies every possible lone traitor exactly', async () => {
    for (let u = 0; u < N; u++) {
      const result = await traceTraitor(master, { rings: [rings[u]] }, 'greedy', heads)
      expect(result.accused).toBe(u)
      expect(result.steps.length).toBeLessThanOrEqual(2 + 4) // 2 anchors + log2(16) midpoints
    }
  })

  it('an evasive strategy does not help a lone traitor', async () => {
    // With one key set there is never an actionable disagreement to exploit.
    for (const u of [0, 5, 15]) {
      const result = await traceTraitor(master, { rings: [rings[u]] }, 'evasive', tails)
      expect(result.accused).toBe(u)
    }
  })

  it('a dead box is reported as untraceable, not accused', async () => {
    const result = await traceTraitor(master, { rings: [] }, 'greedy', heads)
    expect(result.accused).toBeNull()
  })
})

describe('coalitions', () => {
  it('always-decrypt coalition: accuses the highest-numbered traitor (sampled pairs)', async () => {
    const pairs: Array<[number, number]> = [
      [0, 1], [0, 15], [3, 12], [5, 6], [7, 8], [10, 14], [13, 15],
    ]
    for (const [a, b] of pairs) {
      const result = await traceTraitor(master, { rings: [rings[a], rings[b]] }, 'greedy', heads)
      expect(result.accused).toBe(b)
    }
  })

  it('trace-and-revoke: catch one, revoke, catch the other, revoke, box dead', async () => {
    const decoder = { rings: [rings[3], rings[12]] }
    const first = await traceTraitor(master, decoder, 'greedy', heads)
    expect(first.accused).toBe(12)
    const revoked = new Set([first.accused!])
    const { bc: bc1 } = await encryptBroadcast(master, 'sd', revoked, 'after one revocation')
    expect(await decoderOpens(decoder, bc1)).toBe('after one revocation') // still alive via #3's keys
    // Probes respect the revocation, so #12's keys are now dead on them too:
    // the second trace pins the OTHER coalition member.
    const second = await traceTraitor(master, decoder, 'greedy', heads, revoked)
    expect(second.accused).toBe(3)
    revoked.add(second.accused!)
    const { bc: bc2 } = await encryptBroadcast(master, 'sd', revoked, 'after both revoked')
    expect(await decoderOpens(decoder, bc2)).toBeNull() // box is dead
  })

  it('evasive coalition, always-refuse coins: still traced to a traitor (the lowest)', async () => {
    const result = await traceTraitor(master, { rings: [rings[3], rings[12]] }, 'evasive', tails)
    expect(result.accused).toBe(3) // refusing detected probes just shifts blame inside the coalition
  })

  it('THE FLAW: evasive coalition with adversarial coins frames an innocent subscriber', async () => {
    // Traitors #3 and #12 (0-indexed). Coins only get consulted on detected
    // probes, i.e. boundaries in (3, 12]. Search path: mid 8 (decrypt),
    // mid 12 (refuse), mid 10 (decrypt), mid 11 (refuse) -> accuses 10.
    const coins = [0, 1, 0, 1]
    let k = 0
    const coin = () => coins[k++ % coins.length]
    const result = await traceTraitor(master, { rings: [rings[3], rings[12]] }, 'evasive', coin)
    expect(result.accused).toBe(10)
    expect([3, 12]).not.toContain(result.accused) // an innocent subscriber accused
  })

  it('evasive coalition detects probes between its keys (and only there)', async () => {
    const decoder = { rings: [rings[3], rings[12]] }
    for (const boundary of [0, 2, 3]) {
      const probe = await makeProbe(master, boundary, 'x')
      expect((await pirateDecode(decoder, probe.bc, 'evasive', tails)).detected).toBe(false)
    }
    for (const boundary of [4, 8, 12]) {
      const probe = await makeProbe(master, boundary, 'x')
      const answer = await pirateDecode(decoder, probe.bc, 'evasive', tails)
      expect(answer.detected).toBe(true)
      expect(answer.canDecrypt).toBe(true) // it could decrypt — refusal is a choice
    }
    // past both keys: cannot decrypt, nothing actionable
    const probe = await makeProbe(master, 13, 'x')
    const answer = await pirateDecode(decoder, probe.bc, 'evasive', tails)
    expect(answer.detected).toBe(false)
    expect(answer.canDecrypt).toBe(false)
  })

  it('xorshift PRNG is deterministic for a given seed', () => {
    const a = makeXorshift(7)
    const b = makeXorshift(7)
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
    const vals = Array.from({ length: 100 }, makeXorshift(123))
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})
