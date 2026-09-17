import type { AlbumSummary, PublicPhoto } from '#shared/types'

/**
 * 公開 Gallery 的資料來源：build 時從 D1 產生的快照（`scripts/snapshot.mjs`）。
 *
 * 為什麼不是直接查 D1：公開頁面全部走預渲染，而預渲染跑在 Node 裡、沒有 D1 binding。
 * 讓預渲染與執行時共用同一份快照，就只有一條程式路徑，不會有兩套查詢邏輯對不起來的風險。
 *
 * D1 仍然是系統的真相來源 —— 快照是從它產生的。等後台上線（Phase 6）要改回直接查 D1，
 * 屆時這些路由也就不再預渲染。
 */

export interface SnapshotAlbum {
  slug: string
  name: string
  description: string | null
  eventDate: string | null
  coverPhotoId: string | null
  photos: PublicPhoto[]
}

let cached: SnapshotAlbum[] | null = null

async function load(): Promise<SnapshotAlbum[]> {
  if (cached)
    return cached

  const raw = await useStorage('assets:server').getItem<SnapshotAlbum[] | string>('gallery.json')

  cached = typeof raw === 'string' ? JSON.parse(raw) : (raw ?? [])

  return cached!
}

/** 首頁的相簿目錄 */
export async function albumSummaries(): Promise<AlbumSummary[]> {
  const albums = await load()

  return albums.map(album => ({
    slug: album.slug,
    name: album.name,
    description: album.description,
    eventDate: album.eventDate,
    photoCount: album.photos.length,
    coverPhotoId: album.coverPhotoId,
    previewPhotoIds: album.photos.slice(0, 6).map(photo => photo.id),
  }))
}

/** 相簿頁：一次給整本。178 張含 LQIP 也才 116KB，換到「載入更多」完全不必再發請求 */
export async function albumBySlug(slug: string): Promise<SnapshotAlbum | null> {
  const albums = await load()

  return albums.find(album => album.slug === slug) ?? null
}

/** 預渲染要走過的路徑：首頁、每一本相簿、以及每一張照片（單張分享要有正確的 OG meta） */
export async function prerenderRoutes(): Promise<string[]> {
  const albums = await load()

  return [
    '/',
    ...albums.flatMap(album => [
      `/albums/${album.slug}`,
      ...album.photos.map(photo => `/albums/${album.slug}/${photo.id}`),
    ]),
  ]
}
