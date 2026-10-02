<!-- AUTO-GENERATED from CLAUDE.md by the sync-agent-rules skill. Do NOT edit directly — edit CLAUDE.md and re-run sync. -->

# CLAUDE.md

給 Claude Code（claude.ai/code）在這個 repo 工作時的指引。

## 這是什麼

**v-conf-gallery** —— Vconf Taiwan 的活動照片 Gallery，獨立於官網（`v-conf.vue.tw`，另一個 repo、Nuxt 3 + Vercel）之外。
Nuxt 4 + Tailwind v4，部署在 **Vercel**（公開頁面預渲染成靜態檔，單張照片深連結與 JSON API 走 Vercel Function），
**照片本身在 Cloudinary**，由它的 CDN 直接送給訪客，完全不經過我們的伺服器。
規模：5~15 個相簿、300~1000 張照片，活動後一次批次上傳 100~500 張。

GitHub repo `vconf/vconf-gallery` 已連上 Vercel 專案 `vconf-gallery`：push 到 `main` 即部署正式站
（`https://vconf-gallery.vercel.app`），其他分支產生 Preview。

內容的真相來源仍是 **Cloudflare D1**，但它只在本機的匯入流程裡用到，網站執行時完全不碰：
匯入腳本 → 套進 D1 → `pnpm snapshot` 倒成 `server/assets/gallery.json` → commit → Vercel build 讀這份檔案。
Vercel 上沒有 wrangler 登入，所以 **build 不會自己去撈 D1**，忘了跑 snapshot 就是部署舊內容。

完整規劃在 `~/.claude/plans/vconf-taiwan-gallery-lexical-leaf.md`。

## 指令

```bash
pnpm dev                 # Nuxt dev
pnpm build               # 本機產出 .output（node-server）；在 Vercel 上會自動偵測成 vercel preset
pnpm lint / lint:fix
pnpm snapshot            # 從正式 D1 倒出 server/assets/gallery.json（需要 wrangler 登入，只在本機跑）
pnpm db:migrate:local    # 套用 migrations 到本機 D1
pnpm db:migrate          # 套用到正式 D1
vercel deploy            # 手動部署 Preview（平常 push 就會自動部署，加 --prod 是正式站）
```

Node 20+、pnpm。沒有測試框架。

## 不可違反的規則

這些不是風格偏好，是查證過官方限制後的結論。改動前請先讀對應理由。

### 1. 圖片不經過我們的伺服器

`<img>` 直接指向 `res.cloudinary.com`，URL 一律用 `shared/utils/photo.ts` 的 `photoUrl()` 組。
**不要**做 `/img/...` 之類的代理路由。

理由：
1. Cloudinary 自帶 CDN 與即時轉檔，額度與 Vercel 分開計算。圖片若改走 Vercel（代理路由或 Vercel Image Optimization），
   流量與 Function 呼叫都會吃 Vercel Hobby 的月額度，而圖片正是流量的大宗。
2. 一頁 30 張縮圖走自家路由就是 31 次請求；走 Cloudinary 只剩 1 次。
3. 不用綁信用卡是這個專案的前提（當初在 Cloudflare 也是因此不用 R2）。

流量（bandwidth）是這個方案唯一會撞的額度，所以 transformation 一律帶 `q_auto:good`，不要改成 `q_auto:best`。

### 2. 照片牆的尺寸依「高度」切，燈箱依「寬度」切

`h320` / `h640` 給照片牆與縮圖，`w1200` / `w2000` 給燈箱。定義在 `shared/utils/photo.ts` 的 `PHOTO_TRANSFORMS`。
一律帶 `c_limit`（永不放大）與 `f_auto`（自動給 AVIF / WebP）。

理由：justified 版型的不變量是「同一列等高」，一張照片需要多寬取決於長寬比。依寬度切的話，3:2 橫式在 320 列高 / DPR2 下需要 960px，2:3 直式只需要 427px 卻拿到同一份 —— 多傳 2.3 倍，而活動照片裡直式通常佔三四成。在 Cloudinary 上，浪費的直接就是流量 credits。

### 3. 燈箱一定要有墊底縮圖

