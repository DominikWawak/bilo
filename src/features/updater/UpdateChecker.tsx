import { useState } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

type Phase =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date' }
  | { kind: 'available'; version: string; notes: string }
  | { kind: 'downloading'; pct: number | null }
  | { kind: 'ready' }
  | { kind: 'error'; msg: string }

export const UpdateChecker = () => {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })

  const checkForUpdate = async () => {
    setPhase({ kind: 'checking' })
    try {
      const update = await check()
      if (!update) {
        setPhase({ kind: 'up-to-date' })
        return
      }
      setPhase({
        kind: 'available',
        version: update.version,
        notes: update.body ?? '',
      })
    } catch (e) {
      setPhase({ kind: 'error', msg: String(e) })
    }
  }

  const installUpdate = async () => {
    if (phase.kind !== 'available') return
    const update = await check().catch(() => null)
    if (!update) return

    setPhase({ kind: 'downloading', pct: null })
    let downloaded = 0
    let total = 0

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
          setPhase({ kind: 'downloading', pct: total ? 0 : null })
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          setPhase({ kind: 'downloading', pct: total ? Math.round((downloaded / total) * 100) : null })
        } else if (event.event === 'Finished') {
          setPhase({ kind: 'ready' })
        }
      })
    } catch (e) {
      setPhase({ kind: 'error', msg: String(e) })
      return
    }

    setPhase({ kind: 'ready' })
  }

  const doRelaunch = async () => {
    await relaunch()
  }

  return (
    <div className="updater-box">
      {phase.kind === 'idle' && (
        <button type="button" className="sp-btn sp-btn-primary updater-check-btn" onClick={checkForUpdate}>
          Check for updates
        </button>
      )}

      {phase.kind === 'checking' && (
        <span className="updater-status">Checking…</span>
      )}

      {phase.kind === 'up-to-date' && (
        <div className="updater-row">
          <span className="updater-badge updater-ok">✓ Up to date</span>
          <button type="button" className="sp-btn updater-check-btn" onClick={checkForUpdate}>
            Check again
          </button>
        </div>
      )}

      {phase.kind === 'available' && (
        <div className="updater-available">
          <div className="updater-badge updater-new">↑ v{phase.version} available</div>
          {phase.notes && (
            <p className="updater-notes">{phase.notes}</p>
          )}
          <div className="updater-row">
            <button type="button" className="sp-btn sp-btn-primary" onClick={installUpdate}>
              Download &amp; install
            </button>
            <button type="button" className="sp-btn" onClick={() => setPhase({ kind: 'idle' })}>
              Later
            </button>
          </div>
        </div>
      )}

      {phase.kind === 'downloading' && (
        <div className="updater-progress-wrap">
          <div className="updater-status">Downloading…</div>
          <div className="updater-bar-track">
            <div
              className="updater-bar-fill"
              style={{ width: phase.pct != null ? `${phase.pct}%` : '100%', opacity: phase.pct != null ? 1 : 0.4 }}
            />
          </div>
          {phase.pct != null && (
            <span className="updater-pct">{phase.pct}%</span>
          )}
        </div>
      )}

      {phase.kind === 'ready' && (
        <div className="updater-available">
          <div className="updater-badge updater-ok">✓ Update installed</div>
          <p className="updater-notes">Relaunch to apply the update.</p>
          <button type="button" className="sp-btn sp-btn-primary" onClick={doRelaunch}>
            Relaunch now
          </button>
        </div>
      )}

      {phase.kind === 'error' && (
        <div className="updater-available">
          <div className="updater-badge updater-err">✕ {phase.msg}</div>
          <button type="button" className="sp-btn" onClick={() => setPhase({ kind: 'idle' })}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
