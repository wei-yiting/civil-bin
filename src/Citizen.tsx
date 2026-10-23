import { useCloudStatus } from './persistence'
import { useNow } from './useNow'
import { save } from './actions'
import { useMemo, useRef, useState } from 'react'
import { nearbyPlaces } from './nearby'
import type { NearbyPlace } from './nearby'
import {
  dateKey,
  isOpen,
  todayHoursLabel,
  validateMeasurement,
  measurementLabel,
  isDemoDelivery,
} from './domain'
import type { SizeMeasurement } from './domain'
import { MeasurementEditor, SizeBoardGuide } from './MeasurementEditor'
import { preparePhoto, prepareSamplePhoto } from './photo'
import { StoreStatus } from './ui'
import { GeoMap } from './GeoMap'
import { BinSource } from './BinSource'
import { usePublicBins } from './usePublicBins'
import { useLocation } from './useLocation'
import {
  hasCoordinates,
  haversineMeters,
  formatDistance,
  nearestBin,
} from './geo'
import type { Coordinates } from './geo'
import type { PublicBin } from './bin-data'
import type { PageProps } from './ui'

export function Citizen({ data, notify }: PageProps) {
  const cloud = useCloudStatus()
  const now = useNow()
  const [selected, setSelected] = useState(data.stores[0].id)
  const [query, setQuery] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('飲料杯／容器')
  const [measurement, setMeasurement] = useState<SizeMeasurement>({
    boardVersion: 'street-v1',
    size: 'S',
    quantity: 1,
  })
  const [compared, setCompared] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const historyRef = useRef<HTMLElement>(null)
  const [visibleNearby, setVisibleNearby] = useState({ key: '', count: 8 })
  const [visibleOther, setVisibleOther] = useState({ key: '', count: 8 })
  function scrollHistory() {
    historyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const [showBins, setShowBins] = useState(true)
  const [showPartners, setShowPartners] = useState(true)
  const [focusToken, setFocusToken] = useState(0)
  const [mapCenter, setMapCenter] = useState<Coordinates>({
    lat: 25.0588,
    lng: 121.5434,
  })
  const [searchOrigin, setSearchOrigin] = useState<Coordinates | null>(null)
  const [selectedBin, setSelectedBin] = useState<PublicBin | null>(null)
  const publicBins = usePublicBins()
  const { position, locating, error: locationError, locate } = useLocation()
  const origin = searchOrigin ?? position ?? { lat: 25.0588, lng: 121.5434 }
  const store = data.stores.find((s) => s.id === selected)!
  const shown = useMemo(
    () =>
      data.stores.filter(
        (s) =>
          `${s.name}${s.area}${s.address}`.includes(query.trim()) &&
          (!onlyOpen || isOpen(s, new Date(now))),
      ),
    [data.stores, query, onlyOpen, now],
  )
  const history = data.deliveries.filter(
    (r) => r.date === dateKey() && r.measurement && !isDemoDelivery(r),
  )

  async function submit() {
    if (busy || !photo || !compared) return
    try {
      validateMeasurement(measurement)
    } catch (error) {
      notify((error as Error).message)
      return
    }
    if (!isOpen(store)) {
      notify('此據點目前不在收受時段，請選擇其他據點。')
      return
    }
    setBusy(true)
    const done = await save(
      (draft) => {
        draft.deliveries.unshift({
          id: crypto.randomUUID(),
          storeId: selected,
          date: dateKey(),
          createdAt: new Date().toISOString(),
          kind,
          liters: 0,
          low: 0,
          high: 0,
          measurement: { ...measurement },
          photo,
          source: 'photo',
          status: 'pending',
          reason: '',
        })
      },
      notify,
      '交付紀錄已送出，請到店讓店家確認。',
    )
    setBusy(false)
    if (done) {
      setPhoto(null)
      setCompared(false)
      setShowUpload(false)
      requestAnimationFrame(scrollHistory)
    }
  }
  const filteredBins = useMemo(
    () =>
      publicBins.bins.filter((bin) =>
        `${bin.district}${bin.address}`.includes(query.trim()),
      ),
    [publicBins.bins, query],
  )
  const places = nearbyPlaces(
    origin,
    showPartners ? shown : [],
    showBins ? filteredBins : [],
    new Date(now),
  )
  const listKey = `${origin.lat}:${origin.lng}:${query}:${onlyOpen}:${showBins}:${showPartners}`
  const nearbyLimit = visibleNearby.key === listKey ? visibleNearby.count : 8
  const otherLimit = visibleOther.key === listKey ? visibleOther.count : 8
  function renderPlace(entry: NearbyPlace) {
    if (entry.type === 'store') {
      const s = entry.place
      return (
        <button
          className={`nearby-place ${selected === s.id && !selectedBin ? 'selected' : ''}`}
          key={`store:${s.id}`}
          aria-pressed={selected === s.id && !selectedBin}
          onClick={() => {
            setSelected(s.id)
            setSelectedBin(null)
          }}
        >
          <span className="place-icon">▤</span>
          <span>
            <b>
              {s.name}
              {s.isDemo && <small>示範</small>}
            </b>
            <small>
              {s.area}・{todayHoursLabel(s)}
            </small>
          </span>
          <span className="place-right">
            <StoreStatus store={s} />
            <small>{formatDistance(entry.distance)}</small>
          </span>
        </button>
      )
    }
    const bin = entry.place
    return (
      <button
        className="nearby-place bin-place"
        key={`bin:${bin.id}`}
        aria-pressed={selectedBin?.id === bin.id}
        onClick={() => setSelectedBin(bin)}
      >
        <span className="place-icon">♲</span>
        <span>
          <b>{bin.address}</b>
          <small>
            {bin.district}・官方位置{bin.note ? '・' + bin.note : ''}
          </small>
        </span>
        <span className="place-right">
          <small>{formatDistance(entry.distance)}</small>
        </span>
      </button>
    )
  }
  const closest = nearestBin(store, publicBins.bins)
  return (
    <div className="citizen-app">
      <header className="citizen-heading">
        <div>
          <span className="eyebrow">我們的城市，我們的垃圾桶</span>
          <h1>附近哪裡可以丟垃圾？</h1>
        </div>
        <button
          className="round-action"
          aria-label="查看交付紀錄"
          onClick={scrollHistory}
        >
          ◷
        </button>
      </header>
      <div className="map-search">
        <span>⌕</span>
        <input
          aria-label="搜尋店家或街區"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜尋合作店家、街區、清潔箱地址"
        />
        <button
          aria-label="清除搜尋"
          disabled={!query}
          onClick={() => setQuery('')}
        >
          ×
        </button>
      </div>
      <div className="map-filter-row">
        <label className="map-chip">
          <input
            type="checkbox"
            checked={showPartners}
            onChange={(e) => setShowPartners(e.target.checked)}
          />
          合作店家
        </label>
        <label className="map-chip bin-chip">
          <input
            type="checkbox"
            aria-label="顯示公共垃圾桶"
            checked={showBins}
            onChange={(e) => setShowBins(e.target.checked)}
          />
          公共垃圾桶
        </label>
        <label className="map-chip">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          只看收受中
        </label>
      </div>
      <section className="citizen-map-stage" aria-label="附近的收受位置">
        <GeoMap
          stores={showPartners ? shown : undefined}
          bins={showBins ? filteredBins : undefined}
          selected={selected}
          filterToken={query}
          onSelect={(id) => {
            setSelected(id)
            setSelectedBin(null)
          }}
          onBinSelect={setSelectedBin}
          location={position}
          focusToken={focusToken}
          focus={selectedBin}
          onCenterChange={setMapCenter}
        />
        <div className="map-floating-controls">
          <button
            className="search-here"
            onClick={() => setSearchOrigin(mapCenter)}
          >
            ⌕ 搜尋此區域
          </button>
          <button
            className="locate-button"
            aria-label="定位我的位置"
            disabled={locating}
            onClick={() => {
              setSearchOrigin(null)
              setFocusToken((n) => n + 1)
              locate()
            }}
          >
            ⌖<span>{locating ? '定位中…' : '我的位置'}</span>
          </button>
        </div>
        <div className="map-legend">
          <span className="legend-partner">● 合作店家</span>
          <span className="legend-bin">◆ 官方清潔箱</span>
        </div>
      </section>
      <div className="location-caption">
        {position
          ? `定位精度約 ${Math.round(position.accuracy)} 公尺・距離為直線估算`
          : '尚未定位・先顯示臺北市中心，可自由拖曳地圖'}
        {locationError && <p role="status">{locationError}</p>}
      </div>
      {selectedBin && showBins ? (
        <section className="selected-place official-place">
          <span className="place-type">公共清潔箱・官方位置</span>
          <h2>{selectedBin.address}</h2>
          <p>
            {selectedBin.district}・
            {formatDistance(haversineMeters(origin, selectedBin))}
            {selectedBin.note ? '・' + selectedBin.note : ''}
          </p>
          <small>設置以現場為準；資料不含即時滿溢與開放狀態。</small>
          <button className="text-button" onClick={() => setSelectedBin(null)}>
            查看合作店家
          </button>
        </section>
      ) : (
        <section className="selected-place" data-testid="selected-store">
          <div className="selected-place-head">
            <div>
              <span className="place-type">
                {store.isDemo ? '虛構示範店家' : '自行登錄的合作店家'}
              </span>
              <h2>{store.name}</h2>
              <p>{store.address}</p>
            </div>
            <StoreStatus store={store} />
          </div>
          <div className="place-facts">
            <span>◷ {todayHoursLabel(store)}</span>
            <span>
              ⌖{' '}
              {hasCoordinates(store)
                ? formatDistance(haversineMeters(origin, store))
                : '尚未設定位置'}
            </span>
            {closest && (
              <span>附近清潔箱 {formatDistance(closest.distance)}</span>
            )}
          </div>
          <button
            className="button full"
            disabled={!isOpen(store)}
            onClick={() => setShowUpload(true)}
          >
            拍照交付<span>→</span>
          </button>
        </section>
      )}
      <section className="nearby-section" aria-label="1 公里內的附近據點">
        <div className="nearby-heading">
          <h2>1 公里內的附近據點</h2>
          <span>{places.nearby.length} 處・依直線距離排序</span>
        </div>
        {places.nearby.slice(0, nearbyLimit).map(renderPlace)}
        {!places.nearby.length && (
          <p className="empty">
            1 公里內沒有符合的清潔箱或收受中店家，請調整搜尋或查看其他據點。
          </p>
        )}
        {places.nearby.length > nearbyLimit && (
          <button
            className="button secondary full"
            onClick={() =>
              setVisibleNearby({ key: listKey, count: nearbyLimit + 8 })
            }
          >
            顯示更多附近據點（尚有 {places.nearby.length - nearbyLimit} 處）
          </button>
        )}
        <p className="mini-note">
          官方清潔箱僅提供設置位置，不代表即時容量或可用狀態。合作店家只收少量行人垃圾；示範店家不代表現場提供服務。
        </p>
      </section>
      <section
        ref={historyRef}
        className="card history-card"
        style={{ scrollMarginTop: 20 }}
        data-testid="citizen-history"
      >
        <div className="card-head">
          <div>
            <span className="eyebrow">03 / 追蹤交付狀態</span>
            <h2>我今天的交付紀錄</h2>
          </div>
          <span className="badge gray">{history.length} 筆</span>
        </div>
        <div className="card-body">
          {history.length ? (
            history.map((r) => (
              <div className="history-row" key={r.id}>
                <span>
                  {r.kind}
                  <small>
                    {data.stores.find((s) => s.id === r.storeId)?.name ??
                      '合作店家'}
                  </small>
                </span>
                <b>{measurementLabel(r)}</b>
                {r.confirmedMeasurement && (
                  <small>店家確認：{measurementLabel(r, true)}</small>
                )}
                <span
                  className={`badge ${r.status === 'rejected' ? 'orange' : 'green'}`}
                >
                  {r.status === 'pending'
                    ? '待店家確認'
                    : r.status === 'accepted'
                      ? '已收受'
                      : '已拒收'}
                </span>
                {r.reason && <small>{r.reason}</small>}
              </div>
            ))
          ) : (
            <p className="muted">完成交付後，可以在這裡查看店家確認結果。</p>
          )}
        </div>
      </section>
      <details className="nearby-section" aria-label="其他據點">
        <summary>
          其他據點（1 公里外／暫未收受）・{places.other.length} 處
        </summary>
        <p className="mini-note">
          距離較遠的清潔箱、收受中店家，以及目前停收的店家，依搜尋中心直線距離排序。
        </p>
        {places.other.slice(0, otherLimit).map(renderPlace)}
        {!places.other.length && <p className="empty">沒有其他符合的據點。</p>}
        {places.other.length > otherLimit && (
          <button
            className="button secondary full"
            onClick={() =>
              setVisibleOther({ key: listKey, count: otherLimit + 8 })
            }
          >
            顯示更多其他據點（尚有 {places.other.length - otherLimit} 處）
          </button>
        )}
      </details>
      <BinSource resource={publicBins} />
      {showUpload && (
        <div className="delivery-overlay">
          <section
            className="delivery-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="拍照交付垃圾"
          >
            <button
              className="close-delivery"
              aria-label="關閉拍照交付"
              onClick={() => setShowUpload(false)}
            >
              ×
            </button>
            <section className="card upload-card">
              <div className="card-head">
                <div>
                  <span className="eyebrow">02 / 到店拍照交付</span>
                  <h2>讓這次交付留下紀錄</h2>
                </div>
                <span className="step-label">拍照 → 尺寸對照 → 確認</span>
              </div>
              <div className="card-body">
                <div className="chosen-store" data-testid="delivery-store">
                  <span className="store-symbol">▤</span>
                  <div>
                    <b>{store.name}</b>
                    <small>{store.address}</small>
                  </div>
                  <StoreStatus store={store} />
                </div>
                <div className={`photo-zone ${photo ? 'has-photo' : ''}`}>
                  {photo ? (
                    <img src={photo} alt="交付垃圾照片預覽" />
                  ) : (
                    <>
                      <span className="camera-icon">◎</span>
                      <b>拍下這次要交付的垃圾</b>
                      <p>建議放入尺寸參考卡，避免拍到人臉</p>
                    </>
                  )}
                </div>
                <div className="button-row photo-actions">
                  <label
                    className={`button secondary upload-label ${busy ? 'disabled' : ''}`}
                  >
                    ＋ 拍照／選取照片
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      aria-label="拍照或選取垃圾照片"
                      disabled={busy}
                      onChange={async (e) => {
                        const file = e.target.files?.[0]
                        e.target.value = ''
                        if (!file) return
                        setBusy(true)
                        setCompared(false)
                        setPhoto(null)
                        try {
                          setPhoto(await preparePhoto(file))
                          notify('照片已載入本機，尚未送出。')
                        } catch (error) {
                          notify((error as Error).message)
                        } finally {
                          setBusy(false)
                        }
                      }}
                    />
                  </label>
                  <button
                    className="text-button"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true)
                      setCompared(false)
                      try {
                        setPhoto(await prepareSamplePhoto())
                      } catch (error) {
                        notify((error as Error).message)
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    載入示範照片
                  </button>
                </div>
                <div className="fields">
                  <label>
                    垃圾類型
                    <select
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value)
                        setCompared(false)
                      }}
                    >
                      {[
                        '飲料杯／容器',
                        '食物包裝',
                        '小型隨手垃圾',
                        '其他一般垃圾',
                      ].map((k) => (
                        <option key={k}>{k}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <MeasurementEditor
                  value={measurement}
                  onChange={(next) => {
                    setMeasurement(next)
                    setCompared(false)
                  }}
                />
                <SizeBoardGuide />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={compared}
                    onChange={(event) => setCompared(event.target.checked)}
                  />
                  已用尺寸板逐件對照，且都完整放入所選尺寸框
                </label>
                <p className="mini-note">
                  超過 20 × 30
                  公分框的垃圾不適用，請使用原清運管道；這裡只收少量行人隨手垃圾。
                </p>
                <p className="privacy-note">
                  {cloud.configured
                    ? '送出後照片會上傳到 private 儲存空間，供本人、收受店家與市府查看；目前不會傳送給 AI。'
                    : '照片會縮圖後保存在此瀏覽器，供店家端查看；不會上傳伺服器或傳送給 AI。'}
                </p>
                <button
                  className="button full"
                  disabled={
                    !photo ||
                    !compared ||
                    !Number.isInteger(measurement.quantity) ||
                    measurement.quantity < 1 ||
                    measurement.quantity > 99 ||
                    busy ||
                    !isOpen(store)
                  }
                  onClick={submit}
                >
                  送出交付紀錄<span>→</span>
                </button>
              </div>
            </section>
          </section>
        </div>
      )}
      <nav className="citizen-bottom-nav" aria-label="民眾功能">
        <button
          aria-label="附近地圖"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          ⌖<span>附近地圖</span>
        </button>
        <button aria-label="拍照交付" onClick={() => setShowUpload(true)}>
          ◎<span>拍照交付</span>
        </button>
        <button onClick={scrollHistory}>
          ◷<span>交付紀錄</span>
        </button>
      </nav>
    </div>
  )
}