大圖（w1200，約 200KB）載入前，先鋪一張**與照片牆完全相同 srcset** 的縮圖（`wallSrcSet()`）。
srcset 必須一模一樣，否則不會命中瀏覽器快取、墊底圖自己也要下載，等於白做。
同時在 `prevId` / `nextId` 變動時用 `new Image()` 預抓前後各一張。

實測依據：沒有這兩件事時，點縮圖到大圖出現要 1648ms、按左右鍵換一張要 2299ms；
加上之後是 616ms / 928ms，而且**感受上是即時的**，因為墊底圖立刻就在。

前後張也要**本地優先**：已載入的照片直接用 `photos` 陣列算，不要每換一張就打一次
`/api/photos/:id`。那支 API 只負責深連結（例如直接開第 380 張，那一批還沒載進來）。

### 4. 照片不准閃爍

三個來源都處理過，改動時不要退回去：

- **LQIP 不做淡入。** LQIP 與真圖是同一張畫面，交叉淡入時兩層會疊加合成，中間幾幀的亮度
  跟兩者都不同 —— 那就是「閃一下」。改成 `await img.decode()` 之後**直接換**。
- **LQIP 延遲 300ms 才顯示**（純 CSS `animation: lqip-in 0s 300ms forwards`）。真圖若在那之前
  就回來，這一層根本不會被畫出來，省掉一次「模糊→清晰」的重繪。
- **捲動進場不准把已現身的元素重設。** `useScrollReveal` 在載入更多／切換排列時會重跑，
  用 `data-revealed="1"` 標記已現身（含首屏那些）並排除，否則畫面上看過的照片會整批消失再重播。

### 5. `<script setup>` 裡不准有 top-level await

`await useFetch(...)` 會讓 setup 變成 async，而 await 之後 `getCurrentInstance()` 是 null，
後面任何需要 Nuxt instance 的 composable 都會壞掉。這個坑踩過兩次，症狀差很多：

- **靜默失效**：`useMediaQuery` 永遠回 SSR 預設值 → 手機版型卡在 justified，看起來只是「版型怪」。
- **整頁 500**：`NUXT_E1001 Nuxt instance unavailable`，深連結單張照片時必現。

不 await 不影響 SSR／預渲染 —— Nuxt 本來就會等所有 asyncData 解析完才渲染。

同一類的還有兩個：

- **`useRuntimeConfig()` 要在 setup 當下取值，不能包成 computed 再給 `useSeoMeta` 的 getter 用。**
  computed 是惰性的，第一次被讀到會是在 head 求值階段，那時已經離開 instance context。
  而且那個分支只在 `photoId` 有值時才執行，所以相簿頁一切正常、只有單張照片 500 —— 極難發現。
- **`runtimeConfig.public` 要有預設值，不能只靠部署平台的執行時環境變數。**
  預渲染在 build 階段跑，只在執行時才有的值它讀不到 —— 結果是預渲染的 HTML 一張圖都沒有。

### 6. Masonry 自己分欄，不用 CSS `columns`

CSS 多欄會在內容變動時**重新平衡整個版面** —— 捲到底追加 30 張時，既有照片會在欄與欄之間跳位，
右欄整條換掉，看起來就是「閃一下變模糊」（新位置的圖還沒載入，顯示的是 LQIP）。手機上最明顯。

改用貪婪法把每張放進目前最矮的那一欄：這是決定性的，往後追加不會改變前面已經排好的位置。
實測追加後既有照片的最大位移只剩 2px 水平 / 25px 垂直（欄內逐格累積的次像素捨入），不是重排。

**另外：`PhotoWall` 的根元素只有一個，不准用 `v-if`/`v-else` 切換整個容器。**
那會在 hydration 時把 SSR 的節點留下來，畫面上同時存在兩個 `.wall` —— 一個是伺服器渲染的舊版型、
一個是 client 的新版型，看起來像「版型沒生效」。只切換裡面的內容。

### 7. 版型用 `data-layout` 屬性選擇器，不用 class

`PhotoWall` 的排列切換靠 `.wall[data-layout="masonry"]` 這種屬性選擇器。

理由是實測到的怪象：同一個元素、同一次 render，`:data-layout` 更新了但 `:class` 沒有跟著換
（靜態 `class` 與動態 `:class` 混用、改成單一綁定也一樣）。屬性選擇器的效果與 class 完全相同，
而 `data-*` 的 patch 是可靠的，所以用它繞開。

