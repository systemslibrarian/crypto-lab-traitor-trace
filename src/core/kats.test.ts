/**
 * Spec known-answer tests for every primitive the demo relies on:
 *  - HKDF-SHA-256: RFC 5869 Appendix A, test cases 1-3 (the SHA-256 cases)
 *  - HMAC-SHA-256: RFC 4231, test cases 1-2
 *  - AES-256-GCM: NIST GCM spec (McGrew-Viega revised spec), test cases 13-16
 * 9 KATs total.
 */

import { describe, expect, it } from 'vitest'
import { fromHex, toHex, utf8 } from './bytes'
import { aesGcmOpen, aesGcmSealWithIv, hkdfSha256, hmacSha256 } from './primitives'

describe('HKDF-SHA-256 — RFC 5869 Appendix A', () => {
  it('test case 1 (basic)', async () => {
    const okm = await hkdfSha256(
      fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
      fromHex('000102030405060708090a0b0c'),
      fromHex('f0f1f2f3f4f5f6f7f8f9'),
      42,
    )
    expect(toHex(okm)).toBe(
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    )
  })

  it('test case 2 (longer inputs/outputs)', async () => {
    const ikm = fromHex(
      '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f' +
        '202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f' +
        '404142434445464748494a4b4c4d4e4f',
    )
    const salt = fromHex(
      '606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f' +
        '808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f' +
        'a0a1a2a3a4a5a6a7a8a9aaabacadaeaf',
    )
    const info = fromHex(
      'b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf' +
        'd0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef' +
        'f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff',
    )
    const okm = await hkdfSha256(ikm, salt, info, 82)
    expect(toHex(okm)).toBe(
      'b11e398dc80327a1c8e7f78c596a49344f012eda2d4efad8a050cc4c19afa97c' +
        '59045a99cac7827271cb41c65e590e09da3275600c2f09b8367793a9aca3db71' +
        'cc30c58179ec3e87c14c01d5c1f3434f1d87',
    )
  })

  it('test case 3 (zero-length salt and info)', async () => {
    const okm = await hkdfSha256(
      fromHex('0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b'),
      new Uint8Array(0),
      new Uint8Array(0),
      42,
    )
    expect(toHex(okm)).toBe(
      '8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8',
    )
  })
})

describe('HMAC-SHA-256 — RFC 4231', () => {
  it('test case 1', async () => {
    const mac = await hmacSha256(fromHex('0b'.repeat(20)), utf8('Hi There'))
    expect(toHex(mac)).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7')
  })

  it('test case 2', async () => {
    const mac = await hmacSha256(utf8('Jefe'), utf8('what do ya want for nothing?'))
    expect(toHex(mac)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843')
  })
})

describe('AES-256-GCM — NIST GCM spec test cases 13-16', () => {
  it('test case 13 (empty plaintext)', async () => {
    const sealed = await aesGcmSealWithIv(new Uint8Array(32), new Uint8Array(12), new Uint8Array(0))
    // WebCrypto appends the tag to the ciphertext; empty PT -> ct is the tag.
    expect(toHex(sealed.ct)).toBe('530f8afbc74536b9a963b4f1c4cb738b')
  })

  it('test case 14 (single zero block)', async () => {
    const sealed = await aesGcmSealWithIv(new Uint8Array(32), new Uint8Array(12), new Uint8Array(16))
    expect(toHex(sealed.ct)).toBe(
      'cea7403d4d606b6e074ec5d3baf39d18' + 'd0d1c8a799996bf0265b98b5d48ab919',
    )
  })

  it('test case 15 (four blocks, no AAD)', async () => {
    const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308')
    const iv = fromHex('cafebabefacedbaddecaf888')
    const pt = fromHex(
      'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255',
    )
    const sealed = await aesGcmSealWithIv(key, iv, pt)
    expect(toHex(sealed.ct)).toBe(
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa' +
        '8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad' +
        'b094dac5d93471bdec1a502270e3cc6c',
    )
    // And the tag actually gates decryption: flip one bit, GCM must reject.
    const tampered = { iv, ct: sealed.ct.slice() }
    tampered.ct[0] ^= 1
    expect(await aesGcmOpen(key, tampered)).toBeNull()
    expect(await aesGcmOpen(key, sealed)).not.toBeNull()
  })

  it('test case 16 (60-byte plaintext with AAD)', async () => {
    const key = fromHex('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308')
    const iv = fromHex('cafebabefacedbaddecaf888')
    const pt = fromHex(
      'd9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a72' +
        '1c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b39',
    )
    const aad = fromHex('feedfacedeadbeeffeedfacedeadbeefabaddad2')
    const sealed = await aesGcmSealWithIv(key, iv, pt, aad)
    expect(toHex(sealed.ct)).toBe(
      '522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa' +
        '8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662' +
        '76fc6ece0f4e1768cddf8853bb2d551b',
    )
  })
})
