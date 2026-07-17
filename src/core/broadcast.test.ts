/**
 * End-to-end broadcast tests: authorized subscribers decrypt through exactly
 * one header entry; revoked subscribers have no usable entry and real
 * AES-GCM keeps them out; nobody's key ring changes across a revocation;
 * pooling revoked keys does not help (collusion resistance of the
 * encryption itself).
 */

import { beforeAll, describe, expect, it } from 'vitest'
import { randomBytes, toHex } from './bytes'
import {
  buildUserKeyRing,
  encryptBroadcast,
  encryptNaivePerRecipient,
  headerBytes,
  subscriberDecrypt,
  usableEntries,
  type Method,
  type UserKeyRing,
} from './broadcast'
import { pirateDecode } from './trace'
import { N } from './tree'

let master: Uint8Array
let rings: UserKeyRing[]

beforeAll(async () => {
  master = randomBytes(32)
  rings = []
  for (let u = 0; u < N; u++) rings.push(await buildUserKeyRing(master, u))
})

const METHODS: Method[] = ['cs', 'sd']

describe('broadcast round trips', () => {
  it('nobody revoked: all 16 decrypt through a single header entry', async () => {
    for (const method of METHODS) {
      const { bc } = await encryptBroadcast(master, method, new Set(), 'hello everyone')
      expect(bc.header.length).toBe(1)
      for (const ring of rings) {
        const r = await subscriberDecrypt(ring, bc)
        expect(r.opened).toBe(true)
        expect(r.plaintext).toBe('hello everyone')
      }
    }
  })

  it('revoked #7/#12 (1-indexed): authorized decrypt, revoked locked out, both methods', async () => {
    const revoked = new Set([6, 11])
    for (const method of METHODS) {
      const { bc } = await encryptBroadcast(master, method, revoked, 'monthly session key inside')
      expect(bc.header.length).toBe(method === 'cs' ? 6 : 2)
      for (const ring of rings) {
        const r = await subscriberDecrypt(ring, bc)
        const usable = await usableEntries(ring, bc)
        if (revoked.has(ring.u)) {
          expect(usable).toEqual([])
          expect(r.entryIndex).toBeNull()
          expect(r.opened).toBe(false)
          expect(r.plaintext).toBeNull()
        } else {
          expect(usable.length).toBe(1) // the cover property, observed
          expect(r.unwrapOk).toBe(true)
          expect(r.opened).toBe(true)
          expect(r.plaintext).toBe('monthly session key inside')
        }
      }
    }
  })

  it('random revocation sets round-trip for both methods', async () => {
    let seed = 42
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      return seed / 0x80000000
    }
    for (let trial = 0; trial < 6; trial++) {
      const revoked = new Set<number>()
      const r = 1 + Math.floor(rand() * 8)
      while (revoked.size < r) revoked.add(Math.floor(rand() * N))
      for (const method of METHODS) {
        const { bc } = await encryptBroadcast(master, method, revoked, `trial ${trial}`)
        for (const ring of rings) {
          const rep = await subscriberDecrypt(ring, bc)
          expect(rep.opened).toBe(!revoked.has(ring.u))
        }
      }
    }
  })

  it('naive per-recipient baseline: 14 wraps for 2 revoked, and byte counts grow linearly', async () => {
    const { bc: full } = await encryptNaivePerRecipient(master, new Set(), 'naive')
    const { bc: two } = await encryptNaivePerRecipient(master, new Set([6, 11]), 'naive')
    expect(full.header.length).toBe(16)
    expect(two.header.length).toBe(14)
    expect(headerBytes(full)).toBe(16 * (12 + 32 + 16))
    for (const ring of rings) {
      const r = await subscriberDecrypt(ring, two)
      expect(r.opened).toBe(![6, 11].includes(ring.u))
    }
  })

  it('key rings are untouched by revocation (stateless receivers)', async () => {
    // Setup ran once, before any revocation. Re-derive after "revoking":
    // byte-identical key material — revocation lives entirely in the header.
    const before = rings.map((r) => [...r.cs.values()].map(toHex).join())
    await encryptBroadcast(master, 'sd', new Set([3, 8, 9]), 'revocation happened')
    const after = await Promise.all(
      rings.map(async (r) => [...(await buildUserKeyRing(master, r.u)).cs.values()].map(toHex).join()),
    )
    expect(after).toEqual(before)
  })

  it('two REVOKED subscribers pooling their keys still cannot decrypt (collusion-resistant encryption)', async () => {
    const revoked = new Set([6, 11])
    for (const method of METHODS) {
      const { bc } = await encryptBroadcast(master, method, revoked, 'not for you two')
      const answer = await pirateDecode({ rings: [rings[6], rings[11]] }, bc, 'greedy', () => 0)
      expect(answer.canDecrypt).toBe(false)
      expect(answer.output).toBeNull()
      // and neither ring can even address an entry
      expect(await usableEntries(rings[6], bc)).toEqual([])
      expect(await usableEntries(rings[11], bc)).toEqual([])
    }
  })

  it('a wrong session key fails closed on the body (GCM tag)', async () => {
    const { bc } = await encryptBroadcast(master, 'cs', new Set(), 'tag check')
    const { aesGcmOpen } = await import('./primitives')
    expect(await aesGcmOpen(randomBytes(32), bc.body)).toBeNull()
  })
})
