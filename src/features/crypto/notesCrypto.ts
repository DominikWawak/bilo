/**
 * AES-256-GCM encryption for Bilo sync payloads.
 *
 * Key derivation: PBKDF2-SHA-256, 600 000 iterations (OWASP 2023 recommendation).
 * Cipher:         AES-256-GCM with a random 96-bit IV per encryption.
 * Salt:           random 128-bit, stored alongside ciphertext (not secret).
 *
 * The passphrase is NEVER stored — it is held in memory for the session only.
 * All heavy lifting uses the browser's built-in Web Crypto API (no extra deps).
 */

const PBKDF2_ITERATIONS = 600_000
const SALT_BYTES = 16   // 128 bits
const IV_BYTES   = 12   // 96 bits — standard for GCM

export interface EncryptedPayload {
  /** Marker so pull-side knows the data is encrypted */
  encrypted: true
  /** Base64-encoded PBKDF2 salt */
  salt: string
  /** Base64-encoded AES-GCM IV */
  iv: string
  /** Base64-encoded AES-GCM ciphertext */
  ciphertext: string
}

function toBase64(buf: ArrayBuffer): string {
  // Chunked to avoid call-stack overflow on large buffers
  const bytes = new Uint8Array(buf)
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  }
  return btoa(binary)
}

function fromBase64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypts a plaintext string with the given passphrase.
 * Returns a JSON-serialisable object that can be stored or synced.
 */
export async function encryptPayload(
  plaintext: string,
  passphrase: string
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const iv   = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const key  = await deriveKey(passphrase, salt)

  const enc        = new TextEncoder()
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  )

  return {
    encrypted: true,
    salt:       toBase64(salt),
    iv:         toBase64(iv),
    ciphertext: toBase64(ciphertext),
  }
}

/**
 * Decrypts an EncryptedPayload with the given passphrase.
 * Throws a user-friendly error if the passphrase is wrong.
 */
export async function decryptPayload(
  payload: EncryptedPayload,
  passphrase: string
): Promise<string> {
  const salt       = fromBase64(payload.salt)
  const iv         = fromBase64(payload.iv)
  const ciphertext = fromBase64(payload.ciphertext)
  const key        = await deriveKey(passphrase, salt)

  let plainBuf: ArrayBuffer
  try {
    plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext)
  } catch {
    throw new Error('Wrong passphrase — could not decrypt notes.')
  }

  return new TextDecoder().decode(plainBuf)
}

/**
 * Returns true if the raw string looks like an EncryptedPayload.
 * Safe to call before JSON.parse throws.
 */
export function isEncryptedPayload(raw: string): boolean {
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    return obj.encrypted === true && typeof obj.ciphertext === 'string'
  } catch {
    return false
  }
}
