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
  // Open first, completed pushed under.
  const ordered = [...open, ...done]

  /** The panel is a touch screen with a keyboard on the far side of the desk. */
  function startAdding(): void {
    void window.hyte.focusPanel()
    setAdding(true)
  }

  async function submit(): Promise<void> {
    const input = inputRef.current
    const value = input?.value ?? ''
    if (!value.trim()) {
      setAdding(false)
      return
    }
    await window.hyte.addTask(value)
    // Stay open for the next one: lists are usually written in a run.
    if (input) {
      input.value = ''
      input.focus()
    }
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
          <button class="task-done-adding" onClick={() => setAdding(false)}>
            Done
          </button>
        </div>
      ) : (
        <button class="task-add" onClick={startAdding}>
          + Add a task
        </button>
      )}
    </div>
  )
}
