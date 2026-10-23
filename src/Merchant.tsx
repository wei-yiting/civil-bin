import { useNow } from './useNow'
import { save } from './actions'
import { useState } from 'react'
import { Registration } from './Registration'
import { GeoMap } from './GeoMap'
import {
  aggregateSizes,
  dateKey,
  validateWeeklyHours,
  validateMeasurement,
  validateSizeCounts,
  measurementLabel,
  SIZE_OPTIONS,
  isDemoDelivery,
} from './domain'
import { MeasurementEditor, SizeBoardGuide } from './MeasurementEditor'
import { WeeklyHoursEditor } from './WeeklyHoursEditor'
import type { Delivery, Store, SizeMeasurement, SizeCounts } from './domain'
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
  const [selected, setSelected] = useState(data.stores[0]?.id ?? '')
  const [registering, setRegistering] = useState(false)
  const store = data.stores.find((s) => s.id === selected) ?? data.stores[0]
  if (!store)
    return (
      <Registration
        notify={notify}
        onRegistered={(id) => setSelected(id)}
        renderMap={(position, onPick) => (
          <GeoMap picked={position} onPick={onPick} />
        )}
      />
    )
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">讓小店的幫忙，都有憑有據</div>
          <h1>我的街角小店</h1>
          <p>確認現場交付、安排收受時段，再完成今日代收申報。</p>
        </div>
        <StoreStatus store={store} />
      </header>
      <section className="merchant-onboarding">
        <div>
          <span className="eyebrow">成為我們的街角夥伴</span>
          <h2>
            {store.isDemo ? '讓你的小店，成為城市的好鄰居。' : store.name}
          </h2>
          <p>
            {store.isDemo
              ? '目前為示範店家。登錄店名、地址與位置，開始設定你的收受服務。'
              : store.address}
          </p>
        </div>
        <button className="button" onClick={() => setRegistering(true)}>
          登錄我的店家
        </button>
      </section>
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
      {registering && (
        <div className="delivery-overlay">
          <div
            className="delivery-dialog registration-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="登錄合作店家"
          >
            <button
              className="close-delivery"
              aria-label="關閉店家登錄"
              onClick={() => setRegistering(false)}
            >
              ×
            </button>
            <Registration
              notify={notify}
              onRegistered={(id) => {
                setSelected(id)
                setRegistering(false)
              }}
              renderMap={(position, onPick) => (
                <GeoMap picked={position} onPick={onPick} />
              )}
            />
          </div>
        </div>
      )}
      <MerchantStore key={store.id} store={store} data={data} notify={notify} />
    </>
  )
}