### 8. 燈箱大圖用 `w-auto h-auto`，但盒子要由**舞台**給

兩件事要一起做，只做一半都會壞，而且壞的樣子完全不同。

**上半：大圖一定要 `w-auto h-auto`。**
`<img>` 有 `width`/`height` 屬性時，只寫 `max-h-svh max-w-full` 並**不會**讓它等比縮小 ——
瀏覽器會用屬性當寬度、只截高度，元素盒變成「屬性寬 × 上限高」，再由 `object-contain`
在裡面置中留白。實測一張 1800×2400 的直式照片，元素盒是 1800×950、實際畫出來只有 712×950。

這不只是版面問題：燈箱的控制項是量 `getBoundingClientRect()` 來貼齊照片的，量到的若是元素盒
而不是照片本身，箭頭就會貼在一個看不見的框上、離照片很遠。

**下半：`width: auto` 讓屬性的尺寸提示失效，所以載入前沒有盒子。**
資源還沒回來時只剩長寬比（`aspect-ratio: auto 2400 / 1800`），沒有任何一邊是確定值，
`getComputedStyle` 量到的就是 `0px / 0px`。舞台是 flex item、寬度由內容決定，整條鏈跟著塌。

節流網路下連按左右鍵，逐幀量到 214 幀裡有 **111 幀左右箭頭與叉叉全部擠在畫面正中央**
（照片盒子 0 寬的有 110 幀）。連帶的傷害更隱蔽：墊底縮圖是 `absolute inset-0 size-full`、
靠舞台撐大小，所以那 107 幀裡它也是 0 寬 —— **第 3 條那張「立刻出現」的墊底圖，
在最需要它的時候等於不存在**。

解法是把確定的盒子給舞台（比例資料本來就在 `photo.width/height`），大圖改成 `size-full` 填滿它：

```css
.stage {
  width: min(100%, calc((100svh - 8rem) * var(--ar)));
  aspect-ratio: var(--ar);
}
```

算式與 `object-contain` 的結果相同：寬度 = min(可用寬度, 可用高度 × 長寬比)。
改動前後在 1440×900 / 768×1024 / 390×844 三種視窗、直式與橫式照片下，
照片盒子與箭頭位置完全一致（只有 1px 次像素差異）。

**控制項要量舞台，不要量大圖。** 大圖帶著 `:key="photo.id"`，每換一張都是新元素，
`useElementBounding` 的 ResizeObserver 要重新觀察，連按時會有幾幀量到 0、控制項跟著閃掉。
舞台不會被重建。另外保留 `chromeReady`（量不到照片就不顯示控制項）當保險 ——
舞台第一個 layout frame 就有盒子，所以它不造成延遲。

### 9. 預抓一定要跟燈箱共用同一套 srcset + sizes

`usePhotoWarmup` 的 `warm()` 不是「抓某一階」，而是設 `img.sizes` + `img.srcset` 讓**瀏覽器用同一套
演算法挑同一個候選**。共用 `lightboxSizes()` 與 `lightboxSrcSet()`，不要在任何一邊自己寫死尺寸。

為什麼：燈箱是 object-contain，顯示寬度是 `min(100vw, 視窗高 × 長寬比)`。直式照片算出約 675px
會挑 `w_1200`、橫式算出約 1350px 會挑 `w_1600` —— 預抓若寫死 `w1200`，橫式照片就完全沒被預抓。
實測錯配時換一張 1000~1500ms，命中時 44ms。

`w_1600` 這一階也是量出來補的：沒有它，橫式照片會跳去拿 `w_2000`（556KB，實際只需要一半）。

### 10. SSR 圖片：load 事件可能在 hydration 之前就發生過

`<img>` 有可能在 Vue 掛上 `@load` 之前就已經載完 —— 那個事件不會再來，圖片會永遠卡在
`opacity: 0`、一直顯示模糊的 LQIP。手機上特別容易發生（hydration 較慢）。

所以 `PhotoWall` 在 `onMounted` 與清單變動後都要跑 `syncLoaded()`，掃 `img.complete && naturalWidth > 0`。

