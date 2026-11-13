/**
 * 系统返回处理栈（安卓手势返回 / 返回键）。
 * 原生 MainActivity 的 OnBackPressedCallback 通过 evaluateJavascript 调用
 * window.LifeJournalBack()，返回 "1" 表示页面已消费本次返回，否则原生 finish。
 *
 * 各浮层在可见时注册关闭器、不可见时注销；后注册先处理（LIFO），
 * 保证深层浮层（弹窗 > 菜单 > 抽屉 > 页面）优先被返回关闭。
 */

type BackHandler = () => boolean

const handlers: BackHandler[] = []

/** 注册返回处理函数（返回 true 表示已消费本次返回），返回值为注销函数 */
export function registerBackHandler(fn: BackHandler): () => void {
  handlers.push(fn)
  return () => {
    const i = handlers.indexOf(fn)
    if (i >= 0) handlers.splice(i, 1)
  }
}

function run(): boolean {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i]()) return true
  }
  return false
}

// 供原生 evaluateJavascript 同步调用（返回 1/0/null）
;(window as unknown as { LifeJournalBack?: () => boolean }).LifeJournalBack = run
