import { Check, Calendar } from "lucide-react"
import { store } from "../store"
import type { Todo } from "../types"

export function TodoMiniCard({ todo }: { todo: Todo }) {
  return (
    <div
      onClick={() => {
        if (todo.entryId) {
          store.selectEntry(todo.entryId)
        }
      }}
      className="group flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-surface hover:border-border/60 hover:shadow-card transition-all cursor-pointer"
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          store.updateTodo(todo.id, {
            status: todo.status === "done" ? "pending" : "done",
          })
        }}
        className="flex-shrink-0"
      >
        {todo.status === "done" ? (
          <div className="w-4 h-4 rounded-full bg-success text-white flex items-center justify-center">
            <Check className="w-2.5 h-2.5" />
          </div>
        ) : (
          <div className="w-4 h-4 rounded-full border border-border group-hover:border-primary transition-colors" />
        )}
      </button>
      <span
        className={`flex-1 text-sm truncate whitespace-nowrap ${
          todo.status === "done" ? "line-through text-text-muted" : "text-text"
        }`}
        title={todo.title}
      >
        {todo.title}
      </span>
      {todo.dueDate && (
        <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] text-text-muted whitespace-nowrap">
          <Calendar className="w-3 h-3" />
          {todo.dueDate}
        </span>
      )}
    </div>
  )
}
