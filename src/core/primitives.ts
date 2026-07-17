/**
 * Thin wrappers over WebCrypto (SubtleCrypto). All real crypto in this demo
 * flows through these four functions: HKDF-SHA-256, HMAC-SHA-256, and
 * AES-256-GCM seal/open. Nothing is simulated.
 */

import { randomBytes } from './bytes'

const subtle = crypto.subtle

/** HKDF-SHA-256 (RFC 5869): extract-then-expand, returns `length` bytes. */
export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits'])
  const bits = await subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  )
  return new Uint8Array(bits)
}

/** HMAC-SHA-256 (RFC 2104 / FIPS 198-1): the PRF for GGM label derivation. */
export async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await subtle.sign('HMAC', k, data as BufferSource))
}

export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await subtle.digest('SHA-256', data as BufferSource))
}

/** AES-GCM ciphertext: 12-byte IV + ciphertext with the 16-byte tag appended. */
export interface Sealed {
  iv: Uint8Array
  ct: Uint8Array
}

export async function aesGcmSealWithIv(
  key: Uint8Array,
  iv: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<Sealed> {
  const k = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['encrypt'])
  const params: AesGcmParams = { name: 'AES-GCM', iv: iv as BufferSource }
  if (aad) params.additionalData = aad as BufferSource
  const ct = new Uint8Array(await subtle.encrypt(params, k, plaintext as BufferSource))
  return { iv, ct }
}

export async function aesGcmSeal(
  key: Uint8Array,
  plaintext: Uint8Array,
  aad?: Uint8Array,
): Promise<Sealed> {
  return aesGcmSealWithIv(key, randomBytes(12), plaintext, aad)
}

/** Fail-closed: returns null on ANY failure (bad key, bad tag, malformed input). */
export async function aesGcmOpen(
  key: Uint8Array,
  sealed: Sealed,
  aad?: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const k = await subtle.importKey('raw', key as BufferSource, 'AES-GCM', false, ['decrypt'])
    const params: AesGcmParams = { name: 'AES-GCM', iv: sealed.iv as BufferSource }
    if (aad) params.additionalData = aad as BufferSource
    return new Uint8Array(await subtle.decrypt(params, k, sealed.ct as BufferSource))
  } catch {
    return null
  }
}

/** Bytes on the wire for one sealed blob (IV + ciphertext incl. tag). */
export function sealedSize(s: Sealed): number {
  return s.iv.length + s.ct.length
}
