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
} from "lucide-react"
import { useState } from "react"
import { cn } from "../lib/utils"

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

export function ToolBar({ editor, onSetLink }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)

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
      <div className="relative">
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
      <div className="relative">
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
    <div className="absolute left-0 top-full mt-1 p-2 rounded-lg bg-surface border border-border shadow-popover z-50 animate-fade-in-up">
      <div className="grid grid-cols-6 gap-1">
        {colors.map((c) => (
          <button
            key={c}
            onClick={() => onPick(c)}
            className="w-6 h-6 rounded-md border border-border hover:scale-110 transition-transform"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button
        onClick={onClear}
        className="mt-2 w-full text-xs text-text-muted hover:text-text py-1 border-t border-border-light"
      >
        清除颜色
      </button>
    </div>
  )
}
