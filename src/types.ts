export type Mood = "happy" | "calm" | "energetic" | "tired" | "sad" | "angry"

export type EntryType = "daily" | "inspiration" | "behavior"

export interface User {
  id: string
  username: string
  isAdmin: boolean
  createdAt: string
}

export interface Todo {
  id: string
  title: string
  description?: string
  priority: 1 | 2 | 3
  status: "pending" | "in_progress" | "done"
  dueDate?: string
  remindAt?: string
  syncedToCalendar: boolean
  entryId?: string
  completedAt?: string
  createdAt: string
}

export interface JournalEntry {
  id: string
  title: string
  content: string        // Markdown 原文
  plainText: string      // 纯文本预览
  mood?: Mood
  tags: string[]
  entryType: EntryType
  isPinned: boolean
  isLocked: boolean      // 单篇密码锁定
  date?: string          // 自定义日记日期 YYYY-MM-DD，优先级高于 createdAt
  createdAt: string
  updatedAt: string
}

export const MOOD_LABELS: Record<Mood, { emoji: string; label: string; color: string }> = {
  happy:       { emoji: "😊", label: "开心", color: "#FBBF24" },
  calm:        { emoji: "😌", label: "平静", color: "#60A5FA" },
  energetic:   { emoji: "🔥", label: "干劲", color: "#F87171" },
  tired:       { emoji: "😴", label: "疲惫", color: "#A78BFA" },
  sad:         { emoji: "😔", label: "低落", color: "#94A3B8" },
  angry:       { emoji: "😤", label: "烦躁", color: "#EF4444" },
}

export const PRIORITY_LABELS = {
  1: { label: "高", color: "#DC2626" },
  2: { label: "中", color: "#D97706" },
  3: { label: "低", color: "#94A3B8" },
} as const
