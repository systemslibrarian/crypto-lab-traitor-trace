/** Session-wide lab state: one master seed, sixteen subscriber key rings. */

import { concatBytes, randomBytes, toHex } from '../core/bytes'
import { buildUserKeyRing, type UserKeyRing } from '../core/broadcast'
import { sha256 } from '../core/primitives'
import { N } from '../core/tree'

export interface Lab {
  master: Uint8Array
  rings: UserKeyRing[]
  /** Per-subscriber key-ring fingerprints, fixed at setup — displayed to show revocation reissues nothing. */
  fingerprints: string[]
}

export async function initLab(): Promise<Lab> {
  const master = randomBytes(32)
  const rings: UserKeyRing[] = []
  const fingerprints: string[] = []
  for (let u = 0; u < N; u++) {
    const ring = await buildUserKeyRing(master, u)
    rings.push(ring)
    const material = concatBytes(
      ...[...ring.cs.values()],
      ...ring.sd.labels.map((l) => l.label),
      ring.sd.fullKey,
    )
    fingerprints.push(toHex((await sha256(material)).subarray(0, 4)))
  }
  return { master, rings, fingerprints }
}

/** Human description of a subscriber range under a tree node. */
export function rangeLabel(users: number[]): string {
  if (users.length === 0) return 'nobody'
  if (users.length === 1) return `#${users[0] + 1}`
  return `#${users[0] + 1}–#${users[users.length - 1] + 1}`
}
