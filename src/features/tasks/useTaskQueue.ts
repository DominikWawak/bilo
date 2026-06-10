import { useCallback, useRef, useState } from 'react'
import type { Task, TaskStatus } from './TaskStatusBar'

const DISMISS_DELAY_MS = 2200  // how long a done/error task lingers

export type TaskQueue = {
  tasks: Task[]
  startTask: (id: string, label: string) => void
  finishTask: (id: string, error?: string) => void
}

export function useTaskQueue(): TaskQueue {
  const [tasks, setTasks] = useState<Task[]>([])
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const startTask = useCallback((id: string, label: string) => {
    // Cancel any pending auto-dismiss for this id
    const existing = timers.current.get(id)
    if (existing) clearTimeout(existing)
    timers.current.delete(id)

    setTasks((prev) => {
      const filtered = prev.filter((t) => t.id !== id)
      return [...filtered, { id, label, status: 'running' as TaskStatus }]
    })
  }, [])

  const finishTask = useCallback((id: string, error?: string) => {
    const status: TaskStatus = error ? 'error' : 'done'

    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status, detail: error ?? undefined } : t,
      ),
    )

    // Auto-dismiss after delay
    const timer = setTimeout(() => {
      setTasks((prev) => prev.filter((t) => t.id !== id))
      timers.current.delete(id)
    }, DISMISS_DELAY_MS)

    timers.current.set(id, timer)
  }, [])

  return { tasks, startTask, finishTask }
}
