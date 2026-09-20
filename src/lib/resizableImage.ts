import Image from "@tiptap/extension-image"
import { ReactNodeViewRenderer } from "@tiptap/react"
import { ResizableImageView } from "../components/ResizableImageView"

/**
 * 可缩放图片节点：基于 @tiptap/extension-image 扩展。
 * - 增加 width 属性（可拖动手柄调整，持久化到内容）
 * - 使用 React NodeView 渲染（默认缩小 + 右下角缩放手柄）
 * - 自定义 Markdown 序列化：手动调整过宽度的图片输出为原始 HTML 以保留 width，
 *   否则保持标准 markdown 图片语法（不改变旧内容）
 */

const escAttr = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute("width") || null,
        renderHTML: (attributes) => (attributes.width ? { width: attributes.width } : {}),
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView)
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: any, node: any) {
          const { src, alt, title, width } = node.attrs
          const w = width ? Number(width) : null
          if (w && w > 0) {
            // 手动调整过大小：输出原始 HTML，宽度随 markdown 一起持久化
            let html = `<img src="${escAttr(src)}" width="${w}"`
            if (alt) html += ` alt="${escAttr(alt)}"`
            if (title) html += ` title="${escAttr(title)}"`
            state.write(html + ">")
          } else {
            state.write(`![${state.esc(alt || "")}](${state.esc(src)}${title ? ` ${state.quote(title)}` : ""})`)
          }
        },
      },
    }
  },
})
