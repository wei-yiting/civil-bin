import { WEEKDAYS } from './domain'
import type { WeeklyHours } from './domain'

export function WeeklyHoursEditor({
  value,
  onChange,
}: {
  value: WeeklyHours
  onChange: (value: WeeklyHours) => void
}) {
  function edit(index: number, patch: Partial<WeeklyHours[number]>) {
    onChange(value.map((day, i) => (i === index ? { ...day, ...patch } : day)))
  }
  return (
    <fieldset className="weekly-hours">
      <legend>每週收受時段</legend>
      <p className="mini-note">
        以臺北時間計算。結束早於開始表示跨到隔日；開始與結束不可相同。休息日仍可承接前一晚的跨日時段。
      </p>
      {[1, 2, 3, 4, 5, 6, 0].map((index) => (
        <div className="weekly-row" key={index}>
          <label className="check-label">
            <input
              type="checkbox"
              checked={!value[index].closed}
              onChange={(e) => edit(index, { closed: !e.target.checked })}
            />
            {WEEKDAYS[index]}收受
          </label>
          <div className="weekly-times">
            <label>
              <span className="sr-only">{WEEKDAYS[index]}開始時間</span>
              <input
                type="time"
                required={!value[index].closed}
                disabled={value[index].closed}
                value={value[index].start}
                onChange={(e) => edit(index, { start: e.target.value })}
              />
            </label>
            <span aria-hidden="true">–</span>
            <label>
              <span className="sr-only">{WEEKDAYS[index]}結束時間</span>
              <input
                type="time"
                required={!value[index].closed}
                disabled={value[index].closed}
                value={value[index].end}
                onChange={(e) => edit(index, { end: e.target.value })}
              />
            </label>
          </div>
          {value[index].closed && <small className="muted">休息</small>}
        </div>
      ))}
    </fieldset>
  )
}
