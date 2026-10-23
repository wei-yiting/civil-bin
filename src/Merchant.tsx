import { save } from './actions'
import { useState } from 'react'
import { aggregate, dateKey } from './domain'
import type { Delivery, Store } from './domain'
import { Metric, StoreStatus } from './ui'
import type { PageProps } from './ui'

const reasons = [
  '家戶垃圾或不符收受範圍',
  '收受容量已滿',
  '危險物品或不明廢棄物',
  '照片與現場垃圾不符',
]
const tabs = [
  { id: 'pending', label: '待確認' },
  { id: 'accepted', label: '已收受' },
  { id: 'rejected', label: '已拒收' },
] as const

export function Merchant({ data, notify }: PageProps) {
  const [selected, setSelected] = useState(data.stores[0].id)
  const store = data.stores.find((s) => s.id === selected)!
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">讓小店的幫忙，都有憑有據</div>
          <h1>店家收受管理</h1>
          <p>確認現場交付、安排收受時段，再完成今日代收申報。</p>
        </div>
        <StoreStatus store={store} />
      </header>
      <div className="store-switch">
        <label>
          選擇合作店家
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            {data.stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <MerchantStore key={store.id} store={store} data={data} notify={notify} />
    </>
  )
}

function MerchantStore({ store, data, notify }: PageProps & { store: Store }) {
  const today = dateKey()
  const [tab, setTab] = useState<Delivery['status']>('pending')
  const [enabled, setEnabled] = useState(store.enabled)
  const [start, setStart] = useState(store.hoursStart)
  const [end, setEnd] = useState(store.hoursEnd)
  const [claim, setClaim] = useState(
    String(data.claims[`${today}:${store.id}`] ?? ''),
  )
  const [manual, setManual] = useState('')
  const [reason, setReason] = useState(reasons[0])
  const totals = aggregate(data, store.id)
  const records = data.deliveries.filter(
    (r) => r.storeId === store.id && r.date === today,
  )
  const shown = records.filter((r) => r.status === tab)
  function decide(id: string, status: 'accepted' | 'rejected') {
    save(
      (draft) => {
        const record = draft.deliveries.find(
          (r) => r.id === id && r.storeId === store.id && r.date === dateKey(),
        )
        if (!record || record.status !== 'pending')
          throw new Error('這筆紀錄已變更，請重新確認。')
        record.status = status
        record.reason = status === 'rejected' ? reason : ''
      },
      notify,
      status === 'accepted'
        ? '已確認收受，照片佐證與市府比對已同步更新。'
        : '已拒收，原因已同步至民眾端。',
    )
  }
  return (
    <>
      <div className="metrics three">
        <div data-testid="photo-total">
          <Metric
            label="照片佐證量"
            value={totals.liters.toFixed(1)}
            unit="公升・模擬估算"
            accent
          />
        </div>
        <Metric label="已收受照片" value={totals.count} unit="筆獨立紀錄" />
        <Metric
          label="未拍照收受"
          value={totals.manualLiters.toFixed(1)}
          unit="公升・不列入照片佐證"
        />
      </div>
      <div className="merchant-layout">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">01 / 現場確認</span>
              <h2>{store.name}・今日交付紀錄</h2>
            </div>
            <span className="badge orange">{totals.pending} 筆待確認</span>
          </div>
          <div className="tabs" role="group" aria-label="交付狀態">
            {tabs.map((t) => (
              <button
                key={t.id}
                aria-label={t.label}
                aria-pressed={tab === t.id}
                className={`tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                <span>{records.filter((r) => r.status === t.id).length}</span>
              </button>
            ))}
          </div>
          <div className="card-body" data-testid="merchant-records">
            {tab === 'pending' && (
              <label className="reject-reason">
                拒收原因
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                >
                  {reasons.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
            )}
            {shown.length ? (
              shown.map((r) => (
                <div className="record" key={r.id}>
                  {r.photo && r.source === 'photo' ? (
                    <img
                      className="record-photo"
                      src={r.photo}
                      alt={`${r.kind}交付照片`}
                    />
                  ) : (
                    <span className="manual-thumb">手動紀錄</span>
                  )}
                  <div className="record-info">
                    <b>{r.kind}</b>
                    <small>
                      {new Date(r.createdAt).toLocaleTimeString('zh-TW', {
                        timeZone: 'Asia/Taipei',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false,
                      })}
                      ・{r.source === 'photo' ? '照片模擬估算' : '店家手動登記'}
                    </small>
                    <span>{r.liters.toFixed(1)} 公升</span>
                    {r.reason && <small>拒收原因：{r.reason}</small>}
                  </div>
                  <div className="record-actions">
                    {r.status === 'pending' ? (
                      <>
                        <button
                          className="button secondary"
                          onClick={() => decide(r.id, 'accepted')}
                        >
                          確認收受
                        </button>
                        <button
                          className="button danger"
                          onClick={() => decide(r.id, 'rejected')}
                        >
                          拒收
                        </button>
                      </>
                    ) : (
                      <span
                        className={`badge ${r.status === 'accepted' ? 'green' : 'orange'}`}
                      >
                        {r.status === 'accepted' ? '已收受' : '已拒收'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="empty">
                目前沒有{tabs.find((t) => t.id === tab)!.label}的交付紀錄。
              </p>
            )}
          </div>
          <div className="card-body manual-entry">
            <h3>補登未拍照收受</h3>
            <p className="muted">
              只記錄實際代收的行人垃圾；手動登記不等於民眾獨立照片佐證。
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const value = Number(manual)
                if (
                  !manual.trim() ||
                  !Number.isFinite(value) ||
                  value <= 0 ||
                  value > 999
                ) {
                  notify('請輸入大於 0 且不超過 999 公升的收受量。')
                  return
                }
                const done = save(
                  (draft) => {
                    draft.deliveries.unshift({
                      id: crypto.randomUUID(),
                      storeId: store.id,
                      date: dateKey(),
                      createdAt: new Date().toISOString(),
                      kind: '未拍照代收垃圾',
                      liters: value,
                      low: value,
                      high: value,
                      photo: null,
                      source: 'manual',
                      status: 'accepted',
                      reason: '',
                    })
                  },
                  notify,
                  '已新增未拍照收受；不列入照片佐證量。',
                )
                if (done) setManual('')
              }}
            >
              <label>
                未拍照收受量（公升）
                <input
                  type="number"
                  min="0.1"
                  max="999"
                  step="0.1"
                  required
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                />
              </label>
              <button className="button secondary full" type="submit">
                新增未拍照收受
              </button>
            </form>
          </div>
        </section>
        <div className="merchant-settings">
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">02 / 收受服務</span>
                <h2>開放時段</h2>
              </div>
              <StoreStatus store={store} />
            </div>
            <div className="card-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!start || !end || start === end) {
                    notify('開始與結束時間必須不同；跨午夜時段可直接設定。')
                    return
                  }
                  save(
                    (draft) => {
                      const target = draft.stores.find((s) => s.id === store.id)
                      if (!target) throw new Error('找不到此店家，請重新載入。')
                      Object.assign(target, {
                        enabled,
                        hoursStart: start,
                        hoursEnd: end,
                      })
                    },
                    notify,
                    '收受設定已儲存，民眾端據點狀態已同步。',
                  )
                }}
              >
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  開放收受
                </label>
                <div className="fields">
                  <label>
                    開始收受時間
                    <input
                      type="time"
                      required
                      value={start}
                      onChange={(e) => setStart(e.target.value)}
                    />
                  </label>
                  <label>
                    結束收受時間
                    <input
                      type="time"
                      required
                      value={end}
                      onChange={(e) => setEnd(e.target.value)}
                    />
                  </label>
                </div>
                <p className="mini-note">
                  支援跨午夜時段；結束時間起停止收受。示範預設為 00:00–23:59。
                </p>
                <button className="button secondary full" type="submit">
                  儲存收受設定
                </button>
              </form>
            </div>
          </section>
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">03 / 每日申報</span>
                <h2>今日代收總量</h2>
              </div>
              <span className="badge gray">{today}</span>
            </div>
            <div className="card-body">
              <p className="muted">
                申報額外代收的行人垃圾，自有營業垃圾不列入此申報及補助範圍。此原型不計算或發放補助。
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  const value = Number(claim)
                  if (
                    !claim.trim() ||
                    !Number.isFinite(value) ||
                    value < 0 ||
                    value > 999
                  ) {
                    notify('請輸入 0 至 999 公升；沒有代收時請明確填 0。')
                    return
                  }
                  save(
                    (draft) => {
                      draft.claims[`${dateKey()}:${store.id}`] = value
                    },
                    notify,
                    '今日申報已儲存，市府端比對已同步更新。',
                  )
                }}
              >
                <label>
                  今日代收申報量（公升）
                  <input
                    type="number"
                    min="0"
                    max="999"
                    step="0.1"
                    required
                    value={claim}
                    onChange={(e) => setClaim(e.target.value)}
                  />
                </label>
                <p className="mini-note">
                  照片估計量為 {totals.low.toFixed(1)}–{totals.high.toFixed(1)}{' '}
                  公升。未申報與零量申報會分開呈現。
                </p>
                <button className="button full" type="submit">
                  儲存今日申報
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}
