import { CityMapPanel } from './CityMapPanel'
import { CityTimePanel } from './CityTimePanel'
import { dayLabel, shiftDay } from './city-history'
import { save } from './actions'
import { useState } from 'react'
import { aggregateSizes, dateKey, reviewKey, measurementLabel } from './domain'
import type { Store, SizeCounts } from './domain'
import { Metric, StoreStatus } from './ui'
import type { PageProps } from './ui'

const totalCounts = (counts: SizeCounts) => counts.S + counts.M + counts.L
function countsLabel(counts: SizeCounts) {
  return `小 ${counts.S}／中 ${counts.M}／大 ${counts.L}（共 ${totalCounts(counts)} 件）`
}
function Review({
  data,
  store,
  day,
  notify,
}: PageProps & { store: Store; day: string }) {
  const key = reviewKey(data, store.id, day)
  const [note, setNote] = useState(data.reviews[key] ?? '')
  const evidence = aggregateSizes(data, store.id, day)
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <span className="eyebrow">查核工作台</span>
          <h2>{store.name}・查核詳情</h2>
        </div>
        <span className="badge gray">供人工核對</span>
      </div>
      <div className="card-body">
        <p>
          民眾原登記與店家確認的尺寸件數分開保留。差異供補件與核對，不判定違規。
        </p>
        <div className="callout">
          民眾原登記：<b>{countsLabel(evidence.reported)}</b>
          <br />
          店家已確認：<b>{countsLabel(evidence.confirmed)}</b>
        </div>
        <div className="evidence-list">
          {data.deliveries
            .filter(
              (r) => r.date === day && r.storeId === store.id && r.measurement,
            )
            .map((r) => (
              <div className="evidence-row" key={r.id}>
                {r.photo ? (
                  <img src={r.photo} alt={`${r.kind}佐證照片`} />
                ) : (
                  <span className="manual-icon">手動</span>
                )}
                <div>
                  <b>{r.kind}</b>
                  <small>原登記：{measurementLabel(r)}</small>
                  {r.confirmedMeasurement && (
                    <small>店家確認：{measurementLabel(r, true)}</small>
                  )}
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
          onSubmit={async (e) => {
            e.preventDefault()
            if (!note.trim()) return
            await save(
              (draft) => {
                draft.reviews[key] = note.trim()
              },
              notify,
              '查核紀錄已儲存；差異仍需人工核對。',
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

export function City({ data, notify }: PageProps) {
  const [day, setDay] = useState(dateKey())
  const [selected, setSelected] = useState(data.stores[0].id)
  const [onlyFlags, setOnlyFlags] = useState(false)
  const store = data.stores.find((s) => s.id === selected)!
  const summaries = data.stores.map((s) => {
    const evidence = aggregateSizes(data, s.id, day)
    const claim = data.sizeClaims[`${day}:${s.id}`]
    const difference =
      !!claim &&
      (['S', 'M', 'L'] as const).some(
        (size) => claim[size] !== evidence.confirmed[size],
      )
    return { store: s, evidence, claim, difference }
  })
  const flags = summaries.filter((s) => s.difference)
  return (
    <>
      <header className="page-header">
        <div>
          <div className="eyebrow">讓城市評估，有資料可循</div>
          <h1>公共垃圾需求與收受分析</h1>
          <p>
            依尺寸板分類觀察各點件數與申報差異，供政府評估；不是體積推算或政策結論。
          </p>
        </div>
        <div className="city-date-navigation">
          <label className="date-filter">
            分析日期
            <input
              type="date"
              value={day}
              required
              max={dateKey()}
              onChange={(e) => {
                if (e.target.value && e.target.value <= dateKey())
                  setDay(e.target.value)
              }}
            />
          </label>
          <div className="actions">
            <button
              className="button secondary"
              onClick={() => setDay(shiftDay(day, -1))}
            >
              前一天
            </button>
            <button
              className="button secondary"
              onClick={() => setDay(dateKey())}
            >
              今天
            </button>
            <button
              className="button secondary"
              disabled={day >= dateKey()}
              onClick={() => setDay(shiftDay(day, 1))}
            >
              後一天
            </button>
          </div>
          <strong>{dayLabel(day)}</strong>
          <small>
            以臺北時間統計；平日／週末依星期分類，未套用國定假日或補班行事曆。
          </small>
        </div>
      </header>
      <CityMapPanel
        data={data}
        day={day}
        selected={selected}
        onSelect={setSelected}
      />
      <CityTimePanel
        data={data}
        store={store}
        day={day}
        onSelect={setSelected}
      />
      <div className="metrics four">
        <Metric label="合作據點" value={data.stores.length} unit="間小店" />
        <Metric
          label="店家已確認"
          value={summaries.reduce(
            (n, s) => n + totalCounts(s.evidence.confirmed),
            0,
          )}
          unit="件・尺寸板登記"
        />
        <Metric
          label="店家當日申報"
          value={summaries.reduce(
            (n, s) => n + (s.claim ? totalCounts(s.claim) : 0),
            0,
          )}
          unit="件・未申報不計入"
        />
        <Metric
          label="待核對差異"
          value={flags.length}
          unit="個據點・非違規判定"
          accent
        />
      </div>
      <section className="card comparison">
        <div className="card-head">
          <div>
            <span className="eyebrow">01 / 雙方尺寸件數比對</span>
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
                <th>民眾原登記</th>
                <th>店家已確認</th>
                <th>店家當日申報</th>
                <th>比對結果</th>
                <th>查核作業</th>
              </tr>
            </thead>
            <tbody>
              {summaries
                .filter((s) => !onlyFlags || s.difference)
                .map(({ store: s, evidence, claim, difference }) => (
                  <tr key={s.id}>
                    <td>
                      <b>{s.name}</b>
                      <small>{s.area}</small>
                      {day === dateKey() && <StoreStatus store={s} />}
                    </td>
                    <td>
                      {countsLabel(evidence.reported)}
                      <small>已收受交付的原始填寫</small>
                    </td>
                    <td>{countsLabel(evidence.confirmed)}</td>
                    <td>{claim ? countsLabel(claim) : '尚未申報'}</td>
                    <td>
                      <span
                        className={`badge ${difference ? 'orange' : claim ? 'green' : 'gray'}`}
                      >
                        {difference ? '待核對' : claim ? '件數一致' : '待申報'}
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
          <p className="empty">目前沒有待核對差異。</p>
        )}
        <div className="mini-note padded">
          小件 10 × 15 公分、中件 15 × 20 公分、大件 20 × 30
          公分。尺寸表示對照板外框分類，不是公升；每日申報與逐筆確認任一分類不符時提醒核對。
        </div>
      </section>
      <Review
        key={reviewKey(data, selected, day)}
        data={data}
        store={store}
        day={day}
        notify={notify}
      />
    </>
  )
}
