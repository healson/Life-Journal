import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: string | Date, withTime = false): string {
  const d = typeof date === "string" ? new Date(date) : date
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, "0")
  const minute = d.getMinutes().toString().padStart(2, "0")
  const dateStr = `${d.getFullYear()}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`
  if (withTime) return `${dateStr} ${hour}:${minute}`
  return dateStr
}

export function formatRelative(date: string | Date): string {
  const now = new Date()
  const d = typeof date === "string" ? new Date(date) : date
  const diff = now.getTime() - d.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return formatDate(date)
}

/**
 * 从全文提取包含关键词的摘要片段。
 * 返回片段中第一个关键词的位置（用于高亮分组），并控制片段长度。
 * - 命中时：以关键词为中心，前后各取 HALF 字，首尾补省略号
 * - 未命中或空：返回原始文本（前面截断）
 */
export function buildSnippet(text: string, keyword: string, half = 24): string {
  const kw = keyword.toLowerCase()
  if (!kw) return text
  const lower = text.toLowerCase()
  const idx = lower.indexOf(kw)
  if (idx === -1) return text.slice(0, half * 2)

  const start = Math.max(0, idx - half)
  const end = Math.min(text.length, idx + kw.length + half)
  const prefix = start > 0 ? "…" : ""
  const suffix = end < text.length ? "…" : ""
  return prefix + text.slice(start, end) + suffix
}
