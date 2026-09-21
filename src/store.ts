import type { JournalEntry, Todo } from "./types"
import { emitChange } from "./lib/events"
import { startIdleTimer, stopIdleTimer } from "./lib/idle"
import {
  apiCompleteTodo, apiCreateEntry, apiCreateTodo, apiDeleteEntry, apiDeleteTodo,
  apiListEntries, apiListTodos, apiLockEntry, apiLogin, apiMe, apiRegister,
  apiTogglePin, apiUnlockEntry, apiUpdateEntry, apiUpdateTodo, getToken, setToken,
} from "./api/client"

/** 草稿条目的固定 id 标记（不在 entries 数组中） */
export const DRAFT_ID = "__draft__"

interface State {
  isUnlocked: boolean
  currentUser: { username: string; isAdmin: boolean } | null
  selectedDate: string | null
  entries: JournalEntry[]
  todos: Todo[]
  selectedEntryId: string | null
  filterType: "all" | "daily" | "inspiration" | "behavior"
  searchQuery: string
  showConvertDrawer: boolean
  showAddTodo: boolean   // “办”按钮触发的全局“新建待办”标志
  draft: JournalEntry | null
  booting: boolean       // 数据加载中
  bootError: string | null
  sessionUnlockedIds: string[]  // 会话内已输入密码解锁的日记 id（刷新/登出后失效）
}

const state: State = {
  isUnlocked: !!getToken(),
  currentUser: null,
  selectedDate: null,
  entries: [],
  todos: [],
  selectedEntryId: null,
  filterType: "all",
  searchQuery: "",
  showConvertDrawer: false,
  showAddTodo: false,
  draft: null,
  booting: false,
  bootError: null,
  sessionUnlockedIds: [],
}

function toClient(
  e: any,
): JournalEntry {
  return {
    id: e.id,
    title: e.title ?? "",
    content: e.content ?? "",
    plainText: e.plain_text ?? "",
    mood: e.mood as JournalEntry["mood"],
    tags: (e.tags ?? []).slice(),
    entryType: (e.entry_type ?? "daily") as JournalEntry["entryType"],
    isPinned: !!e.is_pinned,
    isLocked: !!e.is_locked,
    date: e.date ?? undefined,
    createdAt: e.created_at,
    updatedAt: e.updated_at,
  }
}

function toTodo(t: any): Todo {
  return {
    id: t.id,
    title: t.title ?? "",
    description: t.description ?? undefined,
    priority: (t.priority ?? 2) as Todo["priority"],
    status: (t.status ?? "pending") as Todo["status"],
    dueDate: t.due_date ?? undefined,
    remindAt: t.remind_at ?? undefined,
    syncedToCalendar: !!t.synced_to_calendar,
    entryId: t.entry_id != null ? String(t.entry_id) : undefined,
    completedAt: t.completed_at ?? undefined,
    createdAt: t.created_at,
  }
}

export function entryPayload(e: Partial<JournalEntry>) {
  return {
    title: e.title,
    content: e.content,
    plain_text: e.plainText,
    mood: e.mood ?? null,
    tags: e.tags,
    entry_type: e.entryType,
    is_pinned: e.isPinned,
    date: e.date ?? null,
  }
}

function todoPayload(t: Partial<Todo>) {
  return {
    title: t.title,
    description: t.description ?? null,
    priority: t.priority,
    status: t.status,
    due_date: t.dueDate ?? null,
    remind_at: t.remindAt ?? null,
    entry_id: t.entryId != null ? Number(t.entryId) : null,
  }
}

