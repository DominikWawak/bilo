import { useEffect, useState } from 'react'
import {
  getRuntimeConfig,
  getRuntimeStatus,
  setRuntimeConfig,
  startLlama,
  startWhisper,
  stopAllRuntimes,
  type RuntimeStatus,
} from './runtimeApi'
import { useAIRuntimeSettings } from './useAIRuntimeSettings'

export const AISettingsCard = () => {
  const { settings, update } = useAIRuntimeSettings()
  const [status, setStatus] = useState<RuntimeStatus>({
    llamaRunning: false,
    whisperRunning: false,
    lastError: null,
  })
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [remoteConfig, remoteStatus] = await Promise.all([
          getRuntimeConfig(),
          getRuntimeStatus(),
        ])

        update({
          llamaBinaryPath: remoteConfig.llamaBinaryPath,
          whisperBinaryPath: remoteConfig.whisperBinaryPath,
          modelPath: remoteConfig.llamaModelPath,
          whisperModelPath: remoteConfig.whisperModelPath,
          contextSize: remoteConfig.contextSize,
          threads: remoteConfig.threads,
          gpuLayers: remoteConfig.gpuLayers,
          host: remoteConfig.host,
          port: remoteConfig.port,
        })
        setStatus(remoteStatus)
      } catch {
        setRuntimeMessage('Runtime API unavailable in browser-only mode.')
      }
    }

    void load()
  }, [update])

  const applyConfig = async () => {
    try {
      await setRuntimeConfig({
        llamaBinaryPath: settings.llamaBinaryPath,
        whisperBinaryPath: settings.whisperBinaryPath,
        llamaModelPath: settings.modelPath,
        whisperModelPath: settings.whisperModelPath,
        contextSize: settings.contextSize,
        threads: settings.threads,
        gpuLayers: settings.gpuLayers,
        host: settings.host,
        port: settings.port,
      })
      setRuntimeMessage('Runtime config applied.')
    } catch (error) {
      setRuntimeMessage(`Apply failed: ${String(error)}`)
    }
  }

  const handleStartLlama = async () => {
    try {
      const nextStatus = await startLlama()
      setStatus(nextStatus)
      setRuntimeMessage('Llama runtime started.')
    } catch (error) {
      setRuntimeMessage(`Start llama failed: ${String(error)}`)
    }
  }

  const handleStartWhisper = async () => {
    try {
      const nextStatus = await startWhisper()
      setStatus(nextStatus)
      setRuntimeMessage('Whisper runtime started.')
    } catch (error) {
      setRuntimeMessage(`Start whisper failed: ${String(error)}`)
    }
  }

  const handleStopAll = async () => {
    try {
      const nextStatus = await stopAllRuntimes()
      setStatus(nextStatus)
      setRuntimeMessage('All runtimes stopped.')
    } catch (error) {
      setRuntimeMessage(`Stop failed: ${String(error)}`)
    }
  }

  return (
    <section className="panel">
      <h2>Local AI Runtime</h2>
      <p>Llama.cpp runtime controls persisted locally.</p>
      <div className="pill-row">
        <button
          type="button"
          className={settings.mode === 'basic' ? 'active' : ''}
          onClick={() => update({ mode: 'basic' })}
        >
          Basic
        </button>
        <button
          type="button"
          className={settings.mode === 'advanced' ? 'active' : ''}
          onClick={() => update({ mode: 'advanced' })}
        >
          Advanced
        </button>
      </div>

      <label className="field-checkbox">
        <input
          type="checkbox"
          checked={settings.autoCleanTranscript}
          onChange={(event) =>
            update({ autoCleanTranscript: event.target.checked })
          }
        />
        <span>Auto-clean voice transcript before insert</span>
      </label>

      <label className="field-label">
        Llama binary
        <input
          type="text"
          value={settings.llamaBinaryPath}
          onChange={(event) => update({ llamaBinaryPath: event.target.value })}
        />
      </label>

      <label className="field-label">
        Whisper binary
        <input
          type="text"
          value={settings.whisperBinaryPath}
          onChange={(event) => update({ whisperBinaryPath: event.target.value })}
        />
      </label>

      <label className="field-label">
        Model
        <input
          type="text"
          value={settings.modelPath}
          onChange={(event) => update({ modelPath: event.target.value })}
        />
      </label>

      <label className="field-label">
        Whisper model
        <input
          type="text"
          value={settings.whisperModelPath}
          onChange={(event) => update({ whisperModelPath: event.target.value })}
        />
      </label>

      {settings.mode === 'advanced' ? (
        <div className="advanced-grid">
          <label className="field-label">
            Context
            <input
              type="number"
              min={1024}
              step={512}
              value={settings.contextSize}
              onChange={(event) =>
                update({ contextSize: Number(event.target.value) || 1024 })
              }
            />
          </label>
          <label className="field-label">
            Threads
            <input
              type="number"
              min={1}
              value={settings.threads}
              onChange={(event) => update({ threads: Number(event.target.value) || 1 })}
            />
          </label>
          <label className="field-label">
            GPU layers
            <input
              type="number"
              min={0}
              value={settings.gpuLayers}
              onChange={(event) =>
                update({ gpuLayers: Number(event.target.value) || 0 })
              }
            />
          </label>
          <label className="field-label">
            Host
            <input
              type="text"
              value={settings.host}
              onChange={(event) => update({ host: event.target.value })}
            />
          </label>
          <label className="field-label">
            Port
            <input
              type="number"
              min={1}
              max={65535}
              value={settings.port}
              onChange={(event) => update({ port: Number(event.target.value) || 8088 })}
            />
          </label>
        </div>
      ) : (
        <ul className="compact-list">
          <li>Preset: balanced local mode</li>
          <li>Preview-before-apply required</li>
          <li>Voice dictation pipeline attaches here next</li>
        </ul>
      )}

      <ul className="compact-list">
        <li>Llama running: {status.llamaRunning ? 'yes' : 'no'}</li>
        <li>Whisper running: {status.whisperRunning ? 'yes' : 'no'}</li>
        {status.lastError ? <li>Error: {status.lastError}</li> : null}
      </ul>

      <div className="runtime-actions">
        <button type="button" onClick={applyConfig}>
          Apply config
        </button>
        <button type="button" onClick={handleStartLlama}>
          Start llama
        </button>
        <button type="button" onClick={handleStartWhisper}>
          Start whisper
        </button>
        <button type="button" onClick={handleStopAll}>
          Stop all
        </button>
      </div>

      {runtimeMessage ? <p>{runtimeMessage}</p> : null}
    </section>
  )
}
