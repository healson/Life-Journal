import { useEditor, EditorContent, type Editor } from "@tiptap/react"
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
import { CalendarDays, ChevronLeft, ChevronRight, FileDown, FileText, FileType, Pencil, ListTree } from "lucide-react"
import { ToolBar } from "./ToolBar"
import { store, DRAFT_ID } from "../store"
import { apiUploadImage } from "../api/client"
import { useStore } from "../lib/observer"
import { launchEnvelope } from "../lib/envelope"
import { FontSize } from "../lib/fontSize"
import { exportMarkdown, exportPdf, exportWord } from "../lib/export"
import { cn, formatDate } from "../lib/utils"
import { MOOD_LABELS } from "../types"

interface Props {
  entryId: string
  readOnly?: boolean
}

/** 大纲目录条目 */
interface OutlineItem {
  id: string        // React key / 高亮标识（由序号构成，稳定）
  index: number     // 在编辑器 h1,h2,h3 文档序中的位置
  text: string
  level: number
  top: number
}

// 星期表头
const WEEKDAY_HEADERS: string[] = ["一", "二", "三", "四", "五", "六", "日"]

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

  // ── 浮动大纲目录（hooks 必须在下方条件 return 之前）──
  const scrollBoxRef = useRef<HTMLDivElement>(null)
  const [outline, setOutline] = useState<OutlineItem[]>([])
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [activeOutlineId, setActiveOutlineId] = useState<string | null>(null)
  const headingElsRef = useRef<OutlineItem[]>([])
  const outlineRef = useRef<OutlineItem[]>([])

  // 从编辑器 DOM 提取标题作为大纲（编辑内容/切换日记时重建）
  // 注意：不往标题 DOM 上挂 data 属性——ProseMirror 会重建受管节点导致属性丢失，
  // 跳转改为按文档序 index 实时查询元素（见 jumpTo）。
  const rebuildOutline = useCallback(() => {
    if (!editor) return
    const box = scrollBoxRef.current
    const boxRect = box?.getBoundingClientRect()
    const root = editor.view.dom
    const items: OutlineItem[] = []
    root.querySelectorAll<HTMLElement>("h1, h2, h3").forEach((el, idx) => {
      const text = (el.textContent ?? "").trim()
      if (!text) return
      // 相对滚动容器的位置：用 rect 差值，不受 offsetParent 影响
      const top = box && boxRect
        ? el.getBoundingClientRect().top - boxRect.top + box.scrollTop
        : el.offsetTop
      items.push({ id: `h-${idx}`, index: idx, text, level: Number(el.tagName[1]), top })
    })
    headingElsRef.current = items
    // 内容与位置都没变则跳过 setState，避免打字时无谓重渲染
    const prev = outlineRef.current
    const changed =
      prev.length !== items.length ||
      items.some((it, i) => {
        const p = prev[i]
        return !p || p.id !== it.id || p.text !== it.text || p.level !== it.level || Math.abs(p.top - it.top) > 1
      })
    if (changed) {
      outlineRef.current = items
      setOutline(items)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    rebuildOutline()
    // 编辑器 DOM 变化（增删标题/输入）时重建，用 rAF 合并高频触发
    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        rebuildOutline()
      })
    }
    const observer = new MutationObserver(schedule)
    observer.observe(editor.view.dom, { childList: true, subtree: true, characterData: true })
    return () => {
      observer.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [editor, rebuildOutline])

  // 滚动时高亮当前可见的最高级标题
  const handleScroll = useCallback(() => {
    const box = scrollBoxRef.current
    if (!box) return
    const headTop = 60 // 顶部工具栏大致高度
    let current: string | null = null
    for (const item of headingElsRef.current) {
      if (item.top - box.scrollTop <= headTop) current = item.id
      else break
    }
    if (current !== activeOutlineId) setActiveOutlineId(current)
  }, [activeOutlineId])

  const jumpTo = (item: OutlineItem) => {
    const box = scrollBoxRef.current
    if (!box || !editor) return
    // 按文档序 index 实时查询（ProseMirror 会重建节点，缓存的 DOM 引用/data 属性不可靠）
    const el = editor.view.dom.querySelectorAll<HTMLElement>("h1, h2, h3")[item.index]
    if (!el) return
    // 先定位光标，但禁用 ProseMirror 的 scrollIntoView：
    // 它会直接赋值 scrollTop 打断平滑滚动甚至把视口拉回文档开头，导致"点击不跳转"
    try {
      const pos = editor.view.posAtDOM(el, 0)
      editor.chain().focus(pos, { scrollIntoView: false }).setTextSelection(pos).run()
    } catch {
      // 位置映射失败不影响滚动跳转
    }
    // 实时测量目标位置（缓存的 top 会因图片/字体加载后布局变化而过期）
    const top =
      el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop
    box.scrollTo({ top: Math.max(0, top - 56), behavior: "smooth" })
    setActiveOutlineId(item.id)
  }

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
        onEdit={() => store.setSearch("")}
      />
    )
  }

  return (
    <div className="h-full flex-1 min-h-0 flex flex-col bg-surface relative" onBlur={handleBlur}>
      {/* 编辑器区域 */}
      <div ref={scrollBoxRef} onScroll={handleScroll} className="flex-1 overflow-y-auto max-md:pb-28">
        <div className={cn(
          "max-w-3xl mx-auto",
          // 右侧浮动大纲（把手/面板）悬浮在编辑区右缘，窄编辑列下会盖住正文行尾，
          // 表现为"文字点不动、不能编辑"。按大纲状态给正文预留右侧空间，杜绝遮挡。
          outline.length > 0 && "md:pr-10",
          outlineOpen && "md:pr-56",
        )}>
          {/* 标题 + 心情 + 标签 + 自定义日期 */}
          <EntryMetaBar entry={entry} onSave={save} />

          {/* 工具栏（紧跟 meta，贴近打字区） */}
          <div className="relative">
            <ToolBar
              editor={editor}
              onSetLink={setLink}
              entryId={entryId}
              isLocked={!!entry?.isLocked}
            />
          </div>

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

      {/* 底部状态栏 */}
      <EditorStatusBar editor={editor} entry={entry} />
    </div>
  )
}

