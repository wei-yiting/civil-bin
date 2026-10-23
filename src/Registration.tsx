import { useCloudStatus } from './persistence'
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Notify } from './App'
import { save } from './actions'
import { registerStore, TAIPEI_DISTRICTS, defaultWeeklyHours } from './domain'
import { WeeklyHoursEditor } from './WeeklyHoursEditor'
import type { Coordinates } from './geo'

export interface RegistrationProps {
  onRegistered: (id: string) => void
  notify: Notify
  renderMap?: (
    position: Coordinates,
    onPick: (point: Coordinates) => void,
  ) => ReactNode
}

export function Registration({
  onRegistered,
  notify,
  renderMap,
}: RegistrationProps) {
  const cloud = useCloudStatus()
  const [name, setName] = useState('')
  const [area, setArea] = useState<string>('松山區')
  const [address, setAddress] = useState('')
  const [hours, setHours] = useState(() => defaultWeeklyHours('09:00', '18:00'))
  const [saving, setSaving] = useState(false)
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const position =
    lat.trim() &&
    lng.trim() &&
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
      ? { lat: Number(lat), lng: Number(lng) }
      : { lat: 25.0588, lng: 121.5434 }
  function pick(point: Coordinates) {
    setLat(point.lat.toFixed(6))
    setLng(point.lng.toFixed(6))
  }
  return (
    <section
      className="card registration-card"
      aria-labelledby="registration-title"
    >
      <div className="card-head">
        <div>
          <span className="eyebrow">一起成為街角夥伴</span>
          <h2 id="registration-title">註冊合作店家</h2>
        </div>
        <span className="badge gray">
          {cloud.configured ? '雲端店家登記' : '本機展示登記'}
        </span>
      </div>
      <div className="card-body">
        <p className="muted">
          填寫店家資訊與收受位置，完成後即可在民眾端地圖與店家端查看。
          {cloud.configured
            ? '資料會保存到共享資料庫，此登記不代表市府核准。'
            : '登記僅儲存在此瀏覽器，尚未提交市府審核。'}
        </p>
        <form
          noValidate
          data-testid="registration-form"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!lat.trim() || !lng.trim()) {
              notify('請在地圖選擇店家位置，或填寫經緯度。')
              return
            }
            if (saving) return
            setSaving(true)
            let registeredId = ''
            const done = await save(
              (draft) => {
                const store = registerStore(draft, {
                  name,
                  area,
                  address,
                  hoursStart: hours[1].start,
                  hoursEnd: hours[1].end,
                  weeklyHours: hours,
                  lat: Number(lat),
                  lng: Number(lng),
                })
                draft.stores.push(store)
                registeredId = store.id
              },
              notify,
              '店家已登錄，可切換至民眾端查看新據點。',
            )
            setSaving(false)
            if (done) onRegistered(registeredId)
          }}
        >
          <label>
            店家名稱
            <input
              name="storeName"
              autoComplete="organization"
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="請填寫實際店名"
            />
          </label>
          <label>
            行政區
            <select
              name="district"
              value={area}
              onChange={(event) => setArea(event.target.value)}
            >
              {TAIPEI_DISTRICTS.map((district) => (
                <option key={district}>{district}</option>
              ))}
            </select>
          </label>
          <label>
            店家地址
            <input
              name="address"
              autoComplete="street-address"
              required
              maxLength={200}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="臺北市／路名／門牌"
            />
          </label>
          <WeeklyHoursEditor value={hours} onChange={setHours} />
          {renderMap && (
            <div className="registration-map">
              <h3>選擇店家位置</h3>
              <p className="muted">
                點選地圖填入座標；地址不會自動轉成位置，請確認標記與實際門牌相符。
              </p>
              {renderMap(position, pick)}
            </div>
          )}
          <details>
            <summary>手動輸入精確座標</summary>{' '}
            <div className="fields">
              <label>
                緯度
                <input
                  type="number"
                  inputMode="decimal"
                  min="24.95"
                  max="25.22"
                  step="any"
                  required
                  value={lat}
                  onChange={(event) => setLat(event.target.value)}
                  placeholder="例如 25.0588"
                />
              </label>
              <label>
                經度
                <input
                  type="number"
                  inputMode="decimal"
                  min="121.45"
                  max="121.68"
                  step="any"
                  required
                  value={lng}
                  onChange={(event) => setLng(event.target.value)}
                  placeholder="例如 121.5434"
                />
              </label>
            </div>
          </details>
          <p className="mini-note">
            新據點的清運量能、滿溢紀錄與今日申報會保持「未知／未申報」，需後續補齊現場資料。地圖座標僅用於距離與位置顯示。
          </p>
          <button disabled={saving} className="button full" type="submit">
            完成店家登錄
          </button>
        </form>
      </div>
    </section>
  )
}