function plainText(md: string): string {
  return md
    .replace(/<[^>]*>/g, "")             // 先剥掉内联 HTML 标签（如 <span style="...">）
    .replace(/[#*`>\-_!()\[\]]/g, "")    // 再清掉常见 Markdown 语法符号
    .replace(/\n+/g, " ")
    .trim()
    .slice(0, 200)
}

function genId() {
  return "tmp_" + Math.random().toString(36).slice(2, 8)
}

async function loadData(fromUnlock = false) {
  state.booting = true
  state.bootError = null
  try {
    const [entries, todos] = await Promise.all([
      apiListEntries(),
      apiListTodos(),
    ])
    state.entries = entries.map(toClient)
    state.todos = todos.map(toTodo)
    if (state.isUnlocked && state.entries[0]) {
      state.selectedEntryId = state.entries[0].id
    }
    if (fromUnlock && state.entries[0]) state.selectedEntryId = state.entries[0].id
  } catch (err) {
    state.bootError = (err as Error).message
  } finally {
    state.booting = false
    emitChange()
  }
}

export const store = {
  get state() { return state },

  // ── 认证 / 多用户 ──
  async refreshMe() {
    try {
      const me = await apiMe()
      state.currentUser = { username: me.username, isAdmin: !!me.is_admin }
    } catch {
      state.currentUser = null
    }
  },

  async login(username: string, password: string): Promise<void> {
    const r = await apiLogin(username, password)
    setToken(r.access_token)
    state.isUnlocked = true
    await this.refreshMe()
    await loadData(true)
    startIdleTimer(() => this.lock(), 10)
  },

  async register(username: string, password: string): Promise<void> {
    const r = await apiRegister(username, password)
    setToken(r.access_token)
    state.isUnlocked = true
    await this.refreshMe()
    await loadData(true)
    startIdleTimer(() => this.lock(), 10)
  },

  /** 退出登录：清空 token、当前用户与本地数据 */
  lock() {
    stopIdleTimer()
    state.isUnlocked = false
    state.currentUser = null
    state.entries = []
    state.todos = []
    state.draft = null
    state.selectedEntryId = null
    state.sessionUnlockedIds = []
    setToken(null)
  },

  /** 应用启动时若已有 token，后台拉取数据 */
  async init() {
    if (!state.isUnlocked || !getToken()) return
    await this.refreshMe()
    await loadData()
    startIdleTimer(() => this.lock(), 10)
  },

  /** 重新从后端拉取当前用户数据（导入/清空后调用） */
  async refresh() {
    await loadData()
  },

  // ── 日历 ──
  selectDate(dateStr: string | null) {
    state.selectedDate = dateStr
    // 清空日期过滤时，一并取消由日历产生的草稿（回到不受日历影响的完整列表）
    if (dateStr === null) this.cancelDraft()
  },

  // ── Entries ──
  selectEntry(id: string | null) { state.selectedEntryId = id },

  createEntry(data: Partial<JournalEntry>): JournalEntry {
    const tmpId = genId()
    const now = new Date().toISOString()
    const entry: JournalEntry = {
      id: tmpId,
      title: data.title ?? "无标题",
      content: data.content ?? "",
      plainText: "",
      mood: data.mood,
      tags: data.tags ?? [],
      entryType: data.entryType ?? "daily",
      isPinned: false,
      isLocked: false,
      date: data.date,
      createdAt: now,
      updatedAt: now,
    }
    state.entries.unshift(entry)
    state.selectedEntryId = entry.id

    apiCreateEntry(entryPayload(entry)).then((server: any) => {
      const idx = state.entries.findIndex((e) => e.id === tmpId)
      if (idx >= 0) {
        const merged = { ...state.entries[idx], ...toClient(server) }
        state.entries = state.entries.map((e, i) => (i === idx ? merged : e))
        if (state.selectedEntryId === tmpId) state.selectedEntryId = merged.id
        emitChange()
      }
    }).catch(() => { /* 后端失败则保留本地（离线语义） */ })

    return entry
  },

  // ── 草稿（点击空日期进入，尚未成为正式日记）──
  startDraft(date: string) {
    const now = new Date().toISOString()
    state.draft = {
      id: DRAFT_ID, title: "", content: "", plainText: "",
      mood: undefined, tags: [], entryType: "daily", isPinned: false, isLocked: false,
      date, createdAt: now, updatedAt: now,
    }
    state.selectedEntryId = DRAFT_ID
  },

  updateDraft(patch: Partial<JournalEntry>) {
    if (!state.draft) return
    const updated = { ...state.draft, ...patch, updatedAt: new Date().toISOString() }
    if (patch.content) updated.plainText = plainText(patch.content)
    state.draft = updated
  },

  commitDraft() {
    if (!state.draft) return
    const d = state.draft
    state.draft = null
    if (d.content.trim() || d.title.trim()) {
      const entry = this.createEntry({
        date: d.date, title: d.title, content: d.content,
        mood: d.mood, tags: d.tags, entryType: d.entryType,
      })
      state.selectedEntryId = entry.id
    } else {
      state.selectedEntryId = null
    }
  },

  /** 取消当前草稿（空草稿安全丢弃；有内容的草稿会在编辑器失焦时先提交保存） */
  cancelDraft() {
    if (state.selectedEntryId !== DRAFT_ID) return
    state.draft = null
    state.selectedEntryId = null
  },

  updateEntry(id: string, patch: Partial<JournalEntry>) {
    const idx = state.entries.findIndex((e) => e.id === id)
    if (idx < 0) return
    const updated = { ...state.entries[idx], ...patch, updatedAt: new Date().toISOString() }
    if (patch.content) updated.plainText = plainText(patch.content)
    state.entries = state.entries.map((e, i) => (i === idx ? updated : e))
    apiUpdateEntry(id, entryPayload(patch)).catch(() => {})
  },

  deleteEntry(id: string) {
    const idx = state.entries.findIndex((e) => e.id === id)
    if (idx >= 0) {
      state.entries.splice(idx, 1)
      state.entries = [...state.entries]
      if (state.selectedEntryId === id) {
        state.selectedEntryId = state.entries[0]?.id ?? null
      }
    }
    apiDeleteEntry(id).catch(() => {})
  },

  togglePin(id: string) {
    const entry = state.entries.find((e) => e.id === id)
    if (!entry) return
    const flipped = !entry.isPinned
    state.entries = state.entries.map((e) => (e.id === id ? { ...e, isPinned: flipped } : e))
    apiTogglePin(id).then((server: any) => {
      state.entries = state.entries.map((e) =>
        e.id === id ? { ...e, isPinned: !!server.is_pinned } : e)
      emitChange()
    }).catch(() => {})
  },

  // ── 单篇密码锁定 ──
  /** 设置密码并锁定：本地立即置锁、清空正文（防留在内存），成功后合并服务端响应 */
  lockEntry(id: string, password: string) {
    state.entries = state.entries.map((e) =>
      e.id === id ? { ...e, isLocked: true, content: "", plainText: "" } : e)
    state.sessionUnlockedIds = state.sessionUnlockedIds.filter((x) => x !== id)
    return apiLockEntry(id, password).then((server: any) => {
      state.entries = state.entries.map((e) => (e.id === id ? { ...e, ...toClient(server) } : e))
      emitChange()
    })
  },

  /** 输入密码解锁：removeLock=false 临时查看（记入会话）；removeLock=true 永久移除密码 */
  unlockEntry(id: string, password: string, removeLock = false) {
    return apiUnlockEntry(id, password, removeLock).then((server: any) => {
      const client = toClient(server)
      state.entries = state.entries.map((e) => (e.id === id ? { ...e, ...client } : e))
      state.sessionUnlockedIds = removeLock
        ? state.sessionUnlockedIds.filter((x) => x !== id)
        : [...state.sessionUnlockedIds.filter((x) => x !== id), id]
      emitChange()
    })
  },

  /** 重新隐藏内容（仅本地，密码保持不变） */
  relockEntry(id: string) {
    state.entries = state.entries.map((e) =>
      e.id === id ? { ...e, content: "", plainText: "" } : e)
    state.sessionUnlockedIds = state.sessionUnlockedIds.filter((x) => x !== id)
  },

  setFilter(type: State["filterType"]) { state.filterType = type },
  setSearch(q: string) { state.searchQuery = q },
  openConvertDrawer() { state.showConvertDrawer = true; emitChange() },
  closeConvertDrawer() { state.showConvertDrawer = false; emitChange() },
  openAddTodo() { state.showAddTodo = true; emitChange() },
  closeAddTodo() { state.showAddTodo = false; emitChange() },

  // ── Todos ──
  addTodos(todos: Omit<Todo, "id" | "createdAt" | "syncedToCalendar">[]): Todo[] {
    const created: Todo[] = []
    for (const t of todos) {
      const tmpId = genId()
      const todo: Todo = {
        ...t, id: tmpId, createdAt: new Date().toISOString(), syncedToCalendar: false,
      }
      state.todos.unshift(todo)
      created.push(todo)

      apiCreateTodo(todoPayload(todo)).then((server: any) => {
        const idx = state.todos.findIndex((x) => x.id === tmpId)
        if (idx >= 0) {
          const merged = { ...state.todos[idx], ...toTodo(server) }
          state.todos = state.todos.map((x, i) => (i === idx ? merged : x))
          emitChange()
        }
      }).catch(() => {})
    }
    return created
  },

  updateTodo(id: string, patch: Partial<Todo>) {
    const idx = state.todos.findIndex((t) => t.id === id)
    if (idx < 0) return
    let updated = { ...state.todos[idx], ...patch }
    if (patch.status === "done") {
      updated.completedAt = updated.completedAt ?? new Date().toISOString()
    } else if (patch.status) {
      updated.completedAt = undefined
    }
    state.todos = state.todos.map((t, i) => (i === idx ? updated : t))

    // 后端统一走 complete 端点处理 done/pending
    const p = todoPayload(patch)
    if (p.status === "done" || p.status === "pending") {
      apiCompleteTodo(id).then((server: any) => {
        state.todos = state.todos.map((t) => (t.id === id ? { ...t, ...toTodo(server) } : t))
        emitChange()
      }).catch(() => {})
    } else {
      apiUpdateTodo(id, p).then(() => emitChange()).catch(() => {})
    }
  },

  deleteTodo(id: string) {
    const idx = state.todos.findIndex((t) => t.id === id)
    if (idx >= 0) state.todos = state.todos.filter((t) => t.id !== id)
    apiDeleteTodo(id).catch(() => {})
  },
}

// 已解锁（历史会话）且有 token：启动即后台加载数据
if (state.isUnlocked && getToken()) {
  void store.init()
}