/**
 * AI 搜索接口：POST /api/ai/ask，SSE 流式读取（fetch + ReadableStream，
 * 不能用 EventSource——无法携带 Authorization 头）。
 */

import { BASE, getToken } from "./client"

export interface AIRef {
  id: string | number
  date: string | null
  title: string | null
}

export interface AIAskCallbacks {
  onSearching?: () => void
  /** 检索到的日记引用列表（正式回答开始前推送） */
  onRefs?: (refs: AIRef[]) => void
  /** 增量文本 */
  onDelta: (text: string) => void
  /** 错误（中文友好信息） */
  onError: (message: string) => void
  onDone?: () => void
}

export async function askAI(question: string, cb: AIAskCallbacks): Promise<void> {
  const headers: Record<string, string> = { Accept: "text/event-stream" }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  headers["Content-Type"] = "application/json"

  let res: Response
  try {
    res = await fetch(`${BASE}/ai/ask`, {
      method: "POST",
      headers,
      body: JSON.stringify({ question }),
    })
  } catch {
    cb.onError("网络错误：无法连接服务器")
    return
  }

  if (!res.ok || !res.body) {
    let msg = `请求失败（${res.status}）`
    try {
      const data = await res.json()
      if (typeof data?.detail === "string") msg = data.detail
    } catch {
      /* 保留默认消息 */
    }
    cb.onError(msg)
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  const handleFrame = (frame: string) => {
    let event = "message"
    let data = ""
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) data += line.slice(5).trim()
    }
    if (!data) return
    let parsed: any = null
    try {
      parsed = JSON.parse(data)
    } catch {
      return
    }
    if (event === "searching") cb.onSearching?.()
    else if (event === "refs") cb.onRefs?.(Array.isArray(parsed.items) ? parsed.items : [])
    else if (event === "delta") cb.onDelta(typeof parsed.content === "string" ? parsed.content : "")
    else if (event === "error") cb.onError(typeof parsed.message === "string" ? parsed.message : "AI 服务出错")
    else if (event === "done") cb.onDone?.()
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf("\n\n")) >= 0) {
        handleFrame(buffer.slice(0, idx))
        buffer = buffer.slice(idx + 2)
      }
    }
  } catch {
    cb.onError("连接中断，请重试")
  }
}
