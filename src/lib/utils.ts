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