/**
 * 浮动大纲目录：悬浮在编辑区右侧，点击标题跳转到对应位置。
 * 收起态只剩一个竖排「目录」把手，不遮挡正文；手机端（窄屏）不显示。
 */
function OutlinePanel({ items, activeId, open, onToggle, onJump }: {
  items: OutlineItem[]
  activeId: string | null
  open: boolean
  onToggle: () => void
  onJump: (item: OutlineItem) => void
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onToggle}
        title="展开大纲目录"
        className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 flex-col items-center gap-1.5 px-1.5 py-3 rounded-l-xl border border-r-0 border-border-light bg-surface/95 backdrop-blur text-text-muted hover:text-primary hover:border-primary/30 transition-colors shadow-card"
      >
        <ListTree className="w-4 h-4" />
        <span className="text-[11px] leading-tight [writing-mode:vertical-rl] tracking-widest">目录</span>
      </button>
    )
  }

  return (
    <div className="hidden md:flex absolute right-3 top-3 bottom-16 z-20 w-52 flex-col rounded-xl border border-border-light bg-surface/95 backdrop-blur shadow-card animate-fade-in-up">
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
  )
}

function EntryMetaBar({ entry, onSave }: {
  entry: NonNullable<ReturnType<typeof useStore>["entries"]>[number] | Exclude<ReturnType<typeof useStore>["draft"], null>
  onSave: (patch: Parameters<typeof store.updateEntry>[1]) => void
}) {
  const moods = [
    { key: "happy", emoji: "🙂" },
    { key: "calm", emoji: "🤣" },
    { key: "energetic", emoji: "💪" },
    { key: "tired", emoji: "🤔" },
    { key: "angry", emoji: "😡" },
    { key: "sad", emoji: "😭" },
    { key: "helpless", emoji: "🙄" },
  ] as const

  // 自定义日期：优先用 entry.date，否则 fallback 到 createdAt
  const currentDate = entry.date ?? formatDate(entry.createdAt)

  return (
    <div className="px-8 pt-6 pb-4 border-b border-border-light max-md:px-5 max-md:pt-4">
      {/* 标题 */}
      <input
        type="text"
        value={entry.title}
        onChange={(e) => onSave({ title: e.target.value })}
        placeholder="标题…"
        className="w-full text-3xl font-bold bg-transparent outline-none text-text placeholder:text-text-muted/50"
      />

      {/* 日期 + 心情 + 标签 + 置顶 —— 桌面端固定单行；移动端自动换行避免横向溢出 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-3 whitespace-nowrap md:flex-nowrap md:gap-y-0">
        {/* 自定义日期 —— 月份改到下个月时触发信封 */}
        <DateInputWithEnvelope currentDate={currentDate} onPick={(ds) => onSave({ date: ds })} />

        {/* 心情 */}
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-text-muted mr-1">心情</span>
          {moods.map((m) => (
            <button
              key={m.key}
              onClick={() => onSave({ mood: entry.mood === m.key ? undefined : m.key })}
              className={`w-8 h-8 rounded-lg text-lg flex items-center justify-center transition-all ${
                entry.mood === m.key
                  ? "bg-surface-active ring-2 ring-primary/30 scale-110"
                  : "hover:bg-surface-hover"
              }`}
              title={MOOD_LABELS[m.key].label}
            >
              {m.emoji}
            </button>
          ))}
        </div>

        {/* 标签 + 置顶 —— 移动端整体换行到心情下一行；桌面端与日期/心情同行 */}
        <div className="flex items-center gap-x-3 w-full md:w-auto md:flex-1 md:min-w-0">
          {/* 标签（收缩 + 内部横向滚动） */}
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span className="text-xs font-medium text-text-muted flex-shrink-0">标签</span>
            <div className="overflow-x-auto no-scrollbar min-w-0">
              <TagInput
                tags={entry.tags}
                onChange={(tags) => onSave({ tags })}
              />
            </div>
          </div>

          {/* 置顶 */}
          <button
            onClick={() => store.togglePin(entry.id)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              entry.isPinned ? "bg-accent/20 text-accent" : "bg-surface-hover text-text-secondary hover:text-text"
            }`}
          >
            {entry.isPinned ? "📌 已置顶" : "📌 置顶"}
          </button>
        </div>
      </div>
    </div>
  )
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      const v = e.currentTarget.value.trim().replace(/^#/, "")
      if (v && !tags.includes(v)) {
        onChange([...tags, v])
        e.currentTarget.value = ""
      }
    } else if (e.key === "Backspace" && !e.currentTarget.value && tags.length) {
      onChange(tags.slice(0, -1))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-xs font-medium"
        >
          #{t}
          <button
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="hover:text-primary-dark"
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        placeholder={tags.length ? "" : "输入标签，回车添加…"}
        className="bg-transparent outline-none text-sm text-text-secondary placeholder:text-text-muted min-w-[120px]"
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

function EditorStatusBar({ editor, entry }: {
  editor: Editor
  entry: NonNullable<ReturnType<typeof useStore>["entries"]>[number] | Exclude<ReturnType<typeof useStore>["draft"], null>
}) {
  const charCount = editor.storage.characterCount?.characters?.() ?? 0
  // 中文每字计一词 + 英文按单词计（Tiptap 默认按空格分词，中文无空格会被整体算成 1 词）
  const text = editor.getText()
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const latinCount = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length
  const wordCount = cjkCount + latinCount
  const markdown = editor.storage.markdown?.getMarkdown?.() ?? editor.getHTML()
  const title = entry.title || "无标题"
  const date = entry.date ?? formatDate(entry.createdAt)
  const html = editor.getHTML()
  return (
    <div className="flex items-center justify-between px-6 py-2 border-t border-border-light text-xs text-text-muted bg-surface/50">
      <span>上次编辑 {new Date(entry.updatedAt).toLocaleString("zh-CN")}</span>

      {/* 导出：md / doc / pdf（移动端隐藏） */}
      <div className="flex items-center gap-0.5 max-md:hidden">
        <span className="mr-1">导出</span>
        <button
          onClick={() => exportMarkdown(title, markdown)}
          title="导出 Markdown (.md)"
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-hover hover:text-text transition-colors"
        >
          <FileType className="w-3.5 h-3.5" /> MD
        </button>
        <button
          onClick={() => exportWord(title, html, date)}
          title="导出 Word 文档 (.doc)"
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-hover hover:text-text transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> DOC
        </button>
        <button
          onClick={() => exportPdf(title, html, date)}
          title="导出 PDF（打印另存）"
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-hover hover:text-text transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" /> PDF
        </button>
      </div>

      <span>{charCount} 字符 · {wordCount} 词</span>
    </div>
  )
}

/**
 * 自定义日期输入（自制迷你日历弹层）
 * 彻底抛弃 <input type="date"> —— 原生控件会乱发 change 事件导致动画误触。
 * 现在：点日期按钮 → 弹出日历 → 点某一天 → 若晚于原日期立即触发信封。
 * hover 永远不会触发任何东西。
 */
function DateInputWithEnvelope({ currentDate, onPick }: {
  currentDate: string
  onPick: (ds: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => {
    const [y, m] = currentDate.split("-").map(Number)
    return { y: y || new Date().getFullYear(), m: m || 1 }
  })
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  // 打开时：弹层定位到按钮下方 + 视图跳到当前日期所在月
  useEffect(() => {
    if (!open || !btnRef.current) return
    const r = btnRef.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, left: r.left })
    const [y, m] = currentDate.split("-").map(Number)
    setView({ y: y || new Date().getFullYear(), m: m || 1 })
  }, [open, currentDate])

  // 点击弹层外部关闭
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [open])

  const prevMonth = () =>
    setView((v) => (v.m === 1 ? { y: v.y - 1, m: 12 } : { ...v, m: v.m - 1 }))
  const nextMonth = () =>
    setView((v) => (v.m === 12 ? { y: v.y + 1, m: 1 } : { ...v, m: v.m + 1 }))
  // 回到今天：视图切到今天所在年月
  const goToday = () => {
    const n = new Date()
    setView({ y: n.getFullYear(), m: n.getMonth() + 1 })
  }

  const pick = (day: number) => {
    const ds = `${view.y}-${String(view.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    // 只有"点选了更晚的日期"这一个入口会触发信封
    if (ds > currentDate) {
      const fromEl = btnRef.current
      const toEl = document.querySelector<HTMLElement>("[data-envelope-target]")
      if (fromEl && toEl) {
        launchEnvelope({ fromEl, toEl, label: "发往未来" })
      }
    }
    onPick(ds)
    setOpen(false)
  }

  // 网格：周一起始
  const firstWeekday = new Date(view.y, view.m - 1, 1).getDay()
  const offset = (firstWeekday + 6) % 7
  const daysInMonth = new Date(view.y, view.m, 0).getDate()
  const t = new Date()
  const todayStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`

  return (
    <div className="flex items-center gap-1.5 relative" ref={wrapRef}>
      <span className="text-xs font-medium text-text-muted">日期</span>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        data-envelope-source
        className="flex items-center gap-1 px-2 py-1 rounded-md bg-surface-hover text-sm text-text-secondary hover:text-text transition-colors"
      >
        <CalendarDays className="w-3.5 h-3.5" />
        {currentDate}
      </button>

      {open && (
        <div
          className="fixed z-[1200] w-64 p-3 rounded-xl bg-white border border-border-light shadow-xl"
          style={{ top: pos.top, left: pos.left }}
        >
          {/* 月份导航 */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={prevMonth}
              className="p-1 rounded-md hover:bg-surface-hover text-text-secondary"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium text-text">
              {view.y} 年 {view.m} 月
            </span>
            <button
              type="button"
              onClick={goToday}
              className="ml-1 px-1.5 py-0.5 rounded text-[11px] text-text-muted hover:text-primary hover:bg-primary/10 transition-colors"
            >
              今天
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1 rounded-md hover:bg-surface-hover text-text-secondary"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 星期表头 */}
          <div className="grid grid-cols-7 mb-1 text-center text-[11px] text-text-muted">
            {WEEKDAY_HEADERS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          {/* 日期网格 */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: offset }).map((_, i) => (
              <span key={`blank-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const ds = `${view.y}-${String(view.m).padStart(2, "0")}-${String(day).padStart(2, "0")}`
              const isToday = ds === todayStr
              const isSel = ds === currentDate
              return (
                <button
                  key={ds}
                  type="button"
                  onClick={() => pick(day)}
                  className={cn(
                    "mx-auto w-7 h-7 flex items-center justify-center rounded-md text-xs transition-colors",
                    isSel
                      ? "bg-primary text-white font-medium"
                      : isToday
                        ? "text-accent font-bold ring-1 ring-accent/40"
                        : "text-text-secondary hover:bg-surface-hover",
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 搜索只读视图：展示标题/元信息与正文（关键词高亮），右下角「编辑」按钮退出只读。
 */
function ReadOnlyEntry({
  entry,
  html,
  keyword,
  onEdit,
}: {
  entry: NonNullable<ReturnType<typeof useStore>["entries"]>[number] | Exclude<ReturnType<typeof useStore>["draft"], null>
  html: string
  keyword: string
  onEdit: () => void
}) {
  const mood = entry.mood ? MOOD_LABELS[entry.mood] : null
  return (
    <div className="h-full flex flex-col bg-surface">
      <div className="flex-1 overflow-y-auto max-md:pb-28">
        <div className="max-w-3xl mx-auto">
          {/* 标题 + 元信息（只读展示） */}
          <div className="px-8 pt-6 pb-4 border-b border-border-light max-md:px-5 max-md:pt-4">
            <h1 className="text-3xl font-bold break-words">{entry.title || "无标题"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 whitespace-nowrap text-xs text-text-muted">
              <span>📅 {entry.date ?? formatDate(entry.createdAt)}</span>
              {mood && (
                <span>
                  {mood.emoji} {mood.label}
                </span>
              )}
              {entry.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded bg-surface-active text-text-secondary">
                  #{t}
                </span>
              ))}
              {entry.isPinned && <span>📌 已置顶</span>}
            </div>
          </div>

          {/* 正文（关键词高亮） */}
          <HighlightedHtml html={html} keyword={keyword} />
        </div>
      </div>

      {/* 编辑按钮 */}
      <button
        onClick={onEdit}
        className="fixed bottom-12 right-6 md:bottom-16 md:right-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-white text-sm font-medium shadow-popover hover:bg-accent-light active:scale-95 transition-all z-30"
      >
        <Pencil className="w-4 h-4" />
        编辑
      </button>
    </div>
  )
}

/** 渲染只读 HTML 并对关键词做 <mark> 高亮（不区分大小写，全部命中） */
function HighlightedHtml({ html, keyword }: { html: string; keyword: string }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 先还原上次插入的高亮
    el.querySelectorAll("mark[data-search-hit]").forEach((m) => {
      m.replaceWith(document.createTextNode(m.textContent ?? ""))
    })
    if (!keyword) return
    const kw = keyword.toLowerCase()
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const nodes: Text[] = []
    while (walker.nextNode()) nodes.push(walker.currentNode as Text)
    nodes.forEach((node) => {
      const value = node.nodeValue ?? ""
      if (!value.toLowerCase().includes(kw)) return
      const frag = document.createDocumentFragment()
      let rest = value
      while (rest.length > 0) {
        const li = rest.toLowerCase().indexOf(kw)
        if (li === -1) {
          frag.appendChild(document.createTextNode(rest))
          break
        }
        if (li > 0) frag.appendChild(document.createTextNode(rest.slice(0, li)))
        const mark = document.createElement("mark")
        mark.dataset.searchHit = "1"
        mark.className = "rounded px-0.5 bg-yellow-200 text-inherit font-semibold"
        mark.textContent = rest.slice(li, li + kw.length)
        frag.appendChild(mark)
        rest = rest.slice(li + kw.length)
      }
      node.parentNode?.replaceChild(frag, node)
    })
  }, [html, keyword])

  return (
    <div
      ref={ref}
      className="tiptap-editor max-w-3xl mx-auto px-8 py-6 max-md:px-5"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
