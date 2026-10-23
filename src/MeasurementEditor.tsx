import sizeBoard from './assets/size-board.svg?inline'
import { SIZE_OPTIONS } from './domain'
import type { SizeMeasurement } from './domain'

export function MeasurementEditor({
  value,
  onChange,
  prefix = '交付',
}: {
  value: SizeMeasurement
  onChange: (next: SizeMeasurement) => void
  prefix?: string
}) {
  return (
    <div className="fields measurement-editor">
      <label>
        {prefix}尺寸級距
        <select
          aria-label={`${prefix}尺寸級距`}
          value={value.size}
          onChange={(event) =>
            onChange({
              ...value,
              size: event.target.value as SizeMeasurement['size'],
            })
          }
        >
          {SIZE_OPTIONS.map((size) => (
            <option key={size.id} value={size.id}>
              {size.label}・{size.widthCm} × {size.heightCm} 公分內
            </option>
          ))}
        </select>
      </label>
      <label>
        {prefix}件數
        <input
          type="number"
          aria-label={`${prefix}件數`}
          min="1"
          max="99"
          step="1"
          required
          value={value.quantity}
          onChange={(event) =>
            onChange({ ...value, quantity: Number(event.target.value) })
          }
        />
      </label>
    </div>
  )
}
export function SizeBoardGuide() {
  return (
    <details className="size-board-guide">
      <summary>如何使用隨手垃圾尺寸板？</summary>
      <img
        src={sizeBoard}
        alt="隨手垃圾尺寸板：小件10乘15、中件15乘20、大件20乘30公分的共用左下角對照框"
      />
      <p>
        每件垃圾完整放入最小可容納的框內，對齊左下角後比較長寬；不同級距請分筆登記。件數以實際分開交付的容器或包件計算，不拆分杯蓋等零件重複計數。
      </p>
      <p>
        超過最大框、家戶垃圾與危險物品不適用。這是試辦用的平面尺寸分級，不代表體積、重量或正式收受規範。
      </p>
      <a
        className="text-button"
        href={sizeBoard}
        download="civil-bin-size-board-v1.svg"
      >
        下載尺寸板原稿（23 × 35 公分）
      </a>
      <p className="mini-note">
        依原尺寸 100% 印製，確認下方校正線長 10
        公分；不要使用「符合頁面」縮放。畫面上的預覽不可當實體比例尺。
      </p>
    </details>
  )
}
