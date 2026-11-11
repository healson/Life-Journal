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
  Type,
  ImagePlus,
  Lock,
  RemoveFormatting,
} from "lucide-react"
import { useRef, useState } from "react"
import { cn } from "../lib/utils"
import { currentFontSize } from "../lib/fontSize"
import { useClickOutside } from "../lib/useClickOutside"
import { apiUploadImage } from "../api/client"
import { store, DRAFT_ID } from "../store"
import { passwordDialog } from "./PasswordDialog"
import { COLORS, HIGHLIGHT_COLORS, ColorPalette, EmojiControl, FontSizeControl } from "./toolbar/pickers"

interface Props {
  editor: Editor
  onSetLink: () => void
  entryId?: string | null
  isLocked?: boolean
  /** 完整面板模式：去掉顶栏吸顶/边框样式，用于浮动「更多」弹出面板 */
  panel?: boolean
}

export function ToolBar({ editor, onSetLink, entryId, isLocked = false, panel = false }: Props) {
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [showHighlightPicker, setShowHighlightPicker] = useState(false)
  const [showFontSize, setShowFontSize] = useState(false)
  const [showLockMenu, setShowLockMenu] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const colorRef = useRef<HTMLDivElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const fontSizeRef = useRef<HTMLDivElement>(null)
  const lockMenuRef = useRef<HTMLDivElement>(null)

  useClickOutside(colorRef, () => setShowColorPicker(false))
  useClickOutside(highlightRef, () => setShowHighlightPicker(false))
  useClickOutside(fontSizeRef, () => setShowFontSize(false))
  useClickOutside(lockMenuRef, () => setShowLockMenu(false))

  const closeAll = () => {
    setShowColorPicker(false)
    setShowHighlightPicker(false)
    setShowFontSize(false)
    setShowLockMenu(false)
  }

  const isDraft = !entryId || entryId === DRAFT_ID

  /** 未锁定：设置密码并锁定 */
  const handleSetLock = async () => {
    if (!entryId) return
    const pwd = await passwordDialog({
      title: "锁定这篇日记",
      message: "设置密码后，查看内容需要输入该密码。",
      confirmText: "锁定",
    })
    if (!pwd) return
    try {
      await store.lockEntry(entryId, pwd)
    } catch (err) {
      window.alert((err as Error)?.message || "锁定失败")
    }
  }

  /** 已锁定且本会话已解锁：仅本地重新隐藏内容 */
  const handleRelock = () => {
    if (!entryId) return
    store.relockEntry(entryId)
  }

  /** 已锁定：输入当前密码永久移除锁定 */
  const handleRemoveLock = async () => {
    if (!entryId) return
    const pwd = await passwordDialog({
      title: "解除密码锁定",
      message: "输入当前密码，永久移除这篇日记的锁定。",
      confirmText: "解除",
    })
    if (!pwd) return
    try {
      await store.unlockEntry(entryId, pwd, true)
    } catch (err) {
      window.alert((err as Error)?.message || "密码错误")
    }
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
    <div
      className={cn(
        "flex items-center gap-0.5 flex-wrap",
        panel
          ? "px-1.5 py-1.5"
          : "sticky top-0 z-10 px-4 py-2 border-b border-border-light bg-surface/95 backdrop-blur max-md:gap-1 max-md:py-1 max-md:px-3",
      )}
    >
      {/* 拖拽提示 */}
      {!panel && (
        <span className="w-6 h-8 flex items-center justify-center text-text-muted/40">
          <GripVertical className="w-4 h-4" />
        </span>
      )}

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

      {/* 清除格式：移除选区所有行内样式（加粗/颜色/高亮/字号/链接等），
          并把标题/引用等块级格式恢复为普通段落、对齐恢复左对齐 */}
      <Btn
        title="清除所有格式"
        onClick={() =>
          editor.chain().focus().unsetAllMarks().clearNodes().unsetTextAlign().run()
        }
      >
        <RemoveFormatting className="w-4 h-4" />
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

      {/* 单篇密码锁定（草稿不提供） */}
      {!isDraft && (
        <div className="relative" ref={lockMenuRef}>
          <button
            type="button"
            title={isLocked ? "已锁定：点击管理" : "密码锁定这篇日记"}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              if (isLocked) {
                setShowLockMenu((v) => !v)
              } else {
                void handleSetLock()
              }
            }}
            className={cn(
              "w-8 h-8 flex items-center justify-center rounded-md transition-colors",
              isLocked
                ? "bg-primary/15 text-primary hover:bg-primary/20"
                : "text-text-secondary hover:text-text hover:bg-surface-hover",
            )}
          >
            <Lock className="w-4 h-4" />
          </button>
          {isLocked && showLockMenu && (
            <div className="absolute right-0 top-full mt-2 w-44 rounded-xl bg-surface border border-border shadow-popover z-50 animate-fade-in-up py-1.5">
              <button
                type="button"
                onClick={() => {
                  setShowLockMenu(false)
                  handleRelock()
                }}
                className="w-full text-left px-4 py-2 text-[13px] text-text hover:bg-surface-active transition-colors"
              >
                重新锁定（隐藏内容）
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLockMenu(false)
                  void handleRemoveLock()
                }}
                className="w-full text-left px-4 py-2 text-[13px] text-danger hover:bg-surface-active transition-colors"
              >
                解除密码锁定
              </button>
            </div>
          )}
        </div>
      )}

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
