import { useRef, useState } from "react"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { GripVertical } from "lucide-react"

/** 未手动调整时：默认显示为容器宽度的 62%，最大 560px（随屏幕自适应） */
const DEFAULT_PERCENT = 62
const DEFAULT_MAX_PX = 560
const MIN_WIDTH_PX = 80

/**
 * 图片 NodeView：默认缩小显示（不占满编辑区），选中后可通过右下角手柄拖动调整宽度。
 * 宽度写入节点的 width 属性，随 Markdown 内容持久化。
 */
export function ResizableImageView({ node, updateAttributes, selected, editor, getPos }: NodeViewProps) {
  const imgRef = useRef<HTMLImageElement>(null)
  const [dragging, setDragging] = useState(false)

  const attrs = node.attrs as {
    src: string
    alt?: string | null
    title?: string | null
    width?: number | string | null
  }

  const explicit = attrs.width ? Number(attrs.width) : null
  const displayWidth = explicit ? `${explicit}px` : `min(${DEFAULT_PERCENT}%, ${DEFAULT_MAX_PX}px)`

  const selectNode = () => {
    if (typeof getPos === "function") {
      editor.chain().focus().setNodeSelection(getPos()).run()
    }
  }

  /** 右下角手柄：水平拖动改宽度（高度按比例自动），限制在 [80, 容器宽] */
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const img = imgRef.current
    if (!img) return
    const startX = e.clientX
    const startW = img.getBoundingClientRect().width
    const maxW = (img.parentElement?.clientWidth ?? startW) || startW
    setDragging(true)
    document.body.style.userSelect = "none"
    const onMove = (ev: PointerEvent) => {
      const next = Math.round(Math.min(Math.max(startW + (ev.clientX - startX), MIN_WIDTH_PX), maxW))
      updateAttributes({ width: next })
    }
    const onUp = () => {
      setDragging(false)
      document.body.style.userSelect = ""
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
  }

  return (
    <NodeViewWrapper
      className="resizable-image my-2 select-none"
      contentEditable={false}
      onClick={(e: React.MouseEvent) => {
        e.stopPropagation()
        selectNode()
      }}
    >
      <div className="relative flex justify-center">
        <img
          ref={imgRef}
          src={attrs.src}
          alt={attrs.alt ?? ""}
          title={attrs.title ?? undefined}
          draggable={false}
          className="rounded-lg"
          style={{ width: displayWidth, height: "auto", maxWidth: "100%" }}
        />
        {/* 拖拽手柄（移动图片位置）；data-drag-handle 由 Tiptap 识别为节点拖拽源 */}
        {selected && editor.isEditable && (
          <button
            type="button"
            data-drag-handle
            draggable
            title="拖动调整位置"
            className="absolute -top-2.5 -left-2.5 w-6 h-6 rounded-lg bg-surface border border-border shadow flex items-center justify-center text-text-muted hover:text-text cursor-grab active:cursor-grabbing z-10"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </button>
        )}
        {selected && editor.isEditable && !dragging && (
          <button
            type="button"
            title="拖动调整大小"
            onPointerDown={startResize}
            className="absolute -bottom-2 -right-2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow cursor-ew-resize touch-none"
          />
        )}
      </div>
    </NodeViewWrapper>
  )
}
