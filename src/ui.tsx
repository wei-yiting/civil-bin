import type { ReactNode } from 'react'
import type { State, Store } from './domain'
import { isOpen } from './domain'
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
  return (
    <span className={`badge ${isOpen(store) ? 'green' : 'gray'}`}>
      {!store.enabled ? '暫停收受' : isOpen(store) ? '收受中' : '非開放時段'}
    </span>
  )
}
export function Map({
  stores,
  selected,
  onSelect,
}: {
  stores: Store[]
  selected: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="map" role="group" aria-label="合作收受點示意地圖">
      <div className="map-park">
        <span>街角公園</span>
      </div>
      <div className="map-block block-one" />
      <div className="map-block block-two" />
      <div className="map-block block-three" />
      <span className="road road-one">民生東路</span>
      <span className="road road-two">南京東路</span>
      <span className="road road-three">市民步道</span>
      <span className="map-caption">示意地圖・非實際座標</span>
      {stores.map((s, i) => (
        <button
          key={s.id}
          className={`pin ${s.id === selected ? 'selected' : ''} ${isOpen(s) ? '' : 'closed'}`}
          style={{ left: `${s.x}%`, top: `${s.y}%` }}
          aria-label={`地圖：${s.name}`}
          aria-pressed={s.id === selected}
          onClick={() => onSelect(s.id)}
        >
          <span>{i + 1}</span>
          <b>{s.name}</b>
        </button>
      ))}
      <span className="map-origin">
        <i />
        示意位置
      </span>
      <span className="map-key">● 合作收受點</span>
    </div>
  )
}
