import { writeFile } from 'node:fs/promises'
import { fetchPublicBins } from '../src/bin-data.ts'

const snapshot = await fetchPublicBins(AbortSignal.timeout(30_000))
const destination = new URL('../src/data/public-bins.json', import.meta.url)
await writeFile(destination, JSON.stringify(snapshot) + '\n', 'utf8')
console.log(
  `更新 ${snapshot.bins.length} 個位置；篩除 ${snapshot.rejected} 筆，去重 ${snapshot.duplicates} 筆；${snapshot.fetchedAt}`,
)
