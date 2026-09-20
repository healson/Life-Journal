import { useState } from "react"
import { Lock, Unlock } from "lucide-react"
import { store } from "../store"
import type { JournalEntry } from "../types"

interface Props {
  entry: JournalEntry
}

/**
 * 已锁定日记的查看页：输入密码后可临时查看；也可永久解除锁定。
 */
export function LockedEntryView({ entry }: Props) {
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleView() {
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await store.unlockEntry(entry.id, password, false)
      setPassword("")
    } catch (err) {
      setError((err as Error)?.message || "密码错误")
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveLock() {
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      await store.unlockEntry(entry.id, password, true)
      setPassword("")
    } catch (err) {
      setError((err as Error)?.message || "密码错误")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex-1 min-w-0 min-h-0 flex flex-col items-center justify-center text-center p-8 bg-surface">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <Lock className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-bold text-text mb-1">这篇日记上了锁</h2>
      <p className="text-sm text-text-secondary mb-6 max-w-xs">
        「{entry.title || "无标题"}」已被密码保护，输入密码即可查看。
      </p>

      <input
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          setError(null)
        }}
        onKeyDown={(e) => e.key === "Enter" && handleView()}
        placeholder="输入密码"
        className="w-64 h-11 px-4 rounded-xl bg-surface-active border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {error && (
        <p className="mt-2.5 text-xs text-danger">{error}</p>
      )}

      <button
        type="button"
        disabled={!password || busy}
        onClick={handleView}
        className="mt-4 inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Unlock className="w-4 h-4" />
        查看日记
      </button>

      <button
        type="button"
        disabled={!password || busy}
        onClick={handleRemoveLock}
        className="mt-3 text-xs text-text-muted hover:text-text transition-colors disabled:opacity-50"
      >
        永久解除密码锁定
      </button>
    </div>
  )
}