function MerchantStore({ store, data, notify }: PageProps & { store: Store }) {
  const today = dateKey()
  const [tab, setTab] = useState<Delivery['status']>('pending')
  const [manual, setManual] = useState<SizeMeasurement>({
    boardVersion: 'street-v1',
    size: 'S',
    quantity: 1,
  })
  const [busy, setBusy] = useState(false)
  const [reason, setReason] = useState(reasons[0])
  const totals = aggregateSizes(data, store.id)
  const records = data.deliveries
    .filter((r) => r.storeId === store.id && r.date === today && r.measurement)
    .sort(
      (a, b) =>
        Number(isDemoDelivery(a)) - Number(isDemoDelivery(b)) ||
        Date.parse(b.createdAt) - Date.parse(a.createdAt),
    )
  const shown = records.filter((r) => r.status === tab)
  async function decide(
    id: string,
    status: 'accepted' | 'rejected',
    confirmed?: SizeMeasurement,
  ) {
    const succeeded = await save(
      (draft) => {
        const record = draft.deliveries.find(
          (r) => r.id === id && r.storeId === store.id && r.date === dateKey(),
        )
        if (!record || record.status !== 'pending')
          throw new Error('這筆紀錄已變更，請重新確認。')
        if (status === 'accepted' && record.measurement) {
          validateMeasurement(confirmed)
          record.confirmedMeasurement = { ...confirmed }
        }
        record.status = status
        record.reason = status === 'rejected' ? reason : ''
      },
      notify,
      status === 'accepted'
        ? '已確認收受，尺寸件數與市府資料已同步更新。'
        : '已拒收，原因已同步至民眾端。',
    )
    if (succeeded && status === 'accepted') setTab('accepted')
    return succeeded
  }
  return (
    <>
      <div className="metrics three">
        <div data-testid="size-total">
          <Metric
            label="今日已確認"
            value={totals.total}
            unit="件・人工尺寸登記"
            accent
          />
        </div>
        <Metric
          label="小件／中件／大件"
          value={`${totals.confirmed.S}／${totals.confirmed.M}／${totals.confirmed.L}`}
          unit="件・不換算公升"
        />
        <Metric
          label="待確認交付"
          value={totals.pending}
          unit="筆・尚未計入收受"
        />
      </div>
      <div className="merchant-layout">
        <section className="card">
          <div className="card-head">
            <div>
              <span className="eyebrow">01 / 現場確認</span>
              <h2>
                {store.name}・
                {tab === 'accepted' ? '今日全部收受紀錄' : '今日交付紀錄'}
              </h2>
            </div>
            <span className="badge orange">
              {records.filter((r) => r.status === 'pending').length} 筆待確認
            </span>
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
              shown.map((record) => (
                <DeliveryConfirmation
                  key={record.id}
                  record={record}
                  decide={decide}
                  notify={notify}
                />
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
              使用同一尺寸板登記；此為店家自行補登，沒有民眾照片佐證。
            </p>
            <form
              onSubmit={async (event) => {
                event.preventDefault()
                if (busy) return
                try {
                  validateMeasurement(manual)
                } catch (error) {
                  notify((error as Error).message)
                  return
                }
                setBusy(true)
                try {
                  await save(
                    (draft) =>
                      draft.deliveries.unshift({
                        id: crypto.randomUUID(),
                        storeId: store.id,
                        date: dateKey(),
                        createdAt: new Date().toISOString(),
                        kind: '未拍照尺寸登記',
                        liters: 0,
                        low: 0,
                        high: 0,
                        measurement: { ...manual },
                        confirmedMeasurement: { ...manual },
                        photo: null,
                        source: 'manual',
                        status: 'accepted',
                        reason: '',
                      }),
                    notify,
                    '已新增未拍照尺寸收受，不列入民眾照片紀錄。',
                  )
                } finally {
                  setBusy(false)
                }
              }}
            >
              <MeasurementEditor
                value={manual}
                onChange={setManual}
                prefix="補登"
              />
              <button className="button secondary full" disabled={busy}>
                新增未拍照收受
              </button>
            </form>
          </div>
        </section>
        <div className="merchant-settings">
          <ServiceSettings
            key={JSON.stringify([
              store.id,
              store.enabled,
              store.weeklyHours,
              store.pausedOn,
              store.pauseReason,
            ])}
            store={store}
            notify={notify}
          />
          <DailySizeClaim
            key={JSON.stringify([
              store.id,
              today,
              data.sizeClaims[`${today}:${store.id}`],
            ])}
            store={store}
            data={data}
            notify={notify}
          />
        </div>
      </div>
    </>
  )
}

function DeliveryConfirmation({
  record,
  decide,
  notify,
}: {
  record: Delivery
  decide: (
    id: string,
    status: 'accepted' | 'rejected',
    confirmed?: SizeMeasurement,
  ) => Promise<boolean>
  notify: PageProps['notify']
}) {
  const [measurement, setMeasurement] = useState<SizeMeasurement>(
    record.confirmedMeasurement ??
      record.measurement ?? {
        boardVersion: 'street-v1',
        size: 'S',
        quantity: 1,
      },
  )
  const [busy, setBusy] = useState(false)
  async function confirm(status: 'accepted' | 'rejected') {
    if (busy) return
    if (status === 'accepted' && record.measurement) {
      try {
        validateMeasurement(measurement)
      } catch (error) {
        notify((error as Error).message)
        return
      }
    }
    setBusy(true)
    try {
      await decide(record.id, status, measurement)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div
      className="record size-record"
      role="group"
      aria-label={`${record.kind}交付紀錄`}
    >
      {record.photo && record.source === 'photo' ? (
        <img
          className="record-photo"
          src={record.photo}
          alt={`${record.kind}交付照片`}
        />
      ) : (
        <span className="manual-thumb">手動紀錄</span>
      )}
      <div className="record-info">
        <b>{record.kind}</b>
        <small>
          {new Date(record.createdAt).toLocaleTimeString('zh-TW', {
            timeZone: 'Asia/Taipei',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          })}
          ・{record.source === 'photo' ? '尺寸板照片登記' : '店家自行補登'}
        </small>
        <span>原填：{measurementLabel(record)}</span>
        {record.confirmedMeasurement && (
          <span>店家確認：{measurementLabel(record, true)}</span>
        )}
        {record.reason && <small>拒收原因：{record.reason}</small>}
      </div>
      {record.status === 'pending' ? (
        <div className="record-confirmation">
          {record.measurement && (
            <MeasurementEditor
              value={measurement}
              onChange={setMeasurement}
              prefix="店家確認"
            />
          )}
          <p className="mini-note">
            以現場尺寸板核對，必要時修正；原填資料會保留。
          </p>
          <div className="button-row">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => confirm('accepted')}
            >
              確認收受
            </button>
            <button
              className="button danger"
              disabled={busy}
              onClick={() => confirm('rejected')}
            >
              拒收
            </button>
          </div>
        </div>
      ) : (
        <span
          className={`badge ${record.status === 'accepted' ? 'green' : 'orange'}`}
        >
          {record.status === 'accepted' ? '已收受' : '已拒收'}
        </span>
      )}
    </div>
  )
}

function DailySizeClaim({ store, data, notify }: PageProps & { store: Store }) {
  const today = dateKey()
  const totals = aggregateSizes(data, store.id)
  const [claim, setClaim] = useState<SizeCounts>(() => ({
    ...(data.sizeClaims[`${today}:${store.id}`] ?? { S: 0, M: 0, L: 0 }),
  }))
  const [busy, setBusy] = useState(false)
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">03 / 每日申報</span>
          <h2>今日尺寸收受申報</h2>
        </div>
        <span className="badge gray">{today}</span>
      </div>
      <div className="card-body">
        <p>
          逐筆已確認：小件 {totals.confirmed.S}／中件 {totals.confirmed.M}／大件{' '}
          {totals.confirmed.L} 件。請核對今日實際交付後填寫；未申報不視為零。
        </p>
        <SizeBoardGuide />
        <button
          className="text-button"
          onClick={() => setClaim({ ...totals.confirmed })}
        >
          帶入已確認件數
        </button>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            if (busy) return
            const submitter = (event.nativeEvent as SubmitEvent).submitter
            const closeToday =
              submitter instanceof HTMLButtonElement &&
              submitter.value === 'close'
            try {
              validateSizeCounts(claim)
            } catch (error) {
              notify((error as Error).message)
              return
            }
            setBusy(true)
            try {
              await save(
                (draft) => {
                  const currentDate = dateKey()
                  const target = draft.stores.find((s) => s.id === store.id)
                  if (!target) throw new Error('找不到此店家，請重新載入。')
                  draft.sizeClaims[`${currentDate}:${store.id}`] = { ...claim }
                  if (closeToday) {
                    target.pausedOn = currentDate
                    target.pauseReason = '今日結算完成，準備交付清運'
                  }
                },
                notify,
                closeToday
                  ? '今日已結算並停收；請依現場清運方式處理。'
                  : '今日尺寸申報已儲存，市府端資料已同步。',
              )
            } finally {
              setBusy(false)
            }
          }}
        >
          {SIZE_OPTIONS.map((size) => (
            <label key={size.id}>
              今日{size.label}申報件數
              <input
                type="number"
                min="0"
                max="999"
                step="1"
                required
                value={claim[size.id]}
                onChange={(event) =>
                  setClaim((previous) => ({
                    ...previous,
                    [size.id]: Number(event.target.value),
                  }))
                }
              />
            </label>
          ))}
          <p className="mini-note">
            結算只是完成申報與停收，清運須由現場另行確認。
          </p>
          <button
            className="button full"
            type="submit"
            name="settlement"
            value="close"
            disabled={busy}
          >
            完成今日結算並停收
          </button>
          <button
            className="button secondary full"
            type="submit"
            name="settlement"
            value="save"
            disabled={busy}
          >
            儲存今日尺寸申報
          </button>
        </form>
      </div>
    </section>
  )
}