同一段還有兩個坑：
- `img.decode()` 對「還沒被繪製」的圖片（opacity 0、在視窗外）**可能永遠不 resolve**，
  一定要 `Promise.race` 加 timeout。
- `PhotoWall` 根元素的 `ref="wall"` 是 `syncLoaded()` 與 `useScrollReveal()` 共同的依賴。
  它曾經在一次 `lint --fix` 重排 class 時被弄丟，導致兩個功能**靜默失效**（畫面看起來只是
  「照片一直模糊」）。改動 template 後要確認它還在。

### 11. Cloudinary 的轉檔是 lazy 的，匯入後要預熱

某個 (原圖, 參數) 組合**第一次被請求時才現場產生**：實測冷的 0.8~1.9 秒、熱的 0.13~0.19 秒。
不預熱的話每個訪客都在幫我們付第一次的錢。

匯入新照片後一定要跑 `python3 scripts/warm_transforms.py`。
注意 `f_auto` 會依 `Accept` 產生**不同的衍生檔**（AVIF 與 WebP 是兩份），所以兩種都要暖。

不需要定期重暖：官方文件寫明「transformation 在產生新衍生檔時才計數，對同一個 URL 的重複請求不計數」。
也**不要**想用 cron（Vercel Cron 或任何 serverless 排程）做這件事 —— 完整暖一次要 1,424 個 URL，
本機一次跑完就好，沒有重複執行的必要。

### 12. `.cell` 絕對不准寫死 `height`

`app/components/gallery/PhotoWall.vue` 的純 CSS justified 靠的是：grow 與 basis 都正比於 `--ar`，所以同列每項的寬度都是 `ar × k`，配合 `aspect-ratio` 得到的高度就是 `k`。寫死 height 會退化成「固定列高 + 裁切」，等於放棄 justified。

也不要改用 `justified-layout` 套件：它是絕對定位，必須先量到容器寬度，SSR 階段拿不到 —— 只能選「SSR 不出圖」或「猜寬度再重排」，兩者都不能接受。

照片牆有三種排列（`justified` / `masonry` / `square`），全部是純 CSS、由容器的 class 切換，
沒有任何測量或 JS 排版。使用者的選擇記在 `localStorage`，不進資料庫 —— 那是個人的看法習慣。

### 13. 上傳是冪等的，但不准覆蓋人工編輯過的欄位

用 `INSERT ... ON CONFLICT(id) DO UPDATE SET`，**只更新檔案相關欄位**，刻意不覆蓋 `caption` / `sort_order` / `is_visible`。

**不准用 `INSERT OR REPLACE`** —— 它在 SQLite 是 DELETE + INSERT，重試會把已編輯好的說明與排序清成上傳時的預設值。

`sort_order` 由**前端**指定（上傳前跟 album 要一次 base offset，然後 `base + index * 1000`）。伺服器不准讀 `MAX(sort_order)`：並行上傳時 4 條會讀到同一個值而撞號。

上傳是**瀏覽器直傳 Cloudinary**：伺服器只負責產簽章（`/api/admin/uploads/signature`），檔案 bytes 不經過伺服器。
`public_id` 固定是 `vconf-gallery/{photoId}`，所以重試會覆蓋同一個資產，不會累積孤兒。
Cloudinary 上傳成功後，瀏覽器才呼叫 `/api/admin/photos` 寫 D1 —— 有 D1 那列就代表資產存在。

### 14. 排序一次只動一列

拖拉後只送**那一張**的新位置，值取前後鄰居的中點（所以 `sort_order` 是 `REAL`）。

理由（以 D1 為後台資料庫的前提；後台還沒做，換資料庫時要重新檢查這條）：D1 Free 每次 invocation 只有 **50 個 query**、每個 query 只有 **100 個 bound parameter**。送 500 張的完整順序陣列，不論拆成 500 個 statement 還是一條 `UPDATE ... CASE WHEN`（1000 個參數），兩條路都會撞牆。

### 15. Admin 是 deny-by-default，不靠路徑前綴

每一個碰資料庫的 admin handler **第一行**都是 `await requireAdmin(event)`。`server/middleware/00.auth.ts` 只負責 UX（把未登入的 `/admin/**` 導去登入頁），不是防線。

