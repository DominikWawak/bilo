import { useRef, useState } from 'react'
import { type JiraIssue, type JiraSettings, issueToNoteBody, searchJira } from './jiraService'

type Props = {
  jiraSettings: JiraSettings
  onCreateNote: (title: string, body: string) => void
}

export const JiraPanel = ({ jiraSettings, onCreateNote }: Props) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<JiraIssue[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const runSearch = async (jql: string) => {
    if (!jql.trim()) return
    setLoading(true)
    setError(null)
    try {
      const issues = await searchJira(jiraSettings, jql)
      setResults(issues)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') runSearch(query)
  }

  const statusDot = (issue: JiraIssue) => {
    if (issue.statusCategory === 'done') return <span className="jira-dot done" />
    if (issue.statusCategory === 'inProgress') return <span className="jira-dot progress" />
    return <span className="jira-dot todo" />
  }

  const isConfigured = jiraSettings.baseUrl && jiraSettings.email && jiraSettings.apiToken

  return (
    <div className="jira-panel">
      <div className="jira-search-row">
        <input
          ref={inputRef}
          className="jira-search-input"
          type="text"
          placeholder={isConfigured ? 'JQL or ticket e.g. LM-4030' : 'Configure Jira in settings first'}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          disabled={!isConfigured}
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="jira-search-btn"
          onClick={() => runSearch(query)}
          disabled={!isConfigured || loading}
        >
          {loading ? '…' : '→'}
        </button>
      </div>

      {!isConfigured && (
        <p className="jira-hint">Add Jira URL, email, and API token in ⚙ settings below.</p>
      )}

      {error && <p className="jira-error">{error}</p>}

      {results.length > 0 && (
        <ul className="jira-results">
          {results.map((issue) => (
            <li key={issue.key} className="jira-result-item">
              <div className="jira-result-header">
                {statusDot(issue)}
                <span className="jira-key">{issue.key}</span>
                <span className="jira-type">{issue.issuetype}</span>
                <button
                  type="button"
                  className="jira-add-btn"
                  title="Add as note"
                  onClick={() => onCreateNote(`${issue.key} — ${issue.summary}`, issueToNoteBody(issue))}
                >
                  +
                </button>
              </div>
              <p className="jira-summary">{issue.summary}</p>
              <span className="jira-meta">{issue.status} · {issue.updated}</span>
            </li>
          ))}
        </ul>
      )}

      {results.length === 0 && !loading && !error && isConfigured && query && (
        <p className="jira-hint">No results. Try a JQL like <code>assignee = currentUser()</code></p>
      )}
    </div>
  )
}
