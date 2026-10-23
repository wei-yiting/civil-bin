# Civil Bin｜我們的垃圾桶

以手機為主的行人垃圾服務原型：民眾在可拖曳的真實地圖上找合作小店與公共清潔箱；店家登錄地址、位置與時段並確認交付；市府在大螢幕地圖比較各地收受量與公共設施分布。

使用 React、TypeScript、Vite、Leaflet 1.9.4 與 OpenStreetMap 底圖。地圖不需要 Google Maps API key；參考 `debugthon-carpool` 的地圖封裝與圖層分離方式，未沿用其他專案的金鑰。

## 立即啟動

需要 Node.js 22.12 以上與 npm（本專案使用 22.23.4，可先 `nvm use`）。

```sh
git clone https://github.com/wei-yiting/civil-bin.git
cd civil-bin
npm ci
npm run dev
```

開啟終端顯示的 `http://localhost:5173`。`localhost` 與 `127.0.0.1` 的本機資料不同，示範時請固定使用同一個網址。此開發伺服器包含官方位置資料的同來源 API。

```sh
npm run format:check
npm run lint
npm test
npm run build
npm run preview
```

`dist/` 是標準網站，`dist/standalone.html` 是內嵌程式、樣式與位置快照的攜帶版本。**真實底圖需要連網**，不會大量預先下載圖磚。標準 `dist/index.html` 請透過 HTTP／HTTPS 開啟；不要直接雙擊取代網站伺服器。單檔版本的本機儲存及定位能力依瀏覽器而異，手機展示建議使用 HTTPS 網址。

## 資料模式與雲端部署

本機專案位於 `/Users/dong.wyt/Documents/dev-projects/civil-bin`。提供 24 家、涵蓋臺北市 12 個行政區的虛構示範店家及多日交付紀錄；不代表現場真實提供服務。

- `.env.local` 保存自己的設定並被 Git 忽略；GitHub 僅追蹤 `.env.example`。
- `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_PUBLISHABLE_KEY` 都空白時使用 localStorage；填入後使用 Supabase，連線失敗不改存本機。
- [Supabase／Vercel 部署說明](docs/supabase.md) 包含 SQL 初始化、照片 Storage、匿名身分、店家／市府帳號授權與 Vercel 環境變數。
- `npm run seed:cloud` 生成 demo SQL；`npm run test:db` 使用 Docker 建立隔離 PostgreSQL 驗證權限與主要資料流程。
- 使用尺寸板人工填寫與店家確認，不使用 AI、不由尺寸換算公升。

## 尺寸板

[尺寸板原稿](src/assets/size-board.svg) 為 23 × 35 公分，含小／中／大三框及 10 公分校正線。以原尺寸 100% 印製，勿使用符合頁面縮放；畫面預覽不能當比例尺。每件對齊左下角，以完整容納的最小框分類，不同級距分筆登記，超過最大框及家戶垃圾不適用。這是試辦用分類，不是官方收受規範。

店家確認可修正尺寸及件數，保留民眾原填；市府按各級件數觀察差異。現有 Supabase 升級需先執行 `supabase/migrations/202610240002_size_board.sql`，再匯入 `supabase/seed-sizes.sql`。

## 三種角色

### 民眾：先找得到，再交付

- 手機介面以地圖為首頁，支援觸控拖曳、縮放、搜尋店家與搜尋目前區域。
- 點「我的位置」才請求瀏覽器定位，顯示定位精度；拒絕、逾時或不支援時仍能移動地圖，**不會將預設臺北中心冒充使用者位置**。
- 合作店家與官方清潔箱為不同圖層；1 公里內的收受中店家與官方位置混合按直線距離排序，接著是今日交付紀錄，最後才是遠處／未開放據點。距離不當成步行路線或時間。
- 點選合作點後開啟拍照交付面板，選取 JPEG／PNG／WebP 或示範插圖，依實體尺寸板選擇小／中／大件與件數，確認完整放入所選框後送出。
- 交付結果與店家端同步；個人紀錄排除預載示範資料。底部提供地圖、拍照及紀錄入口。

### 店家：登錄自己的小店

- 點「登錄我的店家」，填寫店名、臺北市行政區、地址與收受時段。
- 在地圖點選門牌位置，必要時展開「手動輸入精確座標」。地址目前不會自動地理編碼，需確認地圖標記與門牌相符。
- 新登錄的店家會出現在民眾與市府地圖；重新載入仍保留。未提供的申報、清運容量等資料顯示未知，不填入假零量。
- 管理當日全部交付照片、確認收受或附原因拒收，另可補登未拍照收受及每日申報。確認後自動切換已收受紀錄，新交付優先顯示。完成今日結算可同時送出申報並停收，不代表清運已完成。
- 每週七天獨立設定收受時段與休息日，支援跨午夜。今日臨時停收與原因即時同步，換日恢復每週時段；可隨時解除當日停收。
- 預設為本機展示；設定 Supabase 後，店家帳號只可管理本人據點。登記不代表市府核准。

### 市府：一張地圖理解全區

- 臺北市全區地圖疊加官方清潔箱與合作收受點，可切行政區、圖層及店家確認／每日申報件數。
- 點店家標記可連動查核，檢視周邊 500 公尺內設置位置數與最近清潔箱距離。
- 可切換日期觀察平日／假日，檢視收受時段、每小時件數與逐筆時間，並保留照片佐證、查核備註與申報差異提醒。
- 數據圖層不含官方即時垃圾量、桶容量、滿溢或清運班次；這些不能從位置 CSV 推算為已知事實。

