import { useNow } from './useNow'
import type { ReactNode } from 'react'
import type { State, Store } from './domain'
import { isOpen, dateKey } from './domain'
import type { Notify } from './App'

export type PageProps = { data: State; notify: Notify }
export function Metric({
  label,
  value,
  unit,
  accent = false,
}: {
  label: string
  value: ReactNode
  unit: string
  accent?: boolean
}) {
  return (
    <div className={`metric ${accent ? 'accent' : ''}`}>
      <span>{label}</span>
      <div>
        <strong>{value}</strong>
        <small>{unit}</small>
      </div>
    </div>
  )
}
export function StoreStatus({ store }: { store: Store }) {
  useNow()
  return (
    <span className={`badge ${isOpen(store) ? 'green' : 'gray'}`}>
      {!store.enabled
        ? '暫停收受'
        : store.pausedOn === dateKey()
          ? '今日已停收'
          : isOpen(store)
            ? '收受中'
            : '非開放時段'}
    </span>
  )
}
