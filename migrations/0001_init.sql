-- Vconf Gallery 初始 schema
--
-- D1 的 foreign key 預設就是開啟的（等同每個 transaction 都 PRAGMA foreign_keys = on），
-- 而每個 migration 檔跑在 implicit transaction 裡。將來若要做 SQLite 常見的
-- 「建新表 → 複製 → drop 舊表 → rename」，那個 migration 檔開頭必須加：
--   PRAGMA defer_foreign_keys = on;
-- 否則會因為 FK 檢查而失敗。

CREATE TABLE albums (
  id             TEXT PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,          -- 網址片段，上線後不要改
  name           TEXT NOT NULL,
  description    TEXT,

  -- 刻意不設 FOREIGN KEY：albums → photos → albums 是循環參照，
  -- SQLite 的 FK 非 deferred，建表與刪除順序都會變得難處理。
  -- 應用層維護只要一行：刪照片時清掉指向它的 cover。
  -- cover 為空時，讀取端退回該相簿 sort_order 最小的可見照片。
  cover_photo_id TEXT,

  event_date     TEXT,                          -- YYYY-MM-DD，純顯示用

  -- REAL 而非 INTEGER：拖拉排序用「前後鄰居的中點」，永遠只有 1 個 UPDATE。
  -- D1 Free 每次 invocation 只有 50 個 query、每個 query 只有 100 個 bound parameter，
  -- 送整個順序陣列（500 張 = 500 statements 或 1000 params）兩條都會撞牆。
  -- INTEGER 間隔 1000 的稀疏排序在同一個位置只能插 10 次就碰撞，REAL 可撐數十次。
  sort_order     REAL NOT NULL DEFAULT 0,

  -- 相簿預設「隱藏」，照片預設「顯示」—— 兩者刻意不同。
  -- 語意是：相簿要整理好才公開，但照片一上傳就該看得到，要藏是例外。
  is_visible     INTEGER NOT NULL DEFAULT 0,

  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);

CREATE TABLE photos (
  id                TEXT PRIMARY KEY,           -- uuid v4，由前端產生，重試時重用 → 冪等
  album_id          TEXT NOT NULL REFERENCES albums(id) ON DELETE CASCADE,

  original_filename TEXT,
  caption           TEXT,
  sort_order        REAL NOT NULL,

  -- 上傳那份（長邊 2400）的尺寸。justified 版型是先算比例再排版，
  -- 少了這兩個欄位整頁會隨著圖片逐張解碼而重排。
  width             INTEGER NOT NULL,
  height            INTEGER NOT NULL,

  -- 描述的是「上傳到 Cloudinary 的那份」（長邊 2400），不是 original_filename 對應的原檔。
  -- 沒有 cloudinary public_id 欄位：它固定是 `vconf-gallery/{id}`，由 shared/utils/photo.ts 推導。
  stored_size       INTEGER NOT NULL,

  placeholder_color TEXT,                       -- '#4a5b6c'，載入前的底色
  taken_at          TEXT,                       -- 只保留 EXIF 的 DateTimeOriginal，GPS 等一律不存

  is_visible        INTEGER NOT NULL DEFAULT 1,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE INDEX idx_photos_album_sort   ON photos (album_id, is_visible, sort_order);
CREATE INDEX idx_albums_visible_sort ON albums (is_visible, sort_order);
