import type { H3Event } from 'h3'

/**
 * 這是全專案唯一碰 `event.context.cloudflare` 的地方。
 *
 * 為什麼要收斂：Nitro v2（Nuxt 4 目前用的）把 binding 放在 `event.context.cloudflare.env`，
 * 但 Nitro v3 已經改成 `event.req.runtime.cloudflare.env`。把存取集中在這裡，
 * 將來升級只需要改這個檔；package.json 也因此鎖住 nitropack 的版本。
 *
 * 另一個硬規則：binding 只在請求生命週期內存在，絕對不能在模組頂層取用。
 *
 * 這個 Worker 只有 D1 一個 binding —— 圖片在 Cloudinary，由它的 CDN 直接送給訪客。
 */

export interface GalleryEnv {
  DB: D1Database
}

function cloudflare(event: H3Event) {
  const ctx = (event.context as Record<string, any>).cloudflare

  if (!ctx) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Cloudflare bindings unavailable — 是不是在 Cloudflare runtime 之外執行，或在模組頂層取用了？',
    })
  }

  return ctx
}

export function useCfEnv(event: H3Event): GalleryEnv {
  return cloudflare(event).env as GalleryEnv
}

export function useDb(event: H3Event): D1Database {
  return useCfEnv(event).DB
}

/**
 * 背景工作。回應送出後才跑，不佔用 Worker 的回應時間
 * （但仍然算在同一次 invocation 的 subrequest 預算裡 —— Free 只有 50 個）。
 */
export function cfWaitUntil(event: H3Event, promise: Promise<unknown>): void {
  const waitUntil = (event.context as Record<string, any>).waitUntil ?? cloudflare(event).context?.waitUntil

  if (typeof waitUntil === 'function')
    waitUntil(promise)
  else
    void promise
}
