import { useMemo, useState } from 'react'
import { aggregateSizes, TAIPEI_DISTRICTS } from './domain'
import type { State } from './domain'
import { GeoMap } from './GeoMap'
import { BinSource } from './BinSource'
import { usePublicBins } from './usePublicBins'
import {
  hasCoordinates,
  haversineMeters,
  nearestBin,
  formatDistance,
} from './geo'

export function CityMapPanel({
  data,
  day,
  selected,
  onSelect,
}: {
  data: State
  day: string
  selected: string
  onSelect: (id: string) => void
}) {
  const resource = usePublicBins()
  const [district, setDistrict] = useState('')
  const [showBins, setShowBins] = useState(true)
  const [showStores, setShowStores] = useState(true)
  const [mode, setMode] = useState('confirmed')
  const [fitToken, setFitToken] = useState(0)
  const bins = useMemo(
    () => resource.bins.filter((bin) => !district || bin.district === district),
    [resource.bins, district],
  )
  const stores = useMemo(
    () => data.stores.filter((store) => !district || store.area === district),
    [data.stores, district],
  )
  const volumes = useMemo(
    () =>
      Object.fromEntries(
        stores.map((store) => {
          const evidence = aggregateSizes(data, store.id, day)
          const counts =
            mode === 'claims'
              ? data.sizeClaims[`${day}:${store.id}`]
              : evidence.confirmed
          return [store.id, counts ? counts.S + counts.M + counts.L : NaN]
        }),
      ),
    [stores, data, day, mode],
  )
  const store = data.stores.find((s) => s.id === selected)!
  const nearest = nearestBin(store, resource.bins)
  const around = hasCoordinates(store)
    ? resource.bins.filter((bin) => haversineMeters(store, bin) <= 500).length
    : 0
  return (
    <section className="card city-map-panel">
      <div className="card-head">
        <div>
          <span className="eyebrow">城市全覽・官方位置 × 合作收受</span>
          <h2>每個街角的需求，都在同一張地圖</h2>
        </div>
        <button
          className="button secondary"
          onClick={() => setFitToken((n) => n + 1)}
        >
          查看全區
        </button>
      </div>
      <div className="city-map-toolbar">
        <label>
          行政區
          <select
            aria-label="地圖行政區"
            value={district}
            onChange={(e) => {
              setDistrict(e.target.value)
              setFitToken((n) => n + 1)
            }}
          >
            <option value="">臺北市全區</option>
            {TAIPEI_DISTRICTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </label>
        <label>
          地圖顯示數值
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="confirmed">店家已確認件數</option>
            <option value="claims">店家當日申報件數</option>
          </select>
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={showStores}
            onChange={(e) => setShowStores(e.target.checked)}
          />
          合作收受點
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            aria-label="市府顯示公共垃圾桶"
            checked={showBins}
            onChange={(e) => setShowBins(e.target.checked)}
          />
          公共清潔箱
        </label>
      </div>
      <div className="city-real-map">
        <GeoMap
          overview
          stores={showStores ? stores : undefined}
          bins={showBins ? bins : undefined}
          selected={selected}
          onSelect={onSelect}
          volumes={volumes}
          valueUnit="件"
          fitToken={fitToken}
        />
        <div className="city-map-legend">
          <span>
            ● 合作店家・{mode === 'confirmed' ? '已確認件數' : '店家申報件數'}
          </span>
          <span>● 官方公共清潔箱</span>
          <span>— 表示當日無該項資料</span>
        </div>
      </div>
      <div className="city-map-summary">
        <div>
          <small>目前地圖資料</small>
          <b>
            {bins.length} 個官方位置・{stores.length} 個合作點
          </b>
        </div>
        <div>
          <small>{store.name} 周邊</small>
          <b>
            最近清潔箱 {nearest ? formatDistance(nearest.distance) : '未知'}
            ・500 公尺內 {hasCoordinates(store) ? around : '未知'} 個位置
          </b>
        </div>
        <p>
          位置資料不等於即時桶況或容量；地標資料可能涵蓋多個清潔箱。合作點顯示尺寸板登記件數／店家自行申報；不同尺寸不換算公升，資料供觀察，不代表增設或清運結論。
        </p>
      </div>
      <BinSource resource={resource} />
    </section>
  )
}
