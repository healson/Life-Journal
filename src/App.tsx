import { useState } from "react"
import { Sidebar } from "./components/Sidebar"
import { EntryList } from "./components/EntryList"
import { MarkdownEditor } from "./components/MarkdownEditor"
import { TodoList } from "./components/TodoList"
import { ConvertDrawer } from "./components/ConvertDrawer"
import { LoginScreen } from "./components/LoginScreen"
import { ResizablePane } from "./components/ResizablePane"
import { EnvelopeLayer } from "./components/EnvelopeLayer"
import { ConfirmHost } from "./components/ConfirmDialog"
import { store, DRAFT_ID } from "./store"
import { useStore } from "./lib/observer"
import { Wand2 } from "lucide-react"

type View = "entries" | "todos"

export default function App() {
  const [view, setView] = useState<View>("entries")
  const state = useStore()

  // 未登录时显示登录页
  if (!state.isUnlocked) {
    return (
      <>
        <LoginScreen />
        <ConfirmHost />
      </>
    )
  }

  const selectedEntry = state.entries.find((e) => e.id === state.selectedEntryId)
  // 草稿态：selectedEntryId 为 DRAFT_ID 时，右侧编辑器绑定 state.draft
  const isDrafting = state.selectedEntryId === DRAFT_ID && !!state.draft
  const editing = selectedEntry || isDrafting

  return (
    <div className="h-full flex bg-background overflow-hidden">
      {/* 左侧边栏（可拖动宽度）——默认加宽以容纳 24px 品牌标题 */}
      <ResizablePane initialWidth={300} minWidth={260} maxWidth={420} side="right">
        <Sidebar onViewChange={setView} />
      </ResizablePane>

      {/* 中间栏 + 右侧编辑区（整体再套一层） */}
      <main className="flex-1 flex min-w-0 relative">
        {view === "entries" ? (
          <>
            {/* 中间：日记列表（可拖动宽度） */}
            <ResizablePane initialWidth={320} minWidth={240} maxWidth={480} side="right">
              <EntryList />
            </ResizablePane>

            {/* 右侧：编辑器 */}
            <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
              {editing ? (
                <MarkdownEditor entryId={state.selectedEntryId!} />
              ) : (
                <EmptyState onNew={() => store.createEntry({ entryType: "daily" })} />
              )}

              {/* 浮动 "转待办" 按钮 */}
              {editing && (
                <button
                  onClick={() => store.openConvertDrawer()}
                  className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-2.5 rounded-full bg-accent text-white text-sm font-medium shadow-popover hover:bg-accent-light active:scale-95 transition-all z-30"
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

      {/* 转待办抽屉 */}
      <ConvertDrawer />

      {/* 信封飞行动画层（全屏固定 z-index 1000） */}
      <EnvelopeLayer />

      {/* 全局居中确认框 */}
      <ConfirmHost />
    </div>
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
