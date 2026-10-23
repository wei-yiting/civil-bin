import Papa from 'papaparse'

export interface PublicBin {
  id: string
  district: string
  address: string
  lat: number
  lng: number
  note: string
}
export interface BinParseResult {
  bins: PublicBin[]
  rejected: number
  duplicates: number
}
export interface BinSnapshot extends BinParseResult {
  fetchedAt: string
  sources: { url: string; label: string; count: number }[]
}
export const PUBLIC_BIN_SOURCES = [
  {
    id: 'street',
    label: '臺北市行人專用清潔箱主表',
    url: 'https://data.taipei/api/dataset/a835f3ba-7f50-4b0d-91a6-9df128632d1c/resource/267d550f-c6ec-46e0-b8af-fd5a464eb098/download',
  },
  {
    id: 'landmark',
    label: '臺北市行人專用清潔箱補充地標',
    url: 'https://data.taipei/api/dataset/a835f3ba-7f50-4b0d-91a6-9df128632d1c/resource/2030d728-9597-437d-81a4-cf2a44c7f114/download',
  },
] as const

export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('big5', { fatal: true }).decode(buffer)
  }
}

export function mergeBins(parts: BinParseResult[]): BinParseResult {
  const bins: PublicBin[] = []
  const coordinates = new Set<string>()
  const addresses = new Set<string>()
  let duplicates = parts.reduce((sum, part) => sum + part.duplicates, 0)
  for (const bin of parts.flatMap((part) => part.bins)) {
    const coordinate = `${bin.lat.toFixed(6)},${bin.lng.toFixed(6)}`
    const address = `${bin.district}:${bin.address.replace(/\s/g, '')}`
    if (coordinates.has(coordinate) || addresses.has(address)) {
      duplicates++
      continue
    }
    coordinates.add(coordinate)
    addresses.add(address)
    bins.push(bin)
  }
  return {
    bins,
    rejected: parts.reduce((sum, part) => sum + part.rejected, 0),
    duplicates,
  }
}

export function parseBins(csv: string, _sourceId = 'taipei'): BinParseResult {
  const parsed = Papa.parse<Record<string, string>>(
    csv.replace(/^\uFEFF/, ''),
    {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => header.trim(),
    },
  )
  const required = ['行政區', '地址', '經度', '緯度', '備註']
  if (!required.every((field) => parsed.meta.fields?.includes(field))) {
    throw new Error('官方清潔箱資料欄位不符，保留前次資料')
  }
  const bins: PublicBin[] = []
  let rejected = 0
  for (const row of parsed.data) {
    const latText = row['緯度']?.trim() ?? ''
    const lngText = row['經度']?.trim() ?? ''
    const lat = Number(latText)
    const lng = Number(lngText)
    const district = row['行政區']?.trim() ?? ''
    const address = row['地址']?.trim() ?? ''
    if (
      !latText ||
      !lngText ||
      !district ||
      !address ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < 24.9 ||
      lat > 25.25 ||
      lng < 121.4 ||
      lng > 121.7 ||
      row.__parsed_extra
    ) {
      rejected++
      continue
    }
    bins.push({
      id: `taipei-${lat.toFixed(7)}-${lng.toFixed(7)}`,
      district,
      address,
      lat,
      lng,
      note: row['備註']?.trim() ?? '',
    })
  }
  return mergeBins([{ bins, rejected, duplicates: 0 }])
}

export async function fetchPublicBins(
  signal: AbortSignal,
): Promise<BinSnapshot> {
  const results = await Promise.all(
    PUBLIC_BIN_SOURCES.map(async (source) => {
      const response = await fetch(source.url, { signal })
      if (!response.ok)
        throw new Error(`官方資料下載失敗（${response.status}）`)
      const result = parseBins(
        decodeCsvBuffer(await response.arrayBuffer()),
        source.id,
      )
      if (!result.bins.length)
        throw new Error('官方資料沒有有效位置，保留前次資料')
      return { source, result }
    }),
  )
  return {
    ...mergeBins(results.map(({ result }) => result)),
    fetchedAt: new Date().toISOString(),
    sources: results.map(({ source, result }) => ({
      url: source.url,
      label: source.label,
      count: result.bins.length + result.rejected + result.duplicates,
    })),
  }
}

export function isBinSnapshot(value: unknown): value is BinSnapshot {
  if (!value || typeof value !== 'object') return false
  const data = value as Partial<BinSnapshot>
  return (
    typeof data.fetchedAt === 'string' &&
    Number.isFinite(Date.parse(data.fetchedAt)) &&
    Number.isInteger(data.rejected) &&
    Number(data.rejected) >= 0 &&
    Number.isInteger(data.duplicates) &&
    Number(data.duplicates) >= 0 &&
    Array.isArray(data.sources) &&
    data.sources.length === PUBLIC_BIN_SOURCES.length &&
    PUBLIC_BIN_SOURCES.every((official) =>
      data.sources?.some(
        (source) =>
          source &&
          source.url === official.url &&
          typeof source.label === 'string' &&
          Number.isInteger(source.count) &&
          source.count >= 0,
      ),
    ) &&
    Array.isArray(data.bins) &&
    data.bins.length > 0 &&
    data.bins.every(
      (bin) =>
        bin &&
        typeof bin.id === 'string' &&
        typeof bin.address === 'string' &&
        typeof bin.district === 'string' &&
        typeof bin.note === 'string' &&
        typeof bin.lat === 'number' &&
        Number.isFinite(bin.lat) &&
        bin.lat >= 24.9 &&
        bin.lat <= 25.25 &&
        typeof bin.lng === 'number' &&
        Number.isFinite(bin.lng) &&
        bin.lng >= 121.4 &&
        bin.lng <= 121.7,
    )
  )
}
