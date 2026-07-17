/** Byte-array helpers shared by every module. No crypto here. */

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export function utf8(s: string): Uint8Array {
  return encoder.encode(s)
}

export function utf8Decode(b: Uint8Array): string {
  return decoder.decode(b)
}

export function toHex(b: Uint8Array): string {
  let out = ''
  for (const x of b) out += x.toString(16).padStart(2, '0')
  return out
}

export function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '')
  if (clean.length % 2 !== 0) throw new Error('odd-length hex string')
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) {
    const byte = Number.parseInt(clean.slice(2 * i, 2 * i + 2), 16)
    if (Number.isNaN(byte)) throw new Error('invalid hex string')
    out[i] = byte
  }
  return out
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

/** Plain equality for tests/display — NOT constant-time; never used to check secrets. */
export function bytesEq(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}
