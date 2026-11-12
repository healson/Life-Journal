import { ChevronRight, ListTree } from "lucide-react"
import { cn } from "../../lib/utils"

/** 大纲目录条目 */
export interface OutlineItem {
  id: string        // React key / 高亮标识（由序号构成，稳定）
  index: number     // 在编辑器 h1,h2,h3 文档序中的位置
  text: string
  level: number
  top: number
}

/**
 * 浮动大纲目录：悬浮在编辑区右侧，点击标题跳转到对应位置。
 * 收起态：桌面是竖排「目录」把手，手机是右上角图标按钮（与「完成」同排）。
 * 展开态：桌面右侧浮层，手机近似全宽浮层。
 */
export function OutlinePanel({ items, activeId, open, onToggle, onJump }: {
  items: OutlineItem[]
  activeId: string | null
  open: boolean
  onToggle: () => void
  onJump: (item: OutlineItem) => void
}) {
  if (!open) {
    return (
      <>
        {/* 手机端入口：右上角「完成」按钮左侧 */}
        <button
          type="button"
          onClick={onToggle}
          title="展开大纲目录"
          className="md:hidden absolute top-3 right-20 z-40 flex items-center px-2.5 py-1.5 rounded-full border border-border-light bg-surface/90 backdrop-blur text-text-secondary hover:text-primary shadow-sm transition-colors"
        >
          <ListTree className="w-4 h-4" />
        </button>
        {/* 桌面端竖排把手 */}
        <button
          type="button"
          onClick={onToggle}
          title="展开大纲目录"
          className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-50 flex-col items-center gap-1.5 px-1.5 py-3 rounded-l-xl border border-r-0 border-border-light bg-surface/95 backdrop-blur text-text-muted hover:text-primary hover:border-primary/30 transition-colors shadow-card"
        >
          <ListTree className="w-4 h-4" />
          <span className="text-[11px] leading-tight [writing-mode:vertical-rl] tracking-widest">目录</span>
        </button>
      </>
    )
  }

  return (
    <>
      {/* 手机端遮罩：点空白处收起 */}
      <div className="md:hidden fixed inset-0 z-40 bg-black/10" onClick={onToggle} />
      <div className="absolute z-50 flex flex-col left-3 right-3 top-14 bottom-16 w-auto md:left-auto md:right-3 md:top-3 md:w-52 rounded-xl border border-border-light bg-surface/95 backdrop-blur shadow-popover animate-fade-in-up">
      {/* 头部 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-light">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-text">
          <ListTree className="w-3.5 h-3.5 text-primary" />
          大纲目录
        </span>
        <button
          type="button"
          onClick={onToggle}
          title="收起目录"
          className="p-1 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 条目列表 */}
      <div className="flex-1 overflow-y-auto py-1.5 lj-scroll">
        {items.map((item) => {
          const active = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onJump(item)}
              title={item.text}
              className={cn(
                "w-full text-left px-3 py-1.5 text-xs leading-snug transition-colors border-l-2",
                item.level === 1 ? "pl-3" : item.level === 2 ? "pl-5" : "pl-7",
                active
                  ? "border-primary bg-primary/10 text-primary font-medium"
                  : "border-transparent text-text-secondary hover:bg-surface-hover hover:text-text",
              )}
            >
              <span className="truncate block">{item.text}</span>
            </button>
          )
        })}
      </div>
    </div>
    </>
  )
}
