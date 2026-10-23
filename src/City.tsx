import { number, save } from './actions'
import { useState } from 'react'
import {
  aggregate,
  capacityAnalysis,
  classification,
  dateKey,
  reviewKey,
} from './domain'
import type { Store } from './domain'
import { Metric } from './ui'
import type { PageProps } from './ui'

function Review({
  data,
  store,
  day,
  notify,
}: PageProps & { store: Store; day: string }) {
  const key = reviewKey(data, store.id, day)
  const [note, setNote] = useState(data.reviews[key] ?? '')
  const result = classification(data, store.id, day)
  const evidence = aggregate(data, store.id, day)
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">查核工作台</span>
          <h2>{store.name}・查核詳情</h2>
        </div>
        <span
          className={`badge ${result.level === 'normal' ? 'green' : 'orange'}`}
        >
          {result.label}
        </span>
      </div>
      <div className="card-body">
        <p>{result.detail}</p>
        <div className="callout">
          照片估計區間{' '}
          <b>
            {number(evidence.low)}–{number(evidence.high)} 公升
          </b>
          ；未拍照收受 <b>{number(evidence.manualLiters)} 公升</b>
          。照片只涵蓋部分交付，差異不等於違規。
        </div>
        <div className="evidence-list">
          {data.deliveries
            .filter((r) => r.date === day && r.storeId === store.id)
            .map((r) => (
              <div className="evidence-row" key={r.id}>
                {r.photo ? (
                  <img src={r.photo} alt={`${r.kind}佐證照片`} />
                ) : (
                  <span className="manual-icon">手動</span>
                )}
                <div>
                  <b>{r.kind}</b>
                  <small>
                    {r.low.toFixed(1)}–{r.high.toFixed(1)} 公升・
                    {r.source === 'manual' ? '店家登記' : '照片模擬估算'}
                  </small>
                </div>
                <span className="badge gray">
                  {r.status === 'accepted'
                    ? '已收受'
                    : r.status === 'rejected'
                      ? '已拒收'
                      : '待確認'}
                </span>
              </div>
            ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (!note.trim()) return
            save(
              (draft) => {
                draft.reviews[key] = note.trim()
              },
              notify,
              '查核紀錄已儲存；異常仍需現場核驗。',
            )
          }}
        >
          <label>
            查核備註
            <textarea
              required
              maxLength={1000}
              value={note}
              placeholder="記錄追查原因、補件或現場核驗結果"
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button className="button" type="submit">
            儲存查核紀錄
          </button>
        </form>
        {data.reviews[key] && (
          <div className="saved-review">
            <span className="badge green">已留查核備註</span>
            <p>{data.reviews[key]}</p>
            <small>此備註對應目前證據；申報或交付變更後需重新查核。</small>
          </div>
        )}
      </div>
    </section>
  )
}

function Scenario({
  store,
  notify,
}: { store: Store } & Pick<PageProps, 'notify'>) {
  const [distance, setDistance] = useState(String(store.binDistance))
  const [capacity, setCapacity] = useState(String(store.publicCapacity))
  const [collections, setCollections] = useState(String(store.collections))
  const [overflow, setOverflow] = useState(String(store.overflow))
  function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault()
    const values = [distance, capacity, collections, overflow].map(Number)
    if (
      [distance, capacity, collections, overflow].some((v) => !v.trim()) ||
      values.some((v) => !Number.isFinite(v) || v < 0) ||
      !Number.isInteger(values[2]) ||
      !Number.isInteger(values[3])
    ) {
      notify('請輸入有效非負數，清運與滿溢次數須為整數。')
      return
    }
    save(
      (draft) => {
        Object.assign(
          draft.stores.find((s) => s.id === store.id)!,
          {
            binDistance: values[0],
            publicCapacity: values[1],
            collections: values[2],
            overflow: values[3],
          },
        )
      },
      notify,
      '模擬情境已更新，分析結果已重新計算。',
    )
  }
  return (
    <form className="scenario-form" onSubmit={submit}>
      <div className="fields">
        <label>
          最近垃圾桶距離（公尺）
          <input
            type="number"
            min="0"
            max="10000"
            required
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
        </label>
        <label>
          垃圾桶容量（公升）
          <input
            type="number"
            min="0"
            max="10000"
            step="0.1"
            required
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </label>
        <label>
          每日清運次數
          <input
            type="number"
            min="0"
            max="50"
            step="1"
            required
            value={collections}
            onChange={(e) => setCollections(e.target.value)}
          />
        </label>
        <label>
          當日滿溢通報次數
          <input
            type="number"
            min="0"
            max="999"
            step="1"
            required
            value={overflow}
            onChange={(e) => setOverflow(e.target.value)}
          />
        </label>
      </div>
      <button className="button secondary full">更新模擬情境</button>
    </form>
  )
}

