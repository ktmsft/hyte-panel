import { useRef, useState } from 'preact/hooks'
import type { Task, TaskProviderId } from '@shared/types'

interface Props {
  tasks: Task[]
  provider: TaskProviderId
}

const PROVIDER_LABEL: Record<TaskProviderId, string> = {
  local: 'On this PC',
  google: 'Google Tasks',
  microsoft: 'Microsoft To Do'
}

export function Todos({ tasks, provider }: Props) {
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const open = tasks.filter((task) => !task.done)
  const done = tasks.filter((task) => task.done)
  // Open tasks first, completed ones kept visible but pushed under them.
  const ordered = [...open, ...done]

  async function submit(): Promise<void> {
    const value = inputRef.current?.value ?? ''
    if (value.trim()) await window.hyte.addTask(value)
    setAdding(false)
  }

  return (
    <div class="card">
      <div class="card-title">
        <span>To do</span>
        <span>
          {open.length} open · {PROVIDER_LABEL[provider]}
        </span>
      </div>

      <div class="card-body">
        {ordered.length === 0 && <div class="empty">Nothing on the list.</div>}
        {ordered.map((task) => (
          <button
            key={task.id}
            class={`task${task.done ? ' done' : ''}`}
            onClick={() => void window.hyte.toggleTask(task.id)}
          >
            <span class="task-box">✓</span>
            <span class="task-title">{task.title}</span>
          </button>
        ))}
      </div>

      {adding ? (
        <div class="task-input">
          {/* Phase 4 swaps this for the on-screen keyboard. It works with a real
              keyboard today, which is enough to exercise the flow. */}
          <input
            ref={inputRef}
            type="text"
            placeholder="New task"
            autoFocus
            onKeyDown={(event) => {
              if (event.key === 'Enter') void submit()
              if (event.key === 'Escape') setAdding(false)
            }}
          />
          <button onClick={() => void submit()}>Add</button>
        </div>
      ) : (
        <button class="task-add" onClick={() => setAdding(true)}>
          + Add a task
        </button>
      )}
    </div>
  )
}
