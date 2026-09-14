/**
 * Unit tests for background auto-sync (push-only).
 *
 * Tauri invoke is mocked via the global test setup. localStorage and the
 * in-memory session passphrase are exercised through the real modules.
 */
import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, type MockedFunction } from 'vitest'
import { runAutoPush } from '../features/sync/autoSync'
import { setSessionPassphrase } from '../features/sync/sessionKey'
import { isEncryptedPayload } from '../features/crypto/notesCrypto'

const mockInvoke = invoke as MockedFunction<typeof invoke>

const localStorageStore: Record<string, string> = {}
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem: (k: string) => localStorageStore[k] ?? null,
    setItem: (k: string, v: string) => { localStorageStore[k] = v },
    removeItem: (k: string) => { delete localStorageStore[k] },
    clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]) },
  },
  writable: true,
})

describe('runAutoPush', () => {
  beforeEach(() => {
    mockInvoke.mockReset()
    localStorage.clear()
    setSessionPassphrase('')
  })

  it('does nothing when repo or token is not configured', async () => {
    expect(await runAutoPush()).toBe('skipped-unconfigured')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('skips pushing when remote is encrypted but no passphrase is loaded', async () => {
    localStorage.setItem('bilo-sync-repo', 'https://github.com/x/y')
    localStorage.setItem('bilo-sync-token', 'ghp_abc')
    localStorage.setItem('bilo-sync-encrypted', 'true')

    expect(await runAutoPush()).toBe('skipped-locked')
    expect(mockInvoke).not.toHaveBeenCalled()
  })

  it('pushes when remote is encrypted and the passphrase is loaded', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-sync-repo', 'https://github.com/x/y')
    localStorage.setItem('bilo-sync-token', 'ghp_abc')
    localStorage.setItem('bilo-sync-encrypted', 'true')
    setSessionPassphrase('correct horse battery staple')

    expect(await runAutoPush()).toBe('pushed')
    const [, args] = mockInvoke.mock.calls[0] as [string, { payload: string }]
    expect(isEncryptedPayload(args.payload)).toBe(true)
  })

  it('pushes plaintext when no passphrase is set', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-sync-repo', 'https://github.com/x/y')
    localStorage.setItem('bilo-sync-token', 'ghp_abc')
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: '1' }]))

    await runAutoPush()

    expect(mockInvoke).toHaveBeenCalledOnce()
    const [cmd, args] = mockInvoke.mock.calls[0] as [string, { payload: string }]
    expect(cmd).toBe('github_sync_push')
    expect(isEncryptedPayload(args.payload)).toBe(false)
  })

  it('encrypts the payload when a session passphrase is set', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-sync-repo', 'https://github.com/x/y')
    localStorage.setItem('bilo-sync-token', 'ghp_abc')
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: 'secret' }]))
    setSessionPassphrase('correct horse battery staple')

    await runAutoPush()

    const [, args] = mockInvoke.mock.calls[0] as [string, { payload: string }]
    expect(isEncryptedPayload(args.payload)).toBe(true)
    expect(args.payload).not.toContain('secret')
  })

  it('records the last-sync timestamp on success', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-sync-repo', 'https://github.com/x/y')
    localStorage.setItem('bilo-sync-token', 'ghp_abc')

    await runAutoPush()

    expect(localStorage.getItem('bilo-sync-last')).not.toBeNull()
  })
})
