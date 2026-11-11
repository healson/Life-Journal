import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react"
import type { Editor } from "@tiptap/react"

/**
 * 光标跟随的浮动工具栏状态：定位、显示/隐藏、「更多」面板开合。
 * scrollBoxRef 由调用方持有（大纲目录也依赖同一滚动容器）。
 */
export function useFloatingBar(
  editor: Editor | null,
  scrollBoxRef: RefObject<HTMLDivElement | null>,
  entryId: string,
) {
  const barRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [barShown, setBarShown] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  // barPos 同时记录编辑区列的实际边界，用于「更多」面板的水平对齐
  const [barPos, setBarPos] = useState<{
    left: number; top: number; barW: number; barH: number; colLeft: number; colWidth: number
  } | null>(null)

  const updateBarPos = useCallback(() => {
    if (!editor || !barRef.current) return
    const box = scrollBoxRef.current
    if (!box) return
    const b = box.getBoundingClientRect()
    const barW = barRef.current.offsetWidth
    const barH = barRef.current.offsetHeight
    // 用工具栏自身的视口坐标 → 固定定位：水平居中于光标，优先放在光标上方一行
    const coords = editor.view.coordsAtPos(editor.state.selection.head)
    let left = coords.left - barW / 2
    left = Math.min(Math.max(left, b.left + 8), Math.max(b.left + 8, b.right - barW - 8))
    let top = coords.top - barH - 8
    if (top < b.top + 8) top = coords.bottom + 8
    setBarPos((prev) => {
      const same = prev &&
        Math.abs(prev.left - left) < 0.5 && Math.abs(prev.top - top) < 0.5 &&
        prev.barW === barW && prev.barH === barH &&
        Math.abs(prev.colLeft - b.left) < 0.5 && Math.abs(prev.colWidth - b.width) < 0.5
      return same ? prev : { left, top, barW, barH, colLeft: b.left, colWidth: b.width }
    })
  }, [editor, scrollBoxRef])

  // 光标移动 / 内容变化 / 窗口尺寸 / 编辑区滚动时重新定位
  useEffect(() => {
    if (!editor) return
    const on = () => {
      // 兜底：个别环境下 focus 事件不触发，光标一变化只要编辑器处于聚焦态就显示工具栏
      if (editor.isFocused) setBarShown(true)
      updateBarPos()
    }
    editor.on("selectionUpdate", on)
    editor.on("update", on)
    window.addEventListener("resize", on)
    const box = scrollBoxRef.current
    box?.addEventListener("scroll", on, { passive: true })
    return () => {
      editor.off("selectionUpdate", on)
      editor.off("update", on)
      window.removeEventListener("resize", on)
      box?.removeEventListener("scroll", on)
    }
  }, [editor, updateBarPos, scrollBoxRef])

  // 聚焦显示、失焦隐藏（工具栏自身 onMouseDown 已阻止默认行为，点按钮不会触发失焦）
  useEffect(() => {
    if (!editor) return
    const onFocus = () => setBarShown(true)
    const onBlur = () => {
      setBarShown(false)
      setMoreOpen(false)
    }
    editor.on("focus", onFocus)
    editor.on("blur", onBlur)
    return () => {
      editor.off("focus", onFocus)
      editor.off("blur", onBlur)
    }
  }, [editor])

  // 首次显示后（及切换日记后）测量并定位
  useLayoutEffect(() => {
    if (barShown) updateBarPos()
  }, [barShown, updateBarPos, entryId])

  // 点「更多」外部 / Esc 关闭完整面板
  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (barRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setMoreOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMoreOpen(false)
    }
    document.addEventListener("mousedown", onDown)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("mousedown", onDown)
      document.removeEventListener("keydown", onKey)
    }
  }, [moreOpen])

  return { barRef, panelRef, barShown, moreOpen, setMoreOpen, barPos, updateBarPos }
}
