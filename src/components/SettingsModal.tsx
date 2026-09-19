import { useEffect, useState } from "react"
import { createPortal } from "react-dom"
import { X, Check, Palette } from "lucide-react"
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from "../lib/theme"
import { cn } from "../lib/utils"

/**
 * 设置弹窗：主题外观切换（配置类功能统一放这里）
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useState<ThemeId>("sage")

  useEffect(() => {
    if (open) setTheme(getStoredTheme())
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  const pick = (id: ThemeId) => {
    setTheme(id)
    applyTheme(id)
  }

  return createPortal(
    <div
      className="lj-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/25 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="设置"
        className="lj-dialog w-full max-w-md bg-surface rounded-2xl shadow-popover border border-border-light overflow-hidden"
      >
        {/* 头部 */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/12 flex items-center justify-center">
              <Palette className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">设置</h2>
              <p className="text-xs text-text-muted mt-0.5">装扮你的专属小天地</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 -mr-1.5 -mt-1 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            title="关闭"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* 主题选择 */}
        <div className="px-6 pb-6">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-3">
            外观主题
          </div>
          <div className="grid grid-cols-2 gap-3">
            {THEMES.map((t) => {
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pick(t.id)}
                  className={cn(
                    "relative text-left p-3 rounded-xl border-2 transition-all active:scale-[0.98]",
                    active
                      ? "border-primary bg-primary/5 shadow-card"
                      : "border-border-light hover:border-border bg-surface hover:bg-surface-hover",
                  )}
                >
                  {/* 迷你预览 */}
                  <div
                    className="w-full h-14 rounded-lg mb-2.5 p-2 flex items-end gap-1.5 overflow-hidden"
                    style={{ backgroundColor: t.swatch[0] }}
                  >
                    <span
                      className="w-5 h-5 rounded-full"
                      style={{ backgroundColor: t.swatch[1] }}
                    />
                    <span
                      className="w-5 h-5 rounded-full"
                      style={{ backgroundColor: t.swatch[2] }}
                    />
                    <span className="flex-1" />
                    <span className="w-9 h-2.5 rounded-full opacity-40" style={{ backgroundColor: t.swatch[1] }} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-text">{t.name}</span>
                    {active && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 leading-snug">{t.desc}</p>
                </button>
              )
            })}
          </div>

          <div className="mt-5 pt-4 border-t border-border-light flex items-center justify-between text-[11px] text-text-muted">
            <span>人生记趣录 · Life Journal</span>
            <span>v0.2.0</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
