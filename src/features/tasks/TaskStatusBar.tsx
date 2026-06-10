import { useEffect, useRef } from 'react'

export type TaskStatus = 'running' | 'done' | 'error'

export type Task = {
  id: string
  label: string
  status: TaskStatus
  detail?: string
}

type Props = {
  tasks: Task[]
}

const STATUS_ICON: Record<TaskStatus, string> = {
  running: '◌',
  done: '◉',
  error: '◎',
}

const TaskPill = ({ task }: { task: Task }) => {
  const ref = useRef<HTMLDivElement>(null)

  // Animate in on mount
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.opacity = '0'
    el.style.transform = 'translateY(6px)'
    requestAnimationFrame(() => {
      el.style.transition = 'opacity 180ms ease, transform 180ms ease'
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  }, [])

  return (
    <div ref={ref} className={`task-pill task-pill--${task.status}`}>
      <span className={`task-pill-icon${task.status === 'running' ? ' task-pill-spin' : ''}`}>
        {STATUS_ICON[task.status]}
      </span>
      <span className="task-pill-label">{task.label}</span>
      {task.detail && <span className="task-pill-detail">{task.detail}</span>}
    </div>
  )
}

export const TaskStatusBar = ({ tasks }: Props) => {
  if (tasks.length === 0) return null

  return (
    <div className="task-status-bar" aria-live="polite" aria-label="Background tasks">
      {tasks.map((t) => (
        <TaskPill key={t.id} task={t} />
      ))}
    </div>
  )
}
