import { encryptPayload, decryptPayload, isEncryptedPayload } from '../crypto/notesCrypto'

export interface SyncPayload {
  notes: unknown[]
  sections: unknown[]
}

/** Serialises localStorage note/section data into a JSON string for cloud sync. */
export function buildSyncPayload(): string {
  const notes = JSON.parse(localStorage.getItem('bilo-notes-store') ?? '[]') as unknown[]
  const sections = JSON.parse(localStorage.getItem('bilo-sections-store') ?? '[]') as unknown[]
  return JSON.stringify({ notes, sections })
}

/**
 * Builds a sync payload, encrypting it with the given passphrase when provided.
 * Returns a plain JSON string (encrypted or not) ready to upload.
 */
export async function buildSyncPayloadMaybeEncrypted(passphrase?: string): Promise<string> {
  const plain = buildSyncPayload()
  if (!passphrase) return plain
  const encrypted = await encryptPayload(plain, passphrase)
  return JSON.stringify(encrypted)
}

/**
 * Decrypts a pulled string if it is encrypted, otherwise returns it as-is.
 * Throws a user-friendly error if the passphrase is wrong.
 */
export async function decryptPulledData(raw: string, passphrase?: string): Promise<string> {
  if (!isEncryptedPayload(raw)) return raw
  if (!passphrase) throw new Error('This backup is encrypted — enter your passphrase in Settings → Sync to pull.')
  return decryptPayload(JSON.parse(raw) as Parameters<typeof decryptPayload>[0], passphrase)
}

/**
 * Parses a pulled JSON string and writes the data back to localStorage.
 * Returns true if valid data was applied, false otherwise.
 */
export function applyPulledData(
  result: string,
  onApplied: (notes: unknown[], sections: unknown[]) => void
): boolean {
  try {
    const data = JSON.parse(result) as Partial<SyncPayload>
    if (!Array.isArray(data.notes)) return false
    const sections = Array.isArray(data.sections) ? data.sections : []
    localStorage.setItem('bilo-notes-store', JSON.stringify(data.notes))
    localStorage.setItem('bilo-sections-store', JSON.stringify(sections))
    onApplied(data.notes, sections)
    return true
  } catch {
    return false
  }
}
