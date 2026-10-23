# Civil Bin｜我們的垃圾桶：公共清潔箱資料

## 來源與 snapshot

資料目錄：[政府資料開放平臺「臺北市行人專用清潔箱」](https://data.gov.tw/dataset/121355)。官方下載：

- [行人專用清潔箱主表（661 列）](https://data.taipei/api/dataset/a835f3ba-7f50-4b0d-91a6-9df128632d1c/resource/267d550f-c6ec-46e0-b8af-fd5a464eb098/download)
- [補充地標（130 列）](https://data.taipei/api/dataset/a835f3ba-7f50-4b0d-91a6-9df128632d1c/resource/2030d728-9597-437d-81a4-cf2a44c7f114/download)

本次實際擷取時間：2026-10-24 00:09:26（Asia/Taipei）；精確 UTC 時間保存在 `src/data/public-bins.json` 的 `fetchedAt`。這是下載時間，不代表市府逐點實地更新時間。兩檔實際均為 Big5，HTTP Content-Type 亦為 `text/csv;charset=BIG-5`，欄位為「行政區、地址、經度、緯度、備註」。程式先嘗試嚴格 UTF-8，再以 Big5 解碼，兼容官方未來更換編碼。

原始共 791 列，保留 773 個位置紀錄；排除 2 列無效座標，另去重 16 列。補充檔有「3處」「14處」等備註，一個地標可能對應多個清潔箱；地圖的點位紀錄數不能解讀為實體垃圾桶總數。市府清潔箱位置為真實開放資料，合作店家、收受紀錄和容量仍屬原型示範。

## 清理規則

- 空行忽略；缺少行政區、地址或座標、非數字座標、不在臺北合理範圍（緯度 24.9–25.25、經度 121.4–121.7）者排除。
- 相同經緯度（小數 6 位），或相同行政區與去空白地址者，保留第一筆。主表優先。
- 目前原始無效兩筆為：大同區「重慶北路三段88號對面公車專用道」的經度 `121.513.652`；中正區「公園路捷運台大站4號出入口)」的經緯度互換。原型不自行猜測更正官方座標。
- ID 以座標產生，不隨來源或 CSV 列順序變動。來源筆數、排除數、去重數隨 snapshot 保留。
- 此資料沒有即時滿溢、桶內容物、清運時間或垃圾量資訊。不可把點位密度視為真實剩餘容量，也不可把合作點的模擬容量套用到公共清潔箱。

## 更新與失敗處理

畫面立即載入隨專案內嵌的 snapshot，並向同來源 `/api/public-bins` 端點請求更新，瀏覽器不直接跨來源下載官方 CSV。回應必須是成功 HTTP status、JSON Content-Type，以及完整合法的兩來源資料格式，才標示為最新下載來源；404、HTML fallback、格式不符、離線或 8 秒 timeout 都保留上次完整資料並顯示警示。重新整理按鈕重試同來源端點。

`server/public-bins-handler.ts` 使用固定 allowlist 的兩份官方 URL，不讀取外部 URL query；只允許 GET。它由伺服器向官方完整下載兩份 CSV，8 秒 timeout，記憶體快取 1 小時，同時請求共用一批抓取，成功回應提供 `Cache-Control: public, max-age=60, s-maxage=3600`。任何上游失敗回傳 503 且不快取失敗；不會把 snapshot 冒充為 live，也不會只保留成功的一半來源。live 的時間表示本批完整官方資料的下載時間，快取仍保留原時間。

2026-10-24 使用帶有 `Origin: http://127.0.0.1:5173` 的實際 HTTP 回應檢查，官方檔案沒有 `Access-Control-Allow-Origin` 標頭。此限制透過正式同來源 Node.js 端點解決，不依賴第三方代理：本機 Vite development middleware 與 Vercel `api/public-bins.ts` 共用相同 handler。純靜態 preview、GitHub Pages 與 `file://` 單檔沒有 Node.js API，則明確顯示內嵌資料。單檔 HTML 內嵌同份 snapshot，無須連網即可顯示位置；Vercel 部署可提供完整更新功能。瀏覽器實測結果另見驗證紀錄。

維護者在 Node.js 22.12 以上（建議 22.23 或更新版本）執行：

```sh
npm ci
node --experimental-strip-types scripts/update-bins.mjs
npm run test
npm run build
```

更新腳本實際共下載兩來源，30 秒 timeout，檢查完成才覆寫 snapshot；任何來源失敗就退出，不覆寫舊檔。腳本與瀏覽器共用同一解析及去重邏輯。將更新後的 JSON commit / push 並重新部署，所有使用者即可取得更新後的內嵌資料。