export function City({ data, notify }: PageProps) {
  const [day, setDay] = useState(dateKey())
  const [selected, setSelected] = useState(data.stores[0].id)
  const [onlyFlags, setOnlyFlags] = useState(false)
  const store = data.stores.find((s) => s.id === selected)!
  const summaries = data.stores.map((s) => ({
    store: s,
    evidence: aggregate(data, s.id, day),
    result: classification(data, s.id, day),
    analysis: capacityAnalysis(data, s.id, day),
  }))
  const flags = summaries.filter(
    (s) => s.result.level === 'high' || s.result.level === 'low',
  )
  const analysis = capacityAnalysis(data, selected, day)
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">讓城市決策，有跡可循</div>
          <h1>公共垃圾需求與收受分析</h1>
          <p>比對民眾照片與店家申報，找到需要查核的差異、需要照顧的街角。</p>
        </div>
        <label className="date-filter">
          分析日期
          <input
            type="date"
            value={day}
            required
            max={dateKey()}
            onChange={(e) => {
              if (e.target.value) setDay(e.target.value)
            }}
          />
        </label>
      </header>
      <div className="metrics four">
        <Metric label="合作據點" value={data.stores.length} unit="間小店" />
        <Metric
          label="已收受照片"
          value={summaries.reduce((n, s) => n + s.evidence.count, 0)}
          unit="筆獨立交付"
        />
        <Metric
          label="照片模擬估計量"
          value={number(summaries.reduce((n, s) => n + s.evidence.liters, 0))}
          unit="公升・非實測"
        />
        <Metric
          label="待查核異常"
          value={flags.length}
          unit="個據點・非違規判定"
          accent
        />
      </div>
      <section className="card comparison">
        <div className="card-head">
          <div>
            <span className="eyebrow">01 / 雙方數據交叉比對</span>
            <h2>同一天、同一個據點，一起看</h2>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={onlyFlags}
              onChange={(e) => setOnlyFlags(e.target.checked)}
            />
            只看待查核
          </label>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>合作收受點</th>
                <th>照片估計量</th>
                <th>店家申報量</th>
                <th>比對結果</th>
                <th>查核作業</th>
              </tr>
            </thead>
            <tbody>
              {summaries
                .filter(
                  (s) =>
                    !onlyFlags ||
                    s.result.level === 'high' ||
                    s.result.level === 'low',
                )
                .map(({ store: s, evidence, result }) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      <small>{s.area}</small>
                    </td>
                    <td>
                      {number(evidence.liters)} 公升
                      <small>{evidence.count} 筆已收受照片</small>
                    </td>
                    <td>
                      {data.claims[`${day}:${s.id}`] === undefined
                        ? '尚未申報'
                        : number(data.claims[`${day}:${s.id}`]) + ' 公升'}
                    </td>
                    <td>
                      <span
                        className={`badge ${result.level === 'normal' ? 'green' : result.level === 'missing' ? 'gray' : 'orange'}`}
                      >
                        {result.label}
                      </span>
                    </td>
                    <td>
                      <button
                        className="text-button"
                        onClick={() => setSelected(s.id)}
                      >
                        查核詳情
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {onlyFlags && !flags.length && (
          <p className="empty">目前沒有待查核異常。</p>
        )}
        <div className="mini-note padded">
          模擬門檻：申報高於照片上界 × 125%，或低於下界 × 75%
          時提醒查核。有申報但無照片也需查核。差距可能來自未拍照交付，不可直接判定不實。
        </div>
      </section>
      <div className="city-layout">
        <div className="stack">
          <Review
            key={reviewKey(data, selected, day)}
            data={data}
            store={store}
            day={day}
            notify={notify}
          />
          <section className="card">
            <div className="card-head">
              <div>
                <span className="eyebrow">資料觀測</span>
                <h2>照片佐證與店家申報</h2>
              </div>
              <span className="badge gray">共同比例尺</span>
            </div>
            <div className="card-body bars">
              {summaries.map(({ store: s, evidence }) => {
                const claim = data.claims[`${day}:${s.id}`]
                const max = Math.max(
                  1,
                  ...summaries.flatMap((v) => [
                    v.evidence.liters,
                    data.claims[`${day}:${v.store.id}`] || 0,
                  ]),
                )
                return (
                  <div className="bar-group" key={s.id}>
                    <b>{s.name}</b>
                    <div className="bar-row">
                      <small>照片估計</small>
                      <span className="bar-track">
                        <i
                          style={{ width: `${(evidence.liters / max) * 100}%` }}
                        />
                      </span>
                      <span>{number(evidence.liters)} L</span>
                    </div>
                    <div className="bar-row">
                      <small>店家申報</small>
                      <span className="bar-track amber">
                        <i
                          style={{ width: `${((claim || 0) / max) * 100}%` }}
                        />
                      </span>
                      <span>
                        {claim === undefined ? '未申報' : number(claim) + ' L'}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
        <section className="card capacity-card">
          <div className="card-head">
            <div>
              <span className="eyebrow">02 / 垃圾桶配置與清運量能</span>
              <h2>這個街角，還需要什麼？</h2>
            </div>
          </div>
          <div className="card-body">
            <label>
              分析合作據點
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
            <div className="capacity-summary">
              <span>模擬需求／日清運量能</span>
              <div>
                <b>{number(analysis.demand)}</b>
                <span>／ {number(analysis.capacity)} 公升</span>
              </div>
              <progress
                max="1"
                value={
                  Number.isFinite(analysis.utilization)
                    ? Math.min(1, analysis.utilization)
                    : 0
                }
                aria-label="模擬量能使用率"
              />
              <small>
                需求與量能比：
                {Number.isFinite(analysis.utilization)
                  ? Math.round(analysis.utilization * 100) + '%'
                  : '未知'}
              </small>
            </div>
            <div className="recommendation">
              <span>↗</span>
              <p>{analysis.recommendation}</p>
            </div>
            <h3>調整模擬情境</h3>
            <p className="muted">
              下列為示範假設，可調整後觀察建議。尚未接入真實清運與滿溢資料；容量為單桶容量。
            </p>
            <Scenario
              key={`${store.id}:${store.publicCapacity}:${store.collections}:${store.binDistance}:${store.overflow}`}
              store={store}
              notify={notify}
            />
            <div className="mini-note">
              政策研判仍需垃圾桶本身垃圾量、行人流量、長期滿溢與現場核驗。照片模擬值不可直接作為補助依據。
            </div>
          </div>
        </section>
      </div>
    </>
  )
}
