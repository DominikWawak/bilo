import { useState } from 'react'

const STORAGE_KEY = 'bilo-agent-definitions'

export const AgentDefinitionsPanel = () => {
  const [definition, setDefinition] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved ?? ''
  })

  const handleChange = (value: string) => {
    setDefinition(value)
    localStorage.setItem(STORAGE_KEY, value)
  }

  return (
    <section className="drawer-section">
      <h3>Agent Definition</h3>
      <p>Plain text intent. app compiles structure later.</p>
      <textarea
        value={definition}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="Example: Every day 6pm summarize linked notes for standup."
        className="drawer-textarea"
      />
    </section>
  )
}
