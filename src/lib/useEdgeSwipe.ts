import { useEffect, useRef } from "react"

export type SwipeEdge = "left" | "right"

/**
 * 全面屏手势：从屏幕左/右边缘开始的水平滑动手势。
 * - 左缘右滑（edge="left"）：返回上一级 / 打开侧栏抽屉
 * - 右缘左滑（edge="right"）：关闭侧栏抽屉
 *
 * 仅在移动端（enabled=true）启用；手势起点须在屏幕边缘 32px 内，
 * 水平位移超过 70px 且以水平为主时触发，避免与垂直滚动、编辑器触摸操作冲突。
 */
export function useEdgeSwipe(onSwipe: (edge: SwipeEdge) => void, enabled: boolean) {
  const onSwipeRef = useRef(onSwipe)
  onSwipeRef.current = onSwipe

  useEffect(() => {
    if (!enabled) return
    const EDGE = 32
    const THRESHOLD = 70

    let startX: number | null = null
    let startY = 0

    const handleStart = (e: TouchEvent) => {
      const t = e.touches[0]
      const vw = window.innerWidth
      startX = t.clientX <= EDGE || t.clientX >= vw - EDGE ? t.clientX : null
      startY = t.clientY
    }

    const handleMove = (e: TouchEvent) => {
      if (startX === null) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      // 垂直滚动为主时取消手势
      if (Math.abs(dy) > Math.abs(dx) * 1.2 && Math.abs(dy) > 20) startX = null
    }

    const handleEnd = (e: TouchEvent) => {
      if (startX === null) return
      const t = e.changedTouches[0]
      const dx = t.clientX - startX
      const edge: SwipeEdge = startX <= EDGE ? "left" : "right"
      startX = null
      if (edge === "left" && dx > THRESHOLD) onSwipeRef.current("left")
      else if (edge === "right" && dx < -THRESHOLD) onSwipeRef.current("right")
    }

    document.addEventListener("touchstart", handleStart, { passive: true })
    document.addEventListener("touchmove", handleMove, { passive: true })
    document.addEventListener("touchend", handleEnd, { passive: true })
    return () => {
      document.removeEventListener("touchstart", handleStart)
      document.removeEventListener("touchmove", handleMove)
      document.removeEventListener("touchend", handleEnd)
    }
  }, [enabled])
}
