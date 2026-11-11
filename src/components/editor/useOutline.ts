import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import type { Editor } from "@tiptap/react"
import type { OutlineItem } from "./OutlinePanel"

/**
 * 浮动大纲目录的状态与行为：从编辑器 DOM 提取标题、滚动高亮、点击跳转。
 * scrollBoxRef 由调用方持有（浮动工具栏定位也需要同一滚动容器）。
 */
export function useOutline(
  editor: Editor | null,
  scrollBoxRef: RefObject<HTMLDivElement | null>,
  entryId: string,
) {
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
  }, [editor, scrollBoxRef])

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
  }, [activeOutlineId, scrollBoxRef])

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

  // 切换日记时收起大纲目录，避免上一篇的展开状态带到下一篇
  useEffect(() => {
    setOutlineOpen(false)
    setActiveOutlineId(null)
  }, [entryId])

  return { outline, outlineOpen, setOutlineOpen, activeOutlineId, jumpTo, handleScroll }
}
