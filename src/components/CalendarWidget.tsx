import { useState, useMemo } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { store } from "../store"
import { useStore } from "../lib/observer"
import { cn } from "../lib/utils"

/** 统一补零日期格式 YYYY-MM-DD，与日记 date / 中间栏筛选保持一致 */
const pad = (n: number) => String(n).padStart(2, "0")
const fmtYmd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

/**
 * 月历控件：日期上记录越多颜色越深（热力图）。
 * 点击日期 → 按该日期过滤中间栏内容。
 */
export function CalendarWidget() {
  const state = useStore()
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()

  // 统计每天的记录数（按逻辑日期 date ?? createdAt，补零）
  const dayCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const e of state.entries) {
      const ds = e.date ?? e.createdAt.slice(0, 10)
      counts[ds] = (counts[ds] || 0) + 1
    }
    return counts
  }, [state.entries])

  const maxCount = Math.max(1, ...Object.values(dayCounts))

  // 渲染日历格子
  const weeks = useMemo(() => {
    const firstDay = new Date(year, month, 1)
    const startWeekday = firstDay.getDay() // 0 = 周日
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const prevMonthDays = new Date(year, month, 0).getDate()

    const cells: { day: number; dateStr: string; inMonth: boolean }[] = []

    // 上月尾部
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = prevMonthDays - i
      const m = month
      const y = month === 0 ? year - 1 : year
      cells.push({ day: d, dateStr: fmtYmd(y, m, d), inMonth: false })
    }

    // 本月
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, dateStr: fmtYmd(year, month + 1, d), inMonth: true })
    }

    // 下月头部（补齐 6 行）
    const remaining = 42 - cells.length
    for (let d = 1; d <= remaining; d++) {
      const m = month + 2 > 12 ? 1 : month + 2
      const y = month + 2 > 12 ? year + 1 : year
      cells.push({ day: d, dateStr: fmtYmd(y, m, d), inMonth: false })
    }

    return cells
  }, [year, month])

  const today = new Date()
  const todayStr = fmtYmd(today.getFullYear(), today.getMonth() + 1, today.getDate())

  const getHeatLevel = (count: number): number => {
    if (count === 0) return 0
    if (count === 1) return 1
    const ratio = count / maxCount
    if (ratio < 0.35) return 2
    if (ratio < 0.7) return 3
    return 4
  }

  const monthNames = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"]
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"]

  const selectedDate = state.selectedDate

  // 回到今天：日历切回当前月份，并把列表筛选到今天（含今天的待办）
  const goToday = () => {
    const n = new Date()
    setViewDate(new Date(n.getFullYear(), n.getMonth(), 1))
    store.cancelDraft()
    store.selectDate(fmtYmd(n.getFullYear(), n.getMonth() + 1, n.getDate()))
  }

  return (
    <div
      data-envelope-target
      className="px-3 py-3 rounded-xl bg-surface border border-border-light"
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-sm font-semibold text-text">
          {year} 年 {monthNames[month]} 月
        </div>
        <button
          onClick={goToday}
          className="px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
        >
          今天
        </button>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1 rounded hover:bg-surface-hover text-text-muted hover:text-text transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {weekdays.map((w, i) => (
          <div
            key={w}
            className={cn(
              "text-[10px] text-center py-0.5",
              i === 0 || i === 6 ? "text-text-muted" : "text-text-muted",
            )}
          >
            {w}
          </div>
        ))}
      </div>

      {/* 日历格子 */}
      <div className="grid grid-cols-7 gap-0.5">
        {weeks.map((cell, idx) => {
          const dateKey = cell.dateStr
          const count = dayCounts[dateKey] || 0
          const level = getHeatLevel(count)
          const isToday = dateKey === todayStr
          const isSelected = dateKey === selectedDate
          const isWeekend = idx % 7 === 0 || idx % 7 === 6

          const bgByLevel: Record<number, string> = {
            0: cell.inMonth ? "bg-surface-hover/40 hover:bg-surface-hover" : "bg-transparent",
            1: "bg-primary/15 hover:bg-primary/25",
            2: "bg-primary/30 hover:bg-primary/40",
            3: "bg-primary/55 hover:bg-primary/65",
            4: "bg-primary/80 hover:bg-primary/90 text-white",
          }

          return (
            <button
              key={idx}
              onClick={() => {
                if (!cell.inMonth) return
                if (isSelected) {
                  store.selectDate(null) // 再次点击取消
                } else {
                  if (dayCounts[dateKey]) {
                    // 该日期已有记录 → 按日期过滤中间栏，并打开该日期的新日记草稿
                    //（草稿不新增日记，写完失焦提交后才真正创建）
                    store.selectDate(dateKey)
                    store.startDraft(dateKey)
                  } else {
                    // 该日期没有任何记录 → 进入草稿编辑（不建文、文章数不变）
                    // 右侧编辑器切到该日期，失焦提交后才会真正创建日记
                    store.startDraft(dateKey)
                  }
                }
              }}
              className={cn(
                "relative flex flex-col items-center justify-center aspect-square rounded-md text-xs transition-all",
                cell.inMonth ? bgByLevel[level] : "bg-transparent text-text-muted/30",
                !cell.inMonth && "cursor-default",
                isToday && "ring-2 ring-accent ring-offset-1 ring-offset-surface font-bold",
                isSelected && "ring-2 ring-accent-light ring-offset-1 ring-offset-surface font-semibold",
                isWeekend && cell.inMonth && "text-accent-dark/80",
              )}
              title={count > 0 ? `${dateKey} · ${count} 条记录` : dateKey}
            >
              <span className={cn(isWeekend && cell.inMonth && "text-xs")}>{cell.day}</span>
              {count > 0 && (
                <span
                  className={cn(
                    "w-1 h-1 rounded-full mt-0.5",
                    level >= 3 ? "bg-white/70" : "bg-primary/50",
                    level >= 4 ? "hidden" : "",
                  )}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* 图例 */}
      <div className="flex items-center gap-1.5 mt-3 px-1 text-[10px] text-text-muted">
        <span>少</span>
        {[1, 2, 3, 4].map((l) => (
          <div
            key={l}
            className={cn(
              "w-3 h-3 rounded",
              l === 1 && "bg-primary/15",
              l === 2 && "bg-primary/30",
              l === 3 && "bg-primary/55",
              l === 4 && "bg-primary/80",
            )}
          />
        ))}
        <span>多</span>
        {selectedDate && (
          <button
            onClick={() => store.selectDate(null)}
            className="ml-auto text-primary hover:text-primary-dark text-[11px]"
          >
            清除筛选
          </button>
        )}
      </div>
    </div>
  )
}
