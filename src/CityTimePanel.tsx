import { measurementLabel } from './domain'
import type { State, Store } from './domain'
import {
  collectionTimeline,
  dayLabel,
  scheduledHours,
  timeLabel,
} from './city-history'
import './city-history.css'

export function CityTimePanel({
  data,
  store,
  day,
  onSelect,
}: {
  data: State
  store: Store
  day: string
  onSelect: (id: string) => void
}) {
  const timeline = collectionTimeline(data.deliveries, store.id, day)
  const activeHours = timeline.hourly.filter((entry) => entry.total > 0)
  return (
    <section className="card city-time-panel" aria-label="據點時段分析">
      <div className="card-head">
        <div>
          <span className="eyebrow">所選日期・據點時段分析</span>
          <h2>{store.name}・收受時段</h2>
        </div>
        <label>
          分析合作據點
          <select value={store.id} onChange={(e) => onSelect(e.target.value)}>
            {data.stores.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="card-body">
        <p>
          <b>{dayLabel(day)}</b>
        </p>
        <div className="city-time-summary">
          <div>
            <small>每週設定的收受時段</small>
            <b>{scheduledHours(store, day)}</b>
          </div>
          <div>
            <small>已收受交付的登記時間範圍</small>
            <b>
              {timeline.records.length
                ? `${timeLabel(timeline.records[0].createdAt)}–${timeLabel(timeline.records.at(-1)!.createdAt)}`
                : '當日尚無已收受紀錄'}
            </b>
          </div>
          <div>
            <small>所選日已收受</small>
            <b>
              {timeline.total} 件／{timeline.records.length} 筆交付
            </b>
          </div>
        </div>
        <p className="mini-note">
          時段取目前每週設定，並非歷史營業時段快照。逐筆時間為交付登記時間，不是店家按下確認或清運時間；同筆多件垃圾共用一次登記時間。
        </p>
        <h3>逐小時收受件數（臺北時間）</h3>
        <p className="muted">依店家已確認尺寸分類；未列出的時段為 0 件。</p>
        {activeHours.length ? (
          <div className="city-hourly-list">
            {activeHours.map((entry) => (
              <div className="city-hourly-row" key={entry.hour}>
                <b>
                  {String(entry.hour).padStart(2, '0')}:00–
                  {String(entry.hour + 1).padStart(2, '0')}:00
                </b>
                <progress
                  max={timeline.peak}
                  value={entry.total}
                  aria-label={`${entry.hour} 時收受 ${entry.total} 件`}
                />
                <span>
                  小 {entry.counts.S}／中 {entry.counts.M}／大 {entry.counts.L}
                  ・共 {entry.total} 件
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty">
            此日期沒有已收受的尺寸紀錄，可切換日期或據點查看。
          </p>
        )}
        <details className="city-record-details">
          <summary>
            展開逐筆交付時間與尺寸（{timeline.records.length} 筆）
          </summary>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>登記時間（臺北）</th>
                  <th>垃圾類別</th>
                  <th>原填尺寸</th>
                  <th>店家確認尺寸</th>
                </tr>
              </thead>
              <tbody>
                {timeline.records.map((record) => (
                  <tr key={record.id}>
                    <td>
                      <time dateTime={record.createdAt}>
                        {timeLabel(record.createdAt)}
                      </time>
                    </td>
                    <td>{record.kind}</td>
                    <td>{measurementLabel(record)}</td>
                    <td>{measurementLabel(record, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  )
}
