/**
 * React hook —— 订阅 store 变化。
 */
import { useState, useEffect } from "react"
import { store } from "../store"
import { emitChange, onStoreChange } from "./events"

export function useStore() {
  const [, forceUpdate] = useState(0)
  useEffect(() => onStoreChange(() => forceUpdate((x) => x + 1)), [])
  return store.state
}

// 让 store 的 mutate 方法自动调用 emitChange
type StoreMethodKey = "unlock" | "lock" | "resetPassword" | "selectDate" |
  "selectEntry" | "createEntry" | "updateEntry" | "deleteEntry" | "togglePin" |
  "startDraft" | "updateDraft" | "commitDraft" |
  "setFilter" | "setSearch" | "openConvertDrawer" | "closeConvertDrawer" |
  "addTodos" | "updateTodo" | "deleteTodo"

const patch = (key: StoreMethodKey) => {
  const orig = (store[key] as unknown as Function).bind(store)
  ;(store[key] as unknown as Function) = (...args: unknown[]) => {
    const r = orig(...args)
    emitChange()
    return r
  }
}

;[
  "unlock", "lock", "resetPassword",
  "selectDate",
  "selectEntry", "createEntry", "updateEntry", "deleteEntry", "togglePin",
  "startDraft", "updateDraft", "commitDraft",
  "setFilter", "setSearch", "openConvertDrawer", "closeConvertDrawer",
  "addTodos", "updateTodo", "deleteTodo",
].forEach((k) => patch(k as StoreMethodKey))
