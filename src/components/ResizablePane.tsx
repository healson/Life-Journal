import { useCallback, useEffect, useRef, useState } from "react"

interface Props {
  /** 初始宽度（px） */
  initialWidth: number
  /** 最小宽度 */
  minWidth?: number
  /** 最大宽度 */
  maxWidth?: number
  children: React.ReactNode
  /** 拖动条方向：v = 竖直拖动条（改变水平宽度），h = 水平拖动条 */
  direction?: "v" | "h"
  /** 方向：拖动条在面板的左/右/上/下 */
  side?: "left" | "right" | "top" | "bottom"
  className?: string
}

/**
 * 可拖动改变宽度的面板容器。
 * direction="v" + side="right" 就是左侧面板，右边有一条竖线可拖。
 */
export function ResizablePane({
  initialWidth,
  minWidth = 160,
  maxWidth = 600,
  children,
  direction = "v",
  side = "right",
  className,
}: Props) {
  const [width, setWidth] = useState(initialWidth)
  const isDragging = useRef(false)
  const startPos = useRef(0)
  const startWidth = useRef(initialWidth)

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true
      startPos.current = direction === "v" ? e.clientX : e.clientY
      startWidth.current = width
      document.body.style.cursor = direction === "v" ? "col-resize" : "row-resize"
      document.body.style.userSelect = "none"
    },
    [direction, width],
  )

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      const pos = direction === "v" ? e.clientX : e.clientY
      const delta = pos - startPos.current
      let next: number
      if (side === "right" || side === "bottom") {
        next = startWidth.current + delta
      } else {
        next = startWidth.current - delta
      }
      next = Math.max(minWidth, Math.min(maxWidth, next))
      setWidth(next)
    }
    const onUp = () => {
      if (isDragging.current) {
        isDragging.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
      }
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [direction, side, minWidth, maxWidth])

  // 拖动条样式：大点击热区 + hover 显示小竖线
  const barClass = direction === "v"
    ? "absolute z-20 top-0 h-full w-3 cursor-col-resize group/bar"
    : "absolute z-20 left-0 w-full h-3 cursor-row-resize group/bar"

  const barPosition = side === "right" ? "right-0" : side === "left" ? "left-0" : side === "bottom" ? "bottom-0" : "top-0"

  const innerLine = direction === "v"
    ? "absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-px bg-border group-hover/bar:w-0.5 group-hover/bar:bg-primary/60 group-active/bar:bg-primary transition-all"
    : "absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border group-hover/bar:h-0.5 group-hover/bar:bg-primary/60 group-active/bar:bg-primary transition-all"

  return (
    <div
      className={cn("relative flex-shrink-0", className)}
      style={{
        width: direction === "v" ? width : undefined,
        height: direction === "h" ? width : undefined,
      }}
    >
      {children}
      <div
        className={cn(barClass, barPosition)}
        onMouseDown={onMouseDown}
      >
        <div className={innerLine} />
      </div>
    </div>
  )
}

// cn 本地别名（避免循环 import，这里只做简单拼接）
function cn(...args: Array<string | false | null | undefined>) {
  return args.filter(Boolean).join(" ")
}
