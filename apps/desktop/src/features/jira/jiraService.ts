export type JiraIssue = {
  key: string
  summary: string
  status: string
  statusCategory: 'done' | 'inProgress' | 'todo'
  issuetype: string
  created: string
  updated: string
  priority: string
}

export type JiraSettings = {
  baseUrl: string
  email: string
  apiToken: string
}

export async function searchJira(
  settings: JiraSettings,
  jql: string,
  maxResults = 30,
): Promise<JiraIssue[]> {
  if (!settings.baseUrl || !settings.email || !settings.apiToken) {
    throw new Error('Jira not configured. Add your Jira URL, email, and API token in settings.')
  }

  const auth = btoa(`${settings.email}:${settings.apiToken}`)
  const base = settings.baseUrl.replace(/\/$/, '')
  const params = new URLSearchParams({
    jql,
    maxResults: String(maxResults),
    fields: 'summary,status,issuetype,created,updated,priority',
  })

  const res = await fetch(`${base}/rest/api/3/search?${params}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Jira search failed (${res.status}): ${body.slice(0, 200)}`)
  }

  const data = await res.json()

  return (data.issues ?? []).map(
    (i: {
      key: string
      fields: {
        summary: string
        status: { name: string; statusCategory: { key: string } }
        issuetype: { name: string }
        created: string
        updated: string
        priority?: { name: string }
      }
    }) => {
      const catKey = i.fields.status.statusCategory.key
      const statusCategory: JiraIssue['statusCategory'] =
        catKey === 'done' ? 'done' : catKey === 'indeterminate' ? 'inProgress' : 'todo'
      return {
        key: i.key,
        summary: i.fields.summary,
        status: i.fields.status.name,
        statusCategory,
        issuetype: i.fields.issuetype.name,
        created: i.fields.created?.slice(0, 10) ?? '',
        updated: i.fields.updated?.slice(0, 10) ?? '',
        priority: i.fields.priority?.name ?? 'Medium',
      }
    },
  )
}

export function issueToNoteBody(issue: JiraIssue): string {
  const statusEmoji = issue.statusCategory === 'done' ? '✓' : issue.statusCategory === 'inProgress' ? '→' : '·'
  return [
    `<h2>${issue.key} — ${issue.summary}</h2>`,
    `<p><strong>Type:</strong> ${issue.issuetype} &nbsp;|&nbsp; <strong>Status:</strong> ${statusEmoji} ${issue.status} &nbsp;|&nbsp; <strong>Priority:</strong> ${issue.priority}</p>`,
    `<p><strong>Created:</strong> ${issue.created} &nbsp;|&nbsp; <strong>Updated:</strong> ${issue.updated}</p>`,
    '<p></p>',
  ].join('\n')
}
