export const SIZE_OPTIONS = [
  { id: 'S', label: '小件', widthCm: 10, heightCm: 15 },
  { id: 'M', label: '中件', widthCm: 15, heightCm: 20 },
  { id: 'L', label: '大件', widthCm: 20, heightCm: 30 },
] as const
export interface SizeMeasurement {
  boardVersion: 'street-v1'
  size: 'S' | 'M' | 'L'
  quantity: number
}
export type SizeCounts = { S: number; M: number; L: number }
export const emptySizeCounts = (): SizeCounts => ({ S: 0, M: 0, L: 0 })
export function validateMeasurement(
  value: unknown,
): asserts value is SizeMeasurement {
  const m = value as SizeMeasurement | null
  if (
    !m ||
    typeof m !== 'object' ||
    m.boardVersion !== 'street-v1' ||
    !SIZE_OPTIONS.some((s) => s.id === m.size) ||
    !Number.isInteger(m.quantity) ||
    m.quantity < 1 ||
    m.quantity > 99
  )
    throw new Error('請選擇有效的小件、中件或大件尺寸，件數須為 1–99 的整數。')
}
export function validateSizeCounts(
  value: unknown,
): asserts value is SizeCounts {
  const counts = value as SizeCounts | null
  if (
    !counts ||
    typeof counts !== 'object' ||
    Array.isArray(counts) ||
    Object.keys(counts).length !== 3 ||
    !(['S', 'M', 'L'] as const).every(
      (size) =>
        Number.isInteger(counts[size]) &&
        counts[size] >= 0 &&
        counts[size] <= 999,
    )
  )
    throw new Error('小件、中件與大件的申報件數須各為 0–999 的整數。')
}
export function measurementLabel(
  record: {
    measurement?: SizeMeasurement
    confirmedMeasurement?: SizeMeasurement
    liters: number
  },
  confirmed = false,
): string {
  const measurement = confirmed
    ? (record.confirmedMeasurement ?? record.measurement)
    : record.measurement
  if (!measurement) return `舊版體積示範：${record.liters.toFixed(1)} 公升`
  const size = SIZE_OPTIONS.find((option) => option.id === measurement.size)!
  return `${size.label} × ${measurement.quantity} 件（${size.widthCm} × ${size.heightCm} 公分內）`
}

export function weightedSizeCount(counts: SizeCounts): number {
  return counts.S + counts.M * 2 + counts.L * 4
}
