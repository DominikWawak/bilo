/**
 * In-memory holder for the sync encryption passphrase.
 *
 * The passphrase is kept for the running session only and is NEVER written to
 * disk — this is what keeps your notes encrypted at rest on GitHub. Background
 * auto-sync reads it from here so it can encrypt without persisting the secret.
 */

let sessionPassphrase = ''

export function getSessionPassphrase(): string {
  return sessionPassphrase
}

export function setSessionPassphrase(passphrase: string): void {
  sessionPassphrase = passphrase
}
