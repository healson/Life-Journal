import { useState } from "react"
import { store } from "../store"
import { cn } from "../lib/utils"

interface Props {
  onSuccess?: () => void
}

export function PinLock({ onSuccess }: Props) {
  const [pin, setPin] = useState("")
  const [error, setError] = useState(false)
  const [shake, setShake] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleDigit = async (d: string) => {
    if (loading) return
    if (error) setError(false)
    if (pin.length >= 6) return
    const next = pin + d
    setPin(next)
    if (next.length === 6) {
      setLoading(true)
      const ok = await store.unlock(next)
      setLoading(false)
      if (ok) {
        onSuccess?.()
      } else {
        setError(true)
        setShake(true)
        setTimeout(() => {
          setPin("")
          setShake(false)
        }, 500)
      }
    }
  }

  const handleDelete = () => {
    if (error) setError(false)
    setPin((p) => p.slice(0, -1))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <div className="w-[340px] flex flex-col items-center">
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-lg">
          <span className="text-white text-2xl">📓</span>
        </div>
        <h1 className="text-xl font-bold text-text mb-1">人生记趣录</h1>
        <p className="text-xs text-text-muted mb-8">请输入六位数字密码</p>

        {/* PIN 显示 */}
        <div className={cn("flex gap-3 mb-8", shake && "animate-pulse")}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-12 h-14 rounded-xl border-2 flex items-center justify-center text-xl font-semibold transition-all",
                pin.length > i
                  ? error
                    ? "border-danger bg-danger/10 text-danger"
                    : "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface",
              )}
            >
              {pin.length > i ? "•" : ""}
            </div>
          ))}
        </div>

        {/* 错误提示 */}
        {error && (
          <p className="text-danger text-sm mb-4">密码错误，请重试</p>
        )}
        {loading && (
          <p className="text-primary text-sm mb-4 animate-pulse">登录并同步数据中…</p>
        )}

        {/* 数字键盘 */}
        <div className="grid grid-cols-3 gap-3 select-none">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              disabled={loading}
              className="w-16 h-14 rounded-xl bg-surface border border-border hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all text-xl font-medium text-text disabled:opacity-40"
            >
              {d}
            </button>
          ))}
          {/* 占位 */}
          <div />
          <button
            onClick={() => handleDigit("0")}
            disabled={loading}
            className="w-16 h-14 rounded-xl bg-surface border border-border hover:border-primary/40 hover:bg-primary/5 active:scale-95 transition-all text-xl font-medium text-text disabled:opacity-40"
          >
            0
          </button>
          <button
            onClick={handleDelete}
            disabled={pin.length === 0}
            className="w-16 h-14 rounded-xl bg-surface border border-border hover:border-danger/40 hover:bg-danger/5 active:scale-95 transition-all text-lg text-text-secondary disabled:opacity-30 flex items-center justify-center"
            title="删除"
          >
            ⌫
          </button>
        </div>

        {/* 底部提示 */}
        <p className="mt-8 text-[11px] text-text-muted">
          原型默认密码：111111
        </p>
      </div>
    </div>
  )
}
