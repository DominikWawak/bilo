import { useCallback, useMemo, useState } from 'react'

export type AIAgent = 'cursor' | 'kiro'

export type AIRuntimeSettings = {
  acpApiKey: string
  kiroApiKey: string
  preferredAgent: AIAgent
  personalContext: string
  cursorTranscriptsDir: string
  // Jira integration
  jiraBaseUrl: string
  jiraEmail: string
  jiraApiToken: string
}

const STORAGE_KEY = 'bilo-ai-runtime-settings'

const defaultSettings: AIRuntimeSettings = {
  acpApiKey: '',
  kiroApiKey: '',
  preferredAgent: 'cursor',
  personalContext: '',
  cursorTranscriptsDir: '',
  jiraBaseUrl: '',
  jiraEmail: '',
  jiraApiToken: '',
}

const readSettings = (): AIRuntimeSettings => {
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return defaultSettings
  try {
    const p = JSON.parse(raw) as Partial<AIRuntimeSettings>
    return {
      acpApiKey: p.acpApiKey ?? defaultSettings.acpApiKey,
      kiroApiKey: p.kiroApiKey ?? defaultSettings.kiroApiKey,
      preferredAgent: p.preferredAgent ?? defaultSettings.preferredAgent,
      personalContext: p.personalContext ?? defaultSettings.personalContext,
      cursorTranscriptsDir: p.cursorTranscriptsDir ?? defaultSettings.cursorTranscriptsDir,
      jiraBaseUrl: p.jiraBaseUrl ?? defaultSettings.jiraBaseUrl,
      jiraEmail: p.jiraEmail ?? defaultSettings.jiraEmail,
      jiraApiToken: p.jiraApiToken ?? defaultSettings.jiraApiToken,
    }
  } catch {
    return defaultSettings
  }
}

export const useAIRuntimeSettings = () => {
  const [settings, setSettings] = useState<AIRuntimeSettings>(() => readSettings())

  const update = useCallback((patch: Partial<AIRuntimeSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return useMemo(() => ({ settings, update }), [settings, update])
}
