import { readFileSync } from 'node:fs'
import tailwindcss from '@tailwindcss/vite'

/**
 * 預渲染首頁與每一本相簿。單張照片的網址刻意不預渲染：每頁都是獨立路由，
 * 點開燈箱時要多抓該路由的 `_payload.json`，build 產物也會膨脹十幾倍。
 * 直接開分享連結才落到 Vercel Function 做 SSR，那本來就是唯一需要伺服器算 OG meta 的時機。
 */
function galleryRoutes(): string[] {
  try {
    const albums = JSON.parse(readFileSync('server/assets/gallery.json', 'utf8')) as { slug: string }[]

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
    // 不寫死 preset：在 Vercel 上 build 時 Nitro 會自動偵測成 `vercel`，
    // 本機 `pnpm build && pnpm preview` 則是 node-server，兩邊都能直接跑。

    /**
     * 公開頁面全部預渲染成靜態檔，由 Vercel 的 CDN 直接送出，不喚醒 Function。
     *
     * 量測依據（Cloudflare 時期）：SSR 頁面的 TTFB 是 0.74~1.84s，靜態檔是 0.43s ——
     * 多出來的時間幾乎都在「喚醒伺服器 + 查資料的來回」。
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
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/api/admin/**': { headers: { 'cache-control': 'no-store' } },

    // 公開內容改動不頻繁，讓瀏覽器重複瀏覽時不必每次都回源。60 秒夠短，後台改完很快就看得到。
    //
    // 已知現況（Cloudflare 時期實測，搬到 Vercel 後尚未重新驗證）：以下規則只對「頁面」生效，
    // Nitro 會把 /api/** 的回應蓋回 no-cache。影響不大 —— 貴的是 HTML 與圖片，API 只是幾 KB 的 JSON。
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
    // 全部由 Vercel 專案的環境變數（NUXT_ 前綴）提供，不進 repo
    googleClientId: '',
    googleClientSecret: '',
    sessionSecret: '',
    adminEmails: '', // 逗號分隔
    // Cloudinary 的 secret 只用來在伺服器端產上傳簽章與刪除資產，絕不外流到瀏覽器
    cloudinaryApiKey: '',
    cloudinaryApiSecret: '',
    public: {
      siteUrl: '',
      /**
       * cloud name 本來就會出現在每個圖片 URL 裡，是公開資訊，所以直接給預設值。
       *
       * 不能只靠部署平台的執行時環境變數：預渲染在 build 階段跑，讀不到只在執行時才有的值，
       * 結果會是預渲染的 HTML 一張圖都沒有（`v-if="cloudName"` 為 false）。
       * 環境變數仍可在執行時覆蓋。
       */
      cloudinaryCloudName: 'nlmva1ui',
    },
  },
})
