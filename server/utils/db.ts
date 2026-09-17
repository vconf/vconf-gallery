import type { Album, AlbumSummary, Photo, PublicPhoto } from '#shared/types'

/**
 * D1 的 row 是 snake_case、boolean 用 0/1，型別是 camelCase、boolean 用 true/false。
 * 轉換只寫在這裡一處，handler 不要自己拆 row。
 */

export interface AlbumRow {
  id: string
  slug: string
  name: string
  description: string | null
  cover_photo_id: string | null
  event_date: string | null
  sort_order: number
  is_visible: number
  created_at: string
  updated_at: string
}

export interface PhotoRow {
  id: string
  album_id: string
  original_filename: string | null
  caption: string | null
  sort_order: number
  width: number
  height: number
  stored_size: number
  placeholder_color: string | null
  placeholder: string | null
  taken_at: string | null
  is_visible: number
  created_at: string
  updated_at: string
}

export function toAlbum(row: AlbumRow): Album {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    coverPhotoId: row.cover_photo_id,
    eventDate: row.event_date,
    sortOrder: row.sort_order,
    isVisible: row.is_visible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toPhoto(row: PhotoRow): Photo {
  return {
    id: row.id,
    albumId: row.album_id,
    originalFilename: row.original_filename,
    caption: row.caption,
    sortOrder: row.sort_order,
    width: row.width,
    height: row.height,
    storedSize: row.stored_size,
    placeholderColor: row.placeholder_color,
    placeholder: row.placeholder,
    takenAt: row.taken_at,
    isVisible: row.is_visible === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** 公開 API 只回排版與顯示需要的欄位，不要把整個 row 丟出去 */
export function toPublicPhoto(
  row: Pick<PhotoRow, 'id' | 'width' | 'height' | 'caption' | 'placeholder_color' | 'placeholder'>,
): PublicPhoto {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    caption: row.caption,
    placeholderColor: row.placeholder_color,
    placeholder: row.placeholder,
  }
}

export function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/**
 * 首頁要的東西：相簿本身、可見照片數、封面、以及目錄那一列右側的幾張縮圖。
 *
 * 刻意用 3 個 query 而不是「每個相簿各查一次」—— D1 Free 每次 invocation 只有
 * 50 個 query，15 個相簿走 N+1 就用掉三分之一，而且以後相簿一多就會直接撞牆。
 */
export const ALBUM_PREVIEW_COUNT = 6

export async function listAlbumSummaries(db: D1Database, includeHidden = false): Promise<AlbumSummary[]> {
  const albumFilter = includeHidden ? '' : 'WHERE is_visible = 1'

  const [albums, counts, previews] = await db.batch<any>([
    db.prepare(`SELECT * FROM albums ${albumFilter} ORDER BY sort_order, created_at`),
    db.prepare('SELECT album_id, COUNT(*) AS n FROM photos WHERE is_visible = 1 GROUP BY album_id'),
    db.prepare(`
      SELECT album_id, id FROM (
        SELECT album_id, id,
               ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY sort_order, id) AS rn
        FROM photos WHERE is_visible = 1
      ) WHERE rn <= ?1
    `).bind(ALBUM_PREVIEW_COUNT),
  ])

  const countBy = new Map<string, number>(
    (counts.results as { album_id: string, n: number }[]).map(r => [r.album_id, r.n]),
  )
  const previewBy = new Map<string, string[]>()
  for (const r of previews.results as { album_id: string, id: string }[]) {
    const list = previewBy.get(r.album_id) ?? []
    list.push(r.id)
    previewBy.set(r.album_id, list)
  }

  return (albums.results as AlbumRow[]).map(row => ({
    slug: row.slug,
    name: row.name,
    description: row.description,
    eventDate: row.event_date,
    photoCount: countBy.get(row.id) ?? 0,
    // 封面沒設就退回該相簿排序最前的可見照片，前台不必特別處理空封面
    coverPhotoId: row.cover_photo_id ?? previewBy.get(row.id)?.[0] ?? null,
    previewPhotoIds: previewBy.get(row.id) ?? [],
  }))
}
