import { useState, type FormEvent } from "react"
import { store } from "../store"

type Mode = "login" | "register"

export function LoginScreen() {
  const [mode, setMode] = useState<Mode>("login")
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (loading) return
    setError(null)

    const name = username.trim()
    if (!name || !password) {
      setError("请输入用户名和密码")
      return
    }
    if (mode === "register") {
      if (password.length < 6) { setError("密码至少 6 位"); return }
      if (password !== confirm) { setError("两次输入的密码不一致"); return }
    }

    setLoading(true)
    try {
      if (mode === "login") await store.login(name, password)
      else await store.register(name, password)
    } catch (err: any) {
      setError(err?.message ?? "操作失败，请重试")
    } finally {
      setLoading(false)
    }
  }

  const switchMode = () => {
    setMode((m) => (m === "login" ? "register" : "login"))
    setError(null)
    setConfirm("")
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <form
        onSubmit={submit}
        className="w-[360px] bg-surface rounded-2xl border border-border-light shadow-popover p-8 flex flex-col items-center"
      >
        {/* Logo */}
        <div className="w-16 h-16 rounded-2xl bg-primary flex items-center justify-center mb-5 shadow-lg">
          <span className="text-white text-2xl">📓</span>
        </div>
        <h1 className="text-xl font-bold text-text mb-1">人生记趣录</h1>
        <p className="text-xs text-text-muted mb-7">
          {mode === "login" ? "欢迎回来，登录你的专属小天地" : "创建一个新账户"}
        </p>

        {/* 用户名 */}
        <input
          type="text"
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="用户名"
          disabled={loading}
          className="w-full px-3 py-2.5 mb-3 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
        />

        {/* 密码 */}
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="密码（至少 6 位）"
          disabled={loading}
          className="w-full px-3 py-2.5 mb-3 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
        />

        {/* 注册时的确认密码 */}
        {mode === "register" && (
          <input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="确认密码"
            disabled={loading}
            className="w-full px-3 py-2.5 mb-3 rounded-lg bg-background border border-border outline-none text-sm focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
          />
        )}

        {/* 错误 */}
        {error && (
          <p className="text-danger text-sm mb-3 w-full text-center">{error}</p>
        )}

        {/* 提交 */}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-light disabled:opacity-50 transition-colors"
        >
          {loading ? (mode === "login" ? "登录中…" : "创建中…") : mode === "login" ? "登录" : "注册"}
        </button>

        {/* 切换 */}
        <button
          type="button"
          onClick={switchMode}
          disabled={loading}
          className="mt-4 text-xs text-text-muted hover:text-primary transition-colors"
        >
          {mode === "login" ? "没有账号？去注册" : "已有账号？去登录"}
        </button>

        {mode === "login" && (
          <p className="mt-6 text-[11px] text-text-muted text-center leading-relaxed">
            若首次登录，用注册或已有账号登录即可。
            <br />
            第一个注册的账号会成为管理员。
          </p>
        )}
      </form>
    </div>
  )
}
