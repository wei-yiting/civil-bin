# Supabase 與 Vercel 部署

目前預設仍是本機 localStorage。程式已提供真正的 Supabase adapter，但雲端資料表與帳號仍需初始化，尚未完成實際雲端流程驗收。設定雲端後，連線失敗會阻擋寫入，不會偷偷改存本機。本版改用尺寸板人工登記，不串接影像模型。

## 1. 建立 Supabase project

本機專案位置為 `/Users/dong.wyt/Documents/dev-projects/civil-bin`。`.env.local` 已被 Git 忽略；`.env.example` 不含真實設定。Project URL 使用 `https://PROJECT_REF.supabase.co`，不要包含 Data API 的 `/rest/v1/`。

1. 在 https://supabase.com/dashboard 建立新 project，保管 DB 密碼。
2. 到 Authentication → Sign In / Providers 啟用 Anonymous Sign-Ins。公開展示的 CAPTCHA 與用量限制需另外設定，本版尚未整合 CAPTCHA UI。
3. 到 SQL Editor 新增查詢，依序執行 `supabase/migrations/202610240001_civil_bin.sql`、`supabase/migrations/202610240002_size_board.sql`，各一次。它會建立業務資料表、RLS、交易 RPC、private 照片 bucket 與 Realtime publication。
4. 在 repo 執行 `npm run seed:cloud`，將生成的 `supabase/seed.sql` 貼入 SQL Editor 執行。預載 24 間虛構店家及多日交付與申報，不覆寫既有資料。示範 delivery ID 包含日期，同日不重複新增，隔日保留歷史。清空共享資料需由管理員明確操作。

已完成第一版初始化的專案，只執行 `002_size_board.sql` 與 `supabase/seed-sizes.sql`，不要重跑 `001`。新版新增 civil_size_claims、尺寸登記及確認權限，舊公升資料保留。

若要增加深夜可開放的虛構示範點，執行 `supabase/demo-open-hours.sql`。只更新無 owner、且仍是原始排程的 16 家示範店，已自訂或認領店家不變。

## 2. 建立 demo 店家、市府帳號

到 Authentication → Users → Add user 建立兩個 Email / Password 帳號，啟用 Auto Confirm。不要把密碼寫入 GitHub。複製各帳號 UUID，在 SQL Editor 執行（先替換 UUID）：

```sql
insert into public.civil_profiles(user_id, role)
values ('MERCHANT_USER_UUID'::uuid, 'merchant'), ('CITY_USER_UUID'::uuid, 'city');

update public.civil_stores
set owner_id = 'MERCHANT_USER_UUID'::uuid
where id = 'a';
```

店家帳號只能管理自己擁有的店家；可將多間 demo 店家指定給同一帳號。其餘未指定 owner 的虛構店家只供展示。新增店家功能也需要 merchant 身分，會自動設定 owner。city 只能寫查核紀錄，不能修改店家申報或任意確認交付；角色授權只能由 SQL Editor 等管理員管道設定。

## 3. 本機連線

在 Project Settings → API / Connect 找到 Project URL 與 publishable key。複製 `.env.example` 為 `.env.local` 並填入：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
```

只能使用 publishable key，不能使用 secret key 或 service_role。兩個變數都省略才是本機模式；只填一個會顯示設定錯誤。重新啟動 `npm run dev`。

民眾預設匿名登入；店家與市府使用頁面上方的 Supabase 連線面板登入。雲端模式下不能任意切換未授權角色。本機既有照片不會自動搬到雲端。

## 4. Vercel

1. 在 Vercel → Add New → Project 匯入 `wei-yiting/civil-bin`。
2. Framework 選 Vite，Build Command `npm run build`，Output Directory `dist`，Node.js 22。
3. Environment Variables 新增上述兩個 `VITE_SUPABASE_*`，套用 Production；Preview 建議使用另一個測試 Supabase project。
4. 不設定 `VITE_STATIC_DATA=true`，讓 Vercel `/api/public-bins` 提供官方位置即時更新。
5. Deploy。環境變數改動後須重新部署，因為 Vite 在 build 時讀取。
6. 使用 HTTPS 部署網址，在兩支手機與電腦測試：民眾交付、店家確認、店家停收、民眾刷新／即時停止收受、市府查看總量。匿名使用者無權直接管理店家或讀取別人的照片。

GitHub Pages 不會自動取得 Vercel 的環境變數；保留本機示範模式即可，避免把兩種 demo 混在一起。

## 資料與驗證邊界

- stores、deliveries、claims、reviews 分表保存，RPC 在單一交易中驗證授權及舊值，避免不同裝置整份覆寫。
- 確認／拒收只能由 pending 狀態轉換一次。店家停收與新增交付鎖定同一店家列，伺服器依臺北當日與每週時段重新判斷；畫面上的開放狀態不作為唯一依據。
- Realtime 事件觸發重新讀取；另每 30 秒補讀，恢復漏接事件並更新短效照片網址。這是 demo 級同步，沒有離線寫入佇列。
- 照片位於 private bucket，上傳限 5 MB JPEG／PNG／WebP，限本人、收受店家與市府授權讀取。失敗交易會嘗試刪除孤立上傳；管理員仍應定期清理未引用檔案。
- 全體可看到店家與申報量，以及預載示範紀錄；真實交付只供本人、收受店家與市府讀取。此 demo 不收姓名、電話；正式服務仍需要資料保存／刪除政策。
- seed 交付是虛構數值，附上既有示範插圖以呈現累計量。插圖不是實拍影像證據，不能將此資料聲稱為真實政府統計。
- 已在使用者 Supabase 與三個獨立本機 origin 實測匿名民眾送件、店家修正確認、每日申報與市府即時更新。實體手機與 Vercel 正式部署仍需另驗，詳見 docs/verification.md。

## 本機 DB 驗證

啟動 Docker 後執行 `npm run test:db`。它會建立未對外開放連接埠的暫存 PostgreSQL 16 容器，套用 migration，測試角色權限、照片路徑權限、交付確認、重複處理、申報衝突及停收阻擋，完成後刪除容器。測試使用簡化的 Auth／Storage schema，不能取代實際 Supabase 的 Auth、Storage、Realtime 驗證。

市府的清運情境是畫面試算，不會把假設值寫入共享店家或官方資料。

## 官方參考

- https://supabase.com/docs/reference/javascript/auth-signinanonymously
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
- https://supabase.com/docs/reference/javascript/subscribe
