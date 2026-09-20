import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Lock } from "lucide-react"

/**
 * 密码输入对话框 —— 治愈系圆角样式，Promise 式调用。
 * 用法：const pwd = await passwordDialog({ title: "...", message: "..." })
 * 返回输入的密码；取消/关闭返回 null。
 */

export interface PasswordDialogOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
}

interface DialogState {
  open: boolean
  options: PasswordDialogOptions | null
}

let state: DialogState = { open: false, options: null }
let resolver: ((v: string | null) => void) | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function getSnapshot() {
  return state
}

function close(result: string | null) {
  resolver?.(result)
  resolver = null
  state = { open: false, options: null }
  emit()
}

/** Promise 式密码框；在 App 根部挂载 <PasswordHost /> 后即可全局调用 */
export function passwordDialog(options: PasswordDialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    resolver = resolve
    state = { open: true, options }
    emit()
  })
}

function PasswordHostInner() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [value, setValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // 每次打开时清空输入并聚焦
  useEffect(() => {
    if (snap.open) {
      setValue("")
      inputRef.current?.focus()
    }
  }, [snap.open])

  useEffect(() => {
    if (!snap.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(null)
      if (e.key === "Enter") close(value)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [snap.open, value])

  if (!snap.open || !snap.options) return null

  const { title, message, confirmText = "确定", cancelText = "取消" } = snap.options

  return createPortal(
    <div
      className="lj-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(null)
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="lj-dialog w-full max-w-[340px] bg-surface rounded-2xl shadow-popover border border-border-light px-6 pt-7 pb-5 text-center"
      >
        <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center bg-primary/12">
          <Lock className="w-5 h-5 text-primary" />
        </div>
        <h3 className="mt-3.5 text-base font-bold text-text">{title}</h3>
        {message && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{message}</p>
        )}
        <input
          ref={inputRef}
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="请输入密码"
          className="mt-4 w-full h-10 px-3.5 rounded-xl bg-surface-active border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => close(null)}
            className="flex-1 py-2.5 rounded-xl bg-surface-hover text-text-secondary text-sm font-medium hover:bg-surface-active transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => close(value)}
            className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-medium transition-all hover:bg-primary-light active:scale-[0.97]"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { PasswordHostInner as PasswordHost }
