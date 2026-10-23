import { save } from './actions'
import { useState } from 'react'
import { aggregate, dateKey, estimate, isOpen } from './domain'
import type { Estimate } from './domain'
import { preparePhoto, SAMPLE } from './photo'
import { Map, Metric, StoreStatus } from './ui'
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
  const store = data.stores.find((s) => s.id === selected)!
  const shown = data.stores.filter(
    (s) =>
      `${s.name}${s.area}`.includes(query.trim()) && (!onlyOpen || isOpen(s)),
  )
  const history = data.deliveries.filter(
    (r) =>
      r.storeId === selected &&
      r.date === dateKey() &&
      !r.id.startsWith('sample-'),
  )
  const total = data.stores.reduce((n, s) => n + aggregate(data, s.id).count, 0)
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
    }
  }
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">把善意，留在每個街角</div>
          <h1>附近哪裡可以丟垃圾？</h1>
          <p>找到願意幫忙的小店，拍照交付，讓每一份城市需求被看見。</p>
        </div>
        <span className="badge green">● 示範街區服務中</span>
      </header>
      <div className="metrics three">
        <Metric label="合作小店" value={data.stores.length} unit="個街角夥伴" />
        <Metric
          label="現在可收受"
          value={data.stores.filter((s) => isOpen(s)).length}
          unit="個合作據點"
        />
        <Metric label="今日已確認照片" value={total} unit="筆交付紀錄" accent />
      </div>
      <div className="citizen-layout">
        <section className="card map-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">01 / 找到合作夥伴</span>
              <h2>合作收受點地圖</h2>
            </div>
            <span className="badge gray">臺北・示意街區</span>
          </div>
          <Map stores={shown} selected={selected} onSelect={setSelected} />
          <div className="store-list">
            <div className="search-row">
              <label className="search">
                <span>⌕</span>
                <input
                  aria-label="搜尋店家或街區"
                  placeholder="搜尋店家或街區"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={onlyOpen}
                  onChange={(e) => setOnlyOpen(e.target.checked)}
                />
                只看收受中
              </label>
            </div>
            {shown.length === 0 && (
              <p className="empty">沒有符合的據點，請調整搜尋條件。</p>
            )}
            {shown.map((s, i) => (
              <button
                className={`store-item ${s.id === selected ? 'selected' : ''}`}
                key={s.id}
                aria-pressed={s.id === selected}
                onClick={() => setSelected(s.id)}
              >
                <span className="store-number">{i + 1}</span>
                <span className="store-info">
                  <b>{s.name}</b>
                  <span>
                    {s.area}・{s.hoursStart}–{s.hoursEnd}
                  </span>
                </span>
                <StoreStatus store={s} />
                <span className="chevron">›</span>
              </button>
            ))}
            <div className="mini-note">
              只收受少量行人垃圾。家戶垃圾、事業廢棄物及危險物品請循原清運管道。
            </div>
          </div>
        </section>
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
      </div>
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
            <p className="muted">完成交付後，可以在這裡查看店家確認結果。</p>
          )}
        </div>
      </section>
    </>
  )
}
