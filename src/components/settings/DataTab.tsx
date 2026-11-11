import { useEffect, useRef, useState } from "react"
import {
  Archive, CalendarClock, CalendarSync, Check, Copy, Database, Download, RefreshCw, Trash2, Upload,
} from "lucide-react"
import { cn } from "../../lib/utils"
import { store } from "../../store"
import { confirmDialog } from "../ConfirmDialog"
import {
  calendarBridge, isCalendarSyncEnabled, setCalendarSyncEnabled,
  syncNow, clearCalendarEvents, onCalendarPermissionResult,
} from "../../lib/calendarBridge"
import {
  apiCalendarFeedUrl, apiClearAll, apiCreateSnapshot, apiDownloadSnapshot,
  apiExportData, apiImportData, apiListSnapshots,
  type BackupStatus,
} from "../../api/client"

/** 数据备份/恢复、服务器快照、日历订阅与手机日历同步 */
export function DataTab({ isAdmin }: { isAdmin: boolean }) {
  const [busy, setBusy] = useState<"export" | "import" | "clear" | "snapshot" | null>(null)
  // 服务器自动快照（管理员）
  const [snap, setSnap] = useState<BackupStatus | null>(null)
  const [snapMsg, setSnapMsg] = useState<string | null>(null)
  const [feedCopied, setFeedCopied] = useState(false)
  // 手机日历同步（仅 APK 内显示）
  const [calSyncOn, setCalSyncOn] = useState(() => isCalendarSyncEnabled())
  const [calSyncMsg, setCalSyncMsg] = useState<string | null>(null)
  const calPermCleanup = useRef<(() => void) | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const feedInputRef = useRef<HTMLInputElement>(null)

  // 进入数据页时拉取自动快照状态（管理员）
  useEffect(() => {
    if (!isAdmin) return
    apiListSnapshots().then(setSnap).catch((e: any) => setSnapMsg(e?.message ?? "加载备份状态失败"))
  }, [isAdmin])

  // ── 手机日历同步（APK 桥） ──
  const handleToggleCalSync = () => {
    if (calSyncOn) {
      // 关闭：停开关并清除已写入的日历与事件
      calPermCleanup.current?.()
      calPermCleanup.current = null
      setCalendarSyncEnabled(false)
      setCalSyncOn(false)
      const r = clearCalendarEvents()
      setCalSyncMsg(r === "ok" ? "已关闭，并清除手机日历中的待办" : "已关闭（清除日历失败，可在手机日历中手动删除）")
      return
    }
    // 打开：先落开关，再立即全量同步；无权限时原生会弹申请框
    setCalendarSyncEnabled(true)
    setCalSyncOn(true)
    const r = syncNow(store.state.todos)
    if (r === "ok") {
      setCalSyncMsg("已开启，待办已同步到手机日历")
    } else if (r === "requesting") {
      setCalSyncMsg("请在系统弹窗中允许日历权限…")
      calPermCleanup.current?.()
      calPermCleanup.current = onCalendarPermissionResult((granted) => {
        calPermCleanup.current = null
        if (granted) {
          const r2 = syncNow(store.state.todos)
          setCalSyncMsg(r2 === "ok" ? "已开启，待办已同步到手机日历" : "同步失败：" + r2)
        } else {
          // 拒绝权限：回滚开关，避免后台反复尝试
          setCalendarSyncEnabled(false)
          setCalSyncOn(false)
          setCalSyncMsg("未获得日历权限，无法同步；可在系统设置中授权后重试")
        }
      })
    } else {
      setCalSyncMsg("同步失败：" + r)
    }
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

  // ── 服务器自动快照（管理员）──
  const handleCreateSnapshot = async () => {
    setBusy("snapshot")
    setSnapMsg(null)
    try {
      setSnap(await apiCreateSnapshot())
      setSnapMsg("✅ 已生成最新快照")
    } catch (e: any) {
      setSnapMsg(`❌ ${e?.message ?? "生成失败"}`)
    } finally {
      setBusy(null)
    }
  }

  const handleDownloadSnapshot = async (name: string) => {
    try {
      await apiDownloadSnapshot(name)
    } catch (e: any) {
      alert(e?.message ?? "下载失败")
    }
  }

  // ── 日历订阅 ──
  const handleCopyFeed = async () => {
    const url = apiCalendarFeedUrl()
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setFeedCopied(true)
      setTimeout(() => setFeedCopied(false), 2000)
    } catch {
      // 非 HTTPS 环境剪贴板不可用：全选输入框让用户手动复制
      feedInputRef.current?.select()
    }
  }

  return (
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

      {/* 服务器自动备份（管理员） */}
      {isAdmin && (
        <div className="pt-4 border-t border-border-light">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Archive className="w-3.5 h-3.5" />
            自动备份
          </div>
          <p className="text-[11px] text-text-muted mb-2 leading-relaxed">
            {!snap
              ? (snapMsg ?? "加载中…")
              : snap.enabled
                ? `服务器于每天 ${snap.backup_time}（北京时间）后自动生成数据库一致性快照，每 ${snap.interval_days} 天一份，保留最近 ${snap.keep} 份，存于 data/backups/ 目录。`
                : "自动备份未启用（数据库非 SQLite 文件），仅支持手动导出备份。"}
          </p>

          <button
            type="button"
            disabled={busy !== null || !snap?.enabled}
            onClick={handleCreateSnapshot}
            className="w-full flex items-center gap-3 p-3 rounded-xl border border-border-light bg-surface hover:bg-surface-hover disabled:opacity-50 transition-colors text-left"
          >
            <span className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Archive className="w-4 h-4 text-primary" />
            </span>
            <span className="flex-1">
              <span className="block text-sm font-medium text-text">立即备份</span>
              <span className="block text-[11px] text-text-muted">
                生成当前数据库的一致性快照（覆盖今日快照）
              </span>
            </span>
            {busy === "snapshot" && <RefreshCw className="w-4 h-4 text-text-muted animate-spin" />}
          </button>

          {snapMsg && <p className="text-[11px] text-text-secondary mt-1.5">{snapMsg}</p>}

          {/* 快照列表 */}
          <div className="mt-2">
            {snap && snap.snapshots.length > 0 ? (
              <ul className="divide-y divide-border-light border border-border-light rounded-xl overflow-hidden">
                {snap.snapshots.map((s) => (
                  <li key={s.name} className="flex items-center gap-2 p-2.5 bg-surface">
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Database className="w-3.5 h-3.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-text">{s.date}</div>
                      <div className="text-[10px] text-text-muted">
                        {s.size < 1024 * 1024
                          ? `${Math.max(1, Math.round(s.size / 1024))} KB`
                          : `${(s.size / 1024 / 1024).toFixed(1)} MB`}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDownloadSnapshot(s.name)}
                      title="下载该快照"
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-text-secondary hover:text-primary hover:bg-primary/10 rounded-md flex-shrink-0"
                    >
                      <Download className="w-3.5 h-3.5" />
                      下载
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              snap && (
                <p className="text-[11px] text-text-muted leading-relaxed">
                  暂无快照，点击「立即备份」生成第一份。
                </p>
              )
            )}
          </div>
        </div>
      )}

      {/* 日历订阅 */}
      <div className="pt-4 border-t border-border-light">
        <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" />
          日历订阅
        </div>
        <p className="text-[11px] text-text-muted mb-2 leading-relaxed">
          手机「日历 → 添加订阅日历」粘贴此地址，带截止日期或提醒的待办会显示在系统日历，
          日历应用会按自己的刷新周期自动拉取更新。
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={feedInputRef}
            readOnly
            value={apiCalendarFeedUrl() ?? ""}
            onFocus={(e) => e.target.select()}
            placeholder="登录后生成订阅地址"
            className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-background border border-border text-xs text-text-secondary outline-none focus:border-primary/40"
          />
          <button
            type="button"
            onClick={handleCopyFeed}
            disabled={!apiCalendarFeedUrl()}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-hover text-xs font-medium text-text-secondary hover:bg-surface-active disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {feedCopied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
            {feedCopied ? "已复制" : "复制"}
          </button>
        </div>
        <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">
          地址含登录凭据且长期有效，请勿分享；修改密码或更换密钥后需重新复制。
        </p>
      </div>

      {/* 手机日历同步（仅 APK 内显示） */}
      {calendarBridge() && (
        <div className="pt-4 border-t border-border-light">
          <div className="text-[11px] font-semibold text-text-muted uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <CalendarSync className="w-3.5 h-3.5" />
            手机日历同步
          </div>
          <p className="text-[11px] text-text-muted mb-2 leading-relaxed">
            开启后，带截止日期或提醒的待办会自动写入本机「人生记趣录·待办」日历，
            提醒到点由系统日历弹出；新增、修改、完成待办会即时同步。
          </p>
          <button
            type="button"
            onClick={handleToggleCalSync}
            className={cn(
              "flex items-center gap-2 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors",
              calSyncOn
                ? "bg-primary/10 text-primary hover:bg-primary/15"
                : "bg-surface-hover text-text-secondary hover:bg-surface-active",
            )}
          >
            <span className="flex-1 text-left">
              {calSyncOn ? "已开启，点击关闭并清除" : "开启同步到手机日历"}
            </span>
            {calSyncOn && <Check className="w-4 h-4" />}
          </button>
          {calSyncMsg && (
            <p className="text-[11px] text-text-muted mt-1.5 leading-relaxed">{calSyncMsg}</p>
          )}
        </div>
      )}
    </div>
  )
}
