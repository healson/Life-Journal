import { useState, type FormEvent } from "react"
import {
  KeyRound, RefreshCw, Server, Shield, Trash2, UserPlus,
} from "lucide-react"
import { cn, formatDate } from "../../lib/utils"
import { store } from "../../store"
import { emitChange } from "../../lib/events"
import { confirmDialog } from "../ConfirmDialog"
import {
  apiChangePassword, apiCreateUser, apiDeleteUser, apiListUsers,
  apiResetPassword, apiUpdateUsername, type UserDto,
} from "../../api/client"

/** 账号：修改密码、服务器地址（APK）、用户管理（管理员） */
export function AccountTab({ isAdmin }: { isAdmin: boolean }) {
  // APK 壳注入的桥（window.LifeJournalApp）：服务器地址设置已合并进本弹窗
  const appBridge = (window as unknown as Record<string, any>).LifeJournalApp as
    | { getServerUrl?: () => string; openServerSettings?: () => void }
    | undefined
  const [serverUrl] = useState(() => {
    try {
      return appBridge?.getServerUrl?.() ?? ""
    } catch {
      return ""
    }
  })

  const [oldPwd, setOldPwd] = useState("")
  const [newPwd, setNewPwd] = useState("")
  const [confirmPwd, setConfirmPwd] = useState("")
  const [pwdMsg, setPwdMsg] = useState<string | null>(null)
  // 用户管理
  const [users, setUsers] = useState<UserDto[] | null>(null)
  const [newUser, setNewUser] = useState({ username: "", password: "", is_admin: false })
  const [resetId, setResetId] = useState<number | null>(null)
  const [resetPwd, setResetPwd] = useState("")
  const [renameId, setRenameId] = useState<number | null>(null)
  const [renameName, setRenameName] = useState("")
  const [userMsg, setUserMsg] = useState<string | null>(null)

  const me = store.state.currentUser

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

  const handleRename = async (id: number) => {
    const name = renameName.trim()
    if (!name) { setUserMsg("请输入新用户名"); return }
    if (name.length < 3) { setUserMsg("用户名至少 3 位"); return }
    setUserMsg(null)
    try {
      await apiUpdateUsername(id, name)
      setRenameId(null); setRenameName("")
      setUserMsg("✅ 用户名已更新")
      await loadUsers()
      await store.refreshMe()
      emitChange() // 侧栏用户名是当前账号时同步刷新
    } catch (err: any) {
      setUserMsg(`❌ ${err?.message ?? "修改失败"}`)
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

  return (
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

      {/* 服务器（仅 APK 壳内显示）：原来的悬浮齿轮入口合并到这里 */}
      {appBridge && (
        <div className="pt-4 border-t border-border-light">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-3">
            服务器
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-hover">
            <Server className="w-4 h-4 text-text-muted flex-shrink-0" />
            <span className="text-sm text-text flex-1 truncate">{serverUrl || "未设置"}</span>
            <button
              type="button"
              onClick={() => appBridge.openServerSettings?.()}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary-light transition-colors"
            >
              修改
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">保存后 App 会重新连接该地址。</p>
        </div>
      )}

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
                onClick={() => loadUsers().catch((e: any) => setUserMsg(`❌ ${e?.message ?? "加载失败"}`))}
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
                    <div className="text-[10px] text-text-muted">{store.state.currentUser?.username === u.username ? "当前账号" : (u.created_at ? formatDate(u.created_at) : "")}</div>
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

                  {/* 修改用户名（行内输入） */}
                  {renameId === u.id ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoComplete="off"
                        value={renameName}
                        onChange={(e) => setRenameName(e.target.value)}
                        placeholder="新用户名"
                        className="w-24 px-2 py-1 text-xs rounded-md bg-background border border-border outline-none focus:border-primary/40"
                      />
                      <button
                        type="button"
                        onClick={() => handleRename(u.id)}
                        className="px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded-md flex-shrink-0"
                      >
                        确认
                      </button>
                      <button
                        type="button"
                        onClick={() => { setRenameId(null); setRenameName("") }}
                        className="px-2 py-1 text-xs text-text-muted hover:bg-surface-hover rounded-md flex-shrink-0"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setRenameId(u.id); setRenameName(u.username) }}
                      className="px-2 py-1 text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary/10 rounded-md flex-shrink-0"
                    >
                      改名
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
  )
}