理由：Nuxt 有不在 `/admin` 前綴下的端點 —— `/__nuxt_island/<Component>?props=...` 完全在外面；`_payload.json` 的路徑與 trailing slash 行為會隨版本變；prerender crawler 若爬進 `/admin`，HTML 會被建成靜態檔，連 middleware 都不會經過（所以 `nuxt.config.ts` 的 `routeRules` 對 `/admin/**` 關掉 prerender）。

session cookie 一律用 **`__Host-` 前綴**：它強制 `Secure`、`Path=/` 且不能設 `Domain`，cookie 只屬於這一個 host。
`vercel.app` 在 PSL 上，但同一個網域下還有每次部署的 Preview 子網域，不鎖 host 的話 admin cookie 的範圍會比你以為的大。

### 16. 網站執行時不准依賴 Cloudflare

部署已經搬到 Vercel，執行時拿不到任何 Cloudflare binding。`wrangler.jsonc` 只剩 `d1_databases`，
存在的唯一目的是讓本機的 `wrangler d1 ...`（`snapshot.mjs`、`warm_transforms.py`、`db:migrate`）依名稱找到資料庫。
不要再把 Worker 的設定（`main`、`assets`、`vars`）加回去，也不要在 server 程式裡讀 `event.context.cloudflare`。

### 17. EXIF 在瀏覽器端就要清掉

只保留 `taken_at`（DateTimeOriginal）。GPS 等一律不送、不存。

canvas 重新編碼本來就會洗掉所有 EXIF，而我們上傳的就是 canvas 的輸出，所以**隱私在來源端就解決了**，不依賴 Cloudinary 的行為。日後若要加「下載原圖」，必須先重新處理這件事 —— 活動照片常含拍攝者住家附近的座標。

### 18. 前端只縮一份，不做四份

上傳前用 canvas 縮到長邊 2400（`UPLOAD_MAX_EDGE`）、JPEG q0.85，約 1.5MB。其餘尺寸由 Cloudinary 即時轉。
2400 高於最大顯示需求（燈箱 2000），1000 張約 1.5GB，只吃掉 25 credits 裡的 1.5。

三個一定要做對的細節：

- `createImageBitmap(file, { imageOrientation: 'from-image' })` **必須明確指定**。預設值在各瀏覽器歷史上不一致，不指定會有一批直式照片躺著上傳，而 canvas 重編碼已把 EXIF 洗掉，事後無法自動修正。
- 每張用完立刻 `bitmap.close()`，解碼並行數壓到 2。不釋放會讓 GPU 記憶體累積，iOS Safari 會直接砍掉分頁。
- 上傳進度用 **XHR**，不用 fetch。fetch 回報上傳進度需要 `ReadableStream` body + `duplex: 'half'`，MDN 標示 experimental 且僅 Chromium。

## 交付方式：SSG

公開頁面（首頁、每一本相簿）全部預渲染成靜態檔，由 Vercel CDN 直接送出，不喚醒 Function。
（Cloudflare 時期實測 TTFB 從 0.61~0.69s 降到 0.42s，0.42s 就是靜態檔的地板。）

`/albums/x` 與 `/albums/x/` 都直接回 200、沒有轉址 —— Nitro 的 vercel preset 會用 `overrides` 把
`albums/x/index.html` 對應到無斜線路徑。站內連結一律用無斜線形式。

資料來自 `server/assets/gallery.json`（`scripts/snapshot.mjs` 從 D1 產生）。
**改了內容要重新 build 才會反映** —— 現在後台還沒做，內容只有匯入腳本會動，所以代價是零；
等後台上線，相簿頁要嘛改回 SSR、要嘛在發布時觸發重建。

**單張照片的網址刻意不預渲染。** 試過 178 頁，代價比好處大：每頁都是獨立路由，
點開燈箱時要抓該路由的 `_payload.json`（70~120KB），而且 build 產物從 1MB 膨脹到 24MB。
不預渲染的話，從照片牆點開燈箱是純前端零請求；直接開分享連結才落到 Vercel Function 做 SSR，
那本來就是唯一需要伺服器算 OG meta 的時機。

## View Transitions

