import { readFile, writeFile } from 'node:fs/promises'

// 商圈中心與候選點為情境假設；距離僅依公開清潔箱座標計算，沒有引用人流統計。
const centers = [
  ['中正區', '臺北車站南側', 25.045, 121.516],
  ['中正區', '南門市場', 25.031, 121.518],
  ['大同區', '延三商圈', 25.066, 121.511],
  ['大同區', '寧夏商圈', 25.057, 121.515],
  ['中山區', '晴光商圈', 25.065, 121.526],
  ['中山區', '行天宮商圈', 25.06, 121.534],
  ['松山區', '南京三民商圈', 25.052, 121.563],
  ['松山區', '饒河商圈', 25.05, 121.573],
  ['大安區', '公館商圈', 25.016, 121.535],
  ['大安區', '科技大樓商圈', 25.027, 121.543],
  ['萬華區', '西門商圈', 25.043, 121.504],
  ['萬華區', '龍山寺商圈', 25.035, 121.5],
  ['信義區', '永春商圈', 25.04, 121.576],
  ['信義區', '吳興商圈', 25.029, 121.562],
  ['士林區', '士林站商圈', 25.094, 121.526],
  ['士林區', '芝山站商圈', 25.103, 121.523],
  ['北投區', '北投市場', 25.132, 121.5],
  ['北投區', '石牌商圈', 25.114, 121.516],
  ['內湖區', '港墘商圈', 25.081, 121.577],
  ['內湖區', '東湖商圈', 25.068, 121.613],
  ['南港區', '南港站商圈', 25.053, 121.607],
  ['南港區', '後山埤商圈', 25.045, 121.583],
  ['文山區', '景美商圈', 24.992, 121.541],
  ['文山區', '木柵市場', 24.988, 121.57],
]
const legacy = [
  ['中正區', '公園口', '25.034', '121.518'],
  ['中正區', '書街', '25.043', '121.515'],
  ['大同區', '老街', '25.058', '121.51'],
  ['大同區', '河岸', '25.074', '121.512'],
  ['中山區', '樹蔭', '25.064', '121.525'],
  ['中山區', '晴光', '25.066', '121.53'],
  ['松山區', '綠巷', '25.051', '121.559'],
  ['松山區', '車站邊', '25.05', '121.577'],
  ['大安區', '學院', '25.026', '121.543'],
  ['大安區', '花園', '25.033', '121.535'],
  ['萬華區', '街角', '25.035', '121.499'],
  ['萬華區', '南園', '25.024', '121.497'],
  ['信義區', '山腳', '25.028', '121.568'],
  ['信義區', '廣場', '25.038', '121.566'],
  ['士林區', '文林', '25.09', '121.525'],
  ['士林區', '溪畔', '25.105', '121.529'],
  ['北投區', '溫泉', '25.133', '121.502'],
  ['內湖區', '湖畔', '25.083', '121.578'],
  ['內湖區', '科園', '25.078', '121.565'],
  ['南港區', '東站', '25.053', '121.607'],
  ['文山區', '茶香', '24.993', '121.569'],
]
const bins = JSON.parse(
  await readFile(
    new URL('../src/data/public-bins.json', import.meta.url),
    'utf8',
  ),
).bins
let rng = 20261024
const random = () =>
  (rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0) / 4294967296
const distance = (a, b) => {
  const r = Math.PI / 180
  const arc =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lng - a.lng) * r) / 2) ** 2
  return 6371000 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc))
}
const nearest = (point) =>
  Math.round(Math.min(...bins.map((bin) => distance(point, bin))))
