import { useState, useMemo } from "react"
import { X, Plus, Calendar, Bell, Flag } from "lucide-react"
import { store } from "../store"
import { useStore } from "../lib/observer"
import { cn } from "../lib/utils"

interface DraftTodo {
  title: string
  priority: 1 | 2 | 3
  dueDate: string
  remindAt: string
}

export function ConvertDrawer() {
  const state = useStore()
  const [drafts, setDrafts] = useState<DraftTodo[]>([])

  const entry = useMemo(
    () => state.entries.find((e) => e.id === state.selectedEntryId),
    [state.entries, state.selectedEntryId],
  )

  // 打开时自动从日记中提取候选待办
  const open = state.showConvertDrawer
  useMemo(() => {
    if (open && entry && drafts.length === 0) {
      const candidates = extractTaskCandidates(entry.content, entry.title)
      setDrafts(candidates)
    }
    if (!open) {
      // 关闭时不立即清空，保持用户输入状态
    }
  }, [open, entry?.id])

  // 当 entry 变化时重新提取
  useMemo(() => {
    if (open && entry) {
      const candidates = extractTaskCandidates(entry.content, entry.title)
      // 只有当前草稿为空才填充（避免覆盖用户编辑）
      if (drafts.length === 0) setDrafts(candidates)
    }
  }, [entry?.content])

  if (!open) return null

  const addBlankDraft = () => {
    setDrafts((d) => [
      ...d,
      { title: "", priority: 2, dueDate: "", remindAt: "" },
    ])
  }

  const updateDraft = (i: number, patch: Partial<DraftTodo>) => {
    setDrafts((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  }

  const removeDraft = (i: number) => {
    setDrafts((d) => d.filter((_, idx) => idx !== i))
  }

  const submit = () => {
    if (!entry) return
    const valid = drafts.filter((d) => d.title.trim())
    if (valid.length === 0) return

    store.addTodos(
      valid.map((d) => ({
        title: d.title.trim(),
        priority: d.priority,
        dueDate: d.dueDate || undefined,
        remindAt: d.remindAt || undefined,
        entryId: entry.id,
        status: "pending" as const,
      })),
    )
    setDrafts([])
    store.closeConvertDrawer()
  }

  return (
    <>
      {/* 遮罩 */}
      <div
        className="fixed inset-0 bg-black/20 z-40"
        onClick={() => store.closeConvertDrawer()}
      />

      {/* 抽屉 */}
      <div className="fixed top-0 right-0 h-full w-[440px] bg-surface shadow-popover z-50 flex flex-col animate-fade-in-up">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <div>
            <h2 className="text-lg font-semibold text-text">转为待办</h2>
            {entry && (
              <p className="text-xs text-text-muted mt-0.5">
                来自「{entry.title}」
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setDrafts([])
              store.closeConvertDrawer()
            }}
            className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {drafts.length === 0 && (
            <div className="text-center py-12 text-text-muted text-sm">
              点击下方按钮添加待办
            </div>
          )}

          {drafts.map((draft, i) => (
            <div
              key={i}
              className="p-4 rounded-xl border border-border bg-background space-y-3 animate-fade-in-up"
            >
              {/* 标题 + 删除 */}
              <div className="flex items-start gap-2">
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => updateDraft(i, { title: e.target.value })}
                  placeholder="待办标题…"
                  className="flex-1 text-sm bg-transparent outline-none text-text font-medium placeholder:text-text-muted/50"
                  autoFocus={i === drafts.length - 1}
                />
                <button
                  onClick={() => removeDraft(i)}
                  className="p-1 text-text-muted hover:text-danger"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 优先级 + 日期 + 提醒 */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {/* 优先级 */}
                <div className="flex items-center gap-1">
                  <Flag className="w-3.5 h-3.5 text-text-muted" />
                  <div className="flex gap-1">
                    {[1, 2, 3].map((p) => (
                      <button
                        key={p}
                        onClick={() => updateDraft(i, { priority: p as 1 | 2 | 3 })}
                        className={cn(
                          "px-2 py-0.5 rounded text-xs transition-colors",
                          draft.priority === p
                            ? "bg-primary text-white"
                            : "bg-surface-hover text-text-secondary hover:text-text",
                        )}
                      >
                        {p === 1 ? "高" : p === 2 ? "中" : "低"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 截止日期 */}
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" />
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => updateDraft(i, { dueDate: e.target.value })}
                    className="bg-transparent outline-none text-text-secondary"
                  />
                </div>

                {/* 提醒时间 */}
                <div className="flex items-center gap-1">
                  <Bell className="w-3.5 h-3.5 text-text-muted" />
                  <input
                    type="datetime-local"
                    value={draft.remindAt}
                    onChange={(e) => updateDraft(i, { remindAt: e.target.value })}
                    className="bg-transparent outline-none text-text-secondary"
                  />
                </div>
              </div>
            </div>
          ))}

          {/* 添加按钮 */}
          <button
            onClick={addBlankDraft}
            className="w-full py-2.5 rounded-xl border border-dashed border-border text-text-secondary hover:text-text hover:border-primary/40 hover:bg-primary/5 flex items-center justify-center gap-2 text-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            添加待办
          </button>
        </div>

        {/* 底部 */}
        <div className="p-5 border-t border-border-light space-y-2">
          {entry && (
            <div className="text-[11px] text-text-muted flex items-center gap-1">
              🔔 提醒将通过 CalDAV 同步到你的 vivo 系统日历
            </div>
          )}
          <div className="flex gap-2">
            <button
              onClick={() => {
                setDrafts([])
                store.closeConvertDrawer()
              }}
              className="flex-1 py-2.5 rounded-xl border border-border text-text-secondary hover:bg-surface-hover transition-colors text-sm"
            >
              取消
            </button>
            <button
              onClick={submit}
              disabled={!drafts.some((d) => d.title.trim())}
              className="flex-1 py-2.5 rounded-xl bg-primary text-white hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              创建 {drafts.filter((d) => d.title.trim()).length || 0} 条待办
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * 从 Markdown 内容中自动提取候选待办
 */
function extractTaskCandidates(content: string, _title: string): DraftTodo[] {
  const lines = content.split("\n")
  const result: DraftTodo[] = []

  for (const line of lines) {
    // 匹配 Markdown 任务列表: - [ ] xxx 或 - [x] xxx
    const taskMatch = line.match(/^\s*[-*]\s*\[\s*\]?\s*(.+)$/)
    if (taskMatch) {
      const text = taskMatch[1].trim().replace(/[*`_>#]+/g, "").trim()
      if (text) {
        result.push({
          title: text,
          priority: 2,
          dueDate: "",
          remindAt: "",
        })
      }
      continue
    }

    // 匹配有序列表中包含 "要做"、"需要"、"必须" 的
    const orderedMatch = line.match(/^\s*\d+\.\s*(.+)$/)
    if (orderedMatch) {
      const text = orderedMatch[1].trim()
      const keywords = ["今天", "明天", "要", "需要", "必须", "记得", "别忘了"]
      if (keywords.some((k) => text.includes(k))) {
        result.push({
          title: text,
          priority: text.includes("必须") ? 1 : 2,
          dueDate: "",
          remindAt: "",
        })
      }
    }
  }

  return result
}
