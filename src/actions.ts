import type { State } from './domain'
import { updateData } from './persistence'
import type { Notify } from './App'

export async function save(
  change: (draft: State) => void,
  notify: Notify,
  success: string,
): Promise<boolean> {
  try {
    await updateData(change)
    notify(success)
    return true
  } catch (e) {
    notify((e as Error).message)
    return false
  }
}
export function number(value: number, suffix = '') {
  return Number.isFinite(value) ? value.toFixed(1) + suffix : '未知'
}
