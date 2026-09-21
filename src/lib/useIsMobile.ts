import { useEffect, useState } from "react"

/** 移动端断点：<768px（Tailwind md 断点以下）视为手机 */
const MOBILE_QUERY = "(max-width: 767px)"

/**
 * 监听窗口尺寸变化，判断当前是否为移动端。
 * 桌面端（≥768px）返回 false，保持三栏布局；移动端返回 true，使用抽屉 + 单页切换。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(MOBILE_QUERY).matches : false,
  )

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isMobile
}
