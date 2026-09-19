/**
 * 后端 API 客户端。BASE 默认 "/api"，由 vite dev proxy / nginx 转发到后端。
 * 所有 id 在后端为 int，这里统一转成 string 以匹配前端类型。
 */

const BASE = (import.meta.env.VITE_API_BASE as string) || "/api"

export const TOKEN_KEY = "ryjq_token"

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const { method = "GET", body } = options
  const headers: Record<string, string> = {}
  const token = getToken()
  if (token) headers["Authorization"] = `Bearer ${token}`
  if (body !== undefined) headers["Content-Type"] = "application/json"

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T

  let data: any = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!res.ok) {
    const detail = data?.detail
    const msg = typeof detail === "string" ? detail : detail?.[0]?.msg || res.statusText
    throw new ApiError(res.status, msg)
  }
  return data as T
}

// ── 认证 ──
export interface AuthToken { access_token: string; token_type: string }

export function apiLogin(username: string, password: string) {
  return request<AuthToken>("/auth/login", { method: "POST", body: { username, password } })
}
export function apiRegister(username: string, password: string) {
  return request<AuthToken>("/auth/register", { method: "POST", body: { username, password } })
}

// ── Auth: 用户与账户 ──
export interface UserDto { id: number; username: string; is_admin: boolean; created_at: string }
export function apiMe() { return request<UserDto>("/auth/me") }
export function apiChangePassword(old_password: string, new_password: string) {
  return request<{ ok: boolean }>("/auth/change-password", { method: "POST", body: { old_password, new_password } })
}
export function apiListUsers() { return request<UserDto[]>("/auth/users") }
export function apiCreateUser(username: string, password: string, is_admin: boolean) {
  return request<UserDto>("/auth/users", { method: "POST", body: { username, password, is_admin } })
}
export function apiResetPassword(userId: string | number, new_password: string) {
  return request<{ ok: boolean }>(`/auth/users/${userId}/password`, { method: "POST", body: { new_password } })
}
export function apiUpdateUsername(userId: string | number, username: string) {
  return request<{ ok: boolean }>(`/auth/users/${userId}/username`, { method: "POST", body: { username } })
}
export function apiDeleteUser(userId: string | number) {
  return request<{ ok: boolean }>(`/auth/users/${userId}`, { method: "DELETE" })
}

// ── Backup: 数据备份与恢复 ──
export function apiExportData() { return request<any>("/backup/export") }
export function apiImportData(data: unknown) {
  return request<{ ok: boolean }>("/backup/import", { method: "POST", body: data })
}
export function apiClearAll() { return request<{ ok: boolean }>("/backup/all", { method: "DELETE" }) }

// ── Entries ──
export interface EntryPayload {
  title?: string
  content?: string
  plain_text?: string
  mood?: string | null
  tags?: string[]
  entry_type?: string
  is_pinned?: boolean
  date?: string | null
}

function mapEntry(e: any) {
  e.id = String(e.id)
  e.tags = e.tags ?? []
  e.isPinned = e.isPinned ?? e.is_pinned ?? false
  return e
}

export function apiListEntries(params: Record<string, string> = {}) {
  const qs = Object.entries(params).filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
  return request<any[]>(`/entries${qs ? `?${qs}` : ""}`).then((list) => list.map(mapEntry))
}
export function apiCreateEntry(body: EntryPayload) {
  return request<any>("/entries", { method: "POST", body }).then(mapEntry)
}
export function apiUpdateEntry(id: string, body: EntryPayload) {
  return request<any>(`/entries/${id}`, { method: "PUT", body }).then(mapEntry)
}
export function apiDeleteEntry(id: string) {
  return request(`/entries/${id}`, { method: "DELETE" })
}
export function apiTogglePin(id: string) {
  return request<any>(`/entries/${id}/pin`, { method: "POST" }).then(mapEntry)
}

// ── Todos ──
function mapTodo(t: any) {
  t.id = String(t.id)
  if (t.entry_id != null) t.entryId = String(t.entry_id)
  t.syncedToCalendar = t.synced_to_calendar ?? false
  return t
}

export function apiListTodos(params: Record<string, string> = {}) {
  const qs = Object.entries(params).filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
  return request<any[]>(`/todos${qs ? `?${qs}` : ""}`).then((list) => list.map(mapTodo))
}
export function apiCreateTodo(body: any) {
  return request<any>("/todos", { method: "POST", body }).then(mapTodo)
}
export function apiUpdateTodo(id: string, body: any) {
  return request<any>(`/todos/${id}`, { method: "PUT", body }).then(mapTodo)
}
export function apiCompleteTodo(id: string) {
  return request<any>(`/todos/${id}/complete`, { method: "POST" }).then(mapTodo)
}
export function apiDeleteTodo(id: string) {
  return request(`/todos/${id}`, { method: "DELETE" })
}

// ── Uploads: 图片上传 ──
export function apiUploadImage(file: File) {
  const form = new FormData()
  form.append("file", file)
  const token = getToken()
  return new Promise<string>((resolve, reject) => {
    fetch(`${BASE}/uploads`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: form, // 不手动设 Content-Type，让浏览器自动带 boundary
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (!res.ok) {
          const msg = typeof data?.detail === "string" ? data.detail : "上传失败"
          reject(new ApiError(res.status, msg as string))
          return
        }
        resolve(data.url as string)
      })
      .catch(reject)
  })
}
