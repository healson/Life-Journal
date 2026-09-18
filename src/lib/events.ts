/**
 * 极简事件订阅机制。store 变化时 emit，React 组件通过 useStore() hook 订阅。
 * 独立成模块，避免 store <-> observer 循环依赖。
 */
type Listener = () => void

const listeners = new Set<Listener>()

export function emitChange() {
  listeners.forEach((fn) => fn())
}

export function onStoreChange(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
