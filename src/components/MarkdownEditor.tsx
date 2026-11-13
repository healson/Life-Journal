import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import { TextStyle } from "@tiptap/extension-text-style"
import { Color } from "@tiptap/extension-color"
import TextAlign from "@tiptap/extension-text-align"
import Highlight from "@tiptap/extension-highlight"
import Placeholder from "@tiptap/extension-placeholder"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import CharacterCount from "@tiptap/extension-character-count"
import Link from "@tiptap/extension-link"
import HorizontalRule from "@tiptap/extension-horizontal-rule"
import { Markdown } from "tiptap-markdown"
import { ResizableImage } from "../lib/resizableImage"
import { useEffect, useCallback, useRef, useState } from "react"
import { ToolBar } from "./ToolBar"
import { CompactToolBar } from "./toolbar/CompactToolBar"
import { store, DRAFT_ID } from "../store"
import { apiUploadImage } from "../api/client"
import { useStore } from "../lib/observer"
import { FontSize } from "../lib/fontSize"
import { cn } from "../lib/utils"
import { registerBackHandler } from "../lib/backHandler"
import { OutlinePanel } from "./editor/OutlinePanel"
import { useOutline } from "./editor/useOutline"
import { useFloatingBar } from "./editor/useFloatingBar"
import { EntryMetaBar } from "./editor/EntryMetaBar"
import { EditorStatusBar } from "./editor/EditorStatusBar"
import { ReadOnlyEntry } from "./editor/ReadOnlyEntry"
import { LinkBubble } from "./editor/LinkBubble"

interface Props {
  entryId: string
  readOnly?: boolean
}

/** 粘贴的剪贴板图片常无文件名或无后缀，按 MIME 补全以通过后端上传白名单 */
const ensureImageFile = (file: File): File => {
  if (/\.(png|jpe?g|gif|webp)$/i.test(file.name)) return file
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/gif": "gif",
    "image/webp": "webp",
  }
  const ext = extMap[file.type] ?? "png"
  return new File([file], `pasted-image.${ext}`, { type: file.type || `image/${ext}` })
}