const first = [
  ['a', '阿明早餐店', '中山區', 25.0588, 121.5434, '民生東路商圈'],
  ['b', '惠姐雜貨店', '松山區', 25.0572, 121.547, '市場周邊'],
  ['c', '小林豆漿', '中山區', 25.0552, 121.5406, '住宅街口'],
]
const prefixes = [
  '禾日',
  '杏花',
  '拾光',
  '暖巷',
  '青柚',
  '山嵐',
  '木木',
  '春樹',
  '米香',
  '鹿角',
  '小島',
  '橙月',
  '森野',
  '日常',
  '福來',
  '阿惠',
  '阿哲',
  '雨豆',
  '花間',
  '好拾',
  '清晨',
  '老葉',
  '晴田',
  '滿福',
  '沐禾',
  '禾谷',
  '樹下',
  '雙喜',
  '阿川',
  '一口',
  '阿芬',
  '玉蘭',
  '阿勝',
  '竹青',
  '小葉',
  '橘屋',
]
const types = [
  '早餐店',
  '咖啡館',
  '麵包坊',
  '茶飲舖',
  '雜貨店',
  '便當店',
  '豆花店',
  '飯糰舖',
  '果汁吧',
  '水餃館',
  '文具行',
  '花店',
]
const combinations = prefixes.flatMap((prefix) =>
  types.map((type) => prefix + type),
)
for (let i = combinations.length - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1))
  ;[combinations[i], combinations[j]] = [combinations[j], combinations[i]]
}
const make = (id, name, area, lat, lng, hub, reason) => ({
  id,
  name,
  area,
  address: `臺北市${area}${hub}附近（虛構店家，非實際收受地址）`,
  lat,
  lng,
  binDistance: nearest({ lat, lng }),
  selectionReason: reason,
})
const stores = first.map(([id, name, area, lat, lng, hub]) =>
  make(id, name, area, lat, lng, hub, '既有情境據點'),
)
legacy.forEach(([area, hub, lat, lng], index) =>
  stores.push(
    make(
      `demo-${String(index + 1).padStart(2, '0')}`,
      combinations.pop(),
      area,
      Number(lat),
      Number(lng),
      hub,
      '既有情境據點',
    ),
  ),
)
const districts = [...new Set(centers.map((c) => c[0]))]
for (const [districtIndex, area] of districts.entries()) {
  const target = districtIndex < 6 ? 21 : 20
  const hubs = centers.filter((c) => c[0] === area)
  const candidates = []
  for (const [, hub, lat, lng] of hubs)
    for (let i = 0; i < 1000; i++) {
      const angle = random() * Math.PI * 2,
        radius = Math.sqrt(random()) * 380
      const point = {
        lat: Number((lat + (Math.sin(angle) * radius) / 111195).toFixed(7)),
        lng: Number(
          (
            lng +
            (Math.cos(angle) * radius) /
              (111195 * Math.cos((lat * Math.PI) / 180))
          ).toFixed(7),
        ),
      }
      candidates.push({
        ...point,
        hub,
        binDistance: nearest(point),
        order: random(),
      })
    }
  for (let n = 0; n < target; n++) {
    const gap = n % 4 !== 3
    const options = candidates.filter((p) =>
      stores.every((s) => distance(p, s) >= 85),
    )
    options.sort((a, b) => {
      const rank = (p) =>
        gap
          ? (p.binDistance >= 150 ? 0 : 1000) + Math.abs(p.binDistance - 250)
          : p.order * 500
      return rank(a) - rank(b)
    })
    const point = options[0]
    if (!point) throw new Error(`候選點不足：${area}`)
    stores.push(
      make(
        `demo-${String(stores.length - 2).padStart(2, '0')}`,
        combinations.pop(),
        area,
        point.lat,
        point.lng,
        point.hub,
        gap && point.binDistance >= 150
          ? '公開清潔箱較遠的商圈周邊情境點'
          : '商圈需求假設點（未使用人流統計）',
      ),
    )
  }
}
if (stores.length !== 270 || new Set(stores.map((s) => s.name)).size !== 270)
  throw new Error('店家數或名稱不符')
await writeFile(
  new URL('../src/data/demo-stores.json', import.meta.url),
  JSON.stringify(stores, null, 2) + '\n',
)
console.log(
  JSON.stringify(
    {
      stores: stores.length,
      publicBins: bins.length,
      districts: Object.fromEntries(
        districts.map((area) => [
          area,
          stores.filter((s) => s.area === area).length,
        ]),
      ),
      newGapPoints: stores.slice(24).filter((s) => s.binDistance >= 150).length,
      newMinDistance: Math.min(...stores.slice(24).map((s) => s.binDistance)),
      newMaxDistance: Math.max(...stores.slice(24).map((s) => s.binDistance)),
    },
    null,
    2,
  ),
)
