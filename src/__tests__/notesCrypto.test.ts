/**
 * Tests for AES-256-GCM encryption utilities.
 *
 * Web Crypto API is available in Node 19+ and in Vitest's node environment.
 */
import { describe, expect, it } from 'vitest'
import {
  encryptPayload,
  decryptPayload,
  isEncryptedPayload,
  type EncryptedPayload,
} from '../features/crypto/notesCrypto'

const PASSPHRASE = 'correct-horse-battery-staple'
const WRONG     = 'wrong-passphrase'
const PLAINTEXT = JSON.stringify({ notes: [{ id: '1', title: 'Test note' }], sections: [] })

// ── isEncryptedPayload ────────────────────────────────────────────

describe('isEncryptedPayload', () => {
  it('returns false for plain JSON', () => {
    expect(isEncryptedPayload(PLAINTEXT)).toBe(false)
  })

  it('returns false for invalid JSON', () => {
    expect(isEncryptedPayload('not-json')).toBe(false)
  })

  it('returns false when encrypted flag is missing', () => {
    expect(isEncryptedPayload(JSON.stringify({ ciphertext: 'abc' }))).toBe(false)
  })

  it('returns true for a valid EncryptedPayload shape', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    expect(isEncryptedPayload(JSON.stringify(enc))).toBe(true)
  })
})

// ── encrypt / decrypt round-trip ──────────────────────────────────

describe('encrypt → decrypt round-trip', () => {
  it('recovers the original plaintext', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    const dec = await decryptPayload(enc, PASSPHRASE)
    expect(dec).toBe(PLAINTEXT)
  })

  it('throws a user-friendly error on wrong passphrase', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    await expect(decryptPayload(enc, WRONG)).rejects.toThrow('Wrong passphrase')
  })

  it('produces different ciphertext each call (random IV + salt)', async () => {
    const a = await encryptPayload(PLAINTEXT, PASSPHRASE)
    const b = await encryptPayload(PLAINTEXT, PASSPHRASE)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.iv).not.toBe(b.iv)
    expect(a.salt).not.toBe(b.salt)
  })

  it('encrypted flag is always true', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    expect(enc.encrypted).toBe(true)
  })

  it('salt, iv and ciphertext are non-empty base64 strings', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    const b64 = /^[A-Za-z0-9+/]+=*$/
    expect(enc.salt).toMatch(b64)
    expect(enc.iv).toMatch(b64)
    expect(enc.ciphertext).toMatch(b64)
  })

  it('works with an empty string passphrase (still valid, just weak)', async () => {
    const enc = await encryptPayload(PLAINTEXT, '')
    const dec = await decryptPayload(enc, '')
    expect(dec).toBe(PLAINTEXT)
  })

  it('handles large payloads', async () => {
    const large = JSON.stringify({ notes: Array.from({ length: 500 }, (_, i) => ({ id: String(i), body: 'x'.repeat(200) })), sections: [] })
    const enc = await encryptPayload(large, PASSPHRASE)
    const dec = await decryptPayload(enc, PASSPHRASE)
    expect(dec).toBe(large)
  })
})

// ── EncryptedPayload structure ─────────────────────────────────────

describe('EncryptedPayload structure', () => {
  it('is JSON-serialisable and round-trips through JSON.stringify/parse', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    const serialised = JSON.stringify(enc)
    const restored = JSON.parse(serialised) as EncryptedPayload
    const dec = await decryptPayload(restored, PASSPHRASE)
    expect(dec).toBe(PLAINTEXT)
  })

  it('salt is 16 bytes (128 bits) encoded as base64', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    const saltBytes = Uint8Array.from(atob(enc.salt), c => c.charCodeAt(0))
    expect(saltBytes.byteLength).toBe(16)
  })

  it('iv is 12 bytes (96 bits) encoded as base64', async () => {
    const enc = await encryptPayload(PLAINTEXT, PASSPHRASE)
    const ivBytes = Uint8Array.from(atob(enc.iv), c => c.charCodeAt(0))
    expect(ivBytes.byteLength).toBe(12)
  })
})
