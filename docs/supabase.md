# Supabase 與 Vercel 部署

兩個 env 均空白時使用本機 localStorage；目前使用者的 Supabase 已完成初始化與三個本機 origin 的雲端交付流程驗證。以下初始化步驟供新專案使用，不必重跑既有 migration。設定雲端後，連線失敗會阻擋寫入，不會偷偷改存本機。本版改用尺寸板人工登記，不串接影像模型。

## 1. 建立 Supabase project

本機專案位置為 `/Users/dong.wyt/Documents/dev-projects/civil-bin`。`.env.local` 已被 Git 忽略；`.env.example` 不含真實設定。Project URL 使用 `https://PROJECT_REF.supabase.co`，不要包含 Data API 的 `/rest/v1/`。

1. 在 https://supabase.com/dashboard 建立新 project，保管 DB 密碼。
2. 到 Authentication → Sign In / Providers 啟用 Anonymous Sign-Ins。公開展示的 CAPTCHA 與用量限制需另外設定，本版尚未整合 CAPTCHA UI。
3. 到 SQL Editor 新增查詢，依序執行 `supabase/migrations/202610240001_civil_bin.sql`、`supabase/migrations/202610240002_size_board.sql`，各一次。它會建立業務資料表、RLS、交易 RPC、private 照片 bucket 與 Realtime publication。
4. 在 repo 執行 `npm run seed:cloud`，將生成的 `supabase/seed.sql` 貼入 SQL Editor 執行。預載 270 間虛構店家及多日交付與申報，不覆寫既有資料。示範 delivery ID 包含日期，同日不重複新增，隔日保留歷史。清空共享資料需由管理員明確操作。

已完成第一版初始化的專案，只執行 `002_size_board.sql` 與 `supabase/seed-sizes.sql`，不要重跑 `001`。新版新增 civil_size_claims、尺寸登記及確認權限，舊公升資料保留。

若要增加深夜可開放的虛構示範點，執行 `supabase/demo-open-hours.sql`。只更新無 owner、且仍是原始排程的 16 家示範店，已自訂或認領店家不變。

擴充現有 24 家資料時，依序執行 `supabase/demo-expand-parts/part-01.sql` 到 `part-06.sql`，每次只貼一份。不要在 SQL Editor 貼整份 `demo-expand.sql`，因為會超過大小限制。詳見 [選點與匯入說明](demo-stores.md)。

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

現有正式站：https://civil-bin.vercel.app 。已設定 Production 的兩個 Supabase 公開變數，Node runtime 22。CLI 專案為 `dong-weis-projects/civil-bin`；`.vercel/` 保留本機連結但不進 Git。GitHub 連結未成功，現在 push 不會自動部署。

目前重部署方式：`npx vercel@65.2.0 deploy --prod --yes --scope dong-weis-projects`（須保有 Vercel 登入）。若未登入，先依 CLI 提示登入，勿將 token 放入前端 env。日後可在 Vercel Project Settings → Git 完成 GitHub repo 連結，才會啟用 push 自動部署。

以下為新專案的設定方式：

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
- 已在使用者 Supabase 與三個獨立本機 origin 實測匿名民眾送件、店家修正確認、每日申報與市府即時更新。正式站首頁、API 與合成照片交付已驗證；實體手機相機與正式站店家／市府登入後流程仍需接續驗證，詳見 docs/verification.md。

## 本機 DB 驗證

啟動 Docker 後執行 `npm run test:db`。它會建立未對外開放連接埠的暫存 PostgreSQL 16 容器，套用 migration，測試角色權限、照片路徑權限、交付確認、重複處理、申報衝突及停收阻擋，完成後刪除容器。測試使用簡化的 Auth／Storage schema，不能取代實際 Supabase 的 Auth、Storage、Realtime 驗證。

市府使用尺寸件數及加權比較，不將平面尺寸換算公升。

## 官方參考

- https://supabase.com/docs/reference/javascript/auth-signinanonymously
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/reference/javascript/storage-from-createsignedurl
- https://supabase.com/docs/reference/javascript/subscribe

## 同一瀏覽器展示三種角色

部署後可使用三個固定入口：`/?demoSession=citizen#citizen`、`/?demoSession=merchant#merchant`、`/?demoSession=city#city`。每個入口使用獨立登入儲存，避免同一瀏覽器的帳號互相取代；這只是展示登入隔離，實際角色與資料權限仍由 Supabase RLS／RPC 判斷。店家與市府各自首次登入一次即可，不用提供密碼給開發者。未帶參數的既有網址登入不受影響。
