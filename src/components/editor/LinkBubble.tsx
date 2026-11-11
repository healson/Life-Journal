import { ExternalLink, Check, Copy } from "lucide-react"

/**
 * 链接小气泡：编辑态点击链接后弹出。
 * 「打开」在新窗口打开链接（不打断编辑），并展示/复制链接地址；点外部、滚动或 Esc 关闭。
 */
export function LinkBubble({ href, x, y, copied, popRef, onCopy, onClose }: {
  href: string
  x: number
  y: number
  copied: boolean
  popRef: React.RefObject<HTMLDivElement | null>
  onCopy: (ok: boolean) => void
  onClose: () => void
}) {
  // 夹取到视口内：贴边/贴底的链接不让气泡溢出屏幕
  const W = 280
  const left = Math.min(Math.max(x, W / 2 + 8), window.innerWidth - W / 2 - 8)
  const top = Math.min(y, window.innerHeight - 56)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(href)
      onCopy(true)
    } catch {
      onCopy(false)
    }
  }
  return (
    <div
      ref={popRef}
      className="fixed z-[1300] flex items-center gap-2 w-[280px] max-w-[calc(100vw-16px)] px-2.5 py-2 rounded-xl border border-border-light bg-surface shadow-popover animate-fade-in-up"
      style={{ left, top, transform: "translate(-50%, 4px)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => {
          window.open(href, "_blank", "noopener,noreferrer")
          onClose()
        }}
        className="flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-dark transition-colors"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        打开
      </button>
      <span className="flex-1 min-w-0 truncate text-xs text-text-secondary select-all" title={href}>
        {href}
      </span>
      <button
        type="button"
        onClick={copy}
        title={copied ? "已复制" : "复制链接"}
        className="flex-shrink-0 p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}
