import { useRef, useState } from "react"
import { X, Sparkles, Trash2, CornerDownLeft } from "lucide-react"
import { store } from "../store"
import { useStore } from "../lib/observer"
import { askAI, type AIRef } from "../api/ai"

interface ChatItem {
  id: number
  question: string
  answer: string
  searching: boolean
  finished: boolean
  error: string | null
  refs: AIRef[]
}

export function AIChatDrawer() {
  const state = useStore()
  const [items, setItems] = useState<ChatItem[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  if (!state.aiChatOpen) return null

  const patch = (id: number, fn: (it: ChatItem) => ChatItem) =>
    setItems((prev) => prev.map((it) => (it.id === id ? fn(it) : it)))

  const send = async () => {
    const q = input.trim()
    if (!q || busy) return
    setInput("")
    setBusy(true)
    const id = Date.now()
    setItems((prev) => [
      ...prev,
      { id, question: q, answer: "", searching: true, finished: false, error: null, refs: [] },
    ])
    // 等 DOM 渲染出新消息后滚到底
    setTimeout(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }), 50)

    let errored = false
    await askAI(q, {
      onSearching: () => patch(id, (it) => ({ ...it, searching: true })),
      onRefs: (refs) => patch(id, (it) => ({ ...it, searching: false, refs })),
      onDelta: (t) =>
        patch(id, (it) => ({ ...it, searching: false, answer: it.answer + t })),
      onError: (message) => {
        errored = true
        patch(id, (it) => ({ ...it, searching: false, error: message }))
      },
      onDone: () => patch(id, (it) => ({ ...it, searching: false, finished: true })),
    })
    if (!errored) {
      // 服务端中断未发 done 时兜底收尾
      patch(id, (it) => (it.finished ? it : { ...it, searching: false, finished: true }))
    }
    setBusy(false)
  }

  const openRef = (ref: AIRef) => {
    store.selectEntry(String(ref.id))
    store.closeAIChat()
  }

  return (
    <>
      {/* 遮罩 */}
      <div className="fixed inset-0 bg-black/20 z-40" onClick={() => store.closeAIChat()} />

      {/* 抽屉 */}
      <div className="fixed top-0 right-0 h-full w-full sm:w-[440px] bg-surface shadow-popover z-50 flex flex-col animate-fade-in-up">
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border-light">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-text">AI 搜索</h2>
              <p className="text-xs text-text-muted mt-0.5">搜索、总结你的日记</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setItems([])}
              title="清空对话"
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => store.closeAIChat()}
              title="关闭"
              className="p-1.5 rounded-lg hover:bg-surface-hover text-text-muted hover:text-text"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 消息区 */}
        <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <Sparkles className="w-8 h-8 text-accent/60 mb-3" />
              <p className="text-sm text-text-secondary leading-relaxed">
                问一句，AI 就能翻遍你的日记
                <br />
                <span className="text-text-muted text-xs">
                  例：「总结我 10 月的日记」「上次提到旅行是哪天？」
                </span>
              </p>
            </div>
          )}

          {items.map((it) => (
            <div key={it.id} className="space-y-2 animate-fade-in-up">
              {/* 提问 */}
              <div className="flex justify-end">
                <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-br-md bg-primary text-white text-sm leading-relaxed whitespace-pre-wrap">
                  {it.question}
                </div>
              </div>

              {/* 引用日记卡片 */}
              {it.refs.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {it.refs.map((ref) => (
                    <button
                      key={ref.id}
                      onClick={() => openRef(ref)}
                      title="打开这篇日记"
                      className="px-2 py-1 rounded-lg border border-border bg-background text-xs text-text-secondary hover:border-accent/50 hover:text-text transition-colors truncate max-w-full"
                    >
                      {ref.date ?? "无日期"} · {ref.title || "无标题"}
                    </button>
                  ))}
                </div>
              )}

              {/* 回答 */}
              {it.searching && (
                <div className="flex items-center gap-2 text-xs text-text-muted">
                  <span className="inline-block w-3.5 h-3.5 border-2 border-accent/40 border-t-accent rounded-full animate-spin" />
                  正在查找日记…
                </div>
              )}
              {!it.searching && (it.answer || it.error) && (
                <div className="max-w-[95%] px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-surface-hover text-sm leading-relaxed text-text whitespace-pre-wrap">
                  {it.answer}
                  {busy && !it.finished && !it.error && it.id === items[items.length - 1]?.id && (
                    <span className="inline-block w-2 h-4 ml-0.5 align-text-bottom bg-accent animate-pulse" />
                  )}
                  {it.error && (
                    <div className="mt-1.5 text-danger text-xs leading-relaxed">
                      {it.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 输入区 */}
        <div className="p-4 border-t border-border-light">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              rows={1}
              placeholder={busy ? "AI 正在回答…" : "问问你的日记…"}
              disabled={busy}
              className="flex-1 resize-none rounded-xl border border-border-light bg-background px-3.5 py-2.5 text-sm outline-none text-text placeholder:text-text-muted/60 focus:border-accent/50 focus:ring-2 focus:ring-accent/10 transition-all disabled:opacity-60 min-h-[44px] max-h-28"
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              title="发送（Enter）"
              className="w-11 h-11 rounded-xl bg-accent hover:bg-accent-light text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              <CornerDownLeft className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-2 text-[11px] text-text-muted leading-relaxed">
            每次提问独立，不保留历史记录；内容由 DeepSeek 处理，锁定日记不会提供正文
          </p>
        </div>
      </div>
    </>
  )
}
