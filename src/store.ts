import type { JournalEntry, Todo } from "./types"
import { emitChange } from "./lib/events"
import {
  apiCompleteTodo, apiCreateEntry, apiCreateTodo, apiDeleteEntry, apiDeleteTodo,
  apiListEntries, apiListTodos, apiLogin, apiRegister, apiTogglePin,
  apiUpdateEntry, apiUpdateTodo, getToken, setToken,
} from "./api/client"

/** 后端账号用户名（个人日记固定单一账号） */
const AUTH_USER = "default"

/** 草稿条目的固定 id 标记（不在 entries 数组中） */
export const DRAFT_ID = "__draft__"

interface State {
  isUnlocked: boolean
  hasPassword: boolean
  selectedDate: string | null
  entries: JournalEntry[]
  todos: Todo[]
  selectedEntryId: string | null
  filterType: "all" | "daily" | "inspiration" | "behavior"
  searchQuery: string
  showConvertDrawer: boolean
  draft: JournalEntry | null
  booting: boolean       // 数据加载中
  bootError: string | null
}

const LOCK_KEY = "ryjq_lock_unlocked"
const PASS_KEY = "ryjq_pass"

const hasPassword = localStorage.getItem(PASS_KEY) !== null
const wasUnlocked = localStorage.getItem(LOCK_KEY) === "1" && hasPassword

const state: State = {
  isUnlocked: wasUnlocked,
  hasPassword,
  selectedDate: null,
  entries: [],
  todos: [],
  selectedEntryId: null,
  filterType: "all",
  searchQuery: "",
  showConvertDrawer: false,
  draft: null,
  booting: false,
  bootError: null,
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
    .replace(/[#*`>\-_!()\[\]]/g, "")
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

  // ── 认证 / 解锁 ──
  /**
   * 解锁 = 用 PIN 作为密码登录/注册后端账号，并加载数据。
   * 返回 Promise<boolean>，PinLock 需 await。
   */
  async unlock(pin: string): Promise<boolean> {
    const saved = localStorage.getItem(PASS_KEY)
    const expected = saved ?? "111111"
    if (pin !== expected) return false

    // 先尝试登录；若账号不存在（401）则注册
    try {
      const r = await apiLogin(AUTH_USER, pin)
      setToken(r.access_token)
    } catch (e: any) {
      if (e?.status === 401) {
        try {
          const r = await apiRegister(AUTH_USER, pin)
          setToken(r.access_token)
        } catch (registerErr: any) {
          // 若后端不可用 / 注册失败，回退为纯前端解锁（空数据）
          state.bootError = registerErr?.message ?? "无法连接后端服务"
          setToken(null)
        }
      } else {
        state.bootError = e?.message ?? "无法连接后端服务"
        setToken(null)
      }
    }

    state.isUnlocked = true
    if (!saved) {
      localStorage.setItem(PASS_KEY, pin)
      state.hasPassword = true
    }
    localStorage.setItem(LOCK_KEY, "1")

    if (getToken()) await loadData(true)
    return true
  },

  lock() {
    state.isUnlocked = false
    localStorage.removeItem(LOCK_KEY)
  },

  resetPassword(newPin: string) {
    localStorage.setItem(PASS_KEY, newPin)
    state.hasPassword = true
    state.isUnlocked = true
    localStorage.setItem(LOCK_KEY, "1")
  },

  /** 应用启动时若已解锁且有 token，后台拉取数据 */
  async init() {
    if (!state.isUnlocked || !getToken()) return
    await loadData()
  },

  // ── 日历 ──
  selectDate(dateStr: string | null) { state.selectedDate = dateStr },

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
      mood: undefined, tags: [], entryType: "daily", isPinned: false,
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

  setFilter(type: State["filterType"]) { state.filterType = type },
  setSearch(q: string) { state.searchQuery = q },
  openConvertDrawer() { state.showConvertDrawer = true },
  closeConvertDrawer() { state.showConvertDrawer = false },

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
