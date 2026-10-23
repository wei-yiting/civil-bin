import { useSyncExternalStore } from 'react'
import { migrateState, seedState } from './domain'
import type { State } from './domain'
import {
  cloudClient,
  cloudConfigured,
  cloudLoad,
  cloudSave,
  initialCloudStatus,
} from './cloud'

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
let snapshot: State = cloudConfigured
  ? { ...seedState(), stores: [], deliveries: [], claims: {}, reviews: {} }
  : read()
let cloudStatus = initialCloudStatus
const listeners = new Set<() => void>()
function emit() {
  listeners.forEach((fn) => fn())
}
function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}
export function useData() {
  return useSyncExternalStore(subscribe, () => snapshot)
}
export function useCloudStatus() {
  return useSyncExternalStore(subscribe, () => cloudStatus)
}
export function storageWarning() {
  return warning
}
let refreshPromise: Promise<void> | null = null
export async function refreshCloud() {
  if (!cloudConfigured) return
  if (refreshPromise) return refreshPromise
  refreshPromise = (async () => {
    try {
      const next = await cloudLoad()
      snapshot = next.state
      cloudStatus = next.status
    } catch (error) {
      cloudStatus = {
        ...cloudStatus,
        ready: false,
        message: (error as Error).message,
      }
    }
    emit()
  })().finally(() => {
    refreshPromise = null
  })
  return refreshPromise
}
window.addEventListener('storage', (event) => {
  if (!cloudConfigured && (event.key === KEY || event.key === null)) {
    snapshot = read()
    emit()
  }
})
if (cloudConfigured) {
  void refreshCloud()
  cloudClient?.auth.onAuthStateChange(() => {
    setTimeout(() => {
      void refreshCloud()
    }, 0)
  })
  cloudClient
    ?.channel('civil-bin-updates')
    .on('postgres_changes', { event: '*', schema: 'public' }, () => {
      void refreshCloud()
    })
    .subscribe()
  // Periodic refresh renews signed photo URLs and recovers missed Realtime events.
  setInterval(() => {
    void refreshCloud()
  }, 30_000)
  window.addEventListener('online', () => {
    void refreshCloud()
  })
}
let pending = false
export async function updateData(
  change: (draft: State) => void,
): Promise<void> {
  if (pending) throw new Error('上一筆操作仍在儲存，請稍候。')
  if (cloudConfigured && !cloudStatus.ready)
    throw new Error('雲端尚未連線，資料未送出。請先重新連線。')
  const previous = snapshot
  const draft = structuredClone(previous)
  change(draft)
  pending = true
  try {
    if (cloudConfigured) {
      await cloudSave(previous, draft)
      // Commit succeeded even if a subsequent read fails; never silently switch to local data.
      await refreshCloud()
    } else {
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
  } finally {
    pending = false
  }
}
export async function resetData() {
  if (cloudConfigured)
    throw new Error(
      '共享資料不允許從此介面重設；請由專案管理員在 Supabase 管理。',
    )
  await updateData((draft) => Object.assign(draft, seedState()))
}
