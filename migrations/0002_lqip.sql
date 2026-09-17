-- LQIP（Low Quality Image Placeholder）
--
-- 存的是一張 20px 寬的 JPEG 的 data URI，約 400~700 bytes。
-- 刻意不另外跟 Cloudinary 要一張模糊圖：那會多一個請求與一次 transformation，
-- 而 data URI 隨著 API 的 JSON 一起送到，渲染當下就在，零額外往返。
--
-- placeholder_color 保留：data URI 還沒產生（或產生失敗）時的退路。
ALTER TABLE photos ADD COLUMN placeholder TEXT;
