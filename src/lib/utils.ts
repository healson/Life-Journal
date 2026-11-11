import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import type { JournalEntry } from "../types"

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
 * 取日记的逻辑日期（YYYY-MM-DD）：优先自定义 date，否则 fallback createdAt。
 * 注意必须走 formatDate 按本地时区取日期，直接 slice 字符串会拿到 UTC 日期，
 * 凌晨 0-8 点创建的日记会归到前一天。
 */
export function entryDate(e: JournalEntry): string {
  return e.date ?? formatDate(e.createdAt)
}

/** 取日记逻辑日期的 Date 对象（本地时区零点），用于日历分组/排序 */
export function entryDateObj(e: JournalEntry): Date {
  const [y, m, day] = entryDate(e).split("-").map(Number)
  return new Date(y, m - 1, day)
}

/**
 * 词数统计：中文每字计一词 + 英文/数字按单词计。
 * Tiptap 默认按空格分词，中文无空格会被整体算成 1 词，故自行统计。
 */
export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const latin = (text.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g) || []).length
  return cjk + latin
}

/** Markdown/HTML 转纯文本预览：剥标签、清语法符号、压空白 */
export function toPlainText(md: string): string {
  return md
    .replace(/<[^>]*>/g, "")
    .replace(/[#*`>\-_!()\[\]]/g, "")
    .replace(/\n+/g, " ")
    .trim()
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
