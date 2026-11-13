import { useEffect, useRef, useState } from "react"
import { Sidebar } from "./components/Sidebar"
import { EntryList } from "./components/EntryList"
import { MarkdownEditor } from "./components/MarkdownEditor"
import { TodoList } from "./components/TodoList"
import { ConvertDrawer } from "./components/ConvertDrawer"
import { AIChatDrawer } from "./components/AIChatDrawer"
import { LoginScreen } from "./components/LoginScreen"
import { LockedEntryView } from "./components/LockedEntryView"
import { EnvelopeLayer } from "./components/EnvelopeLayer"
import { ConfirmHost } from "./components/ConfirmDialog"
import { PasswordHost } from "./components/PasswordDialog"
import { store, DRAFT_ID } from "./store"
import { useStore } from "./lib/observer"
import { useIsMobile } from "./lib/useIsMobile"
import { registerBackHandler } from "./lib/backHandler"
import { cn, toPlainText } from "./lib/utils"
import { ChevronLeft, Wand2, Check } from "lucide-react"

type View = "entries" | "todos"

export default function App() {
  const [view, setView] = useState<View>("entries")
  const state = useStore()
  const isMobile = useIsMobile()
  // 移动端：侧栏抽屉开关
  const [drawerOpen, setDrawerOpen] = useState(false)
  // 移动端：从抽屉选了日期/日记后自动收起抽屉
  useEffect(() => {
    if (state.selectedDate || state.selectedEntryId) setDrawerOpen(false)
  }, [state.selectedDate, state.selectedEntryId])

  // 移动端：登录后默认进入「当前日期的空日记」草稿（整个会话只触发一次，返回列表后不再自动跳转）。
  // 等待数据加载完成（booting=false）再建立草稿，避免被 loadData 自动选中的最近日记抢占。
  const autoStartedDraft = useRef(false)
  useEffect(() => {
    if (!isMobile || !state.isUnlocked || autoStartedDraft.current) return
    if (!state.ready) return
    autoStartedDraft.current = true
    const n = new Date()
    const pad = (x: number) => String(x).padStart(2, "0")
    store.selectEntry(null)
    store.startDraft(`${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`)
  }, [isMobile, state.isUnlocked, state.ready])

  // 移动端：列表页返回「二次确认退出」的提示状态
  const [exitHint, setExitHint] = useState(false)
  const exitHintTimer = useRef<number | null>(null)

  // 回前台自动同步：电脑端新增/修改的日记，切回应用即出现（15s 节流）。
  // draft 独立于 entries，刷新不会覆盖正在编辑的内容。
  useEffect(() => {
    if (!state.isUnlocked) return
    let last = 0
    const maybeRefresh = () => {
      if (document.visibilityState !== "visible" || !store.state.isUnlocked) return
      const now = Date.now()
      if (now - last < 15_000) return
      last = now
      void store.refresh()
    }
    document.addEventListener("visibilitychange", maybeRefresh)
    window.addEventListener("focus", maybeRefresh)
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh)
      window.removeEventListener("focus", maybeRefresh)
    }
  }, [state.isUnlocked])

  // 系统返回（安卓手势返回 / 返回键）：原生 OnBackPressedCallback 把事件交给
  // window.LifeJournalBack()（见 lib/backHandler）。弹窗/菜单等浮层自行注册局部
  // 关闭器（LIFO 先执行），这里注册页面级分发器作为兜底。
  const backRef = useRef<() => boolean>(() => false)
  useEffect(() => registerBackHandler(() => backRef.current()), [])

  // 未登录时显示登录页（系统返回交回原生 → finish 退出）
  backRef.current = () => false
  if (!state.isUnlocked) {
    return (
      <>
        <LoginScreen />
        <ConfirmHost />
        <PasswordHost />
      </>
    )
  }

  const selectedEntry = state.entries.find((e) => e.id === state.selectedEntryId)
  // 草稿态：selectedEntryId 为 DRAFT_ID 时，右侧编辑器绑定 state.draft
  const isDrafting = state.selectedEntryId === DRAFT_ID && !!state.draft
  const editing = selectedEntry || isDrafting
  // 搜索 / 锚点标签筛选态进入日记：编辑器锁定只读（正文关键词高亮，可点「编辑」退出）
  const searchActive = !!state.searchQuery?.trim() || !!state.tagFilter
  // 已锁定且本会话尚未输入密码的日记：右侧显示密码查看页
  const lockedHidden =
    !!selectedEntry?.isLocked && !state.sessionUnlockedIds.includes(selectedEntry.id)

  const handleViewChange = (v: View) => {
    setView(v)
    setDrawerOpen(false)
  }

  // 移动端编辑页返回列表
  const goBackToList = () => {
    store.selectEntry(null)
    store.cancelDraft()
  }

  // 页面级返回分发（浮层局部关闭器之外的兜底，顺序：抽屉 → 页面导航 → 退出登录）
  backRef.current = () => {
    if (state.showConvertDrawer) { store.closeConvertDrawer(); return true }
    if (state.aiChatOpen) { store.closeAIChat(); return true }
    if (state.showAddTodo) { store.closeAddTodo(); return true }
    if (drawerOpen) { setDrawerOpen(false); return true }
    if (view === "todos") { setView("entries"); return true }
    if (editing) { goBackToList(); return true }
    // 列表页：第一次提示，3 秒内再按一次退出登录
    if (exitHint) {
      if (exitHintTimer.current) window.clearTimeout(exitHintTimer.current)
      exitHintTimer.current = null
      setExitHint(false)
      store.lock()
      return true
    }
    setExitHint(true)
    if (exitHintTimer.current) window.clearTimeout(exitHintTimer.current)
    exitHintTimer.current = window.setTimeout(() => {
      setExitHint(false)
      exitHintTimer.current = null
    }, 3000)
    return true
  }

  return (
    <div className="h-full flex bg-background overflow-hidden">
      {/* 移动端退出提示（列表页系统返回第一次触发） */}
      {isMobile && exitHint && (
        <div className="fixed top-8 inset-x-0 flex justify-center z-[60] pointer-events-none">
          <div className="px-4 py-2 rounded-full bg-black/70 text-white text-xs shadow-lg">
            再按一次返回键退出登录
          </div>
        </div>
      )}
      {isMobile ? (
        <>
          {/* 侧栏抽屉遮罩 */}
          {drawerOpen && (
            <div
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setDrawerOpen(false)}
            />
          )}

          {/* 侧栏抽屉：Sidebar 原样复用，从左侧滑入 */}
          <div
            className={cn(
              "fixed left-0 top-0 h-full w-[300px] max-w-[85vw] z-50 shadow-2xl transition-transform duration-300",
              drawerOpen ? "translate-x-0" : "-translate-x-full",
            )}
          >
            <Sidebar onViewChange={handleViewChange} />
          </div>

          {/* 主体：列表页 ⇄ 编辑页互斥 */}
          <main className="h-full flex-1 min-w-0">
            {view === "todos" ? (
              <TodoList onMenuClick={() => setDrawerOpen(true)} />
            ) : lockedHidden && selectedEntry ? (
              <div className="relative h-full">
                <MobileBackButton onClick={goBackToList} />
                <LockedEntryView entry={selectedEntry} />
              </div>
            ) : editing ? (
              <div className="relative h-full">
                <MobileDoneButton onDone={goBackToList} readOnly={searchActive} />
                <MarkdownEditor entryId={state.selectedEntryId!} readOnly={searchActive} />
              </div>
            ) : (
              <EntryList
                onNewTodo={() => {
                  store.openAddTodo()
                  setView("todos")
                }}
                onMenuClick={() => setDrawerOpen(true)}
              />
            )}
          </main>
        </>
      ) : (
        <>
          {/* 左侧边栏（固定宽度 280px） */}
          <div className="w-[280px] flex-shrink-0">
            <Sidebar onViewChange={setView} />
          </div>

          {/* 中间栏 + 右侧编辑区（整体再套一层） */}
          <main className="flex-1 flex min-w-0 relative">
            {view === "entries" ? (
              <>
                {/* 中间：日记列表（固定宽度 320px） */}
                <div className="w-[320px] flex-shrink-0">
                  <EntryList onNewTodo={() => { store.openAddTodo(); setView("todos") }} />
                </div>

                {/* 右侧：编辑器 / 锁定查看页 */}
                <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
                  {lockedHidden && selectedEntry ? (
                    <LockedEntryView entry={selectedEntry} />
                  ) : editing ? (
                    <MarkdownEditor entryId={state.selectedEntryId!} readOnly={searchActive} />
                  ) : (
                    <EmptyState onNew={() => store.createEntry({ entryType: "daily" })} />
                  )}

                  {/* 浮动 "转待办" 按钮（搜索只读时由只读视图提供「编辑」按钮） */}
                  {editing && !searchActive && (
                    <button
                      onClick={() => store.openConvertDrawer()}
                      className="fixed bottom-16 right-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-white text-sm font-medium shadow-popover hover:bg-accent-light active:scale-95 transition-all z-30"
                    >
                      <Wand2 className="w-4 h-4" />
                      转待办
                    </button>
                  )}
                </div>
              </>
            ) : (
              <TodoList />
            )}
          </main>
        </>
      )}

      {/* 转待办抽屉 */}
      <ConvertDrawer />

      {/* AI 搜索对话抽屉 */}
      <AIChatDrawer />

      {/* 信封飞行动画层（全屏固定 z-index 1000） */}
      <EnvelopeLayer />

      {/* 全局居中确认框 */}
      <ConfirmHost />

      {/* 全局密码输入框 */}
      <PasswordHost />
    </div>
  )
}

