import { useEffect, useSyncExternalStore } from "react"
import { createPortal } from "react-dom"
import { Trash2, AlertTriangle, Info } from "lucide-react"

/**
 * 居中确认对话框 —— 替代浏览器原生 confirm()
 * 用法：if (await confirmDialog({ message: "..." })) doSomething()
 */

export type ConfirmTone = "danger" | "warning" | "primary"

export interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  cancelText?: string
  tone?: ConfirmTone
}

interface DialogState {
  open: boolean
  options: ConfirmOptions | null
}

let state: DialogState = { open: false, options: null }
let resolver: ((v: boolean) => void) | null = null
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

function close(result: boolean) {
  resolver?.(result)
  resolver = null
  state = { open: false, options: null }
  emit()
}

/** Promise 式确认框；在 App 根部挂载 <ConfirmHost /> 后即可全局调用 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    resolver = resolve
    state = { open: true, options }
    emit()
  })
}

const TONE_STYLE: Record<
  ConfirmTone,
  { iconBg: string; iconColor: string; confirmBtn: string }
> = {
  danger: {
    iconBg: "bg-danger/12",
    iconColor: "text-danger",
    confirmBtn: "bg-danger hover:brightness-105 text-white",
  },
  warning: {
    iconBg: "bg-warning/15",
    iconColor: "text-warning",
    confirmBtn: "bg-warning hover:brightness-105 text-white",
  },
  primary: {
    iconBg: "bg-primary/12",
    iconColor: "text-primary",
    confirmBtn: "bg-primary hover:bg-primary-light text-white",
  },
}

function ConfirmHostInner() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  useEffect(() => {
    if (!snap.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false)
      if (e.key === "Enter") close(true)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [snap.open])

  if (!snap.open || !snap.options) return null

  const { title, message, confirmText = "确定", cancelText = "取消", tone = "danger" } =
    snap.options
  const t = TONE_STYLE[tone]
  const Icon = tone === "danger" ? Trash2 : tone === "warning" ? AlertTriangle : Info

  return createPortal(
    <div
      className="lj-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) close(false)
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="lj-dialog w-full max-w-[340px] bg-surface rounded-2xl shadow-popover border border-border-light px-6 pt-7 pb-5 text-center"
      >
        <div
          className={`mx-auto w-12 h-12 rounded-full flex items-center justify-center ${t.iconBg}`}
        >
          <Icon className={`w-5 h-5 ${t.iconColor}`} />
        </div>
        <h3 className="mt-3.5 text-base font-bold text-text">{title}</h3>
        {message && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">{message}</p>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="flex-1 py-2.5 rounded-xl bg-surface-hover text-text-secondary text-sm font-medium hover:bg-surface-active transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            autoFocus
            onClick={() => close(true)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.97] ${t.confirmBtn}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export { ConfirmHostInner as ConfirmHost }
