# 街角垃圾夥伴

用街角小店接住少量行人垃圾，讓代收需求成為公共垃圾桶配置與清運調查的線索。

繁體中文的黑客松互動原型，使用 React、TypeScript、Vite。三個角色使用同一份本機資料，重開頁面仍會保留，同網址的不同分頁會同步更新。

## 啟動

需要 Node.js 22.12 以上（建議 `nvm use`，本專案使用 22.23.4）與 npm。

```sh
git clone https://github.com/wei-yiting/street-corner-partner.git
cd street-corner-partner
npm ci
npm run dev
```

開啟終端顯示的 `http://localhost:5173`。開發過程都使用同一網址，`localhost` 與 `127.0.0.1` 的本機資料互不相通。

```sh
npm run lint
npm test
npm run build
npm run preview
```

`build` 會產生標準靜態網站 `dist/`，也會產生已內嵌程式、樣式與插圖的 `dist/standalone.html`。標準網站請透過 HTTP／HTTPS 開啟，勿直接雙擊 `dist/index.html`；它需要載入分開的 JavaScript 模組。單檔版是攜帶展示用途，正式 demo 優先用網址，瀏覽器的本機檔案儲存政策可能不同。

若顯示 Node 版本或原生套件錯誤，先 `nvm use` 再 `npm ci --include=optional`，不要沿用舊版 Node 安裝的 `node_modules`。

## 展示流程

1. 民眾端：選地圖標記或店家，載入示範照片或選取 JPEG／PNG／WebP，選垃圾類型與尺寸參考，執行「模擬 AI 體積估算」，送出紀錄。
2. 店家端：選相同店家，查看照片並確認收受，或選原因拒收。確認後，民眾端顯示結果，市府端重新計算照片佐證量。
3. 店家端：調整開放時段或暫停收受，民眾地圖立即反映；補登未拍照收受、填寫今日額外代收申報量。
4. 市府端：比較同日資料，篩選待查核、查看照片與紀錄、保存查核備註。改變垃圾桶距離、容量、清運次數及滿溢次數，觀察分析建議變化。
5. 頁尾可匯出 JSON 備份，或確認重設示範資料。匯出包含本機照片，請自行保管。

初始三家店為虛構，預設 00:00–23:59 方便展示；所有日期與時段皆以 Asia/Taipei 判定。示意地圖沒有真實座標、定位或路線導航。收受量僅限行人隨手垃圾，營業垃圾與家戶垃圾不納入。

## 資料與判讀界線

- **AI 完全模擬**：依垃圾類型預設體積區間，不讀取照片內容、不呼叫 AI API。照片有無參考物只改變預設區間，不能視為實測重量或公升數。
- 已收受照片才列入照片佐證；待確認、拒收與手動補登不列入。照片可能是插圖，種子資料與使用者示範交付均非驗證過的獨立證據。
- 未申報與填寫 0 公升有不同狀態。申報高於照片上界 125%，或低於下界 75%，提醒人工查核；有申報但沒有照片也提醒。這是可測試的展示規則，**不是已驗證的反詐方法**。
- 查核備註對應當時證據 fingerprint；申報或交付變更後不沿用舊備註遮蔽新問題。留下備註不會自動解除異常。
- 模擬需求採「已收受照片量＋手動量」與「店家申報」較大者，避免重複相加。量能為單桶容量 × 每日清運次數；沒有需求資料顯示未知。這不是整個街區的垃圾總產量，缺少垃圾桶既有垃圾量與長期觀測，不能直接做設施或補助決策。
- 照片縮至最長邊 900px 後存入 localStorage；檔案最多 8 MB。資料僅在同一瀏覽器同一來源共享，**跨裝置、不同訪客不共享**。沒有後端、帳號登入、角色授權、真實 AI、支付或市府 API。
- 本機儲存有容量限制；儲存失敗會告知且不顯示送出成功。清除瀏覽器資料會刪除紀錄。本機版採最後寫入結果，不支援多人同時編輯的交易保證。

## 測試

```sh
npx playwright install chromium
npm run build
npm run test:e2e
```

Playwright 測試桌機與手機 Chromium，涵蓋跨分頁共享、照片檔案持久化、收受／拒收、申報、查核、搜尋與地圖、時段、清運情境、匯出重設及水平溢出。首次開發已先觀察未實作流程測試失敗，再實作通過；計算邏輯使用 Vitest。失敗時保留 screenshot、video，CI 重試時保留 trace。

`docs/screenshots/` 為示範資料的實測畫面；`docs/diagnosis.md` 記錄原版檔案檢查與尚未重現的限制。

## 維護結構

| 檔案                            | 責任                               |
| ------------------------------- | ---------------------------------- |
| `src/Citizen.tsx`               | 地圖、拍照、模擬估算、交付狀態     |
| `src/Merchant.tsx`              | 收受、拒收、時段、手動登記、申報   |
| `src/City.tsx`                  | 交叉比對、查核備註、量能情境       |
| `src/domain.ts`                 | 純函式：日期、聚合、異常、量能分析 |
| `src/persistence.ts`            | 版本化本機資料與跨分頁通知         |
| `src/photo.ts`                  | 格式驗證、縮圖與示範插圖           |
| `src/ui.tsx` / `src/actions.ts` | 共用視覺元件、儲存錯誤處理         |
| `originals/`                    | 未修改的原版 HTML，保留來源        |

## 部署

本專案設定相對資源路徑，可部署在 GitHub Pages 子路徑或 Vercel／Netlify 根目錄。路由使用 hash，不需伺服器 rewrite。

- **GitHub Pages**：repo 的 Settings → Pages → Source 選 GitHub Actions，再到 Actions 手動執行 `Deploy Pages`。workflow 先 lint／test／build，再透過官方 Pages actions 發佈 `dist/`。`Verify` workflow 在 main push／PR 執行完整驗證。`Deploy Pages` 目前採手動觸發，避免每次改動直接上線。
- **Vercel／Netlify**：匯入 repo，build command 設為 `npm run build`，output directory 設 `dist`，Node.js 設為 22。無需環境變數。
- **手機展示**：HTTPS 部署後用手機瀏覽網址；拍照介面依瀏覽器提供相機或檔案選擇。由於各裝置資料獨立，三端請在同一裝置切換角色示範。

若要擴充為多人試辦，下一步應加入資料庫、照片物件儲存、真實身分與店家權限、重複照片檢查、獨立清運核驗與觀測資料。先明確界定採集方式與誤差，再接入真正的體積模型。

官方參考：[Vite 部署](https://vite.dev/guide/static-deploy.html)、[React 外部資料訂閱](https://react.dev/reference/react/useSyncExternalStore)、[GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
