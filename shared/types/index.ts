/** Album / Photo 的前後端共用型別。對應 migrations/0001_init.sql */

export interface Album {
  id: string
  slug: string
  name: string
  description: string | null
  coverPhotoId: string | null
  eventDate: string | null
  sortOrder: number
  isVisible: boolean
  createdAt: string
  updatedAt: string
}

export interface Photo {
  id: string
  albumId: string
  originalFilename: string | null
  caption: string | null
  sortOrder: number
  /** 上傳那份（長邊 2400）的尺寸。justified 版型在圖片載入前就要知道比例 */
  width: number
  height: number
  /** 上傳到 Cloudinary 的那份（長邊 2400）的大小，不是原檔 */
  storedSize: number
  /** '#4a5b6c'，載入前的底色；LQIP 缺席時的退路 */
  placeholderColor: string | null
  /** LQIP：20px 寬 JPEG 的 data URI，約 530 bytes。渲染當下就有模糊預覽，零額外請求 */
  placeholder: string | null
  /** EXIF 的 DateTimeOriginal。其餘 EXIF（尤其 GPS）一律不保存 */
  takenAt: string | null
  isVisible: boolean
  createdAt: string
  updatedAt: string
}

/** 公開 API 回傳的照片只有排版與顯示需要的欄位 */
export interface PublicPhoto {
  id: string
  width: number
  height: number
  caption: string | null
  placeholderColor: string | null
  placeholder: string | null
}

/** 相簿頁用：Album 加上整本的照片數 */
export interface AlbumDetail extends Album {
  photoCount: number
}

/** 目錄與 contact strip 用的最小照片資料 */
export interface PreviewPhoto {
  id: string
  width: number
  height: number
}

export interface AlbumSummary {
  slug: string
  name: string
  description: string | null
  eventDate: string | null
  photoCount: number
  coverPhotoId: string | null
  /**
   * 相簿目錄那一列右側的縮圖，以及首頁 contact strip 取材的來源。
   * 帶著尺寸是因為 strip 的每一張高度固定、寬度由長寬比決定 ——
   * 不先給比例的話，寬度要等圖片載入才確定，後面每一張都會被往右推一次。
   */
  previewPhotos: PreviewPhoto[]
}

export interface PhotoPage {
  photos: PublicPhoto[]
  /** null 代表沒有下一批 */
  nextCursor: string | null
}

/** 燈箱深連結用：直接開第 380 張時，SSR 靠這個單獨取數並算出起始批次 */
export interface PhotoDetail extends PublicPhoto {
  albumSlug: string
  prevId: string | null
  nextId: string | null
  /** 在相簿中的序位，從 0 起算 */
  index: number
  total: number
}

/** 上傳時前端一併送上的 metadata */
export interface PhotoUploadMeta {
  photoId: string
  albumId: string
  originalFilename: string
  width: number
  height: number
  placeholderColor: string | null
  takenAt: string | null
  sortOrder: number
}
