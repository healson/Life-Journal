import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  X, Check, Palette, Database, User, Download, Upload, Trash2, KeyRound,
  UserPlus, Shield, RefreshCw,
} from "lucide-react"
import { THEMES, applyTheme, getStoredTheme, type ThemeId } from "../lib/theme"
import { cn } from "../lib/utils"
import { store } from "../store"
import { confirmDialog } from "./ConfirmDialog"
import {
  apiChangePassword, apiClearAll, apiCreateUser, apiDeleteUser, apiExportData,
  apiImportData, apiListUsers, apiResetPassword, type UserDto,
} from "../api/client"

type Tab = "appearance" | "data" | "account"

/**
 * 设置弹窗：外观主题 + 数据备份/恢复 + 账号与用户管理
 */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setTheme] = useState<ThemeId>("sage")
  const [tab, setTab] = useState<Tab>("appearance")

  // 数据
  const [busy, setBusy] = useState<"export" | "import" | "clear" | null>(null)
  // 账号
  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  // 用户管理
  const [users, setUsers] = useState<UserDto[] | null>(null)
  const [newUser, setNewUser] = useState({ username: "", password: "", is_admin: false })
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPwd, setResetPwd] = useState("")
  const [userMsg, setUserMsg] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const me = store.state.currentUser
  const isAdmin = !!me?.isAdmin

  useEffect(() => {
    if (open) {
      setTheme(getStoredTheme())
      setTab("appearance")
      setPwdMsg(null)
      setUserMsg(null)
      setResetId(null)
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

  // ── 数据 ──
  const handleExport = async () => {
    setBusy("export")
    try {
      const data = await apiExportData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      const d = new Date()
      const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`
      a.href = url
      a.download = `人生记趣录-备份-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(e?.message ?? "导出失败")
    } finally {
      setBusy(null)
    }
  }

  const handleImportFile = async (file: File) => {
    const ok = await confirmDialog({
      title: "覆盖导入数据",
      message: "导入会用备份内容覆盖当前账号的全部日记与待办，现有数据将被清空。确定继续？",
      confirmText: "覆盖导入",
      tone: "warning",
    })
    if (!ok) return
    setBusy("import")
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data || typeof data !== "object" || !Array.isArray(data.entries)) {
        throw new Error("备份文件格式不正确")
      }
      await apiImportData(data)
      await store.refresh()
    } catch (e: any) {
      alert(e?.message ?? "导入失败")
    } finally {
      setBusy(null)
    }
  }

  const handleClearAll = async () => {
    const ok = await confirmDialog({
      title: "清空全部数据",
      message: "将删除所有用户的所有日记与待办，此操作不可恢复。确定继续？",
      confirmText: "全部清空",
      tone: "danger",
    })
    if (!ok) return
    setBusy("clear")
    try {
      await apiClearAll()
      await store.refresh()
    } catch (e: any) {
      alert(e?.message ?? "清空失败")
    } finally {
      setBusy(null)
    }
  }

  // ── 账号 ──
  const handleChangePwd = async (e: FormEvent) => {
    e.preventDefault()
    if (!oldPwd || !newPwd || !confirmPwd) { setPwdMsg("请填写所有密码字段"); return }
    if (newPwd.length < 6) { setPwdMsg("新密码至少 6 位"); return }
    if (newPwd !== confirmPwd) { setPwdMsg("两次输入的密码不一致"); return }
    setPwdMsg(null)
    try {
      await apiChangePassword(oldPwd, newPwd)
      setOldPwd(""); setNewPwd(""); setConfirmPwd("")
      setPwdMsg("✅ 密码已更新")
    } catch (e: any) {
      setPwdMsg(`❌ ${e?.message ?? "修改失败"}`)
    }
  }

  // ── 用户管理（仅管理员）──
  const loadUsers = async () => {
    setUsers(await apiListUsers())
  }

  const handleAddUser = async (e: FormEvent) => {
    e.preventDefault()
    if (!newUser.username.trim() || !newUser.password) { setUserMsg("请填写用户名和密码"); return }
    setUserMsg(null)
    try {
      await apiCreateUser(newUser.username.trim(), newUser.password, newUser.is_admin)
      setNewUser({ username: "", password: "", is_admin: false })
      await loadUsers()
    } catch (err: any) {
      setUserMsg(`❌ ${err?.message ?? "添加失败"}`)
    }
  }

  const handleResetPwd = async (id: number) => {
    if (!resetPwd || resetPwd.length < 6) { setUserMsg("新密码至少 6 位"); return }
    setUserMsg(null)
    try {
      await apiResetPassword(id, resetPwd)
      setResetId(null); setResetPwd("")
      setUserMsg("✅ 密码已重置")
    } catch (err: any) {
      setUserMsg(`❌ ${err?.message ?? "重置失败"}`)
    }
  }

  const handleDeleteUser = async (u: UserDto) => {
    const ok = await confirmDialog({
      title: `删除用户「${u.username}」`,
      message: "将删除该账号及其所有日记与待办，此操作不可恢复。确定继续？",
      confirmText: "删除用户",
      tone: "danger",
    })
    if (!ok) return
    try {
      await apiDeleteUser(u.id)
      await loadUsers()
    } catch (err: any) {
      setUserMsg(`❌ ${err?.message ?? "删除失败"}`)
    }
  }

  const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "appearance", label: "外观", icon: <Palette className="w-3.5 h-3.5" /> },
    { id: "data", label: "数据", icon: <Database className="w-3.5 h-3.5" /> },
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
        <div className="px-6 pb-3 flex gap-1.5">
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

        {/* 外观 */}
        {tab === "appearance" && (
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
                    <div
                      className="w-full h-14 rounded-lg mb-2.5 p-2 flex items-end gap-1.5 overflow-hidden"
                      style={{ backgroundColor: t.swatch[0] }}
                    >
                      <span className="w-5 h-5 rounded-full" style={{ backgroundColor: t.swatch[1] }} />
                      <span className="w-5 h-5 rounded-full" style={{ backgroundColor: t.swatch[2] }} />
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
              <span>v0.3.0</span>
            </div>
          </div>
        )}

        {/* 数据 */}
        {tab === "data" && (
          <div className="px-6 pb-6 space-y-3">
            <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1">
              数据备份与恢复 {isAdmin && <span className="normal-case text-primary/70">（管理员可清空全部）</span>}
            </div>

            <button
              type="button"
              disabled={busy !== null}
              onClick={handleExport}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-light bg-surface hover:bg-surface-hover disabled:opacity-50 transition-colors text-left"
            >
              <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Download className="w-4 h-4 text-primary" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-text">导出备份</span>
                <span className="block text-[11px] text-text-muted">下载当前账号全部日记与待办为 JSON 文件</span>
              </span>
              {busy === "export" && <RefreshCw className="w-4 h-4 text-text-muted animate-spin" />}
            </button>

            <button
              type="button"
              disabled={busy !== null}
              onClick={() => fileRef.current?.click()}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-light bg-surface hover:bg-surface-hover disabled:opacity-50 transition-colors text-left"
            >
              <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                <Upload className="w-4 h-4 text-accent" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-medium text-text">导入恢复</span>
                <span className="block text-[11px] text-text-muted">选择备份文件，覆盖当前账号数据</span>
              </span>
              {busy === "import" && <RefreshCw className="w-4 h-4 text-text-muted animate-spin" />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleImportFile(f)
                e.target.value = ""
              }}
            />

            {isAdmin && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={handleClearAll}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-danger/20 bg-danger/5 hover:bg-danger/10 disabled:opacity-50 transition-colors text-left"
              >
                <span className="w-9 h-9 rounded-lg bg-danger/10 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-danger" />
                </span>
                <span className="flex-1">
                  <span className="block text-sm font-medium text-danger">清空全部数据</span>
                  <span className="block text-[11px] text-text-muted">仅管理员可用，删除所有用户的日记与待办</span>
                </span>
                {busy === "clear" && <RefreshCw className="w-4 h-4 text-text-muted animate-spin" />}
              </button>
            )}
          </div>
        )}

        {/* 账号 */}
        {tab === "account" && (
          <div className="px-6 pb-6 space-y-5">
            {/* 当前账号 + 修改密码 */}
            <div>
              <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-3">
                当前账号
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-hover mb-3">
                <Shield className={cn("w-4 h-4", isAdmin ? "text-primary" : "text-text-muted")} />
                <span className="text-sm font-medium text-text flex-1">{me?.username}</span>
                <span className={cn("text-[11px] px-2 py-0.5 rounded-full", isAdmin ? "bg-primary/10 text-primary" : "bg-surface-active text-text-muted")}>
                  {isAdmin ? "管理员" : "普通用户"}
                </span>
              </div>

              <form onSubmit={handleChangePwd} className="space-y-2.5">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="当前密码"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="新密码（至少 6 位）"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="确认新密码"
                  className="w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
                {pwdMsg && <p className="text-xs text-text-secondary">{pwdMsg}</p>}
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  修改密码
                </button>
              </form>
            </div>

            {/* 用户管理（管理员） */}
            {isAdmin && (
              <div className="pt-4 border-t border-border-light">
                <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-3">
                  用户管理
                </div>

                {/* 添加用户 */}
                <form onSubmit={handleAddUser} className="space-y-2.5 mb-4 p-3 rounded-xl bg-surface-hover">
                  <div className="flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium text-text">添加用户</span>
                  </div>
                  <input
                    type="text"
                    autoComplete="off"
                    value={newUser.username}
                    onChange={(e) => setNewUser((v) => ({ ...v, username: e.target.value }))}
                    placeholder="用户名（至少 3 位）"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newUser.password}
                    onChange={(e) => setNewUser((v) => ({ ...v, password: e.target.value }))}
                    placeholder="密码（至少 6 位）"
                    className="w-full px-3 py-2 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40"
                  />
                  <label className="flex items-center gap-2 text-sm text-text-secondary">
                    <input
                      type="checkbox"
                      checked={newUser.is_admin}
                      onChange={(e) => setNewUser((v) => ({ ...v, is_admin: e.target.checked }))}
                      className="accent-primary"
                    />
                    设为管理员
                  </label>
                  {userMsg && <p className="text-xs text-text-secondary">{userMsg}</p>}
                  <button
                    type="submit"
                    className="w-full py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors"
                  >
                    添加
                  </button>
                </form>

                {/* 用户列表 */}
                {users === null ? (
                  !userMsg && (
                    <button
                      type="button"
                      onClick={() => loadUsers().catch((e: any) => setUserMsg(`” ${e?.message ?? "加载失败"}`))}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-surface-hover text-sm font-medium text-text-secondary hover:bg-surface-active transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      加载用户列表
                    </button>
                  )
                ) : (
                  <ul className="divide-y divide-border-light border border-border-light rounded-xl overflow-hidden">
                    {users.map((u) => (
                      <li key={u.id} className="flex items-center gap-2 p-2.5 bg-surface">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary flex-shrink-0">
                          {u.username[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-text truncate">{u.username}</span>
                            {u.is_admin && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary flex-shrink-0">管理员</span>
                            )}
                          </div>
                          <div className="text-[10px] text-text-muted">{store.state.currentUser?.username === u.username ? "当前账号" : u.created_at?.slice(0, 10)}</div>
                        </div>

                        {/* 重置密码（行内输入） */}
                        {resetId === u.id ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={resetPwd}
                              onChange={(e) => setResetPwd(e.target.value)}
                              placeholder="新密码"
                              className="w-28 px-2 py-1 text-xs rounded-md bg-background border border-border outline-none focus:border-primary/40"
                            />
                            <button
                              type="button"
                              onClick={() => handleResetPwd(u.id)}
                              className="px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-md flex-shrink-0"
                            >
                              确认
                            </button>
                            <button
                              type="button"
                              onClick={() => { setResetId(null); setResetPwd("") }}
                              className="px-2 py-1 text-xs text-text-muted hover:bg-surface-hover rounded-md flex-shrink-0"
                            >
                              取消
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setResetId(u.id); setResetPwd("") }}
                            className="px-2 py-1 text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary/10 rounded-md flex-shrink-0"
                          >
                            重置密码
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={store.state.currentUser?.username === u.username}
                          onClick={() => handleDeleteUser(u)}
                          title={store.state.currentUser?.username === u.username ? "不能删除当前账号" : "删除用户"}
                          className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-30 flex-shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
