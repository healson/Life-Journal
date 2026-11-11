import { useEffect, useRef } from "react"
import { Pencil } from "lucide-react"
import { entryDate } from "../../lib/utils"
import { MOOD_LABELS, type JournalEntry } from "../../types"

/**
 * 搜索只读视图：展示标题/元信息与正文（关键词高亮），右下角「编辑」按钮退出只读。
 */
export function ReadOnlyEntry({
  entry,
  html,
  keyword,
  onEdit,
}: {
  entry: JournalEntry
  html: string
  keyword: string
  onEdit: () => void
}) {
  const mood = entry.mood ? MOOD_LABELS[entry.mood] : null
  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex-1 overflow-y-auto max-md:pb-28">
        <div className="max-w-3xl mx-auto">
          {/* 标题 + 元信息（只读展示） */}
          <div className="px-8 pt-6 pb-4 border-b border-border-light max-md:px-5 max-md:pt-4">
            <h1 className="text-3xl font-bold break-words">{entry.title || "无标题"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap text-xs text-text-muted">
              <span>📅 {entryDate(entry)}</span>
              {mood && (
                <span>
                  {mood.emoji} {mood.label}
                </span>
              )}
              {entry.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-surface-active text-text-secondary">
                  #{t}
                </span>
              ))}
              {entry.isPinned && <span>📌 已置顶</span>}
            </div>
          </div>

          {/* 正文（关键词高亮） */}
          <HighlightedHtml html={html} keyword={keyword} />
        </div>
      </div>

      {/* 编辑按钮 */}
      <button
        onClick={onEdit}
        className="fixed bottom-12 right-6 md:bottom-16 md:right-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-white text-sm font-medium shadow-popover hover:bg-accent-light active:scale-95 transition-all z-30"
      >
        <Pencil className="w-4 h-4" />
        编辑
      </button>
    </div>
  )
}

/** 渲染只读 HTML 并对关键词做 <mark> 高亮（不区分大小写，全部命中） */
function HighlightedHtml({ html, keyword }: { html: string; keyword: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 先还原上次插入的高亮
    el.querySelectorAll("mark[data-search-hit]").forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent ?? ""))
    })
    if (!keyword) return
    const kw = keyword.toLowerCase()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    nodes.forEach((node) => {
      const value = node.nodeValue ?? ""
      if (!value.toLowerCase().includes(kw)) return
      const frag = document.createDocumentFragment()
      let rest = value
      while (rest.length > 0) {
        const li = rest.toLowerCase().indexOf(kw)
        if (li === -1) {
          frag.appendChild(document.createTextNode(rest))
          break
        }
        if (li > 0) frag.appendChild(document.createTextNode(rest.slice(0, li)))
        const mark = document.createElement("mark")
        mark.dataset.searchHit = "1"
        mark.className = "rounded px-0.5 bg-yellow-200 text-inherit font-semibold"
        mark.textContent = rest.slice(li, li + kw.length)
        frag.appendChild(mark)
        rest = rest.slice(li + kw.length)
      }
      node.parentNode?.replaceChild(frag, node)
    })
  }, [html, keyword])

  return (
    <div
      ref={ref}
      className="tiptap-editor max-w-3xl mx-auto px-8 py-6 max-md:px-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
