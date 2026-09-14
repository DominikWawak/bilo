import { invoke } from '@tauri-apps/api/core'
import { buildSyncPayloadMaybeEncrypted } from './syncUtils'
import { getSessionPassphrase } from './sessionKey'

let inFlight = false

/** Reason a background push was skipped (for surfacing to the UI/logs). */
export type AutoPushResult = 'pushed' | 'skipped-unconfigured' | 'skipped-locked' | 'in-flight'

/**
 * Pushes the current notes to GitHub using the saved repo/token and the
 * in-memory session passphrase (encrypting when one is set).
 *
 * No-ops if the repo or token isn't configured, or if a push is already
 * running. Never pulls — auto-sync is backup-only so it can't clobber local
 * edits.
 *
 * Fail-safe: if the remote has previously been pushed encrypted
 * (`bilo-sync-encrypted`) but no passphrase is loaded this session, the push
 * is SKIPPED rather than silently overwriting the encrypted backup with
 * plaintext. Errors are thrown to the caller (which swallows them for
 * background runs).
 */
export async function runAutoPush(): Promise<AutoPushResult> {
  if (inFlight) return 'in-flight'
  const repoUrl = localStorage.getItem('bilo-sync-repo') ?? ''
  const token = localStorage.getItem('bilo-sync-token') ?? ''
  if (!repoUrl || !token) return 'skipped-unconfigured'

  const passphrase = getSessionPassphrase().trim() || undefined
  const remoteIsEncrypted = localStorage.getItem('bilo-sync-encrypted') === 'true'
  if (remoteIsEncrypted && !passphrase) return 'skipped-locked'

  inFlight = true
  try {
    const payload = await buildSyncPayloadMaybeEncrypted(passphrase)
    await invoke('github_sync_push', { repoUrl, token, payload })
    localStorage.setItem('bilo-sync-encrypted', passphrase ? 'true' : 'false')
    localStorage.setItem('bilo-sync-last', String(Date.now()))
    return 'pushed'
  } finally {
    inFlight = false
  }
}
