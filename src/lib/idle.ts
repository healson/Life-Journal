/**
 * 无操作自动退出计时器。
 * 监听用户活动事件（鼠标/键盘/滚动/触摸），超过指定时长无操作时触发 onTimeout。
 * 不依赖 store（避免循环依赖），回调由调用方传入。
 */

const ACTIVITY_EVENTS = ["pointerdown", "keydown", "scroll", "touchstart"] as const

let timer: ReturnType<typeof setTimeout> | null = null
let lastActivity = Date.now()
let timeoutMs = 30 * 60 * 1000
let onTimeout: (() => void) | null = null

function onActivity() {
  lastActivity = Date.now()
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
  lastActivity = Date.now()
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