## 真實公共清潔箱資料

來源：[臺北市行人專用清潔箱，data.gov.tw 121355](https://data.gov.tw/dataset/121355)，提供機關為臺北市政府環境保護局，適用政府資料開放授權條款第 1 版。

目前擷取的主表 661 列、補充地標 130 列，經驗證與去重後為 **773 個設置位置**；排除 2 筆無效座標、去重 16 筆。補充地標有些涵蓋多個清潔箱，因此「位置數」不等於實體桶數。原始 CSV 為 Big5，程式會正確解碼。

- 瀏覽器讀取同來源 `api/public-bins`，伺服器從固定的兩個官方下載網址取得完整資料；不接受任意外部 URL。
- 端點設有 8 秒逾時、同時請求合併與最多 1 小時快取，避免每位使用者重複下載官方資料。
- 網路、格式、任一來源或 API 失敗時保留完整內嵌快照，畫面會標示來源與**擷取時間**，不偽稱即時。
- 純靜態部署（GitHub Pages／直接上傳 dist）使用快照；Vercel 的 Node API 或本機開發版可從官方更新。

更新內嵌位置資料：

```sh
npm run data:update
npm run build
```

細節、原始下載 URL、排除規則與實測結果見 [公共資料紀錄](docs/public-bins.md)。

## 哪些仍為模擬

- 24 家初始店家、其座標位置、交付與數量都是虛構示範，介面明確標示；官方清潔箱位置是真實開放資料。
- 新版沒有 AI 估算操作。尺寸板級距為試辦設定：小件 10 × 15、中件 15 × 20、大件 20 × 30 公分；記錄平面外框與件數，不是體積或重量。照片依模式存入 localStorage 或 Supabase private Storage。
- 新件數統計只計已收受；原填與店家確認分開保留。每日申報與逐筆確認件數不符只提示核對，不判定違規。店家補登沒有民眾照片佐證。
- 目前介面只呈現尺寸件數；資料庫保留舊欄位供相容，但不顯示舊公升紀錄或計算。新證據出現後，查核紀錄仍依目前證據版本區分。
- 模擬需求採「照片估計＋手動量」與「申報量」較大者，量能為假設單桶容量 × 清運次數。此分析仍缺真實垃圾量與長期觀測。
- 未設定 Supabase 時，照片、店家、交付與申報僅限同一瀏覽器分頁共享。設定並初始化 Supabase 後可跨裝置共享，照片與操作依登入身分授權。使用者定位不寫入業務資料或匯出檔。
- 舊版資料會遷移至新版保留；無座標的舊店不會被隨便放到地圖上。清除瀏覽器資料會刪除紀錄，頁尾可先匯出 JSON 備份（包含照片）。

## 測試與維護

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

測試涵蓋地理距離、CSV 解碼與清洗、資料遷移、店家登錄、API 快取與失敗、手機定位允許／拒絕、地圖移動縮放、跨角色資料同步及原有交付查核流程。自動測試使用圖磚替身與真實資料快照，避免對公共圖磚服務產生測試流量；實際底圖與同來源 API 另以瀏覽器檢查。

| 位置                                        | 責任                                   |
| ------------------------------------------- | -------------------------------------- |
| `src/GeoMap.tsx`                            | Leaflet 底圖、定位、店家與清潔箱圖層   |
| `src/Citizen.tsx` / `src/mobile.css`        | 手機地圖首頁、交付面板與底部導航       |
| `src/Merchant.tsx` / `src/Registration.tsx` | 店家登錄與收受管理                     |
| `src/CityMapPanel.tsx` / `src/City.tsx`     | 市府全區地圖、日期、時段分析與比對查核 |
| `src/domain.ts` / `src/geo.ts`              | 可獨立測試的業務與距離計算             |
| `src/persistence.ts`                        | 本機／雲端模式、同步與舊資料遷移       |
| `src/bin-data.ts` / `src/usePublicBins.ts`  | 官方 CSV 與前端快照切換                |
| `server/` / `api/public-bins.ts`            | 官方位置資料的同來源端點               |
| `scripts/update-bins.mjs`                   | 更新內嵌官方資料                       |
| `originals/`                                | 未修改的最初街角垃圾夥伴 HTML          |

## 部署與手機使用

- **Vercel**：匯入 repo，Node 22，build command `npm run build`，output directory `dist`。`api/public-bins.ts` 提供 Node 資料端點，前端可連線更新。此路徑依官方介面準備，本次未宣稱已部署 Vercel。
- **GitHub Pages**：Settings → Pages → Source 選 GitHub Actions，執行 `Deploy Pages`。提供公開 HTTPS 與真實底圖，位置資料使用附擷取時間的內嵌快照。
- **一般靜態主機／Netlify**：部署 `dist` 可使用快照；若要最新位置端點，須另配置符合 `api/public-bins` 契約的 Node 服務，不能假設 Vercel 的 api 會在其他主機自動運作。
- **手機**：使用 HTTPS 網址以取得定位能力；將筆電的 localhost 網址貼到手機不會連到筆電。未設定 Supabase 時，手機與筆電資料各自獨立；跨裝置展示須完成 Supabase 初始化。

官方參考：[Leaflet API](https://leafletjs.com/reference.html)、[OpenStreetMap 圖磚使用政策](https://operations.osmfoundation.org/policies/tiles/)、[Vite](https://vite.dev/guide/)、[Vercel Node Functions](https://vercel.com/docs/functions/runtimes/node-js)。
