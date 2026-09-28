/**
 * 无操作自动退出计时器。
 * 监听用户活动事件（鼠标/键盘/滚动/触摸），超过指定时长无操作时触发 onTimeout。
 * 最后活动时间持久化到 localStorage：关闭页面后再打开时校验，
 * 若距离最后活动已超过超时时长同样触发登出（即"页面关闭后等待 N 分钟自动退出"）。
 * 不依赖 store（避免循环依赖），回调由调用方传入。
 */

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const
const LAST_ACTIVITY_KEY = "ryjq_last_activity"

let timer: ReturnType<typeof setTimeout> | null = null
let lastActivity = Date.now()
let timeoutMs = 30 * 60 * 1000
let onTimeout: (() => void) | null = null

const safeStorage =
  typeof localStorage !== "undefined" ? localStorage : null

function persistLastActivity() {
  safeStorage?.setItem(LAST_ACTIVITY_KEY, String(lastActivity))
}

function onActivity() {
  lastActivity = Date.now()
  persistLastActivity()
  resetTimer()
}

function resetTimer() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    onTimeout?.()
  }, timeoutMs)
}

function onVisibilityChange() {
  // 回到前台时，若离开期间已超时则立即登出（而非无条件重置）
  if (document.visibilityState === "visible" && Date.now() - lastActivity > timeoutMs) {
    if (timer) clearTimeout(timer)
    timer = null
    onTimeout?.()
  }
}

export function startIdleTimer(callback: () => void, minutes = 10) {
  stopIdleTimer()
  onTimeout = callback
  timeoutMs = minutes * 60 * 1000

  // 读取持久化的最后活动时间：关闭页面后重开时，若已超时则立即登出
  const persisted = safeStorage?.getItem(LAST_ACTIVITY_KEY)
  lastActivity = persisted ? Number(persisted) || Date.now() : Date.now()
  if (Date.now() - lastActivity > timeoutMs) {
    onTimeout?.()
    return
  }

  for (const ev of ACTIVITY_EVENTS) {
    window.addEventListener(ev, onActivity, { passive: true } as AddEventListenerOptions)
  }
  document.addEventListener("visibilitychange", onVisibilityChange)
  resetTimer()
}

export function stopIdleTimer() {
  if (timer) clearTimeout(timer)
  timer = null
  onTimeout = null
  for (const ev of ACTIVITY_EVENTS) {
    window.removeEventListener(ev, onActivity)
  }
  document.removeEventListener("visibilitychange", onVisibilityChange)
}