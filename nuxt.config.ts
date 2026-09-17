import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'

/**
 * 預渲染要走過的路徑：首頁與每一本相簿 —— 訪客會落地的就這些。
 *
 * **刻意不預渲染 178 個單張照片的網址。** 試過，代價比好處大：
 *   1. 每個照片頁都是獨立路由，從照片牆點開燈箱時 Nuxt 會去抓該路由的 `_payload.json`
 *      （整本相簿約 70~120KB），轉場得等它 —— 實測會觸發
 *      `TimeoutError: Transition was aborted because of timeout in DOM update`。
 *   2. build 產物從 1MB 膨脹到 24MB，因為每一頁都重覆嵌入整本相簿的資料。
 *
 * 不預渲染的話，從照片牆點開燈箱是**純前端、零網路請求**；而直接開單張照片網址
 * （分享連結、爬蟲抓 OG meta）會落到 Worker 做 SSR —— 那本來就是唯一需要伺服器的時機。
 */
function galleryRoutes(): string[] {
  try {
    const albums = JSON.parse(readFileSync('server/assets/gallery.json', 'utf8')) as {
      slug: string
      photos: { id: string }[]
    }[]

    return ['/', ...albums.map(album => `/albums/${album.slug}`)]
  }
  catch {
    // 快照還沒產生（例如第一次 clone）時就只預渲染首頁，不要讓 build 掛掉
    return ['/']
  }
}

export default defineNuxtConfig({
  compatibilityDate: '2026-09-17',
  devtools: { enabled: true },

  modules: [
    '@nuxt/fonts',
    '@vueuse/nuxt',
    // 讓 `nuxt dev` 也拿得到 wrangler.jsonc 裡的 D1 / R2 / Images binding
    'nitro-cloudflare-dev',
  ],

  css: ['~/assets/css/main.css'],

  app: {
    head: {
      // 圖示直接沿用官網的那一組，Gallery 與官網在分頁列上要看得出是同一個東西
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/app-touch-icon.png' },
      ],
      htmlAttrs: { lang: 'zh-Hant-TW' },
    },
  },

  vite: {
    plugins: [tailwindcss()],
  },

  // 原生 View Transition：轉場交給瀏覽器做，比自己用 CSS class 疊 transition 穩，
  // 也不會在切換當下同時存在兩份 DOM 造成跳動。不支援的瀏覽器會直接略過，不需要 fallback。
  experimental: { viewTransition: true },

  nitro: {
    preset: 'cloudflare_module',

    /**
     * 公開頁面全部預渲染成靜態檔。
     *
     * 量測依據：SSR 頁面的 TTFB 是 0.74~1.84s，靜態檔是 0.43s，而 Worker 的 CPU 只有 5ms ——
     * 多出來的時間幾乎都在「喚醒 Worker + 查 D1 的來回」。預渲染之後由 Workers Assets 直接送出，
     * 完全不喚醒 Worker，也不計入每日 10 萬請求的額度。
     *
     * 代價：內容改了要重新 build。現在後台還沒做、內容只有匯入腳本會動，所以代價是零。
     */
    prerender: {
      crawlLinks: false,
      routes: galleryRoutes(),
      failOnError: true,
    },
  },

  // GSAP 出 ESM 但有些子模組需要轉譯
  build: { transpile: ['gsap'] },

  routeRules: {
    // 後台絕對不能被 prerender 成靜態檔（那會完全繞過驗證），也不該被索引或快取
    '/admin/**': {
      prerender: false,
      index: false,
      robots: false,
      headers: { 'cache-control': 'no-store' },
    },
    '/api/admin/**': { headers: { 'cache-control': 'no-store' } },

    // 公開內容改動不頻繁。workers.dev 沒有 zone、CDN 不會幫忙快取，
    // 所以這裡的收益全在瀏覽器端：重複瀏覽不必每次都叫醒 Worker
    // （免費方案每日只有 10 萬次請求）。60 秒夠短，後台改完很快就看得到。
    //
    // 已知現況：以下規則只對「頁面」生效。Nitro 會把 /api/** 的回應蓋回 no-cache，
    // 在 handler 裡用 setResponseHeader 也一樣被蓋掉（實測過）。影響不大 ——
    // 貴的是 HTML 與圖片，API 只是幾 KB 的 JSON；等日後有自訂網域時一併重新處理。
    '/': { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
    '/albums/**': { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
    '/api/albums': { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
    '/api/albums/**': { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
    '/api/photos/**': { headers: { 'cache-control': 'public, max-age=60, stale-while-revalidate=300' } },
  },

  fonts: {
    families: [
      { name: 'Instrument Serif', provider: 'google', weights: [400] },
      { name: 'Noto Serif TC', provider: 'google', weights: [400] },
      { name: 'Noto Sans TC', provider: 'google', weights: [400] },
    ],
  },

  runtimeConfig: {
    // 全部由 `wrangler secret put` 提供，不進 repo
    googleClientId: '',
    googleClientSecret: '',
    sessionSecret: '',
    adminEmails: '', // 逗號分隔
    // Cloudinary 的 secret 只用來在 Worker 內產上傳簽章與刪除資產，絕不外流到瀏覽器
    cloudinaryApiKey: '',
    cloudinaryApiSecret: '',
    public: {
      siteUrl: '',
      /**
       * cloud name 本來就會出現在每個圖片 URL 裡，是公開資訊，所以直接給預設值。
       *
       * 不能只靠 wrangler.jsonc 的 vars：那是**執行時**的環境變數，而預渲染跑在 Node 裡讀不到，
       * 結果會是預渲染的 HTML 一張圖都沒有（`v-if="cloudName"` 為 false）。
       * 環境變數仍可在執行時覆蓋。
       */
      cloudinaryCloudName: 'nlmva1ui',
    },
  },
})
