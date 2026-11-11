import type { Editor } from "@tiptap/react"
import { FileDown, FileText, FileType } from "lucide-react"
import { countWords, entryDate } from "../../lib/utils"
import { exportMarkdown, exportPdf, exportWord } from "../../lib/export"
import type { JournalEntry } from "../../types"

/** 底部状态栏：上次编辑时间、字符/词数、导出 md/doc/pdf */
export function EditorStatusBar({ editor, entry }: {
  editor: Editor
  entry: JournalEntry
}) {
  const charCount = editor.storage.characterCount?.characters?.() ?? 0
  const wordCount = countWords(editor.getText())
  const markdown = editor.storage.markdown?.getMarkdown?.() ?? editor.getHTML()
  const title = entry.title || "无标题"
  const date = entryDate(entry)
  const html = editor.getHTML()
  return (
    <div className="flex items-center justify-between px-6 py-2 border-t border-border-light text-xs text-text-muted bg-surface/50">
      <span>上次编辑 {new Date(entry.updatedAt).toLocaleString("zh-CN")}</span>

      {/* 导出：md / doc / pdf（移动端隐藏） */}
      <div className="flex items-center gap-0.5 max-md:hidden">
        <span className="mr-1">导出</span>
        <button
          onClick={() => exportMarkdown(title, markdown)}
          title="导出 Markdown (.md)"
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-hover hover:text-text transition-colors"
        >
          <FileType className="w-3.5 h-3.5" /> MD
        </button>
        <button
          onClick={() => exportWord(title, html, date)}
          title="导出 Word 文档 (.doc)"
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-hover hover:text-text transition-colors"
        >
          <FileText className="w-3.5 h-3.5" /> DOC
        </button>
        <button
          onClick={() => exportPdf(title, html, date)}
          title="导出 PDF（打印另存）"
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-surface-hover hover:text-text transition-colors"
        >
          <FileDown className="w-3.5 h-3.5" /> PDF
        </button>
      </div>

      <span>{charCount} 字符 · {wordCount} 词</span>
    </div>
  )
}
