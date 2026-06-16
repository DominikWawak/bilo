import { useEffect, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import type { AIAgent, AIRuntimeSettings } from './useAIRuntimeSettings'

type Props = {
  settings: AIRuntimeSettings
  onUpdateSettings: (patch: Partial<AIRuntimeSettings>) => void
  onClose: () => void
  onImportCursor?: () => void
  isImporting?: boolean
  onNotesImported?: () => void
}

export const SettingsPanel = ({ settings, onUpdateSettings: update, onClose, onImportCursor, isImporting, onNotesImported }: Props) => {
  const [jsonPath, setJsonPath] = useState('/tmp/bilo_data.json')
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [cursorEnabled, setCursorEnabled] = useState(false)
  const [agentsAvailable, setAgentsAvailable] = useState<{ cursor: boolean; kiro: boolean } | null>(null)
  const [search, setSearch] = useState('')

  const q = search.toLowerCase().trim()
  const show = (keywords: string) => !q || keywords.toLowerCase().includes(q)

  useEffect(() => {
    invoke<string>('detect_agents').then((raw) => {
      try { setAgentsAvailable(JSON.parse(raw) as { cursor: boolean; kiro: boolean }) }
      catch { /* ignore */ }
    }).catch(() => { /* binary not found yet */ })
  }, [])

  // Sync state
  const [syncRepoUrl, setSyncRepoUrl] = useState(() => localStorage.getItem('bilo-sync-repo') ?? '')
  const [syncToken, setSyncToken] = useState(() => localStorage.getItem('bilo-sync-token') ?? '')
  const [syncInterval, setSyncInterval] = useState<string>(() => localStorage.getItem('bilo-sync-interval') ?? 'manual')
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)

  const saveSync = () => {
    localStorage.setItem('bilo-sync-repo', syncRepoUrl)
    localStorage.setItem('bilo-sync-token', syncToken)
    localStorage.setItem('bilo-sync-interval', syncInterval)
    setSyncMsg('Saved.')
    setTimeout(() => setSyncMsg(null), 2000)
  }

  const runSync = async (direction: 'push' | 'pull') => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const notesRaw = localStorage.getItem('bilo-notes-store') ?? '[]'
      const sectionsRaw = localStorage.getItem('bilo-sections-store') ?? '[]'
      const payload = JSON.stringify({ notes: JSON.parse(notesRaw), sections: JSON.parse(sectionsRaw) })

      if (direction === 'push') {
        await invoke('github_sync_push', { repoUrl: syncRepoUrl, token: syncToken, payload })
        setSyncMsg('Pushed to GitHub.')
      } else {
        const result = await invoke<string>('github_sync_pull', { repoUrl: syncRepoUrl, token: syncToken })
        const data = JSON.parse(result) as { notes?: unknown[]; sections?: unknown[] }
        if (data.notes) {
          localStorage.setItem('bilo-notes-store', JSON.stringify(data.notes))
          localStorage.setItem('bilo-sections-store', JSON.stringify(data.sections ?? []))
          onNotesImported?.()
          setSyncMsg('Pulled from GitHub.')
        } else {
          setSyncMsg('No data returned.')
        }
      }
    } catch (e) {
      setSyncMsg(`Error: ${String(e)}`)
    } finally {
      setSyncing(false)
    }
  }

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

      let addedNotes = 0; let updatedNotes = 0; let addedSecs = 0
      for (const sec of data.sections ?? []) {
        const s = sec as { name?: string }
        if (!existingSecNames.has(s.name ?? '')) { existingSections.push(sec as { name?: string }); existingSecNames.add(s.name ?? ''); addedSecs++ }
      }
      for (const note of data.notes ?? []) {
        const n = note as { id?: string; title?: string }
        const idx = existingNotes.findIndex((e) => { const en = e as { id?: string; title?: string }; return (n.id && en.id === n.id) || (en.title ?? '') === (n.title ?? '') })
        if (idx === -1) { existingNotes.push(note as { title?: string }); addedNotes++ }
        else { existingNotes[idx] = { ...existingNotes[idx], ...note }; updatedNotes++ }
      }
      localStorage.setItem('bilo-notes-store', JSON.stringify(existingNotes))
      localStorage.setItem('bilo-sections-store', JSON.stringify(existingSections))
      setImportMsg(`${addedNotes} added · ${updatedNotes} updated · ${addedSecs} sections.`)
      onNotesImported?.()
    } catch (e) {
      setImportMsg(`Error: ${String(e)}`)
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-page-header">
        <span className="settings-page-title">Settings</span>
        <div className="sp-header-right">
          <input
            className="sp-search"
            type="search"
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="settings-page-back" onClick={onClose} title="Back (Esc)">
            ← Back
          </button>
        </div>
      </div>

      <div className="settings-page-body">

        {/* ── AI ── */}
        {show('ai cursor kiro api key agent about me personal context') && (
        <section className="sp-section">
          <h2 className="sp-section-title">AI</h2>
          <div className="sp-fields">

            {/* Agent selector */}
            <div className="sp-field sp-field-row">
              <label className="sp-label">Agent</label>
              <div className="sp-agent-toggle">
                {(['cursor', 'kiro'] as AIAgent[]).map((a) => {
                  const available = agentsAvailable ? agentsAvailable[a] : null
                  return (
                    <button
                      key={a}
                      type="button"
                      className={`sp-agent-btn${settings.preferredAgent === a ? ' active' : ''}${available === false ? ' unavailable' : ''}`}
                      onClick={() => update({ preferredAgent: a })}
                      title={available === false ? `${a}-agent binary not found` : undefined}
                    >
                      {a}
                      {available === true && <span className="sp-agent-dot sp-agent-dot--ok" />}
                      {available === false && <span className="sp-agent-dot sp-agent-dot--err" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Cursor key */}
            <div className="sp-field">
              <label className="sp-label" htmlFor="acp-key">Cursor API key</label>
              <input
                id="acp-key"
                type="password"
                className="sp-input"
                value={settings.acpApiKey}
                onChange={(e) => update({ acpApiKey: e.target.value })}
                placeholder="cursor_…"
                autoComplete="off"
              />
              <p className="sp-hint">Get at <strong>cursor.com/dashboard/integrations</strong>. Cursor CLI must be installed.</p>
            </div>

            {/* Kiro key */}
            <div className="sp-field">
              <label className="sp-label" htmlFor="kiro-key">Kiro API key</label>
              <input
                id="kiro-key"
                type="password"
                className="sp-input"
                value={settings.kiroApiKey}
                onChange={(e) => update({ kiroApiKey: e.target.value })}
                placeholder="kiro_…"
                autoComplete="off"
              />
              <p className="sp-hint">Requires Kiro to be installed. <code>~/.local/bin/kiro-agent</code> must exist.</p>
            </div>

            <div className="sp-field">
              <label className="sp-label" htmlFor="personal-ctx">About me</label>
              <textarea
                id="personal-ctx"
                className="sp-input sp-textarea"
                value={settings.personalContext}
                onChange={(e) => update({ personalContext: e.target.value })}
                placeholder="Senior engineer working on contact-list-service…"
                rows={3}
              />
              <p className="sp-hint">Context given to the AI on every query.</p>
            </div>
          </div>
        </section>)}

        {/* ── Jira ── */}
        {show('jira atlassian ticket link base url email api token') && (
        <section className="sp-section">
          <h2 className="sp-section-title">Jira</h2>
          <div className="sp-fields">
            <div className="sp-field">
              <label className="sp-label" htmlFor="jira-url">Base URL</label>
              <input id="jira-url" type="text" className="sp-input" value={settings.jiraBaseUrl} onChange={(e) => update({ jiraBaseUrl: e.target.value })} placeholder="https://yourorg.atlassian.net" />
            </div>
            <div className="sp-field">
              <label className="sp-label" htmlFor="jira-email">Email</label>
              <input id="jira-email" type="email" className="sp-input" value={settings.jiraEmail} onChange={(e) => update({ jiraEmail: e.target.value })} placeholder="you@company.com" />
            </div>
            <div className="sp-field">
              <label className="sp-label" htmlFor="jira-token">API token</label>
              <input id="jira-token" type="password" className="sp-input" value={settings.jiraApiToken} onChange={(e) => update({ jiraApiToken: e.target.value })} placeholder="From id.atlassian.com/manage-profile/security/api-tokens" autoComplete="off" />
              <p className="sp-hint">Paste any Jira link in a note — it becomes a clickable ticket card.</p>
            </div>
          </div>
        </section>)}

        {/* ── Sync ── */}
        {show('sync github repository token backup push pull auto') && (
        <section className="sp-section">
          <h2 className="sp-section-title">GitHub Sync</h2>
          <p className="sp-desc">Back up your notes to a private GitHub repository. Pull on any device to restore.</p>
          <div className="sp-fields">
            <div className="sp-field">
              <label className="sp-label" htmlFor="sync-repo">Repository URL</label>
              <input id="sync-repo" type="text" className="sp-input" value={syncRepoUrl} onChange={(e) => setSyncRepoUrl(e.target.value)} placeholder="https://github.com/you/my-bilo-notes" />
            </div>
            <div className="sp-field">
              <label className="sp-label" htmlFor="sync-token">Personal access token</label>
              <input id="sync-token" type="password" className="sp-input" value={syncToken} onChange={(e) => setSyncToken(e.target.value)} placeholder="ghp_…" autoComplete="off" />
            </div>
            <div className="sp-field sp-field-row">
              <label className="sp-label" htmlFor="sync-interval">Auto-sync</label>
              <select id="sync-interval" className="sp-select" value={syncInterval} onChange={(e) => setSyncInterval(e.target.value)}>
                <option value="manual">Manual only</option>
                <option value="5">Every 5 min</option>
                <option value="15">Every 15 min</option>
                <option value="60">Every hour</option>
              </select>
            </div>
          </div>
          <div className="sp-actions">
            <button type="button" className="sp-btn sp-btn-primary" onClick={saveSync}>Save</button>
            <button type="button" className="sp-btn" disabled={syncing || !syncRepoUrl || !syncToken} onClick={() => void runSync('push')}>↑ Push</button>
            <button type="button" className="sp-btn" disabled={syncing || !syncRepoUrl || !syncToken} onClick={() => void runSync('pull')}>↓ Pull</button>
          </div>
          {syncMsg && <p className={`sp-msg${syncMsg.startsWith('Error') ? ' sp-msg--error' : ''}`}>{syncMsg}</p>}
        </section>)}

        {/* ── Import ── */}
        {show('import json notes cursor chat history transcripts') && (
        <section className="sp-section">
          <h2 className="sp-section-title">Import</h2>

          {/* JSON import always visible */}
          <div className="sp-fields">
            <div className="sp-field">
              <label className="sp-label" htmlFor="json-path">Notes JSON file path</label>
              <input id="json-path" type="text" className="sp-input" value={jsonPath} onChange={(e) => setJsonPath(e.target.value)} placeholder="/tmp/bilo_data.json" />
            </div>
          </div>
          <div className="sp-actions">
            <button type="button" className="sp-btn sp-btn-primary" onClick={() => void handleImportJson()}>Import JSON</button>
          </div>
          {importMsg && <p className={`sp-msg${importMsg.startsWith('Error') ? ' sp-msg--error' : ''}`}>{importMsg}</p>}

          {/* Cursor chats — behind a toggle */}
          <div className="sp-toggle-row">
            <label className="sp-toggle-label">
              <input type="checkbox" className="sp-toggle-check" checked={cursorEnabled} onChange={(e) => setCursorEnabled(e.target.checked)} />
              <span>Import Cursor chat history</span>
            </label>
            <p className="sp-hint">Summarise past Cursor AI sessions into organised notes.</p>
          </div>

          {cursorEnabled && (
            <div className="sp-fields sp-fields-indented">
              <div className="sp-field">
                <label className="sp-label" htmlFor="cursor-dir">Transcripts directory</label>
                <input
                  id="cursor-dir"
                  type="text"
                  className="sp-input"
                  value={settings.cursorTranscriptsDir}
                  onChange={(e) => update({ cursorTranscriptsDir: e.target.value })}
                  placeholder="~/.cursor/projects"
                />
              </div>
              <div className="sp-actions">
                <button type="button" className="sp-btn sp-btn-primary" onClick={onImportCursor} disabled={isImporting}>
                  {isImporting ? 'Importing…' : 'Import chats'}
                </button>
              </div>
            </div>
          )}
        </section>)}

      </div>
    </div>
  )
}
