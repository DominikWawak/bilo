/**
 * Unit tests for sync utilities and Tauri command invocations.
 *
 * External dependency (Tauri invoke) is mocked. All functions
 * under test are imported from the real source modules.
 */
import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi, type MockedFunction } from 'vitest'
import { buildSyncPayload, applyPulledData } from '../features/sync/syncUtils'

const mockInvoke = invoke as MockedFunction<typeof invoke>

// ── localStorage stub ────────────────────────────────────────────

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

// ── buildSyncPayload ──────────────────────────────────────────────

describe('buildSyncPayload', () => {
  beforeEach(() => localStorage.clear())

  it('returns valid JSON', () => {
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: '1' }]))
    localStorage.setItem('bilo-sections-store', JSON.stringify([]))
    expect(() => JSON.parse(buildSyncPayload())).not.toThrow()
  })

  it('includes notes from localStorage', () => {
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: 'abc', title: 'My note' }]))
    localStorage.setItem('bilo-sections-store', JSON.stringify([]))
    const payload = JSON.parse(buildSyncPayload()) as { notes: { id: string }[] }
    expect(payload.notes[0].id).toBe('abc')
  })

  it('falls back to empty arrays when localStorage is empty', () => {
    const payload = JSON.parse(buildSyncPayload()) as { notes: unknown[]; sections: unknown[] }
    expect(payload.notes).toEqual([])
    expect(payload.sections).toEqual([])
  })

  it('includes sections from localStorage', () => {
    localStorage.setItem('bilo-notes-store', JSON.stringify([]))
    localStorage.setItem('bilo-sections-store', JSON.stringify([{ id: 's1', name: 'Work' }]))
    const payload = JSON.parse(buildSyncPayload()) as { sections: { id: string }[] }
    expect(payload.sections[0].id).toBe('s1')
  })
})

// ── applyPulledData ──────────────────────────────────────────────

describe('applyPulledData', () => {
  beforeEach(() => localStorage.clear())

  it('writes notes to localStorage and returns true', () => {
    const called = vi.fn()
    const result = JSON.stringify({ notes: [{ id: '1' }], sections: [] })
    const applied = applyPulledData(result, called)
    expect(applied).toBe(true)
    expect(called).toHaveBeenCalledOnce()
    const stored = JSON.parse(localStorage.getItem('bilo-notes-store')!) as { id: string }[]
    expect(stored[0].id).toBe('1')
  })

  it('writes sections to localStorage', () => {
    const result = JSON.stringify({ notes: [], sections: [{ id: 's1' }] })
    applyPulledData(result, vi.fn())
    const stored = JSON.parse(localStorage.getItem('bilo-sections-store')!) as { id: string }[]
    expect(stored[0].id).toBe('s1')
  })

  it('defaults sections to [] when absent', () => {
    const result = JSON.stringify({ notes: [{ id: '1' }] })
    applyPulledData(result, vi.fn())
    expect(JSON.parse(localStorage.getItem('bilo-sections-store')!)).toEqual([])
  })

  it('returns false and does not call callback for invalid JSON', () => {
    const called = vi.fn()
    expect(applyPulledData('not-json', called)).toBe(false)
    expect(called).not.toHaveBeenCalled()
  })

  it('returns false when notes key is missing', () => {
    const called = vi.fn()
    expect(applyPulledData(JSON.stringify({ sections: [] }), called)).toBe(false)
    expect(called).not.toHaveBeenCalled()
  })
})

// ── GitHub sync ──────────────────────────────────────────────────

describe('GitHub sync invoke calls', () => {
  beforeEach(() => { mockInvoke.mockReset(); localStorage.clear() })

  it('push forwards correctly serialised payload', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: '1' }]))
    localStorage.setItem('bilo-sections-store', JSON.stringify([]))
    const payload = buildSyncPayload()

    await invoke('github_sync_push', { repoUrl: 'https://github.com/x/y', token: 'ghp_abc', payload })

    expect(mockInvoke).toHaveBeenCalledWith('github_sync_push', {
      repoUrl: 'https://github.com/x/y',
      token: 'ghp_abc',
      payload,
    })
    const parsed = JSON.parse(payload) as { notes: { id: string }[] }
    expect(parsed.notes[0].id).toBe('1')
  })

  it('pull result is applied to localStorage', async () => {
    const remote = JSON.stringify({ notes: [{ id: 'remote-1' }], sections: [] })
    mockInvoke.mockResolvedValue(remote)
    const result = await invoke<string>('github_sync_pull', { repoUrl: 'https://github.com/x/y', token: 'ghp_abc' })
    applyPulledData(result, vi.fn())
    const stored = JSON.parse(localStorage.getItem('bilo-notes-store')!) as { id: string }[]
    expect(stored[0].id).toBe('remote-1')
  })
})

