import { save } from './actions'
import { useMemo, useState } from 'react'
import { dateKey, estimate, isOpen } from './domain'
import type { Estimate } from './domain'
import { preparePhoto, SAMPLE } from './photo'
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
  const [selected, setSelected] = useState(data.stores[0].id)
  const [query, setQuery] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [photo, setPhoto] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [kind, setKind] = useState('飲料杯／容器')
  const [reference, setReference] = useState(true)
  const [result, setResult] = useState<Estimate | null>(null)
  const [showUpload, setShowUpload] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
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
          `${s.name}${s.area}`.includes(query.trim()) &&
          (!onlyOpen || isOpen(s)),
      ),
    [data.stores, query, onlyOpen],
  )
  const history = data.deliveries.filter(
    (r) =>
      r.storeId === selected &&
      r.date === dateKey() &&
      !r.id.startsWith('sample-'),
  )

  function submit() {
    if (!photo || !result) return
    if (!isOpen(store)) {
      notify('此據點目前不在收受時段，請選擇其他據點。')
      return
    }
    const done = save(
      (draft) => {
        draft.deliveries.unshift({
          id: crypto.randomUUID(),
          storeId: selected,
          date: dateKey(),
          createdAt: new Date().toISOString(),
          kind,
          ...result,
          photo,
          source: 'photo',
          status: 'pending',
          reason: '',
        })
      },
      notify,
      '交付紀錄已送出，請到店讓店家確認。',
    )
    if (done) {
      setPhoto(null)
      setResult(null)
      setShowUpload(false)
      setShowHistory(true)
    }
  }
  const ordered = [...shown].sort(
    (a, b) =>
      (hasCoordinates(a) ? haversineMeters(origin, a) : Infinity) -
      (hasCoordinates(b) ? haversineMeters(origin, b) : Infinity),
  )
  const nearbyBins = [...publicBins.bins]
    .sort((a, b) => haversineMeters(origin, a) - haversineMeters(origin, b))
    .slice(0, 5)
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
          onClick={() => setShowHistory(!showHistory)}
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
          placeholder="搜尋合作店家、街區"
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
          bins={showBins ? publicBins.bins : undefined}
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
          <span className="legend-bin">● 官方清潔箱</span>
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
            <span>
              ◷ {store.hoursStart}–{store.hoursEnd}
            </span>
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
      <section className="nearby-section">
        <div className="nearby-heading">
          <h2>{showPartners ? '附近合作店家' : '附近公共清潔箱'}</h2>
          <span>依搜尋中心直線距離排序</span>
        </div>
        {showPartners &&
          ordered.map((s) => (
            <button
              className={`nearby-place ${selected === s.id && !selectedBin ? 'selected' : ''}`}
              key={s.id}
              aria-pressed={selected === s.id}
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
                  {s.area}・{s.hoursStart}–{s.hoursEnd}
                </small>
              </span>
              <span className="place-right">
                <StoreStatus store={s} />
                <small>
                  {hasCoordinates(s)
                    ? formatDistance(haversineMeters(origin, s))
                    : '位置未設定'}
                </small>
              </span>
            </button>
          ))}
        {showPartners && !ordered.length && (
          <p className="empty">沒有符合的店家，請調整搜尋或查看公共清潔箱。</p>
        )}
        {showBins && (
          <>
            <div className="nearby-heading">
              <h3>鄰近公共清潔箱</h3>
              <span>官方設置位置</span>
            </div>
            {nearbyBins.map((b) => (
              <button
                className="nearby-place bin-place"
                key={b.id}
                onClick={() => setSelectedBin(b)}
              >
                <span className="place-icon">♲</span>
                <span>
                  <b>{b.address}</b>
                  <small>
                    {b.district}
                    {b.note ? '・' + b.note : ''}
                  </small>
                </span>
                <span className="place-right">
                  <small>{formatDistance(haversineMeters(origin, b))}</small>
                </span>
              </button>
            ))}
          </>
        )}
        <p className="mini-note">
          合作店家只收少量行人垃圾；家戶垃圾與事業廢棄物請循原清運管道。示範店家不代表現場提供服務。
        </p>
      </section>
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
                <span className="step-label">拍照 → 估算 → 確認</span>
              </div>
              <div className="card-body">
                <div className="chosen-store" data-testid="selected-store">
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
                        setResult(null)
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
                    onClick={() => {
                      setPhoto(SAMPLE)
                      setResult(null)
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
                        setResult(null)
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
                  <label>
                    尺寸參考
                    <select
                      value={reference ? 'yes' : 'no'}
                      onChange={(e) => {
                        setReference(e.target.value === 'yes')
                        setResult(null)
                      }}
                    >
                      <option value="yes">有尺寸參考卡</option>
                      <option value="no">沒有參考物</option>
                    </select>
                  </label>
                </div>
                <button
                  className="button secondary full"
                  disabled={!photo || busy}
                  onClick={() => setResult(estimate(kind, reference))}
                >
                  模擬 AI 體積估算
                </button>
                {result && (
                  <div className="estimate" data-testid="estimate">
                    <span>✧</span>
                    <div>
                      <small>模擬估算結果・非影像辨識</small>
                      <strong>
                        {result.low.toFixed(1)}–{result.high.toFixed(1)}{' '}
                        <small>公升</small>
                      </strong>
                      <span>依垃圾類型預設，不能用於重量或補助核算。</span>
                    </div>
                  </div>
                )}
                <p className="privacy-note">
                  照片會縮圖後保存在此瀏覽器，供店家端查看；不會上傳伺服器或傳送給
                  AI。
                </p>
                <button
                  className="button full"
                  disabled={!photo || !result || busy || !isOpen(store)}
                  onClick={submit}
                >
                  送出交付紀錄<span>→</span>
                </button>
              </div>
            </section>
          </section>
        </div>
      )}
      {showHistory && (
        <div className="citizen-history-panel">
          <button className="text-button" onClick={() => setShowHistory(false)}>
            收合交付紀錄
          </button>{' '}
          <section className="card history-card" data-testid="citizen-history">
            <div className="card-head">
              <div>
                <span className="eyebrow">03 / 追蹤交付狀態</span>
                <h2>今日在 {store.name} 的新增紀錄</h2>
              </div>
              <span className="badge gray">{history.length} 筆</span>
            </div>
            <div className="card-body">
              {history.length ? (
                history.map((r) => (
                  <div className="history-row" key={r.id}>
                    <span>{r.kind}</span>
                    <b>{r.liters.toFixed(1)} 公升</b>
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
                <p className="muted">
                  完成交付後，可以在這裡查看店家確認結果。
                </p>
              )}
            </div>
          </section>
        </div>
      )}
      <nav className="citizen-bottom-nav" aria-label="民眾功能">
        <button
          aria-current={!showHistory ? 'page' : undefined}
          onClick={() => {
            setShowHistory(false)
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }}
        >
          ⌖<span>附近地圖</span>
        </button>
        <button aria-label="拍照交付" onClick={() => setShowUpload(true)}>
          ◎<span>拍照交付</span>
        </button>
        <button
          aria-current={showHistory ? 'page' : undefined}
          onClick={() => setShowHistory(true)}
        >
          ◷<span>交付紀錄</span>
        </button>
      </nav>
    </div>
  )
}
