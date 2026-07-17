import { describe, expect, it } from 'vitest'
import { bytesEq, concatBytes, fromHex, toHex, utf8, utf8Decode } from './bytes'

describe('byte helpers', () => {
  it('hex round-trips and rejects malformed input', () => {
    expect(toHex(fromHex('00ff10ab'))).toBe('00ff10ab')
    expect(fromHex('de ad be ef')).toEqual(fromHex('deadbeef')) // whitespace tolerated
    expect(() => fromHex('abc')).toThrow('odd-length')
    expect(() => fromHex('zz')).toThrow('invalid hex')
  })

  it('concatenates and compares', () => {
    const joined = concatBytes(fromHex('0102'), new Uint8Array(0), fromHex('03'))
    expect(toHex(joined)).toBe('010203')
    expect(bytesEq(joined, fromHex('010203'))).toBe(true)
    expect(bytesEq(joined, fromHex('010204'))).toBe(false)
    expect(bytesEq(joined, fromHex('0102'))).toBe(false)
  })

  it('utf8 round-trips', () => {
    expect(utf8Decode(utf8('subset cover ✓'))).toBe('subset cover ✓')
  })
})
