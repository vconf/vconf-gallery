/**
 * Cloudinary 的伺服器端工作只有兩件：產上傳簽章、刪除資產。
 * 檔案 bytes 永遠不經過這個 Worker —— 瀏覽器拿著簽章直傳 Cloudinary。
 */

function config() {
  const rc = useRuntimeConfig()

  const cloudName = rc.public.cloudinaryCloudName
  const apiKey = rc.cloudinaryApiKey
  const apiSecret = rc.cloudinaryApiSecret

  if (!cloudName || !apiKey || !apiSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Cloudinary 未設定：需要 NUXT_PUBLIC_CLOUDINARY_CLOUD_NAME / NUXT_CLOUDINARY_API_KEY / NUXT_CLOUDINARY_API_SECRET',
    })
  }

  return { cloudName, apiKey, apiSecret }
}

/**
 * 簽章規則：除了 file / api_key / signature 之外的參數，照 key 排序串成 `k=v&k=v`，
 * 尾端接上 api_secret，取 SHA-1。順序錯了就是 401，而且錯誤訊息不會告訴你哪裡錯。
 */
async function sign(params: Record<string, string>, apiSecret: string): Promise<string> {
  const toSign = `${Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')}${apiSecret}`
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(toSign))

  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface UploadTicket {
  cloudName: string
  apiKey: string
  timestamp: string
  signature: string
  publicId: string
  assetFolder: string
}

/** 發給管理者瀏覽器的上傳票。只有 requireAdmin 通過的請求才會拿到 */
export async function createUploadTicket(photoId: string, albumSlug: string): Promise<UploadTicket> {
  const { cloudName, apiKey, apiSecret } = config()

  const params: Record<string, string> = {
    asset_folder: assetFolder(albumSlug),
    public_id: publicId(photoId),
    timestamp: String(Math.floor(Date.now() / 1000)),
  }

  return {
    cloudName,
    apiKey,
    timestamp: params.timestamp!,
    signature: await sign(params, apiSecret),
    publicId: params.public_id!,
    assetFolder: params.asset_folder!,
  }
}

/** 刪照片時一併把 Cloudinary 上的資產（含所有衍生檔）清掉 */
export async function destroyAsset(photoId: string): Promise<void> {
  const { cloudName, apiKey, apiSecret } = config()

  const params: Record<string, string> = {
    public_id: publicId(photoId),
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const body = new URLSearchParams({
    ...params,
    api_key: apiKey,
    signature: await sign(params, apiSecret),
  })

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    throw createError({
      statusCode: 502,
      statusMessage: `Cloudinary 刪除失敗：${res.status} ${await res.text()}`,
    })
  }
}
