import { Pin, Trash2 } from "lucide-react"
import { store } from "../store"
import { cn, formatRelative } from "../lib/utils"
import type { JournalEntry } from "../types"
import { MOOD_LABELS } from "../types"

interface Props {
  entry: JournalEntry
  selected: boolean
}

export function EntryCard({ entry, selected }: Props) {
  const mood = entry.mood ? MOOD_LABELS[entry.mood] : null
  const todoCount = store.state.todos.filter((t) => t.entryId === entry.id).length

  return (
    <div
      onClick={() => store.selectEntry(entry.id)}
      className={cn(
        "group p-4 rounded-xl cursor-pointer transition-all border",
        selected
          ? "bg-primary/5 border-primary/30 shadow-card"
          : "bg-surface border-border-light hover:border-border hover:shadow-card-hover",
      )}
    >
      <div className="flex items-start gap-3">
        {/* 心情色块 */}
        {mood && (
          <div
            className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-lg"
            style={{ backgroundColor: mood.color + "33" }}
            title={mood.label}
          >
            {mood.emoji}
          </div>
        )}

        <div className="flex-1 min-w-0">
          {/* 标题行 */}
          <div className="flex items-center gap-2">
            {entry.isPinned && (
              <Pin className="w-3 h-3 text-accent flex-shrink-0" fill="currentColor" />
            )}
            <h3 className="font-semibold text-text truncate text-sm">
              {entry.title || "无标题"}
            </h3>
          </div>

          {/* 预览 —— 单行省略，让卡片保持紧凑 */}
          <p className="mt-1 text-xs text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis leading-relaxed">
            {entry.plainText}
          </p>

          {/* 底部：标签 + 时间 + 待办数 —— 单行不换行 */}
          <div className="mt-2 flex items-center gap-1.5 text-[11px] whitespace-nowrap overflow-hidden">
            {entry.tags.slice(0, 2).map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded bg-surface-active text-text-secondary flex-shrink-0"
              >
                #{t}
              </span>
            ))}
            {entry.tags.length > 2 && (
              <span className="text-text-muted flex-shrink-0">+{entry.tags.length - 2}</span>
            )}
            <span className="flex-1 min-w-0" />
            {todoCount > 0 && (
              <span className="flex items-center gap-0.5 text-text-muted flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                {todoCount}
              </span>
            )}
            <span className="text-text-muted flex-shrink-0">{formatRelative(entry.createdAt)}</span>

            {/* 操作按钮 */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                if (confirm("确定删除这条日记吗？")) store.deleteEntry(entry.id)
              }}
              className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-danger transition-all flex-shrink-0"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
