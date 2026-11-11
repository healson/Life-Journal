import { useEffect, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X, Palette, Database, User, Bot } from "lucide-react"
import { applyTheme, getStoredTheme, type ThemeId } from "../lib/theme"
import { cn } from "../lib/utils"
import { store } from "../store"
import { AppearanceTab } from "./settings/AppearanceTab"
import { DataTab } from "./settings/DataTab"
import { AiTab } from "./settings/AiTab"
import { AccountTab } from "./settings/AccountTab"

type Tab = "appearance" | "data" | "account" | "ai"

/**
 * 设置弹窗：外观主题 + 数据备份/恢复 + 账号与用户管理
 * 各页内容见 ./settings/*，弹窗本身只负责容器、标签切换与打开时重置。
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useState<ThemeId>("sage")
  const [tab, setTab] = useState<Tab>("appearance")

  const me = store.state.currentUser
  const isAdmin = !!me?.isAdmin

  useEffect(() => {
    if (open) {
      setTheme(getStoredTheme())
      setTab("appearance")
    }
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

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "appearance", label: "外观", icon: <Palette className="w-3.5 h-3.5" /> },
    { id: "data", label: "数据", icon: <Database className="w-3.5 h-3.5" /> },
    // AI 配置是服务器级设置，仅管理员可见
    ...(isAdmin ? [{ id: "ai" as Tab, label: "AI", icon: <Bot className="w-3.5 h-3.5" /> }] : []),
    { id: "account", label: "账号", icon: <User className="w-3.5 h-3.5" /> },
  ]

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
        className="lj-dialog w-full max-w-md bg-surface rounded-2xl shadow-popover border border-border-light overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* 头部 */}
        <div className="flex items-start justify-between px-6 pt-6 pb-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/12 flex items-center justify-center">
              <Palette className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">设置</h2>
              <p className="text-xs text-text-muted mt-0.5">装扮与数据管理</p>
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

        {/* 标签页 */}
        <div className="px-6 pb-3 flex gap-1.5 flex-shrink-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                tab === t.id
                  ? "bg-primary/10 text-primary"
                  : "text-text-muted hover:text-text hover:bg-surface-hover",
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* 可滚动内容区 */}
        <div className="flex-1 min-h-0 overflow-y-auto lj-scroll">
          {tab === "appearance" && <AppearanceTab theme={theme} onPick={pick} />}
          {tab === "data" && <DataTab isAdmin={isAdmin} />}
          {tab === "ai" && <AiTab />}
          {tab === "account" && <AccountTab isAdmin={isAdmin} />}
        </div>
      </div>
    </div>,
    document.body,
  )
}