function ServiceSettings({
  store,
  notify,
}: {
  store: Store
  notify: PageProps['notify']
}) {
  useNow()
  const [hours, setHours] = useState(() => structuredClone(store.weeklyHours))
  const [enabled, setEnabled] = useState(store.enabled)
  const [reason, setReason] = useState(store.pauseReason || '收受容量已滿')
  const [busy, setBusy] = useState(false)
  const paused = store.pausedOn === dateKey()
  async function pauseToday() {
    if (busy) return
    setBusy(true)
    try {
      await save(
        (draft) => {
          const target = draft.stores.find((s) => s.id === store.id)
          if (!target) throw new Error('找不到此店家，請重新載入。')
          target.pausedOn = paused ? null : dateKey()
          target.pauseReason = paused ? '' : reason.trim() || '店家臨時停收'
        },
        notify,
        paused
          ? '已解除今日停收，依每週時段開放。'
          : '今日已停止收受，民眾與市府端狀態已同步。',
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">02 / 收受服務</span>
          <h2>每週時段與今日停收</h2>
        </div>
        <StoreStatus store={store} />
      </div>
      <div className="card-body">
        <div className="daily-pause" data-testid="daily-pause">
          <h3>{paused ? '今天已臨時停收' : '今天還能繼續收受嗎？'}</h3>
          <p className="mini-note">
            臨時停收只影響臺北時間今天，隔日恢復依每週時段判斷；不會修改每週設定，也不會取消已送出的交付。
          </p>
          {!paused && (
            <label>
              今日停收原因
              <input
                value={reason}
                maxLength={120}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {paused && <p>停收原因：{store.pauseReason || '店家臨時停收'}</p>}
          <button
            type="button"
            disabled={busy}
            className={`button full ${paused ? 'secondary' : 'danger'}`}
            onClick={pauseToday}
          >
            {busy ? '正在同步…' : paused ? '解除今日停收' : '今天停止收受'}
          </button>
        </div>
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (busy) return
            try {
              validateWeeklyHours(hours)
            } catch (error) {
              notify((error as Error).message)
              return
            }
            setBusy(true)
            try {
              await save(
                (draft) => {
                  const target = draft.stores.find((s) => s.id === store.id)
                  if (!target) throw new Error('找不到此店家，請重新載入。')
                  target.enabled = enabled
                  target.weeklyHours = structuredClone(hours)
                },
                notify,
                '收受設定已儲存，民眾端據點狀態已同步。',
              )
            } finally {
              setBusy(false)
            }
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
          <p className="mini-note">
            取消開放會持續停用服務，直到你重新開放。僅當天額滿請使用上方「今天停止收受」。
          </p>
          <WeeklyHoursEditor value={hours} onChange={setHours} />
          <button
            disabled={busy}
            className="button secondary full"
            type="submit"
          >
            {busy ? '正在同步…' : '儲存收受設定'}
          </button>
        </form>
      </div>
    </section>
  )
}
