import { useSyncExternalStore } from 'react'
import { migrateState, seedState } from './domain'
import type { State } from './domain'

const KEY = 'street-corner-partner-v3'
let warning = ''
function read(): State {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return seedState()
    return migrateState(JSON.parse(raw))
  } catch {
    warning = '無法讀取已儲存資料，已載入示範資料；原資料未覆寫。'
    return seedState()
  }
}
let snapshot = read()
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((fn) => fn())
}
window.addEventListener('storage', (event) => {
  if (event.key === KEY || event.key === null) {
    snapshot = read()
    emit()
  }
})
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export function useData() {
  return useSyncExternalStore(subscribe, () => snapshot)
}
export function storageWarning() {
  return warning
}
export function updateData(change: (draft: State) => void) {
  const draft = structuredClone(snapshot)
  change(draft)
  try {
    localStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    throw new Error(
      '儲存失敗，可能空間已滿或瀏覽器禁止儲存。請匯出備份，或減少照片後重試。此次操作未送出。',
    )
  }
  snapshot = draft
  emit()
}
export function resetData() {
  updateData((draft) => Object.assign(draft, seedState()))
}
