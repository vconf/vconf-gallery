/**
 * 把 D1 的內容倒成一份快照，給 build 時的預渲染用。
 *
 * 為什麼需要：預渲染跑在 Node 裡，沒有 Cloudflare 的 D1 binding，查不到資料。
 * 所以 build 之前先用 wrangler 從正式 D1 撈一份 JSON 放進 server/assets/，
 * 預渲染與執行時都讀它。
 *
 * 代價講明白：**內容改了要重新 build 才會反映**。現在後台還沒做、內容只有匯入腳本會動，
 * 所以這個代價是零；等後台上線要嘛把相簿頁改回 SSR、要嘛在發布時觸發重建。
 *
 * 用法：node scripts/snapshot.mjs
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

function query(sql) {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'vconf-gallery', '--remote', '--command', sql, '--json'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  return JSON.parse(out.slice(out.indexOf('[')))[0].results
}

const albums = query(`
  SELECT id, slug, name, description, cover_photo_id, event_date, sort_order
  FROM albums WHERE is_visible = 1 ORDER BY sort_order, created_at`)

const photos = query(`
  SELECT id, album_id, width, height, caption, placeholder_color, placeholder, sort_order
  FROM photos WHERE is_visible = 1 ORDER BY album_id, sort_order, id`)

const byAlbum = new Map()
for (const p of photos) {
  const list = byAlbum.get(p.album_id) ?? []
  list.push({
    id: p.id,
    width: p.width,
    height: p.height,
    caption: p.caption,
    placeholderColor: p.placeholder_color,
    placeholder: p.placeholder,
  })
  byAlbum.set(p.album_id, list)
}

const snapshot = albums.map(a => ({
  slug: a.slug,
  name: a.name,
  description: a.description,
  eventDate: a.event_date,
  coverPhotoId: a.cover_photo_id ?? byAlbum.get(a.id)?.[0]?.id ?? null,
  photos: byAlbum.get(a.id) ?? [],
}))

writeFileSync('server/assets/gallery.json', JSON.stringify(snapshot))
const total = snapshot.reduce((n, a) => n + a.photos.length, 0)
console.log(`  ${snapshot.length} 本相簿、${total} 張照片 → server/assets/gallery.json`)
for (const a of snapshot) console.log(`    ${a.slug}  ${a.photos.length} 張`)
