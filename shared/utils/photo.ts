/**
 * 照片尺寸與 Cloudinary URL 的單一真相來源。
 *
 * 這個檔同時被瀏覽器（縮圖、組 URL）與 Worker（產簽章、寫 D1）使用，
 * 所以裡面不能 import 任何 Vue 或 Nitro 的東西（Nuxt 4 的 shared/ 規則）。
 */

/**
 * 這個帳號是 dynamic folder 模式（`folder_mode: "dynamic"`），所以「Media Library 上看到的資料夾」
 * 與「URL 裡的 public_id」是兩件獨立的事。刻意讓它們不同：
 *
 * - `ASSET_FOLDER` 是給人看的，用中文沒問題，只影響後台的檔案總管。
 * - `publicId()` 是給 URL 用的，必須是 ASCII —— 中文加空白會讓每個圖片 URL 變成一長串
 *   percent-encoded，而且簽章計算容易出錯。
 */
export const ASSET_FOLDER_ROOT = '2026 Vue 圖片畫廊'

/**
 * 顯示資料夾跟著相簿走，所以在 Cloudinary 後台翻檔案時看到的結構會跟 Gallery 一致。
 * 它純粹是給人看的：相簿真正的歸屬在 D1 的 `photos.album_id`，照片搬相簿時
 * 可以順手更新 asset_folder，但就算沒更新也不影響網站。
 */
export function assetFolder(albumSlug: string): string {
  return `${ASSET_FOLDER_ROOT}/${albumSlug}`
}

/** photoId 是 uuid，不會撞名；前綴只是讓 URL 看得出這是 gallery 的資產 */
export function publicId(photoId: string): string {
  return `vconf/${photoId}`
}

/**
 * 交付用的 transformation。
 *
 * 照片牆依「高度」切，燈箱依「寬度」切 —— 這不是隨便挑的：justified 版型的不變量是
 * 「同一列等高」，一張照片需要多寬完全取決於長寬比。若照片牆也依寬度切，
 * 3:2 橫式在 320 列高 / DPR2 下需要 960px，而 2:3 直式只需要 427px 卻會拿到同一份。
 * 活動照片裡直式通常佔三四成，那是系統性的浪費 —— 而在 Cloudinary 上，浪費的是流量 credits。
 *
 * `c_limit` 保證永不放大。`f_auto` 會依 Accept 給 AVIF / WebP。
 * `q_auto:good` 是畫質與檔案大小的折衷；流量是這個方案唯一會撞的額度，不要改成 q_auto:best。
 */
export const PHOTO_TRANSFORMS = {
  /** contact strip（固定 180px 高）、相簿目錄縮圖 */
  h320: 'f_auto,q_auto:good,c_limit,h_320',
  /** contact strip 的 2x */
  h640: 'f_auto,q_auto:good,c_limit,h_640',
  /**
   * 照片牆 1x。
   *
   * 為什麼是 480 而不是 320：justified 的列高**不是** `--row-h`，那只是決定一列塞幾張的基準。
   * 真正的列高由容器寬度與該列張數決定，實測 `--row-h: 320` 在 1500px 寬的視窗會長到 461px。
   * 用 320 的變體去填 461px 等於放大 1.44 倍 —— 看起來就是糊。
   */
  h480: 'f_auto,q_auto:good,c_limit,h_480',
  /** 照片牆 2x */
  h960: 'f_auto,q_auto:good,c_limit,h_960',
  /** 燈箱：手機、1x 筆電 */
  w1200: 'f_auto,q_auto:good,c_limit,w_1200',
  /**
   * 燈箱：桌機 1x。
   *
   * 這一階是量出來補的：燈箱的顯示寬度是 min(100vw, 視窗高 × 長寬比)，
   * 橫式照片在 1440×900 的螢幕上算出約 1350px —— w_1200 不夠，沒有這一階就會跳去
   * 拿 w_2000（556KB），而實際只需要約一半。活動照片絕大多數是橫式。
   */
  w1600: 'f_auto,q_auto:good,c_limit,w_1600',
  /** 燈箱：retina、大螢幕 */
  w2000: 'f_auto,q_auto:good,c_limit,w_2000',
  /** 分享用。固定 1200x630 JPEG —— WebP 當 og:image 在 X 與 LINE 上渲染不可靠 */
  og: 'f_jpg,q_auto:good,c_fill,g_auto,w_1200,h_630',
} as const

