import { useEffect, useRef, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { cn, entryDate } from "../../lib/utils"
import { launchEnvelope } from "../../lib/envelope"
import { store } from "../../store"
import { MOOD_LABELS, type JournalEntry } from "../../types"

// 星期表头
const WEEKDAY_HEADERS: string[] = ["一", "二", "三", "四", "五", "六", "日"]

/** 标题 + 心情 + 标签 + 自定义日期 */
export function EntryMetaBar({ entry, onSave }: {
  entry: JournalEntry
  onSave: (patch: Parameters<typeof store.updateEntry>[1]) => void
}) {
  const moods = [
    { key: "happy", emoji: "🙂" },
    { key: "calm", emoji: "🤣" },
    { key: "energetic", emoji: "💪" },
    { key: "tired", emoji: "🤔" },
    { key: "angry", emoji: "😡" },
    { key: "sad", emoji: "😭" },
    { key: "helpless", emoji: "🙄" },
  ] as const

  // 自定义日期：优先用 entry.date，否则 fallback 到 createdAt
  const currentDate = entryDate(entry)

  return (
    <div className="px-8 pt-6 pb-4 border-b border-border-light max-md:px-5 max-md:pt-4">
      {/* 标题 */}
      <input
        type="text"
        value={entry.title}
        onChange={(e) => onSave({ title: e.target.value })}
        placeholder="标题…"
        className="w-full text-3xl font-bold bg-transparent outline-none text-text placeholder:text-text-muted/50"
      />

      {/* 日期 + 心情 + 标签 + 置顶 —— 桌面端固定单行；移动端自动换行避免横向溢出 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 whitespace-nowrap md:flex-nowrap md:gap-y-0">
        {/* 自定义日期 —— 月份改到下个月时触发信封 */}
        <DateInputWithEnvelope currentDate={currentDate} onPick={(ds) => onSave({ date: ds })} />

        {/* 心情 */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-text-muted mr-1">心情</span>
          {moods.map((m) => (
            <button
              key={m.key}
              onClick={() => onSave({ mood: entry.mood === m.key ? undefined : m.key })}
              className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${
                entry.mood === m.key
                  ? "bg-surface-active ring-2 ring-primary/30 scale-110"
                  : "hover:bg-surface-hover"
              }`}
              title={MOOD_LABELS[m.key].label}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        {/* 标签 + 置顶 —— 移动端整体换行到心情下一行；桌面端与日期/心情同行 */}
        <div className="flex items-center gap-x-3 w-full md:w-auto md:flex-1 md:min-w-0">
          {/* 标签（收缩 + 内部横向滚动） */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-muted flex-shrink-0">标签</span>
            <div className="overflow-x-auto no-scrollbar min-w-0">
              <TagInput
                tags={entry.tags}
                onChange={(tags) => onSave({ tags })}
              />
            </div>
          </div>

          {/* 置顶 */}
          <button
            onClick={() => store.togglePin(entry.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              entry.isPinned ? "bg-accent/20 text-accent" : "bg-surface-hover text-text-secondary hover:text-text"
            }`}
          >
            {entry.isPinned ? "📌 已置顶" : "📌 置顶"}
          </button>
        </div>
      </div>
    </div>
  )
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const v = e.currentTarget.value.trim().replace(/^#/, "")
      if (v && !tags.includes(v)) {
        onChange([...tags, v])
        e.currentTarget.value = ""
      }
    } else if (e.key === "Backspace" && !e.currentTarget.value && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
        >
          #{t}
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="hover:text-primary-dark"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={tags.length ? "" : "输入标签，回车添加…"}
        className="bg-transparent outline-none text-sm text-text-secondary placeholder:text-text-muted min-w-[120px]"
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

/**
 * 自定义日期输入（自制迷你日历弹层）
 * 彻底抛弃 <input type="date"> —— 原生控件会乱发 change 事件导致动画误触。
 * 现在：点日期按钮 → 弹出日历 → 点某一天 → 若晚于原日期立即触发信封。
 * hover 永远不会触发任何东西。
 */
function DateInputWithEnvelope({ currentDate, onPick }: {
  currentDate: string
  onPick: (ds: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const [y, m] = currentDate.split("-").map(Number)
    return { y: y || new Date().getFullYear(), m: m || 1 }
  })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // 打开时：弹层定位到按钮下方 + 视图跳到当前日期所在月
  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
    const [y, m] = currentDate.split("-").map(Number)
    setView({ y: y || new Date().getFullYear(), m: m || 1 })
  }, [open, currentDate])

  // 点击弹层外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const prevMonth = () =>
    setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { ...v, m: v.m - 1 }))
  const nextMonth = () =>
    setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { ...v, m: v.m + 1 }))
  // 回到今天：视图切到今天所在年月
  const goToday = () => {
    const n = new Date()
    setView({ y: n.getFullYear(), m: n.getMonth() + 1 })
  }

  const pick = (day: number) => {
    const ds = `${view.y}-${String(view.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    // 只有"点选了更晚的日期"这一个入口会触发信封
    if (ds > currentDate) {
      const fromEl = btnRef.current
      const toEl = document.querySelector<HTMLElement>("[data-envelope-target]")
      if (fromEl && toEl) {
        launchEnvelope({ fromEl, toEl, label: "发往未来" })
      }
    }
    onPick(ds)
    setOpen(false)
  }

  // 网格：周一起始
  const firstWeekday = new Date(view.y, view.m - 1, 1).getDay()
  const offset = (firstWeekday + 6) % 7
  const daysInMonth = new Date(view.y, view.m, 0).getDate()
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`

  return (
    <div className="flex items-center gap-1.5 relative" ref={wrapRef}>
      <span className="text-xs font-medium text-text-muted">日期</span>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-envelope-source
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-hover text-sm text-text-secondary hover:text-text transition-colors"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        {currentDate}
      </button>

      {open && (
        <div
          className="fixed z-[1200] w-64 p-3 rounded-xl bg-white border border-border-light shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* 月份导航 */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-surface-hover text-text-secondary"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-text">
              {view.y} 年 {view.m} 月
            </span>
            <button
              type="button"
              onClick={goToday}
              className="ml-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              今天
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-surface-hover text-text-secondary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 星期表头 */}
          <div className="grid grid-cols-7 mb-1 text-center text-[11px] text-text-muted">
            {WEEKDAY_HEADERS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* 日期网格 */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: offset }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const ds = `${view.y}-${String(view.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              const isToday = ds === todayStr
              const isSel = ds === currentDate
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    "mx-auto w-7 h-7 flex items-center justify-center rounded-md text-xs transition-colors",
                    isSel
                      ? "bg-primary text-white font-medium"
                      : isToday
                        ? "text-accent font-bold ring-1 ring-accent/40"
                        : "text-text-secondary hover:bg-surface-hover",
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
