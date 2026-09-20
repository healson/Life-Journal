import { Lock, Pin, Trash2 } from "lucide-react"
import { store } from "../store"
import { confirmDialog } from "./ConfirmDialog"
import { cn, formatRelative, buildSnippet } from "../lib/utils"
import type { JournalEntry } from "../types"
import { MOOD_LABELS } from "../types"

interface Props {
  entry: JournalEntry
  selected: boolean
}

/** 把文本中的关键词用 <mark> 高亮（不区分大小写，全部命中） */
function highlight(text: string, keyword: string) {
  if (!keyword) return text
  const parts: React.ReactNode[] = []
  let rest = text
  let k = 0
  while (rest.length > 0) {
    const lower = rest.toLowerCase()
    const kw = keyword.toLowerCase()
    const idx = lower.indexOf(kw)
    if (idx === -1) {
      parts.push(rest)
      break
    }
    if (idx > 0) parts.push(rest.slice(0, idx))
    parts.push(
      <mark
        key={k++}
        className="rounded px-0.5 bg-yellow-200 text-inherit font-semibold text-primary-dark"
      >
        {rest.slice(idx, idx + kw.length)}
      </mark>,
    )
    rest = rest.slice(idx + kw.length)
  }
  return parts
}

export function EntryCard({ entry, selected }: Props) {
  const mood = entry.mood ? MOOD_LABELS[entry.mood] : null
  const todoCount = store.state.todos.filter((t) => t.entryId === entry.id).length
  const keyword = store.state.searchQuery?.trim() || ""
  // 已锁定且本会话未输入密码：隐藏内容预览
  const lockedHidden = entry.isLocked && !store.state.sessionUnlockedIds.includes(entry.id)

  // 搜索时：摘要取关键词附近片段；否则显示原文开头
  const snippet = lockedHidden
    ? ""
    : keyword
      ? buildSnippet(entry.plainText, keyword)
      : entry.plainText

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
            {lockedHidden && (
              <Lock className="w-3 h-3 text-primary flex-shrink-0" fill="currentColor" />
            )}
            <h3 className="font-semibold text-text truncate text-sm">
              {highlight(entry.title || "无标题", keyword)}
            </h3>
          </div>

          {/* 预览 —— 锁定隐藏；搜索时显示关键词附近片段，单行省略；关键词高亮 */}
          <p className="mt-1 text-xs text-text-secondary whitespace-nowrap overflow-hidden text-ellipsis leading-relaxed">
            {lockedHidden ? "🔒 已锁定，输入密码查看" : highlight(snippet, keyword)}
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
              onClick={async (e) => {
                e.stopPropagation()
                const ok = await confirmDialog({
                  title: "确定删除这条日记吗？",
                  message: "删除后无法恢复，这段回忆将从本子里轻轻撕下。",
                  confirmText: "删除",
                  tone: "danger",
                })
                if (ok) store.deleteEntry(entry.id)
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
