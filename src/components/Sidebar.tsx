import { LogOut, Anchor, Settings } from "lucide-react"
import { useState } from "react"
import { store } from "../store"
import { useStore } from "../lib/observer"
import { cn } from "../lib/utils"
import { CalendarWidget } from "./CalendarWidget"
import { SettingsModal } from "./SettingsModal"

interface Props {
  onViewChange: (v: "entries" | "todos") => void
}

export function Sidebar({ onViewChange }: Props) {
  const state = useStore()
  const [settingsOpen, setSettingsOpen] = useState(false)

  // 标签云
  const tagCloud = (() => {
    const counts: Record<string, number> = {}
    for (const e of state.entries) {
      for (const t of e.tags) counts[t] = (counts[t] || 0) + 1
    }
    const arr = Object.entries(counts).map(([tag, count]) => ({ tag, count }))
    arr.sort((a, b) => b.count - a.count)
    return arr.slice(0, 15)
  })()

  // 统计数据
  const totalEntries = state.entries.length
  const totalTodos = state.todos.length
  const doneTodos = state.todos.filter((t) => t.status === "done").length
  const completionRate = totalTodos === 0 ? 0 : Math.round((doneTodos / totalTodos) * 100)

  // 起始“记录”日期：用逻辑日期（date ?? createdAt），并只统计本年实际记录，
  // 排除“往年今日”这类回忆条目，否则基线会被拉到几年前导致日均≈0
  const nowYear = new Date().getFullYear()
  const activeEntries = state.entries.filter((e) => {
    const ds = e.date ?? e.createdAt.slice(0, 10)
    return Number(ds.slice(0, 4)) === nowYear
  })
  const firstDate = activeEntries.length > 0
    ? new Date(Math.min(...activeEntries.map((e) => new Date((e.date ?? e.createdAt).slice(0, 10)).getTime())))
    : new Date()
  const today = new Date()
  // 注意：日记用了将来的日期（如下个月）时不参与过去日均的分子分母之外的判断，
  // 日均 = 本年日记总数 /（今天 - 首次记录的当天差 + 1）
  const dTotal = activeEntries.length
  const daysDiff = Math.max(1, Math.floor((today.getTime() - firstDate.getTime()) / 86400000) + 1)
  const dailyAvg = (dTotal / daysDiff).toFixed(1)

  return (
    <aside className="h-full bg-surface border-r border-border flex flex-col overflow-hidden">
      {/* Logo + 退出 */}
      <div className="px-4 py-4 border-b border-border-light flex items-center gap-2 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white text-sm">📓</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-text truncate">人生记趣录</div>
          <div className="text-[10px] text-text-muted">Life Journal</div>
        </div>
        <button
          onClick={() => setSettingsOpen(true)}
          className="p-1.5 rounded-md text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
          title="设置"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => store.lock()}
          className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
          title="锁定"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 整体可滚动 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {/* 分类 1: 人生 —— 日历控件 */}
        <SidebarSection title="人生" accent>
          <CalendarWidget />
        </SidebarSection>

        {/* 分类 2: 成就 —— 两行四格 */}
        <SidebarSection title="成就">
          <div className="grid grid-cols-2 gap-2">
            {/* 日记总计 → 点击穿透到日记 */}
            <button
              onClick={() => { store.selectDate(null); onViewChange("entries") }}
              className="text-left p-2.5 rounded-lg bg-primary/5 border border-primary/10 hover:bg-primary/10 hover:border-primary/20 transition-colors cursor-pointer"
            >
              <div className="text-[10px] text-text-muted">日记总计</div>
              <div className="text-sm font-bold text-primary leading-tight">
                {totalEntries}<span className="text-xs font-normal ml-0.5">篇</span>
              </div>
            </button>

            {/* 日均 → 穿透到日记 */}
            <button
              onClick={() => { store.selectDate(null); onViewChange("entries") }}
              className="text-left p-2.5 rounded-lg bg-primary/5 border border-primary/10 hover:bg-primary/10 hover:border-primary/20 transition-colors cursor-pointer"
            >
              <div className="text-[10px] text-text-muted">日均</div>
              <div className="text-sm font-bold text-primary leading-tight">
                {dailyAvg}<span className="text-xs font-normal ml-0.5">篇</span>
              </div>
            </button>

            {/* 待办总计 → 穿透到待办 */}
            <button
              onClick={() => { store.selectDate(null); onViewChange("todos") }}
              className="text-left p-2.5 rounded-lg bg-accent/5 border border-accent/10 hover:bg-accent/10 hover:border-accent/20 transition-colors cursor-pointer"
            >
              <div className="text-[10px] text-text-muted">待办总计</div>
              <div className="text-sm font-bold text-accent leading-tight">
                {totalTodos}<span className="text-xs font-normal ml-0.5">个</span>
              </div>
            </button>

            {/* 完成率 → 纯展示，不穿透 */}
            <div className="text-left p-2.5 rounded-lg bg-accent/5 border border-accent/10">
              <div className="text-[10px] text-text-muted">完成率</div>
              <div className="text-sm font-bold text-accent leading-tight">
                {completionRate}<span className="text-xs font-normal ml-0.5">%</span>
              </div>
            </div>
          </div>
        </SidebarSection>

        {/* 分类 4: 锚点 —— 标签云 */}
        <SidebarSection title="锚点">
          <div className="flex flex-wrap gap-1.5 px-1">
            {tagCloud.length === 0 && (
              <div className="text-xs text-text-muted px-2 py-1">暂无标签</div>
            )}
            {tagCloud.map((t) => {
              const maxCount = tagCloud[0]?.count || 1
              const weight = t.count / maxCount
              const size = 11 + Math.round(weight * 5)
              const opacity = 0.5 + weight * 0.5
              return (
                <button
                  key={t.tag}
                  onClick={() => { store.setSearch(t.tag); onViewChange("entries") }}
                  className="px-2 py-0.5 rounded-md bg-surface-hover hover:bg-primary/15 hover:text-primary transition-colors text-text-secondary"
                  style={{ fontSize: `${size}px`, opacity }}
                  title={`${t.tag} · ${t.count} 条`}
                >
                  #{t.tag}
                </button>
              )
            })}
          </div>
          <div className="mt-1 text-[10px] text-text-muted px-2 flex items-center gap-1">
            <Anchor className="w-3 h-3" />
            共 {tagCloud.length} 个锚点
          </div>
        </SidebarSection>
      </div>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </aside>
  )
}

function SidebarSection({
  title,
  children,
  accent = false,
}: {
  title: string
  children: React.ReactNode
  accent?: boolean
}) {
  return (
    <div className="px-3 pt-4 pb-1">
      <div className="flex items-center gap-2 mb-2 px-1">
        <div
          className={cn(
            "w-1 h-4 rounded-full flex-shrink-0",
            accent ? "bg-gradient-to-b from-accent to-accent-light" : "bg-border",
          )}
        />
        <span className="text-[11px] font-semibold text-text-muted uppercase tracking-widest">
          {title}
        </span>
      </div>
      {children}
    </div>
  )
}