export type PhotoTransform = keyof typeof PHOTO_TRANSFORMS

/** 前端一律用這個組 URL，不要手寫字串 */
export function photoUrl(cloudName: string, photoId: string, transform: PhotoTransform): string {
  return `https://res.cloudinary.com/${cloudName}/image/upload/${PHOTO_TRANSFORMS[transform]}/${publicId(photoId)}`
}

/**
 * 照片牆的 srcset。
 *
 * 密度描述子在這裡是對的（每一格的顯示尺寸由版型決定，不是由視窗寬度決定），
 * 但級距必須涵蓋 justified 的列高成長 —— 見 PHOTO_TRANSFORMS.h480 的說明。
 */
export function wallSrcSet(cloudName: string, photoId: string): string {
  return `${photoUrl(cloudName, photoId, 'h480')} 1x, ${photoUrl(cloudName, photoId, 'h960')} 2x`
}

/** 跑馬燈是固定 180px 高，不會成長，所以 320／640 這一組剛剛好 */
export function stripSrcSet(cloudName: string, photoId: string): string {
  return `${photoUrl(cloudName, photoId, 'h320')} 1x, ${photoUrl(cloudName, photoId, 'h640')} 2x`
}

/**
 * 燈箱的 `sizes`。
 *
 * 舞台是 object-contain：直式照片被「高度」限制，顯示寬度只有 `視窗高 × 長寬比`，
 * 遠小於 100vw。寫死 100vw 會讓瀏覽器挑走過大的候選。
 *
 * **預抓一定要用同一個式子**，否則預抓的跟瀏覽器實際要的不是同一張，等於白抓
 * —— 實測錯配時換一張要 1000~1500ms，命中時只要 45ms。
 */
export function lightboxSizes(aspectRatio: number): string {
  return `min(100vw, calc(100svh * ${aspectRatio.toFixed(4)}))`
}

/** 燈箱的 srcset 用 w 描述子，讓瀏覽器依實際顯示寬度挑 */
export function lightboxSrcSet(cloudName: string, photoId: string): string {
  return [
    `${photoUrl(cloudName, photoId, 'w1200')} 1200w`,
    `${photoUrl(cloudName, photoId, 'w1600')} 1600w`,
    `${photoUrl(cloudName, photoId, 'w2000')} 2000w`,
  ].join(', ')
}

/**
 * 上傳前在瀏覽器縮到的尺寸。
 *
 * 只產生這一份 —— 其餘尺寸由 Cloudinary 即時轉，不需要前端做四份。
 * 2400 仍高於最大顯示需求（燈箱 2000），但比原檔小一個數量級：
 * 1000 張約 1.5GB，只吃掉 25 credits 裡的 1.5。
 *
 * 順帶一提，canvas 重新編碼會洗掉所有 EXIF（含 GPS），所以隱私問題在來源端就解決了，
 * 不必依賴 Cloudinary 的行為。
 */
export const UPLOAD_MAX_EDGE = 2400
export const UPLOAD_QUALITY = 0.85

/** 照片牆一批的張數。lazy loading 的門檻很寬鬆，一次給太多會超量預抓 */
export const PHOTO_PAGE_SIZE = 30

/** 首屏 eager 載入的張數；其中只有前 2 張會拿到 fetchpriority="high" */
export const EAGER_PHOTO_COUNT = 8

/** 永遠不放大：來源比目標小就維持原尺寸 */
export function scaleToMaxEdge(width: number, height: number, maxEdge: number) {
  const scale = Math.min(maxEdge / Math.max(width, height), 1)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}
