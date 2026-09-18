import { useState, useMemo } from "react"
import { Check, Circle, Calendar, Bell, Flag, Link2, Plus, Trash2 } from "lucide-react"
import { store } from "../store"
import { useStore } from "../lib/observer"
import { cn } from "../lib/utils"
import { PRIORITY_LABELS } from "../types"
import type { Todo } from "../types"

type Filter = "pending" | "in_progress" | "done" | "all"

export function TodoList() {
  const state = useStore()
  const [filter, setFilter] = useState<Filter>("all")
  const [showAdd, setShowAdd] = useState(false)

  const filtered = useMemo(() => {
    let list = [...state.todos]
    if (filter !== "all") {
      list = list.filter((t) => t.status === filter)
    }
    return list.sort((a, b) => {
      // 未完成在前
      if ((a.status === "done") !== (b.status === "done")) {
        return a.status === "done" ? 1 : -1
      }
      // 优先度
      if (a.priority !== b.priority) return a.priority - b.priority
      // 截止日期
      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
      if (a.dueDate) return -1
      if (b.dueDate) return 1
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [state.todos, filter])

  const counts = useMemo(() => {
    return {
      pending: state.todos.filter((t) => t.status === "pending").length,
      in_progress: state.todos.filter((t) => t.status === "in_progress").length,
      done: state.todos.filter((t) => t.status === "done").length,
      all: state.todos.length,
    }
  }, [state.todos])

  return (
    <div className="flex-1 flex flex-col">
      {/* 头部筛选 */}
      <div className="flex items-center gap-2 px-8 pt-6 pb-4 border-b border-border-light">
        <h1 className="text-2xl font-bold text-text">待办列表</h1>
        <div className="flex-1" />
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-sm hover:bg-primary-light transition-colors"
        >
          <Plus className="w-4 h-4" />
          新建待办
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="px-8 pt-4 flex gap-1">
        {([
          { key: "all", label: "全部", count: counts.all },
          { key: "pending", label: "待处理", count: counts.pending },
          { key: "in_progress", label: "进行中", count: counts.in_progress },
          { key: "done", label: "已完成", count: counts.done },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm transition-colors",
              filter === f.key
                ? "bg-primary text-white font-medium"
                : "text-text-secondary hover:bg-surface-hover",
            )}
          >
            {f.label}
            <span className={cn(
              "ml-1.5 text-xs",
              filter === f.key ? "text-white/80" : "text-text-muted",
            )}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-2">
          {filtered.length === 0 && (
            <div className="text-center py-16 text-text-muted">
              这个分类下还没有待办 ✨
            </div>
          )}
          {filtered.map((todo) => (
            <TodoItem key={todo.id} todo={todo} />
          ))}
        </div>
      </div>

      {showAdd && (
        <AddTodoDialog onClose={() => setShowAdd(false)} />
      )}
    </div>
  )
}

function TodoItem({ todo }: { todo: Todo }) {
  const priority = PRIORITY_LABELS[todo.priority]
  const entry = todo.entryId ? store.state.entries.find((e) => e.id === todo.entryId) : null
  const isOverdue = todo.dueDate && new Date(todo.dueDate) < new Date() && todo.status !== "done"

  return (
    <div
      className={cn(
        "group flex items-start gap-3 p-4 rounded-xl border transition-all bg-surface",
        todo.status === "done"
          ? "border-border-light opacity-60"
          : isOverdue
            ? "border-danger/30 hover:border-danger/50"
            : "border-border-light hover:border-border hover:shadow-card-hover",
      )}
    >
      {/* 状态切换 */}
      <button
        onClick={() =>
          store.updateTodo(todo.id, {
            status: todo.status === "done" ? "pending" : "done",
          })
        }
        className="flex-shrink-0 mt-0.5"
      >
        {todo.status === "done" ? (
          <div className="w-5 h-5 rounded-full bg-success text-white flex items-center justify-center">
            <Check className="w-3 h-3" />
          </div>
        ) : (
          <Circle className="w-5 h-5 text-border hover:text-primary transition-colors" />
        )}
      </button>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-medium text-sm",
              todo.status === "done" && "line-through text-text-muted",
            )}
          >
            {todo.title}
          </span>
          {/* 优先级标记 */}
          <span
            className="inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded"
            style={{ backgroundColor: priority.color + "22", color: priority.color }}
          >
            <Flag className="w-2.5 h-2.5" />
            {priority.label}
          </span>
        </div>

        {/* 元信息 */}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-text-muted">
          {todo.dueDate && (
            <span className={cn(
              "flex items-center gap-0.5",
              isOverdue && "text-danger",
            )}>
              <Calendar className="w-3 h-3" />
              截止：{todo.dueDate}
            </span>
          )}
          {todo.remindAt && (
            <span className="flex items-center gap-0.5">
              <Bell className="w-3 h-3" />
              提醒：{new Date(todo.remindAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {todo.syncedToCalendar && (
            <span className="flex items-center gap-0.5 text-success">
              📅 已同步
            </span>
          )}
          {todo.entryId && entry && (
            <button
              onClick={() => store.selectEntry(todo.entryId!)}
              className="flex items-center gap-0.5 hover:text-primary transition-colors"
              title={`来自：${entry.title}`}
            >
              <Link2 className="w-3 h-3" />
              来自日记
            </button>
          )}
        </div>
      </div>

      {/* 操作 */}
      <button
        onClick={() => {
          if (confirm("确定删除？")) store.deleteTodo(todo.id)
        }}
        className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-danger transition-all"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  )
}

function AddTodoDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("")
  const [priority, setPriority] = useState<1 | 2 | 3>(2)
  const [dueDate, setDueDate] = useState("")
  const [remindAt, setRemindAt] = useState("")

  const submit = () => {
    if (!title.trim()) return
    store.addTodos([{
      title: title.trim(),
      priority,
      status: "pending",
      dueDate: dueDate || undefined,
      remindAt: remindAt || undefined,
    }])
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] bg-surface rounded-xl shadow-popover z-50 animate-fade-in-up p-6 space-y-4">
        <h3 className="text-lg font-semibold">新建待办</h3>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="待办内容…"
          className="w-full px-3 py-2 rounded-lg border border-border outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          autoFocus
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">优先级：</span>
          {[1, 2, 3].map((p) => (
            <button
              key={p}
              onClick={() => setPriority(p as 1 | 2 | 3)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs transition-colors",
                priority === p ? "bg-primary text-white" : "bg-surface-hover text-text-secondary",
              )}
            >
              {p === 1 ? "高" : p === 2 ? "中" : "低"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">截止：</span>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg border border-border outline-none focus:border-primary/40"
          />
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">提醒：</span>
          <input
            type="datetime-local"
            value={remindAt}
            onChange={(e) => setRemindAt(e.target.value)}
            className="flex-1 px-3 py-1.5 rounded-lg border border-border outline-none focus:border-primary/40"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-text-secondary hover:text-text">取消</button>
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-light disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </>
  )
}