Nuxt 的自動轉場**只用在真的換頁**（首頁 ↔ 相簿）。同一本相簿內的導頁在
`app/middleware/view-transition.global.ts` 裡一律關掉 —— Nuxt 的實作會等 `page:finish`，
但 `/albums/x` 與 `/albums/x/{id}` 是同一個頁面元件、參數變化不會重新掛載，那個 hook 不會再觸發，
轉場撐到瀏覽器 4 秒逾時才放棄（`TimeoutError: Transition was aborted because of timeout in DOM update`）。

燈箱的形變改用 `useViewTransition()` 自己包，promise 由我們 resolve。
縮圖與燈箱大圖共用 `view-transition-name: photo`，而且**同一時間只能有一個元素叫這個名字** ——
燈箱開著時縮圖必須把名字讓出來，否則瀏覽器會直接放棄整個轉場。

換照片（連按左右鍵）**刻意不做轉場**：只要 44ms，套上 260ms 的形變反而讓人覺得變慢。

## 平台限制速查

| | Free | 實測 / 預估 |
|---|---|---|
| Vercel Hobby | 流量與 Function 呼叫有月額度（數字以官方 Limits 頁為準） | 靜態頁 + JSON，圖片不走 Vercel |
| D1 | 只在本機匯入時用 | — |
| **Cloudinary** | **25 credits / 月** | 儲存 1.5 + 轉檔 3 + **流量約 20GB** |

Vercel Hobby 限非商業用途，社群活動相簿符合；若之後要掛贊助商或收費，需要重新評估方案。

1 credit = 1GB 儲存 = 1GB 流量 = 1,000 次 transformation，三者共用同一池。**流量是唯一會撞的**：
一次瀏覽（3 個相簿頁 + 20 張燈箱）約 14MB，20GB 約等於每月 1,400 人次。

超額時 Cloudinary 是通知並限流，不會寄帳單（免費方案沒有綁卡）。這是刻意選的：硬停勝過軟扣款。

## 程式慣例

- `<script setup lang="ts">`，不用 Options API
- props 用 `defineProps<T>()`（需要預設值時 `withDefaults`）
- 自閉合標籤（`<NuxtImg />`）
- 每行最多 3 個屬性（ESLint 強制）
- 裝飾性圖片 `alt="" aria-hidden="true"`
- GSAP 只在 client 載入（`app/plugins/gsap.client.ts`），不進 server bundle。捲動進場一律走
  `useScrollReveal()`。**動畫用 GSAP，但觸發用 `IntersectionObserver`，不要用 ScrollTrigger** ——
  ScrollTrigger 是拿「建立當下算好的捲動座標」比對，而這個照片牆會一直追加項目、座標一直變，
  實測慢捲時會有 6 格已經捲過去卻仍停在 `opacity: 0`，使用者看到的就是「圖片跑不出來」。
  另外一定要留那道保險：**已經在視窗上方的一律直接顯示** —— 任何觸發機制都可能漏，
  而漏掉的代價是照片永遠不出現。
- 無限迴圈的動畫（例如首頁的跑馬燈）**離開視窗或分頁切走時一定要停**，否則 rAF 會一直跑。
  用 `useElementVisibility` + `useDocumentVisibility` 控制。
- 優先用 VueUse 的 composable，不要自己寫 `addEventListener` 與 `onUnmounted` 清理。
- 品牌 logo 在 `public/brand/`，取自官網 repo 的 `share/nav-logo-*.svg`，並把深藍 `#34495E` 換成 `#ECEFF7` 以適應深色底（綠色 `#41B883` 保留）。要改 logo 請回官網 repo 取原檔再轉，不要手改路徑資料。
- **不要用 `@nuxt/image`**。URL 規則是自己定的（`shared/utils/photo.ts`），用原生 `<img srcset sizes>`；而且它預設的 IPX provider 依賴 sharp，而且圖片本來就不該經過我們的伺服器（見第 1 條）。

## 設計

深色、照片優先。token 在 `app/assets/css/main.css` 的 `@theme`。

`--color-vue`（品牌綠）與 `--color-violet` **只代表狀態**（focus / 目前 / 已選 / 主要動作），不得用來填滿面積 —— 照片以外的任何東西都不該比照片鮮豔。燈箱背景是純 `#000`，不是 `--color-ink`。

Admin 刻意用**淺色**（`white` / `zinc-*`）：那是工作介面，深色底下長時間判讀縮圖的明暗會失準。
