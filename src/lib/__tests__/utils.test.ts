import { describe, expect, it } from "vitest"
import { buildSnippet, countWords, entryDate, entryDateObj, formatDate, formatRelative, toPlainText } from "../utils"
import type { JournalEntry } from "../../types"

const base = {
  id: "1", title: "t", content: "", plainText: "", tags: [], mood: null,
  entryType: "diary", isPinned: false, isLocked: false,
  createdAt: "2026-03-05T02:30:00", updatedAt: "2026-03-05T02:30:00",
} as unknown as JournalEntry

describe("formatDate", () => {
  it("补零输出 YYYY-MM-DD", () => {
    expect(formatDate(new Date(2026, 2, 5))).toBe("2026-03-05")
  })
  it("withTime 输出到分钟", () => {
    expect(formatDate(new Date(2026, 2, 5, 9, 7), true)).toBe("2026-03-05 09:07")
  })
  it("按本地时区解析字符串，不落到 UTC 前一天", () => {
    // 本地 02:30 的 ISO 串（无时区）应解析为同一天，直接 slice 会拿到前一天
    expect(formatDate("2026-03-05T02:30:00")).toBe("2026-03-05")
  })
})

describe("formatRelative", () => {
  // formatRelative 以真实当前时间为基准，只能相对 now 构造
  const ago = (ms: number) => new Date(Date.now() - ms)
  it("一分钟内显示刚刚", () => {
    expect(formatRelative(ago(30_000))).toBe("刚刚")
  })
  it("分钟/小时/天分级", () => {
    expect(formatRelative(ago(5 * 60_000))).toBe("5 分钟前")
    expect(formatRelative(ago(3 * 3600_000))).toBe("3 小时前")
    expect(formatRelative(ago(2 * 86400_000))).toBe("2 天前")
  })
  it("超过 7 天回退为日期", () => {
    const d = ago(30 * 86400_000)
    expect(formatRelative(d)).toBe(formatDate(d))
  })
})

describe("entryDate", () => {
  it("优先使用自定义 date", () => {
    expect(entryDate({ ...base, date: "2020-01-02" })).toBe("2020-01-02")
  })
  it("date 为空时回退 createdAt 的本地日期", () => {
    expect(entryDate({ ...base, date: undefined })).toBe("2026-03-05")
  })
  it("entryDateObj 返回本地零点，避免跨时区偏移", () => {
    const d = entryDateObj({ ...base, date: "2026-03-05" })
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(5)
    expect(d.getHours()).toBe(0)
  })
})

describe("countWords", () => {
  it("中文每字计一词", () => {
    expect(countWords("今天天气好")).toBe(5)
  })
  it("英文按单词计，不按空格拆中文", () => {
    expect(countWords("今天 hello world")).toBe(4)
  })
  it("连字符与撇号连接的整体算一个词", () => {
    expect(countWords("state-of-the-art don't")).toBe(2)
  })
  it("空串为 0", () => {
    expect(countWords("")).toBe(0)
  })
})

describe("toPlainText", () => {
  it("剥离 HTML 标签与 Markdown 符号", () => {
    expect(toPlainText("# 标题\n**粗体** <span style=\"x\">内联</span>"))
      .toBe("标题 粗体 内联")
  })
  it("换行压成空格并去首尾空白", () => {
    expect(toPlainText("\n\n第一段\n\n第二段\n")).toBe("第一段 第二段")
  })
})

describe("buildSnippet", () => {
  it("无关键词时截断原文", () => {
    expect(buildSnippet("abcdefghij", "", 3)).toBe("abcdefghij")
    expect(buildSnippet("abcdefghij", "zzz", 3)).toBe("abcdef")
  })
  it("命中时以关键词为中心并补省略号", () => {
    const text = "0123456789KEYabcdefghij"
    expect(buildSnippet(text, "key", 3)).toBe("…789KEYabc…")
  })
  it("关键词在开头时不补前缀省略号", () => {
    expect(buildSnippet("KEYabcdefghij", "key", 3)).toBe("KEYabc…")
  })
})