export function MarkdownEditor({ entryId, readOnly }: Props) {
  const state = useStore()
  const isDraft = entryId === DRAFT_ID
  const entry = isDraft ? state.draft : state.entries.find((e) => e.id === entryId)
  const keyword = state.searchQuery?.trim() || ""

  // 草稿态走 updateDraft，否则走 updateEntry（两者都即时保存，草稿失焦才提交为正式日记）
  const save = useCallback(
    (patch: Parameters<typeof store.updateEntry>[1]) => {
      if (isDraft) store.updateDraft(patch)
      else if (entryId) store.updateEntry(entryId, patch)
    },
    [isDraft, entryId],
  )

  // ── 链接点击气泡：编辑态点链接不直接跳走，弹出小气泡确认后打开（setLinkPop 为稳定引用，
  // 可安全放入 useEditor 首帧闭包；勿在 editorProps 里直接读 linkPop 状态，会捕获旧值）──
  const [linkPop, setLinkPop] = useState<{ href: string; x: number; y: number } | null>(null)
  const linkPopRef = useRef<HTMLDivElement>(null)
  const [linkCopied, setLinkCopied] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: {},
        blockquote: {},
        horizontalRule: false,
      }),
      HorizontalRule,
      Underline,
      TextStyle,
      Color,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({
        placeholder: "写点什么吧… 支持 Markdown 快捷语法，输入 # 开始标题，* 开始列表",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
      Link.configure({
        openOnClick: false,
        autolink: true,
      }),
      ResizableImage.configure({ inline: false, allowBase64: true }),
      Markdown,
    ],
    content: entry?.content ?? "",
    editorProps: {
      attributes: {
        class: "tiptap-editor",
      },
      // 粘贴图片：上传后插入编辑区（此前未实现，粘贴无反应）
      handlePaste: (view, event) => {
        const files = event.clipboardData?.files
        if (!files || files.length === 0) return false
        const image = Array.from(files).find((f) => f.type.startsWith("image/"))
        if (!image) return false
        event.preventDefault()
        // 不能用 editor?.chain()：useEditor 首帧返回 null，闭包捕获首次渲染绑定会永远为 null，
        // 导致上传成功但静默不插入（表现为粘贴毫无反应）；view 是稳定实例，直接经它插入
        apiUploadImage(ensureImageFile(image))
          .then((url) => {
            const node = view.state.schema.nodes.image?.create({ src: url })
            if (!node) return
            view.focus()
            view.dispatch(view.state.tr.replaceSelectionWith(node))
          })
          .catch((err) => window.alert((err as Error)?.message || "图片上传失败"))
        return true
      },
      // 点击链接：弹出小气泡（不直接跳转，避免打断编辑）。
      // 带修饰键的点击（Ctrl/Cmd/Shift）交回浏览器默认行为（新开标签页）。
      handleClick: (_view, _pos, event) => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false
        const target = event.target as HTMLElement | null
        const a = target?.closest?.("a")
        const href = a?.getAttribute("href")
        if (!a || !href) return false
        event.preventDefault()
        const r = a.getBoundingClientRect()
        setLinkPop({ href, x: r.left + r.width / 2, y: r.bottom + 8 })
        return true
      },
    },
    onUpdate: ({ editor }) => {
      const md = editor.storage.markdown?.getMarkdown?.() ?? editor.getHTML()
      save({ content: md })
    },
  })

  // 切换日记时，同步内容
  useEffect(() => {
    if (!editor || !entry) return
    const current = editor.storage.markdown?.getMarkdown?.() ?? ""
    if (entry.content !== current) {
      editor.commands.setContent(entry.content, false)
    }
  }, [editor, entry?.id])

  // 快捷键：Cmd/Ctrl+S 保存（实际上自动保存）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  const setLink = useCallback(() => {
    if (!editor) return
    const previousUrl = editor.getAttributes("link").href
    const url = window.prompt("链接地址", previousUrl ?? "")
    if (url === null) return
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      return
    }
    const validatedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange("link").setLink({ href: validatedUrl }).run()
  }, [editor])

  // 气泡：点外部 / 任意滚动 / Esc 时关闭
  useEffect(() => {
    if (!linkPop) return
    const close = () => setLinkPop(null)
    const onDown = (e: MouseEvent) => {
      if (linkPopRef.current?.contains(e.target as Node)) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    // capture：滚动常发生在内层滚动容器，冒泡阶段的 scroll 事件到不了 document
    document.addEventListener("scroll", close, true)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
      document.removeEventListener("scroll", close, true)
    }
  }, [linkPop])

  // ── 滚动容器 / 大纲 / 浮动工具栏 ──
  const scrollBoxRef = useRef<HTMLDivElement>(null)
  const { outline, outlineOpen, setOutlineOpen, activeOutlineId, jumpTo, handleScroll } =
    useOutline(editor, scrollBoxRef, entryId)
  const { barRef, panelRef, barShown, moreOpen, setMoreOpen, barPos } =
    useFloatingBar(editor, scrollBoxRef, entryId)

  // 系统返回：大纲目录展开时先收起
  useEffect(() => {
    if (!outlineOpen) return
    return registerBackHandler(() => {
      setOutlineOpen(false)
      return true
    })
  }, [outlineOpen, setOutlineOpen])

  if (!editor) return null
  if (!entry) return null

  // 草稿态：焦点离开编辑器（点击任意非编辑区域）时提交为正式日记
  const handleBlur = useCallback(
    (e: React.FocusEvent) => {
      if (!isDraft) return
      const related = e.relatedTarget as Node | null
      const root = e.currentTarget
      if (related && root.contains(related)) return // 焦点仍在编辑器内部，不提交
      store.commitDraft()
    },
    [isDraft],
  )

  // 搜索只读模式：不可编辑，正文中关键词高亮，右下「编辑」按钮进入编辑态
  if (readOnly) {
    return (
      <ReadOnlyEntry
        entry={entry}
        html={editor.getHTML()}
        keyword={keyword}
        onEdit={() => { store.setSearch(""); store.setTagFilter("") }}
      />
    )
  }

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col bg-surface relative" onBlur={handleBlur}>
      {/* 编辑器区域 */}
      <div ref={scrollBoxRef} onScroll={handleScroll} className="flex-1 overflow-y-auto max-md:pb-28">
        <div className={cn(
          "max-w-3xl mx-auto",
          // 大纲把手固定浮在编辑区右缘，只给把手留出很窄的安全边距，
          // 避免把手压住正文行尾导致"文字点不动"；展开的目录面板完全浮在上层，不再挤占正文宽度。
          outline.length > 0 && "md:pr-10",
        )}>
          {/* 标题 + 心情 + 标签 + 自定义日期 */}
          <EntryMetaBar entry={entry} onSave={save} />

          <EditorContent editor={editor} />
        </div>
      </div>

      {/* 浮动大纲目录：编辑区右侧悬浮，按标题层级切换；无标题时收起 */}
      {outline.length > 0 && (
        <OutlinePanel
          items={outline}
          activeId={activeOutlineId}
          open={outlineOpen}
          onToggle={() => setOutlineOpen((v) => !v)}
          onJump={jumpTo}
        />
      )}

      {/* 光标跟随的浮动工具栏：聚焦时出现，跟着光标位置移动 */}
      {barShown && (
        <div
          ref={barRef}
          className="fixed z-40 flex items-center rounded-full border border-border bg-surface/95 backdrop-blur px-1.5 py-1 shadow-popover max-w-[calc(100vw-16px)]"
          style={{ left: barPos?.left ?? -9999, top: barPos?.top ?? -9999 }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <CompactToolBar
            editor={editor}
            onSetLink={setLink}
            moreOpen={moreOpen}
            onToggleMore={() => setMoreOpen((v) => !v)}
          />
        </div>
      )}

      {/* 「更多」完整工具栏面板：按编辑区列宽对齐，光标附近上下翻转 */}
      {moreOpen && barPos && (
        <div
          ref={panelRef}
          className="fixed z-40 rounded-xl border border-border bg-surface shadow-popover"
          style={(() => {
            const width = Math.min(680, barPos.colWidth - 16)
            const left = barPos.colLeft + (barPos.colWidth - width) / 2
            const spaceAbove = barPos.top - 8
            const spaceBelow = window.innerHeight - (barPos.top + barPos.barH) - 8
            // 上方放不下且下方更宽裕时改为向下展开
            return spaceAbove >= 120 || spaceBelow < 120
              ? { left, width, bottom: window.innerHeight - barPos.top + 8 }
              : { left, width, top: barPos.top + barPos.barH + 8 }
          })()}
          onMouseDown={(e) => e.preventDefault()}
        >
          <ToolBar
            editor={editor}
            onSetLink={setLink}
            entryId={entryId}
            isLocked={!!entry?.isLocked}
            panel
          />
        </div>
      )}

      {/* 底部状态栏 */}
      <EditorStatusBar editor={editor} entry={entry} />

      {/* 链接小气泡：单击正文里的链接弹出，确认后新窗口打开 */}
      {linkPop && (
        <LinkBubble
          href={linkPop.href}
          x={linkPop.x}
          y={linkPop.y}
          copied={linkCopied}
          popRef={linkPopRef}
          onCopy={(ok) => {
            setLinkCopied(ok)
            if (ok) setTimeout(() => setLinkCopied(false), 1500)
          }}
          onClose={() => setLinkPop(null)}
        />
      )}
    </div>
  )
}