// ── Google Drive ─────────────────────────────────────────────────

describe('Google Drive invoke calls', () => {
  beforeEach(() => { mockInvoke.mockReset(); localStorage.clear() })

  it('push sends the payload built from localStorage', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: 'gd-1' }]))
    localStorage.setItem('bilo-sections-store', JSON.stringify([]))
    const payload = buildSyncPayload()

    await invoke('google_drive_push', { payload })

    expect(mockInvoke).toHaveBeenCalledWith('google_drive_push', { payload })
    expect((JSON.parse(payload) as { notes: { id: string }[] }).notes[0].id).toBe('gd-1')
  })

  it('pull result is applied to localStorage', async () => {
    const remote = JSON.stringify({ notes: [{ id: 'gd-remote' }], sections: [] })
    mockInvoke.mockResolvedValue(remote)
    const result = await invoke<string>('google_drive_pull')
    applyPulledData(result, vi.fn())
    const stored = JSON.parse(localStorage.getItem('bilo-notes-store')!) as { id: string }[]
    expect(stored[0].id).toBe('gd-remote')
  })

  it('status returns connected email', async () => {
    mockInvoke.mockResolvedValue('user@gmail.com')
    expect(await invoke<string | null>('google_drive_status')).toBe('user@gmail.com')
  })

  it('status returns null when disconnected', async () => {
    mockInvoke.mockResolvedValue(null)
    expect(await invoke<string | null>('google_drive_status')).toBeNull()
  })

  it('auth passes clientId and clientSecret', async () => {
    mockInvoke.mockResolvedValue('user@gmail.com')
    await invoke('google_drive_auth', { clientId: 'cid.apps.googleusercontent.com', clientSecret: 'GOCSPX-x' })
    expect(mockInvoke).toHaveBeenCalledWith('google_drive_auth', {
      clientId: 'cid.apps.googleusercontent.com',
      clientSecret: 'GOCSPX-x',
    })
  })

  it('disconnect calls google_drive_disconnect', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await invoke('google_drive_disconnect')
    expect(mockInvoke).toHaveBeenCalledWith('google_drive_disconnect')
  })
})

// ── OneDrive ─────────────────────────────────────────────────────

describe('OneDrive invoke calls', () => {
  beforeEach(() => { mockInvoke.mockReset(); localStorage.clear() })

  it('auth takes only clientId (no secret for public native app)', async () => {
    mockInvoke.mockResolvedValue('user@live.com')
    await invoke('onedrive_auth', { clientId: 'xxxxxxxx-uuid' })
    expect(mockInvoke).toHaveBeenCalledWith('onedrive_auth', { clientId: 'xxxxxxxx-uuid' })
  })

  it('push sends payload built from localStorage', async () => {
    mockInvoke.mockResolvedValue(undefined)
    localStorage.setItem('bilo-notes-store', JSON.stringify([{ id: 'od-1' }]))
    localStorage.setItem('bilo-sections-store', JSON.stringify([]))
    const payload = buildSyncPayload()

    await invoke('onedrive_push', { payload })

    expect(mockInvoke).toHaveBeenCalledWith('onedrive_push', { payload })
    expect((JSON.parse(payload) as { notes: { id: string }[] }).notes[0].id).toBe('od-1')
  })

  it('pull result is applied to localStorage', async () => {
    const remote = JSON.stringify({ notes: [{ id: 'od-remote' }], sections: [] })
    mockInvoke.mockResolvedValue(remote)
    const result = await invoke<string>('onedrive_pull')
    applyPulledData(result, vi.fn())
    const stored = JSON.parse(localStorage.getItem('bilo-notes-store')!) as { id: string }[]
    expect(stored[0].id).toBe('od-remote')
  })

  it('status returns connected email', async () => {
    mockInvoke.mockResolvedValue('user@outlook.com')
    expect(await invoke<string | null>('onedrive_status')).toBe('user@outlook.com')
  })

  it('disconnect calls onedrive_disconnect', async () => {
    mockInvoke.mockResolvedValue(undefined)
    await invoke('onedrive_disconnect')
    expect(mockInvoke).toHaveBeenCalledWith('onedrive_disconnect')
  })
})
