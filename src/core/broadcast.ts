/**
 * The broadcast itself: a header of wrapped session keys (one AES-256-GCM
 * wrap per cover subset) plus the payload encrypted once under a fresh
 * session key. Also the subscriber-side decryption, which reports the
 * cryptographic outcome of each step so the UI can render the crypto result
 * and the security verdict independently.
 */

import { randomBytes, utf8, utf8Decode } from './bytes'
import { csCover, csNodeKey, csUserKeys } from './cs'
import { aesGcmOpen, aesGcmSeal, sealedSize, type Sealed } from './primitives'
import {
  sdCover,
  sdSubsetKey,
  sdUserDeriveKey,
  sdUserKeys,
  type SDSubset,
  type SDUserKeys,
} from './sd'
import { leafNode, N } from './tree'

export type Method = 'cs' | 'sd'

export type SubsetDesc =
  | { kind: 'cs'; node: number } // complete subtree rooted at `node`
  | { kind: 'sd'; i: number; j: number | null } // S_{i,j}

export interface HeaderEntry {
  subset: SubsetDesc
  /** AES-256-GCM encryption of the session key under the subset key. */
  wrap: Sealed
}

export interface Broadcast {
  header: HeaderEntry[]
  /** AES-256-GCM encryption of the payload under the session key. */
  body: Sealed
}

/** Everything one subscriber walks away from setup with. */
export interface UserKeyRing {
  u: number
  cs: Map<number, Uint8Array>
  sd: SDUserKeys
}

export async function buildUserKeyRing(master: Uint8Array, u: number): Promise<UserKeyRing> {
  return { u, cs: await csUserKeys(master, u), sd: await sdUserKeys(master, u) }
}

export interface BroadcastResult {
  bc: Broadcast
  sessionKey: Uint8Array
}

export async function encryptBroadcast(
  master: Uint8Array,
  method: Method,
  revoked: ReadonlySet<number>,
  message: string,
): Promise<BroadcastResult> {
  const sessionKey = randomBytes(32)
  const header: HeaderEntry[] = []
  if (method === 'cs') {
    for (const node of csCover(revoked)) {
      const key = await csNodeKey(master, node)
      header.push({ subset: { kind: 'cs', node }, wrap: await aesGcmSeal(key, sessionKey) })
    }
  } else {
    for (const s of sdCover(revoked)) {
      const key = await sdSubsetKey(master, s)
      header.push({ subset: { kind: 'sd', i: s.i, j: s.j }, wrap: await aesGcmSeal(key, sessionKey) })
    }
  }
  const body = await aesGcmSeal(sessionKey, utf8(message))
  return { bc: { header, body }, sessionKey }
}

/**
 * The naive per-recipient baseline: no cover, one wrap under every
 * non-revoked subscriber's personal (leaf) key.
 */
export async function encryptNaivePerRecipient(
  master: Uint8Array,
  revoked: ReadonlySet<number>,
  message: string,
): Promise<BroadcastResult> {
  const sessionKey = randomBytes(32)
  const header: HeaderEntry[] = []
  for (let u = 0; u < N; u++) {
    if (revoked.has(u)) continue
    const key = await csNodeKey(master, leafNode(u))
    header.push({ subset: { kind: 'cs', node: leafNode(u) }, wrap: await aesGcmSeal(key, sessionKey) })
  }
  const body = await aesGcmSeal(sessionKey, utf8(message))
  return { bc: { header, body }, sessionKey }
}

/** Step-by-step outcome of one subscriber's decryption attempt. */
export interface DecryptReport {
  u: number
  /** Index of the header entry this subscriber's keys could address, if any. */
  entryIndex: number | null
  /** Did the key-wrap GCM decryption authenticate? */
  unwrapOk: boolean
  /** Did the recovered session key open the payload (GCM tag verified)? */
  opened: boolean
  plaintext: string | null
  /** The session key this subscriber recovered, if the unwrap authenticated. */
  sessionKey: Uint8Array | null
}

async function entryKeyFor(ring: UserKeyRing, entry: HeaderEntry): Promise<Uint8Array | null> {
  if (entry.subset.kind === 'cs') return ring.cs.get(entry.subset.node) ?? null
  return sdUserDeriveKey(ring.sd, { i: entry.subset.i, j: entry.subset.j } satisfies SDSubset)
}

/** Indices of header entries this ring can address (a correct cover yields exactly one). */
export async function usableEntries(ring: UserKeyRing, bc: Broadcast): Promise<number[]> {
  const out: number[] = []
  for (let idx = 0; idx < bc.header.length; idx++) {
    if ((await entryKeyFor(ring, bc.header[idx])) !== null) out.push(idx)
  }
  return out
}

export async function subscriberDecrypt(ring: UserKeyRing, bc: Broadcast): Promise<DecryptReport> {
  for (let idx = 0; idx < bc.header.length; idx++) {
    const key = await entryKeyFor(ring, bc.header[idx])
    if (key === null) continue
    const sessionKey = await aesGcmOpen(key, bc.header[idx].wrap)
    if (sessionKey === null) {
      return { u: ring.u, entryIndex: idx, unwrapOk: false, opened: false, plaintext: null, sessionKey: null }
    }
    const pt = await aesGcmOpen(sessionKey, bc.body)
    return {
      u: ring.u,
      entryIndex: idx,
      unwrapOk: true,
      opened: pt !== null,
      plaintext: pt === null ? null : utf8Decode(pt),
      sessionKey,
    }
  }
  return { u: ring.u, entryIndex: null, unwrapOk: false, opened: false, plaintext: null, sessionKey: null }
}

/** Total header bytes as they would go on the wire (IV + ct + tag per entry). */
export function headerBytes(bc: Broadcast): number {
  return bc.header.reduce((n, e) => n + sealedSize(e.wrap), 0)
}