/**
 * 移动端编辑页右上角操作按钮（替代原来的「返回」+ 底部「完成/转待办」操作条）：
 * - 日记为空（无标题/正文/标签/心情）：点击直接返回列表
 * - 日记有内容：点击展开二级菜单「完成日记 / 加入待办」
 * - 搜索只读态：只提供返回
 */
function MobileDoneButton({ onDone, readOnly }: { onDone: () => void; readOnly?: boolean }) {
  const state = useStore()
  const [open, setOpen] = useState(false)
  const entry =
    state.selectedEntryId === DRAFT_ID
      ? state.draft
      : state.entries.find((e) => e.id === state.selectedEntryId)
  const hasContent =
    !!entry &&
    (!!entry.title.trim() || !!toPlainText(entry.content).trim() || (entry.tags?.length ?? 0) > 0 || !!entry.mood)

  // 切换日记时收起菜单，避免带到下一篇
  useEffect(() => {
    setOpen(false)
  }, [state.selectedEntryId])

  // 系统返回：菜单展开时先收起菜单
  useEffect(() => {
    if (!open) return
    return registerBackHandler(() => {
      setOpen(false)
      return true
    })
  }, [open])

  if (readOnly) return <MobileBackButton onClick={onDone} />

  return (
    <div className="absolute top-3 right-3 z-40">
      <button
        onClick={() => (hasContent ? setOpen((v) => !v) : onDone())}
        className="relative z-50 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-surface/90 backdrop-blur border border-border-light text-text-secondary hover:text-text shadow-sm transition-colors"
      >
        <Check className="w-4 h-4" />
        <span className="text-xs">完成</span>
      </button>

      {open && (
        <>
          {/* 点击空白处收起 */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-40 rounded-xl border border-border-light bg-surface shadow-popover overflow-hidden animate-fade-in-up">
            <button
              onClick={() => {
                setOpen(false)
                store.commitDraft()
                onDone()
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[13px] text-text hover:bg-surface-hover transition-colors"
            >
              <Check className="w-4 h-4 text-primary" />
              完成日记
            </button>
            <button
              onClick={() => {
                setOpen(false)
                store.openConvertDrawer()
              }}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-[13px] text-text hover:bg-surface-hover transition-colors"
            >
              <Wand2 className="w-4 h-4 text-primary" />
              加入待办
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** 移动端编辑页顶部的返回按钮 */
function MobileBackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="absolute top-3 right-3 z-40 flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-surface/90 backdrop-blur border border-border-light text-text-secondary hover:text-text shadow-sm transition-colors"
    >
      <ChevronLeft className="w-4 h-4" />
      <span className="text-xs">返回</span>
    </button>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-12 bg-surface">
      <div className="w-24 h-24 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
        <span className="text-5xl">📝</span>
      </div>
      <h2 className="text-xl font-bold text-text mb-2">选择或创建一条日记</h2>
      <p className="text-text-secondary text-sm mb-6 max-w-sm">
        从中间栏选择一条已有的日记开始编辑，或者创建一条新的。
      </p>
      <button
        onClick={onNew}
        className="px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary-light transition-colors"
      >
        创建第一条日记
      </button>
    </div>
  )
}
