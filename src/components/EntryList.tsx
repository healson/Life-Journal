import { useMemo } from "react"
import { Search, X, History, Calendar, CheckSquare } from "lucide-react"
import { store } from "../store"
import { useStore } from "../lib/observer"
import { EntryCard } from "./EntryCard"
import { TodoMiniCard } from "./TodoMiniCard"
import type { JournalEntry } from "../types"

/** 取日记的逻辑日期（优先自定义 date，fallback createdAt） */
function entryDateStr(e: JournalEntry): string {
  return e.date ?? e.createdAt.slice(0, 10)
}

function entryDateObj(e: JournalEntry): Date {
  const d = entryDateStr(e)
  const [y, m, day] = d.split("-").map(Number)
  return new Date(y, m - 1, day)
}

export function EntryList({ onNewTodo }: { onNewTodo?: () => void }) {
  const state = useStore()

  const selectedDate = state.selectedDate // "YYYY-MM-DD"

  // 所有过滤后（不考虑日期）的 entries
  const allFiltered = useMemo(() => {
    let list = state.entries
    if (state.filterType !== "all") {
      list = list.filter((e) => e.entryType === state.filterType)
    }
    // 搜索关键词统一由 store.searchQuery 驱动（标签点击 / 输入框 / 清除共用一份状态）
    const q = state.searchQuery.toLowerCase().trim()
    if (q) {
      list = list.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.plainText.toLowerCase().includes(q) ||
          e.tags.some((t) => t.toLowerCase().includes(q)),
      )
    }
    return [...list].sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
      return entryDateObj(b).getTime() - entryDateObj(a).getTime()
    })
  }, [state.entries, state.filterType, state.searchQuery])

  // 根据日期过滤 + 匹配的待办
  const dateFiltered = useMemo(() => {
    if (!selectedDate) return null
    const [_y, m, d] = selectedDate.split("-").map(Number)

    // entries 分：今年这一天、往年这一天（用 entry.date 优先）
    const todayEntries: typeof allFiltered = []
    const yearlyEntries: typeof allFiltered = []

    for (const e of allFiltered) {
      const ds = entryDateStr(e) // "YYYY-MM-DD"
      const [ey, em, ed] = ds.split("-").map(Number)
      if (em !== m || ed !== d) continue
      if (ey === Number(_y)) {
        todayEntries.push(e)
      } else {
        yearlyEntries.push(e)
      }
    }
    yearlyEntries.sort(
      (a, b) => Number(entryDateStr(b).slice(0, 4)) - Number(entryDateStr(a).slice(0, 4)),
    )

    // todos：dueDate 就是当天，或者关联 entry 在当天
    const dayTodos = state.todos.filter((t) => {
      if (t.dueDate === selectedDate) return true
      if (t.entryId && todayEntries.some((e) => e.id === t.entryId)) return true
      return false
    })

    return { todayEntries, yearlyEntries, dayTodos }
  }, [allFiltered, state.todos, selectedDate])

  const totalCount = state.entries.filter(
    (e) => state.filterType === "all" || e.entryType === state.filterType,
  ).length

  const hasDateFilter = !!selectedDate

  return (
    <div className="h-full border-r border-border bg-background/60 backdrop-blur-sm flex flex-col relative">
      {/* 顶部：搜索（去掉新建按钮，改浮动） */}
      <div className="p-4 border-b border-border-light space-y-3 flex-shrink-0">
        <div className="relative min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input
            type="text"
            placeholder="搜索日记…"
            value={state.searchQuery}
            onChange={(e) => store.setSearch(e.target.value)}
            className="w-full pl-9 pr-9 py-2 rounded-lg bg-surface border border-border-light text-sm outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 transition-all"
          />
          {state.searchQuery && (
            <button
              type="button"
              onClick={() => store.setSearch("")}
              title="清除搜索"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* 状态条 */}
        <div className="flex items-center gap-2 text-[13px] whitespace-nowrap">
          {hasDateFilter && dateFiltered ? (
            <>
              <span className="px-2 py-0.5 rounded-md bg-accent/15 text-accent font-medium">
                📅 {selectedDate}
              </span>
              <button
                onClick={() => store.selectDate(null)}
                className="text-text-muted hover:text-danger underline underline-offset-2"
              >
                清除
              </button>
              <span className="text-text-muted ml-auto">
                {dateFiltered.todayEntries.length + dateFiltered.yearlyEntries.length} 日记
                {dateFiltered.dayTodos.length > 0 && ` · ${dateFiltered.dayTodos.length} 待办`}
              </span>
            </>
          ) : (
            <span className="text-text-muted">共 {totalCount} 条 · 全部视图</span>
          )}
        </div>
      </div>

      {/* 列表内容 */}
      <div className="flex-1 overflow-y-auto p-3 pb-20 space-y-4">
        {allFiltered.length === 0 && !hasDateFilter && (
          <div className="text-center py-12 text-text-muted text-sm">
            {state.searchQuery ? "没搜到匹配的日记" : "还没有日记 ✨"}
          </div>
        )}

        {/* 选中日期视图 */}
        {hasDateFilter && dateFiltered && (
          <>
            {/* 当天待办 */}
            {dateFiltered.dayTodos.length > 0 && (
              <div>
                <div className="px-2 mb-2 text-xs font-medium text-accent flex items-center gap-1.5">
                  <CheckSquare className="w-3 h-3" />
                  今日待办 · {dateFiltered.dayTodos.length}
                </div>
                <div className="space-y-1.5">
                  {dateFiltered.dayTodos.map((t) => (
                    <TodoMiniCard key={t.id} todo={t} />
                  ))}
                </div>
              </div>
            )}

            {/* 当天日记 */}
            <DateEntriesSection
              title={`${selectedDate} · 今日日记`}
              icon={<Calendar className="w-3 h-3" />}
              entries={dateFiltered.todayEntries}
              emptyHint="这一天没有写日记"
            />

            {/* 往年今日 */}
            {dateFiltered.yearlyEntries.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2 px-2 text-xs text-accent font-medium">
                  <History className="w-3.5 h-3.5" />
                  <span>往年今日 · {dateFiltered.yearlyEntries.length} 条回忆</span>
                </div>
                <div className="space-y-2">
                  {dateFiltered.yearlyEntries.map((entry) => {
                    const year = Number(entryDateStr(entry).slice(0, 4))
                    return (
                      <div key={entry.id} className="animate-fade-in-up relative">
                        <div className="absolute -left-1 top-2 w-1 h-6 rounded bg-gradient-to-b from-accent/60 to-accent/20" />
                        <div className="relative">
                          <div className="absolute -top-1 -left-1 bg-accent text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm z-10">
                            {year}
                          </div>
                          <EntryCard entry={entry} selected={entry.id === state.selectedEntryId} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {dateFiltered.todayEntries.length === 0 &&
              dateFiltered.dayTodos.length === 0 &&
              dateFiltered.yearlyEntries.length === 0 && (
                <div className="text-center py-12 text-text-muted text-sm">
                  这一天没有记录
                </div>
              )}
          </>
        )}

        {/* 全部视图 */}
        {!hasDateFilter && (
          <GroupedByDate entries={allFiltered} selectedEntryId={state.selectedEntryId} />
        )}
      </div>

      {/* 浮动操作按钮：右下“记”（新建日记）+ 左下“办”（新建待办） */}
      <button
        onClick={() => store.createEntry({ entryType: "daily" })}
        className="absolute bottom-5 right-5 w-12 h-12 rounded-full bg-accent hover:bg-accent-light active:scale-95 text-white shadow-lg shadow-accent/30 flex items-center justify-center transition-all z-20 text-xl font-medium"
        title="新建日记"
      >
        记
      </button>
      <button
        onClick={() => onNewTodo?.()}
        className="absolute bottom-5 left-5 w-12 h-12 rounded-full bg-accent hover:bg-accent-light active:scale-95 text-white shadow-lg shadow-accent/30 flex items-center justify-center transition-all z-20 text-xl font-medium"
        title="新建待办"
      >
        办
      </button>
    </div>
  )
}

function DateEntriesSection({
  title,
  icon,
  entries,
  emptyHint,
}: {
  title: string
  icon: React.ReactNode
  entries: JournalEntry[]
  emptyHint: string
}) {
  const state = useStore()
  return (
    <div>
      <div className="px-2 mb-2 text-xs font-medium text-primary flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {entries.length === 0 ? (
        <div className="px-2 py-6 text-center text-xs text-text-muted bg-surface-hover/50 rounded-lg">
          {emptyHint}
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="animate-fade-in-up">
              <EntryCard entry={entry} selected={entry.id === state.selectedEntryId} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function GroupedByDate({
  entries,
  selectedEntryId,
}: {
  entries: JournalEntry[]
  selectedEntryId: string | null
}) {
  const grouped = useMemo(() => {
    const map = new Map<string, typeof entries>()
    for (const e of entries) {
      const key = entryDateStr(e) // "YYYY-MM-DD"
      const list = map.get(key) || []
      list.push(e)
      map.set(key, list)
    }
    return Array.from(map.entries())
  }, [entries])

  return (
    <>
      {grouped.map(([date, list]) => (
        <div key={date}>
          <div className="px-2 mb-2 text-xs font-medium text-text-muted">
            {formatDateLabel(date)} · {list.length} 条
          </div>
          <div className="space-y-2">
            {list.map((entry) => (
              <div key={entry.id} className="animate-fade-in-up">
                <EntryCard entry={entry} selected={entry.id === selectedEntryId} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  )
}

function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const today = new Date()
  const tY = today.getFullYear(), tM = today.getMonth() + 1, tD = today.getDate()

  if (y === tY && m === tM && d === tD) return "今天"
  if (y === tY && m === tM && d === tD - 1) return "昨天"

  const diff = Math.floor(
    (Date.UTC(tY, tM - 1, tD) - Date.UTC(y, m - 1, d)) / 86400000,
  )
  if (diff < 7) return `${diff} 天前`
  if (diff < 30) return `${Math.floor(diff / 7)} 周前`

  return `${m}月${d}日`
}
