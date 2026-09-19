/**
 * 主题系统：4 套皮肤（3 套治愈配色 + 1 套手绘风）
 * 通过 <html data-theme="xxx"> 切换，变量定义在 index.css。
 * 选择持久化在 localStorage。
 */

export type ThemeId = "sage" | "peach" | "lavender" | "sketch"

export interface ThemeMeta {
  id: ThemeId
  name: string
  desc: string
  /** 预览色：[底色, 主色, 点缀色] */
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  {
    id: "sage",
    name: "鼠尾草之晨",
    desc: "奶油白 × 雾感绿，安静温柔",
    swatch: ["#F9F6F0", "#658970", "#E29A6B"],
  },
  {
    id: "peach",
    name: "蜜桃奶茶",
    desc: "暖奶茶 × 蜜桃橘，甜甜治愈",
    swatch: ["#FDF3ED", "#D6765C", "#F0B269"],
  },
  {
    id: "lavender",
    name: "薰衣草午后",
    desc: "奶白雾紫 × 灰蓝，松弛助眠",
    swatch: ["#F5F3FA", "#8B7CBD", "#84B4D1"],
  },
  {
    id: "sketch",
    name: "手绘小本子",
    desc: "纸张纹理 × 手绘线条，童趣可爱",
    swatch: ["#FAF4E5", "#55705B", "#D87F4E"],
  },
]

const STORAGE_KEY = "lj-theme"

export function getStoredTheme(): ThemeId {
  const v = localStorage.getItem(STORAGE_KEY)
  return THEMES.some((t) => t.id === v) ? (v as ThemeId) : "sage"
}

export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id
  localStorage.setItem(STORAGE_KEY, id)
}

/** 应用启动时调用，避免主题闪烁 */
export function initTheme() {
  applyTheme(getStoredTheme())
}
