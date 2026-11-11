import { useRef, useState } from "react"
import { SmilePlus } from "lucide-react"
import type { Editor } from "@tiptap/react"
import { cn } from "../../lib/utils"
import { useClickOutside } from "../../lib/useClickOutside"
import { FONT_SIZES } from "../../lib/fontSize"

export const COLORS = [
  "#1C1917", "#DC2626", "#F87171", "#F59E0B", "#FBBF24",
  "#16A34A", "#22C55E", "#0EA5E9", "#6366F1", "#A855F7",
  "#EC4899", "#78716C",
]

export const HIGHLIGHT_COLORS = [
  "#FEF08A", "#FECACA", "#BBF7D0", "#BAE6FD", "#DDD6FE", "#FBCFE8",
]

// 精选治愈系 emoji —— 场景：日记情绪表达 / 心情填充（OpenMoji ♥ 风格取向）
export const EMOJI_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "心情",
    items: ["😊", "😄", "☺️", "🥰", "😌", "🤗", "😤", "😴", "😪", "😭", "🥺", "😜"],
  },
  {
    label: "自然",
    items: ["🌸", "🌺", "🌻", "🌿", "🍀", "🌱", "🌈", "☀️", "🌙", "⭐", "✨", "🌊"],
  },
  {
    label: "爱心",
    items: ["❤️", "🧡", "💛", "💚", "💙", "💜", "💖", "💓", "💞", "💕", "🤍", "💘"],
  },
  {
    label: "陪伴",
    items: ["🐱", "🐶", "🐰", "🦋", "🐢", "🐧", "🐿️", "🦜", "🦄", "🐻", "🐾", "🦩"],
  },
  {
    label: "日常",
    items: ["🧸", "🎀", "📖", "☕", "🎧", "🕯️", "🌷", "🏝️", "🛁", "🧺", "🎵", "🍩"],
  },
]

export function ColorPalette({
  colors,
  onPick,
  onClear,
}: {
  colors: string[]
  onPick: (c: string) => void
  onClear: () => void
}) {
  return (
    <div className="absolute left-0 top-full mt-1 w-[180px] p-2.5 rounded-xl bg-surface border border-border shadow-popover z-50 animate-fade-in-up">
      <div className="grid grid-cols-6 gap-1.5">
        {colors.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="aspect-square w-full rounded-lg border border-black/10 shadow-sm hover:scale-110 hover:ring-2 hover:ring-primary/40 transition-transform"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-2 w-full text-xs text-text-muted hover:text-text py-1.5 border-t border-border-light"
      >
        清除颜色
      </button>
    </div>
  )
}

export function FontSizeControl({
  current,
  onPick,
  onClear,
}: {
  current: number | null
  onPick: (size: string) => void
  onClear: () => void
}) {
  return (
    <div className="absolute left-0 top-full mt-2 w-[150px] p-2.5 rounded-xl bg-surface border border-border shadow-popover z-50 animate-fade-in-up">
      <div className="text-[10px] font-medium text-text-muted px-1 mb-1.5">字号（px）</div>
      <div className="grid grid-cols-4 gap-1.5">
        {FONT_SIZES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(`${s}px`)}
            style={{ fontSize: Math.min(s, 20) }}
            className={cn(
              "h-8 flex items-center justify-center rounded-lg text-text-secondary hover:bg-primary/10 hover:text-primary transition-colors",
              current === s && "bg-primary/15 text-primary font-semibold",
            )}
            title={`${s}px`}
          >
            {s}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="mt-1.5 w-full text-xs text-text-muted hover:text-text py-1.5 border-t border-border-light"
      >
        默认大小
      </button>
    </div>
  )
}

export function EmojiControl({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  useClickOutside(wrapperRef, () => setOpen(false))
  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        title="插入表情"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) onOpen()
        }}
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
          open && "bg-primary/15 text-primary",
        )}
      >
        <SmilePlus className="w-4 h-4" />
      </button>
      {open && (
        <EmojiPicker
          groups={EMOJI_GROUPS}
          onPick={(emoji) => {
            editor.chain().focus().insertContent(emoji).run()
            setOpen(false)
          }}
        />
      )}
    </div>
  )
}

function EmojiPicker({
  groups,
  onPick,
}: {
  groups: { label: string; items: string[] }[]
  onPick: (emoji: string) => void
}) {
  return (
    <div className="absolute left-0 top-full mt-2 rounded-2xl bg-surface border border-border shadow-popover z-50 animate-fade-in-up w-[19rem] max-h-80 overflow-hidden flex flex-col">
      {/* 头部 */}
      <div className="px-3 py-2 border-b border-border-light flex items-center gap-1.5">
        <span className="text-base leading-none">🎨</span>
        <span className="text-xs font-semibold text-text">表情符号</span>
        <span className="text-[10px] text-text-muted ml-auto">点击插入正文</span>
      </div>

      {/* 滚动区 */}
      <div className="flex-1 overflow-y-auto px-3 py-2 emoji-picker-scroll">
        {groups.map((g) => (
          <div key={g.label} className="mb-3 last:mb-0">
            <div className="text-[10px] font-medium text-text-muted px-1 mb-1.5 tracking-wide">
              {g.label}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {g.items.map((e) => (
                <button
                  key={e}
                  onClick={() => onPick(e)}
                  className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-primary/10 hover:scale-110 active:scale-95 transition-all duration-100"
                  title={e}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
