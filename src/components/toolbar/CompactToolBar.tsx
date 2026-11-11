import type { Editor } from "@tiptap/react"
import {
  Bold,
  Italic,
  UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  Link as LinkIcon,
  MoreHorizontal,
} from "lucide-react"
import { cn } from "../../lib/utils"

/**
 * 光标跟随的紧凑工具栏：只放最常用的格式操作，其余收进「更多」完整面板。
 * 按钮统一 onMouseDown 阻止默认行为，避免点击时编辑器失焦导致浮动栏消失。
 */
export function CompactToolBar({ editor, onSetLink, moreOpen, onToggleMore }: {
  editor: Editor
  onSetLink: () => void
  moreOpen: boolean
  onToggleMore: () => void
}) {
  const Btn = ({ active, onClick, title, className, children }: {
    active?: boolean
    onClick: () => void
    title: string
    className?: string
    children: React.ReactNode
  }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "w-8 h-8 shrink-0 flex items-center justify-center rounded-md text-text-secondary hover:text-text hover:bg-surface-hover transition-colors",
        active && "bg-primary/15 text-primary hover:bg-primary/20",
        className,
      )}
    >
      {children}
    </button>
  )
  const Divider = () => <div className="w-px h-5 bg-border mx-1 shrink-0" />

  return (
    <div className="flex items-center gap-0.5 min-w-0">
      {/* 格式按钮区：窄屏可横向滑动，保证末尾「更多」始终可见 */}
      <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto no-scrollbar">
        <Btn title="加粗 (Ctrl+B)" active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold className="w-4 h-4" />
        </Btn>
        <Btn title="斜体 (Ctrl+I)" active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic className="w-4 h-4" />
        </Btn>
        <Btn title="下划线 (Ctrl+U)" active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon className="w-4 h-4" />
        </Btn>
        <Btn title="删除线" active={editor.isActive("strike")} className="max-[439px]:hidden"
          onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough className="w-4 h-4" />
        </Btn>

        <Divider />

        <Btn title="一级标题 (#)" active={editor.isActive("heading", { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          <Heading1 className="w-4 h-4" />
        </Btn>
        <Btn title="二级标题 (##)" active={editor.isActive("heading", { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 className="w-4 h-4" />
        </Btn>
        <Btn title="三级标题 (###)" active={editor.isActive("heading", { level: 3 })} className="max-[399px]:hidden"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          <Heading3 className="w-4 h-4" />
        </Btn>

        <Divider />

        <Btn title="高亮" active={editor.isActive("highlight")} className="max-[359px]:hidden"
          onClick={() => editor.chain().focus().toggleHighlight({ color: "#FEF08A" }).run()}>
          <Highlighter className="w-4 h-4" />
        </Btn>
        <Btn title="链接" active={editor.isActive("link")} onClick={onSetLink}>
          <LinkIcon className="w-4 h-4" />
        </Btn>
      </div>

      <Divider />

      <Btn title="更多格式" active={moreOpen} onClick={onToggleMore}>
        <MoreHorizontal className="w-4 h-4" />
      </Btn>
    </div>
  )
}
