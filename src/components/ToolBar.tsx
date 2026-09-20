import type { Editor } from "@tiptap/react"
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Code2,
  Link as LinkIcon,
  Minus,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Highlighter,
  Palette,
  Undo,
  Redo,
  Wand2,
  GripVertical,
  SmilePlus,
  Type,
  ImagePlus,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { cn } from "../lib/utils"
import { FONT_SIZES, currentFontSize } from "../lib/fontSize"
import { apiUploadImage } from "../api/client"

/** 点击 ref 容器外部时触发 onClose（用于弹层点击外部自动收起） */
function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [ref])
}

interface Props {
  editor: Editor
  onSetLink: () => void
}

const COLORS = [
  "#1C1917", "#DC2626", "#F87171", "#F59E0B", "#FBBF24",
  "#16A34A", "#22C55E", "#0EA5E9", "#6366F1", "#A855F7",
  "#EC4899", "#78716C",
]

const HIGHLIGHT_COLORS = [
  "#FEF08A", "#FECACA", "#BBF7D0", "#BAE6FD", "#DDD6FE", "#FBCFE8",
]

// 精选治愈系 emoji —— 场景：日记情绪表达 / 心情填充（OpenMoji ♥ 风格取向）
const EMOJI_GROUPS: { label: string; items: string[] }[] = [
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

export function ToolBar({ editor, onSetLink }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const colorRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const fontSizeRef = useRef<HTMLDivElement>(null)

  useClickOutside(colorRef, () => setShowColorPicker(false))
  useClickOutside(highlightRef, () => setShowHighlightPicker(false))
  useClickOutside(fontSizeRef, () => setShowFontSize(false))

  const closeAll = () => {
    setShowColorPicker(false)
    setShowHighlightPicker(false)
    setShowFontSize(false)
  }

  const handleInsertImage = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    try {
      const url = await apiUploadImage(file)
      editor.chain().focus().setImage({ src: url }).run()
    } catch (err) {
      window.alert((err as Error)?.message || "图片上传失败")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const Btn = ({
    active,
    onClick,
    children,
    title,
  }: {
    active?: boolean
    onClick: () => void
    children: React.ReactNode
    title: string
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
        active && "bg-primary/15 text-primary hover:bg-primary/20",
      )}
    >
      {children}
    </button>
  )

  const Divider = () => <div className="w-px h-5 bg-border mx-1" />

  return (
    <div className="sticky top-0 z-10 px-4 py-2 border-b border-border-light bg-surface/95 backdrop-blur flex items-center gap-0.5 flex-wrap">
      {/* 拖拽提示 */}
      <span className="w-6 h-8 flex items-center justify-center text-text-muted/40">
        <GripVertical className="w-4 h-4" />
      </span>

      {/* 撤销/重做 */}
      <Btn title="撤销 (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()}>
        <Undo className="w-4 h-4" />
      </Btn>
      <Btn title="重做 (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()}>
        <Redo className="w-4 h-4" />
      </Btn>

      <Divider />

      {/* 标题 */}
      <Btn
        title="一级标题 (#)"
        active={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 className="w-4 h-4" />
      </Btn>
      <Btn
        title="二级标题 (##)"
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 className="w-4 h-4" />
      </Btn>
      <Btn
        title="三级标题 (###)"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading3 className="w-4 h-4" />
      </Btn>

      <Divider />

      {/* 基础格式 */}
      <Btn
        title="加粗 (Ctrl+B)"
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold className="w-4 h-4" />
      </Btn>
      <Btn
        title="斜体 (Ctrl+I)"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="w-4 h-4" />
      </Btn>
      <Btn
        title="下划线 (Ctrl+U)"
        active={editor.isActive("underline")}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
      >
        <UnderlineIcon className="w-4 h-4" />
      </Btn>
      <Btn
        title="删除线"
        active={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough className="w-4 h-4" />
      </Btn>

      <Divider />

      {/* 颜色 */}
      <div className="relative" ref={colorRef}>
        <button
          title="文字颜色"
          onClick={() => {
            setShowColorPicker((v) => !v)
            setShowHighlightPicker(false)
          }}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
            showColorPicker && "bg-primary/15 text-primary",
          )}
        >
          <Palette className="w-4 h-4" />
        </button>
        {showColorPicker && (
          <ColorPalette
            colors={COLORS}
            onPick={(c) => {
              editor.chain().focus().setColor(c).run()
              setShowColorPicker(false)
            }}
            onClear={() => {
              editor.chain().focus().unsetColor().run()
              setShowColorPicker(false)
            }}
          />
        )}
      </div>

      {/* 高亮 */}
      <div className="relative" ref={highlightRef}>
        <button
          title="高亮背景"
          onClick={() => {
            setShowHighlightPicker((v) => !v)
            setShowColorPicker(false)
          }}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
            (showHighlightPicker || editor.isActive("highlight")) && "bg-primary/15 text-primary",
          )}
        >
          <Highlighter className="w-4 h-4" />
        </button>
        {showHighlightPicker && (
          <ColorPalette
            colors={HIGHLIGHT_COLORS}
            onPick={(c) => {
              editor.chain().focus().toggleHighlight({ color: c }).run()
              setShowHighlightPicker(false)
            }}
            onClear={() => {
              editor.chain().focus().unsetHighlight().run()
              setShowHighlightPicker(false)
            }}
          />
        )}
      </div>

      {/* 字号 */}
      <div className="relative" ref={fontSizeRef}>
        <button
          type="button"
          title="字体大小"
          onClick={() => {
            setShowFontSize((v) => !v)
            setShowColorPicker(false)
            setShowHighlightPicker(false)
          }}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
            showFontSize && "bg-primary/15 text-primary",
          )}
        >
          <Type className="w-4 h-4" />
        </button>
        {showFontSize && (
          <FontSizeControl
            current={currentFontSize(editor)}
            onPick={(size) => {
              editor.chain().focus().setMark("textStyle", { fontSize: size }).run()
              setShowFontSize(false)
            }}
            onClear={() => {
              editor.chain().focus().setMark("textStyle", { fontSize: "" }).run()
              setShowFontSize(false)
            }}
          />
        )}
      </div>

      {/* 插入图片 */}
      <div className="relative">
        <button
          type="button"
          title="插入图片"
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "w-8 h-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
            uploading && "opacity-60",
          )}
        >
          <ImagePlus className="w-4 h-4" />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          className="hidden"
          onChange={(e) => handleInsertImage(e.target.files?.[0])}
        />
      </div>

      <Divider />

      {/* 表情 */}
      <EmojiControl
        editor={editor}
        onOpen={closeAll}
      />

      <Divider />

      {/* 对齐 */}
      <Btn
        title="左对齐"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="w-4 h-4" />
      </Btn>
      <Btn
        title="居中"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="w-4 h-4" />
      </Btn>
      <Btn
        title="右对齐"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="w-4 h-4" />
      </Btn>

      <Divider />

      {/* 列表 */}
      <Btn
        title="无序列表 (-)"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="w-4 h-4" />
      </Btn>
      <Btn
        title="有序列表 (1.)"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="w-4 h-4" />
      </Btn>
      <Btn
        title="任务列表 ([ ])"
        active={editor.isActive("taskList")}
        onClick={() => editor.chain().focus().toggleTaskList().run()}
      >
        <CheckSquare className="w-4 h-4" />
      </Btn>

      <Divider />

      {/* 块 */}
      <Btn
        title="引用 (>)"
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="w-4 h-4" />
      </Btn>
      <Btn
        title="行内代码 (`)"
        active={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      >
        <Code className="w-4 h-4" />
      </Btn>
      <Btn
        title="代码块 (```)"
        active={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 className="w-4 h-4" />
      </Btn>
      <Btn title="分隔线 (---)" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="w-4 h-4" />
      </Btn>

      <Divider />

      <Btn
        title="链接"
        active={editor.isActive("link")}
        onClick={onSetLink}
      >
        <LinkIcon className="w-4 h-4" />
      </Btn>

      {/* 右侧留空 */}
      <div className="flex-1" />

      {/* "转待办" 快捷按钮提示（在 MarkdownEditor 底部有专门按钮） */}
      <div className="hidden" />
      <Btn
        title="提示：可选中文本快速标记"
        onClick={() => {
          editor.chain().focus().toggleHighlight({ color: "#FEF08A" }).run()
        }}
      >
        <Wand2 className="w-4 h-4 text-text-muted/50" />
      </Btn>
    </div>
  )
}

function ColorPalette({
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

function FontSizeControl({
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

function EmojiControl({ editor, onOpen }: { editor: Editor; onOpen: () => void }) {
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
