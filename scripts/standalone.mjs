import { readFile, writeFile, readdir } from 'node:fs/promises'
import { resolve, basename } from 'node:path'

const directory = resolve('dist')
const assets = await readdir(resolve(directory, 'assets'))
if (assets.filter((file) => file.endsWith('.js')).length !== 1) {
  throw new Error('單檔輸出預期一個 JavaScript bundle；請先檢查拆分設定。')
}
let html = await readFile(resolve(directory, 'index.html'), 'utf8')
const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)
const css = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/)
if (!script || !css)
  throw new Error('無法找到 build 產生的 JavaScript 或 CSS。')
const javascript = await readFile(
  resolve(directory, 'assets', basename(script[1])),
  'utf8',
)
const stylesheet = await readFile(
  resolve(directory, 'assets', basename(css[1])),
  'utf8',
)
const icon = await readFile(resolve(directory, 'favicon.svg'), 'utf8')
html = html.replace(
  script[0],
  () =>
    `<script type="module">${javascript.replaceAll('</script', '<\\/script')}</script>`,
)
html = html.replace(css[0], () => `<style>${stylesheet}</style>`)
html = html.replace(
  /href="[^"]*favicon.svg"/,
  () => `href="data:image/svg+xml,${encodeURIComponent(icon)}"`,
)
await writeFile(resolve(directory, 'standalone.html'), html)
console.log('已產生 dist/standalone.html（程式與資料內嵌；真實底圖需連網）')
