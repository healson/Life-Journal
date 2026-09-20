/**
 * 日记导出工具：导出为 Markdown(.md) / Word 兼容文档(.doc) / PDF（浏览器打印另存）。
 * PDF 走浏览器打印不是为了装额外依赖（jsPDF 体积大且中文字体难处理），
 * 用排版好的 HTML 新窗口,windows.print() 让用户“另存为 PDF”，中文清晰且所见即所得。
 */

function downloadBlob(filename: string, contentType: string, content: string) {
  const blob = new Blob([content], { type: contentType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** 安全文件名：去掉 / \ : * ? " < > | 等字符 */
function safeName(name: string): string {
  const base = (name || "日记").replace(/[\\/:*?"<>|\s]+/g, "_").slice(0, 50)
  return base || "日记"
}

function pageShell(title: string, bodyHtml: string): string {
  const esc = title.replace(/</g, "&lt;")
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>${esc}</title>
<style>
  body{font-family:"Songti SC","SimSun","Noto Serif SC",serif;line-height:1.85;color:#1f2937;max-width:760px;margin:0 auto;padding:32px 24px;}
  h1{font-size:26px;margin:0 0 6px;}
  blockquote{border-left:3px solid #d1d5db;margin:12px 0;padding-left:12px;color:#6b7280;}
  pre{background:#f3f4f6;padding:12px;border-radius:8px;overflow:auto;}
  code{background:#f3f4f6;padding:1px 4px;border-radius:4px;}
  img{max-width:100%;height:auto;border-radius:8px;}
  table{border-collapse:collapse;margin:12px 0;width:100%;}
  th,td{border:1px solid #d1d5db;padding:6px 10px;}
  hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0;}
  ul,ol{padding-left:24px;}
  .meta{color:#9ca3af;font-size:13px;margin-bottom:20px;}
</style>
</head>
<body>
  ${bodyHtml}
</body>
</html>`
}

function bodyHtml(title: string, html: string, date?: string): string {
  const meta = date ? `<div class="meta">${escapeHtml(title)} · ${escapeHtml(date)}</div>` : ""
  return `${meta}${html}`
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export const exportMarkdown = (title: string, markdown: string) => {
  const host = `# ${title.replace(/^#+\s*/g, "")}\n\n`
  downloadBlob(`${safeName(title)}.md`, "text/markdown;charset=utf-8", host + markdown)
}

export const exportWord = (title: string, html: string, date?: string) => {
  const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:w="urn:schemas-microsoft-com:office:word"
  xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
</head>
<body>${bodyHtml(title, html, date)}</body>
</html>`
  downloadBlob(`${safeName(title)}.doc`, "application/msword;charset=utf-8", doc)
}

export const exportPdf = (title: string, html: string, date?: string) => {
  const win = window.open("", "_blank")
  if (!win) return
  win.document.open()
  win.document.write(pageShell(title, bodyHtml(title, html, date)))
  win.document.close()
  // 等图片与外部资源渲染后再弹打印；给一个兜底延迟兜住 onload 已触发的情况
  const fire = () => win.print()
  const t = setTimeout(fire, 400)
  win.addEventListener("load", () => { clearTimeout(t); fire() })
}