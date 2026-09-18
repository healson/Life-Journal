/**
 * 信封飞行动画：调用 launchEnvelope(fromEl, toEl) 即可从一个元素飞到另一个元素。
 * 信封本身是纯 SVG 画的（不用 GIF，体积小、支持任意尺寸、不卡帧）。
 * 信封在飞行过程中会先原地展开信封 → 再飞向目标 → 到达后"融入"目标。
 */

export type LaunchOptions = {
  fromEl: HTMLElement | null
  toEl: HTMLElement | null
  label?: string
}

let launchImpl: ((opt: LaunchOptions) => void) | null = null

export function registerLauncher(fn: (opt: LaunchOptions) => void) {
  launchImpl = fn
}

export function launchEnvelope(opt: LaunchOptions) {
  console.log("[envelope] launch called:", opt.fromEl, opt.toEl, opt.label)
  launchImpl?.(opt)
  if (!launchImpl) console.warn("[envelope] launcher not registered yet!")
}
