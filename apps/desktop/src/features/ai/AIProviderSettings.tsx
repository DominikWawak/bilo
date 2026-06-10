import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useAIRuntimeSettings } from './useAIRuntimeSettings'

type Props = {
  onImportCursor?: () => void
  isImporting?: boolean
  onNotesImported?: () => void
}

export const AIProviderSettings = ({ onImportCursor, isImporting, onNotesImported }: Props) => {
  const { settings, update } = useAIRuntimeSettings()
  const [open, setOpen] = useState(false)
  const [jsonPath, setJsonPath] = useState('/tmp/bilo_data.json')
  const [importMsg, setImportMsg] = useState<string | null>(null)

  const handleImportJson = async () => {
    setImportMsg(null)
    try {
      const raw = await invoke<string>('read_notes_json', { path: jsonPath })
      const data = JSON.parse(raw) as { notes?: unknown[]; sections?: unknown[] }

      const notesRaw = localStorage.getItem('bilo-notes-store')
      const sectionsRaw = localStorage.getItem('bilo-sections-store')
      const existingNotes: { title?: string }[] = notesRaw ? JSON.parse(notesRaw) as { title?: string }[] : []
      const existingSections: { name?: string }[] = sectionsRaw ? JSON.parse(sectionsRaw) as { name?: string }[] : []

      const existingSecNames = new Set<string>(existingSections.map((s) => s.name ?? ''))

      let addedNotes = 0
      let updatedNotes = 0
      let addedSecs = 0

      for (const sec of data.sections ?? []) {
        const s = sec as { name?: string }
        if (!existingSecNames.has(s.name ?? '')) {
          existingSections.push(sec as { name?: string })
          existingSecNames.add(s.name ?? '')
          addedSecs++
        }
      }

      for (const note of data.notes ?? []) {
        const n = note as { id?: string; title?: string }
        const idx = existingNotes.findIndex((e) => {
          const en = e as { id?: string; title?: string }
          return (n.id && en.id === n.id) || (en.title ?? '') === (n.title ?? '')
        })
        if (idx === -1) {
          existingNotes.push(note as { title?: string })
          addedNotes++
        } else {
          existingNotes[idx] = { ...existingNotes[idx], ...note }
          updatedNotes++
        }
      }

      localStorage.setItem('bilo-notes-store', JSON.stringify(existingNotes))
      localStorage.setItem('bilo-sections-store', JSON.stringify(existingSections))
      setImportMsg(`Done — ${addedNotes} added, ${updatedNotes} updated, ${addedSecs} sections.`)
      onNotesImported?.()
    } catch (e) {
      setImportMsg(`Error: ${String(e)}`)
    }
  }

  return (
    <div className="ai-settings-footer">
      {open && (
        <div className="ai-settings-panel">
          <p className="ai-hint">
            llama.cpp · server at {settings.host}:{settings.port}
          </p>

          {/* Personal context */}
          <label className="ai-field">
            <span>About me (AI context)</span>
            <textarea
              value={settings.personalContext}
              onChange={(e) => update({ personalContext: e.target.value })}
              placeholder="e.g. Senior software engineer, working on a Tauri note app called Bilo…"
              className="ai-textarea"
              rows={3}
            />
          </label>

          <label className="ai-field">
            <span>Host</span>
            <input
              type="text"
              value={settings.host}
              onChange={(e) => update({ host: e.target.value })}
              placeholder="127.0.0.1"
              className="ai-input"
            />
          </label>

          <label className="ai-field">
            <span>Port</span>
            <input
              type="number"
              value={settings.port}
              onChange={(e) => update({ port: Number(e.target.value) })}
              placeholder="8088"
              className="ai-input"
            />
          </label>

          <label className="ai-field">
            <span>Model path</span>
            <input
              type="text"
              value={settings.modelPath}
              onChange={(e) => update({ modelPath: e.target.value })}
              placeholder="/path/to/model.gguf"
              className="ai-input"
            />
          </label>

          {/* Cursor import */}
          <div className="ai-field">
            <span>Cursor transcripts dir</span>
            <input
              type="text"
              value={settings.cursorTranscriptsDir}
              onChange={(e) => update({ cursorTranscriptsDir: e.target.value })}
              placeholder="~/.cursor/projects"
              className="ai-input"
            />
            <button
              type="button"
              className="ai-import-btn"
              onClick={onImportCursor}
              disabled={isImporting}
            >
              {isImporting ? 'Importing…' : 'Import Cursor chats'}
            </button>
          </div>

          {/* Notes JSON import */}
          <div className="ai-section-divider">Import notes</div>
          <div className="ai-field">
            <span>JSON file path</span>
            <input
              type="text"
              value={jsonPath}
              onChange={(e) => setJsonPath(e.target.value)}
              placeholder="/tmp/bilo_data.json"
              className="ai-input"
            />
            <button type="button" className="ai-import-btn" onClick={() => void handleImportJson()}>
              Load into app
            </button>
          </div>
          {importMsg && <p className="ai-import-msg">{importMsg}</p>}

          {/* Jira */}
          <div className="ai-section-divider">Jira</div>

          <label className="ai-field">
            <span>Jira base URL</span>
            <input
              type="text"
              value={settings.jiraBaseUrl}
              onChange={(e) => update({ jiraBaseUrl: e.target.value })}
              placeholder="https://yourorg.atlassian.net"
              className="ai-input"
            />
          </label>

          <label className="ai-field">
            <span>Jira email</span>
            <input
              type="email"
              value={settings.jiraEmail}
              onChange={(e) => update({ jiraEmail: e.target.value })}
              placeholder="you@company.com"
              className="ai-input"
            />
          </label>

          <label className="ai-field">
            <span>Jira API token</span>
            <input
              type="password"
              value={settings.jiraApiToken}
              onChange={(e) => update({ jiraApiToken: e.target.value })}
              placeholder="API token from id.atlassian.com"
              className="ai-input"
            />
          </label>

          {settings.mode === 'advanced' && (
            <>
              <label className="ai-field">
                <span>llama-server binary</span>
                <input
                  type="text"
                  value={settings.llamaBinaryPath}
                  onChange={(e) => update({ llamaBinaryPath: e.target.value })}
                  placeholder="llama-server"
                  className="ai-input"
                />
              </label>

              <label className="ai-field">
                <span>Context size</span>
                <input
                  type="number"
                  value={settings.contextSize}
                  onChange={(e) => update({ contextSize: Number(e.target.value) })}
                  className="ai-input"
                />
              </label>

              <label className="ai-field">
                <span>Threads</span>
                <input
                  type="number"
                  value={settings.threads}
                  onChange={(e) => update({ threads: Number(e.target.value) })}
                  className="ai-input"
                />
              </label>

              <label className="ai-field">
                <span>GPU layers</span>
                <input
                  type="number"
                  value={settings.gpuLayers}
                  onChange={(e) => update({ gpuLayers: Number(e.target.value) })}
                  className="ai-input"
                />
              </label>
            </>
          )}

          <button
            type="button"
            className="ai-mode-toggle"
            onClick={() => update({ mode: settings.mode === 'basic' ? 'advanced' : 'basic' })}
          >
            {settings.mode === 'basic' ? 'Advanced settings' : 'Basic settings'}
          </button>
        </div>
      )}

      <button
        type="button"
        className="ai-settings-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span>llama.cpp</span>
        <span className="ai-settings-chevron">{open ? '▾' : '▴'}</span>
      </button>
    </div>
  )
}
