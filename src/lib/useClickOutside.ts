import { useEffect, useRef } from "react"

/** 点击 ref 容器外部时触发 onClose（用于弹层点击外部自动收起） */
export function useClickOutside(
  ref: React.RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [ref])
}
