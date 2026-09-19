import { Extension } from "@tiptap/core"

/**
 * 自定义字号扩展：给 textStyle mark 注册 fontSize 属性。
 * 工具栏通过 setMark("textStyle", { fontSize: "18px" }) 写入，样式随 style 输出。
 * 依赖同时启用的 TextStyle 扩展（否则 setMark("textStyle") 无效）。
 */
export const FontSize = Extension.create({
  name: "fontSize",

  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (el) => el.style.fontSize?.trim() || null,
            renderHTML: (attributes) => {
              const size = attributes.fontSize
              if (!size) return {}
              return { style: `font-size: ${size}` }
            },
          },
        },
      },
    ]
  },
})

/** 常用字号（px）。"默认" 对应清除 / 继承 */
export const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32] as const

/** 从当前光标处读取字号（可能落在一个段落的多个 mark 上，取最近的 textStyle mark） */
export function currentFontSize(editor: {
  getAttributes: (name: string) => Record<string, unknown>
}): number | null {
  const attrs = editor.getAttributes("textStyle")
  const raw = attrs?.fontSize
  if (!raw) return null
  const n = parseFloat(String(raw))
  return Number.isFinite(n) ? n : null
}
