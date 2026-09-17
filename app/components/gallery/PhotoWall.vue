<script setup lang="ts">
import type { PublicPhoto } from '#shared/types'
import type { WallLayout } from './wallLayouts'
import { useMediaQuery } from '@vueuse/core'
import { loadPayload } from '#app'
import { EAGER_PHOTO_COUNT } from '#shared/utils/photo'
import { DEFAULT_WALL_LAYOUT } from './wallLayouts'

const props = withDefaults(defineProps<{
  photos: PublicPhoto[]
  /** 相簿頁面路徑；點下去進燈箱（可選參數路由） */
  basePath: string
  layout?: WallLayout
}>(), { layout: DEFAULT_WALL_LAYOUT })

// runtime config 不會變，setup 當下取值即可；包成 computed 只會留著惰性求值的地雷
const cloudName = useRuntimeConfig().public.cloudinaryCloudName
const wall = ref<HTMLElement | null>(null)

/**
 * 被點開的那張照片，要跟燈箱大圖共用同一個 view-transition-name，
 * 瀏覽器才知道這兩者是「同一張」，會做形變而不是單純淡入淡出。
 *
 * 關鍵是**同一時間只能有一個元素叫這個名字**：燈箱開著時縮圖必須把名字讓出來，
 * 否則名稱重複、瀏覽器會直接放棄整個轉場。所以只在燈箱關著時才掛上去 ——
 * 打開的瞬間舊快照有名字、新快照由燈箱接手；關閉時剛好反過來。
 */
const route = useRoute()
const lightboxOpen = computed(() => !!route.params.photo)
const morphId = ref<string | null>(null)

function morphName(photoId: string) {
  return !lightboxOpen.value && morphId.value === photoId ? 'photo' : undefined
}

/**
 * Masonry 自己分欄，不用 CSS `columns`。
 *
 * CSS 多欄會在內容變動時**重新平衡整個版面** —— 捲到底追加 30 張時，既有照片會在欄與欄之間
 * 跳位，右欄整條換掉，看起來就是「閃一下變模糊」（新位置的圖還沒載入，顯示的是 LQIP）。
 *
 * 貪婪法把每張放進目前最矮的那一欄：這是決定性的，往後追加不會改變前面已經排好的位置。
 * 相對高度用 1/長寬比 就夠，不必知道實際像素寬。
 */
const isTablet = useMediaQuery('(max-width: 1024px)')
const isMobile = useMediaQuery('(max-width: 640px)')
const columnCount = computed(() => (isMobile.value ? 2 : isTablet.value ? 3 : 4))

const masonryColumns = computed(() => {
  const columns: { photo: PublicPhoto, index: number }[][]
    = Array.from({ length: columnCount.value }, () => [])
  const heights = new Array<number>(columnCount.value).fill(0)

  for (const [index, photo] of props.photos.entries()) {
    let shortest = 0
    for (let i = 1; i < heights.length; i++) {
      if (heights[i]! < heights[shortest]!)
        shortest = i
    }
    columns[shortest]!.push({ photo, index })
    heights[shortest]! += photo.height / photo.width
  }

  return columns
})

const transition = useViewTransition()

/**
 * 先把單張照片那一頁的 payload 備起來。
 *
 * `startViewTransition` 在 update callback 完成之前會把整頁凍結成靜態快照 ——
 * 把 `await navigateTo()` 放進去，等於「網路來回的期間畫面完全不動」，冷的時候就是那個卡頓。
 * 在 hover／focus／touchstart 就備好，點下去時導頁是從快取取用，一個 frame 就結束。
 *
 * 只備使用者真的碰到的那一張。cell 上的 `no-prefetch` 仍然有意義：
 * 那會在每一格進入視窗時就抓，一次三十份是純浪費。
 */
async function warmPayload(photoId: string) {
  try {
    await loadPayload(`${props.basePath}/${photoId}`)
  }
  catch {
    // 沒有 payload（例如那一頁沒被預渲染）就照常導頁，不影響功能
  }
}

/**
 * 點縮圖：先把 view-transition-name 掛上去（舊快照才抓得到這一格），
 * 再在同一個轉場裡導頁。用 `<a>` 的 href 保留中鍵開新分頁與 SEO，所以只攔左鍵。
 */
async function openPhoto(event: MouseEvent, photoId: string) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0)
    return

  event.preventDefault()
  morphId.value = photoId

  // 備好才開始轉場（通常在 hover／touchstart 時就備完了，這裡是立刻回來的）
  await warmPayload(photoId)

  transition(async () => {
    await nextTick()
    await navigateTo(`${props.basePath}/${photoId}`)
  })
}

// 滑過就先抓那一張的燈箱大圖；空閒時再暖前幾張
const { warm, warmFirst } = usePhotoWarmup(cloudName)

function warmCell(photo: PublicPhoto) {
  warm(photo.id, photo.width / photo.height)
  void warmPayload(photo.id)
}
watch(() => props.photos, list => warmFirst(list), { immediate: true })

// 捲動進場。首屏照片完全跳過，載入更多與換排列之後要重建
useScrollReveal(wall, '.cell', () => [props.photos.length, props.layout])

/**
 * 已經可以顯示的照片。在那之前顯示 LQIP（20px 寬的 data URI，隨 JSON 一起到）。
 */
const loaded = reactive(new Set<string>())

/**
 * 等 decode 完成才換掉 LQIP，但最多等 120ms。
 *
 * 不做淡入 —— LQIP 與真圖是同一張畫面，交叉淡入時兩層會疊加合成，中間幾幀的亮度
 * 跟兩者都不同，那就是「閃一下」。直接換反而是自然的「對焦清晰」。
 *
 * 一定要有 timeout：Chrome 對「還沒被繪製」的圖片（例如 opacity 0、在視窗外）
 * 會把 decode() 無限期延後，promise 永遠不 resolve，那張圖就卡在模糊狀態。
 */
async function markLoaded(event: Event, id: string) {
  const img = event.target as HTMLImageElement

  await Promise.race([
    img.decode().catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 120)),
  ])

  loaded.add(id)
}

/**
 * 補抓「在 hydration 之前就載完」的圖片。
 *
 * SSR 出來的 <img> 有可能在 Vue 掛上 @load 監聽器之前就已經載好 —— 那個 load 事件
 * 早就發生過、不會再來，那張圖會卡在 opacity: 0、永遠顯示模糊的 LQIP。
 * 手機上特別容易發生（hydration 較慢）。所以掛載後與清單變動後都掃一次。
 */
function syncLoaded() {
  if (!wall.value)
    return

  for (const img of wall.value.querySelectorAll<HTMLImageElement>('img[data-photo-id]')) {
    if (img.complete && img.naturalWidth > 0)
      loaded.add(img.dataset.photoId!)
  }
}

onMounted(() => {
  syncLoaded()
  // 掛載當下還在載的那些，稍後再掃一次保險
  setTimeout(syncLoaded, 1500)
})
watch(() => props.photos.length, () => nextTick(syncLoaded))
</script>

<template>
  <!--
    根元素只有一個，不用 v-if/v-else 切換整個容器 —— 那會在 hydration 時把 SSR 的節點留下來，
    畫面上同時存在兩個 .wall（一個是伺服器渲染的舊版型、一個是 client 的新版型）。
    只切換「裡面的內容」，根元素的屬性由 Vue patch，穩定得多。

    masonry 走自己分的欄（見 masonryColumns）；justified 與 square 由 CSS 直接排。
    兩邊共用 GalleryPhotoCell，格子本身的行為只有一份。
  -->
  <div
    ref="wall"
    class="wall"
    :data-layout="layout"
  >
    <template v-if="layout === 'masonry'">
      <div
        v-for="(column, columnIndex) in masonryColumns"
        :key="`col-${columnIndex}`"
        class="column"
      >
        <GalleryPhotoCell
          v-for="{ photo, index } in column"
          :key="photo.id"
          :photo="photo"
          :href="`${basePath}/${photo.id}`"
          :cloud-name="cloudName"
          :eager="index < EAGER_PHOTO_COUNT"
          :priority="index < 2"
          :loaded="loaded.has(photo.id)"
          :morph="morphName(photo.id) === 'photo'"
          @open="openPhoto($event, photo.id)"
          @warm="warmCell(photo)"
          @load="markLoaded($event, photo.id)"
          @ready="loaded.add(photo.id)"
        />
      </div>
    </template>

    <template v-else>
      <GalleryPhotoCell
        v-for="(photo, index) in photos"
        :key="photo.id"
        :photo="photo"
        :href="`${basePath}/${photo.id}`"
        :cloud-name="cloudName"
        :eager="index < EAGER_PHOTO_COUNT"
        :priority="index < 2"
        :loaded="loaded.has(photo.id)"
        :morph="morphName(photo.id) === 'photo'"
        @open="openPhoto($event, photo.id)"
        @warm="warmCell(photo)"
        @load="markLoaded($event, photo.id)"
        @ready="loaded.add(photo.id)"
      />
    </template>
  </div>
</template>

<style scoped>
.wall {
  --row-h: 320px;
  --gap: 8px;
}

/* ---- justified：等高橫列 -------------------------------------------------
 * flex 依 flex-grow 比例分配剩餘空間。當 grow 與 basis 都正比於長寬比 --ar 時，
 * 同一列每個項目的最終寬度都是 ar × k（k 對整列相同），配合 aspect-ratio 得到的
 * 高度就是 k —— 整列等高、每張保持原比例、不需要裁切。
 *
 * 絕對不能給格子寫死 height：那會退化成「固定列高 + 裁切」，等於放棄 justified。
 */
.wall[data-layout="justified"] {
  display: flex;
  flex-wrap: wrap;
  gap: var(--gap);
}

/* 讓最後一列維持原始列高，不被撐滿整行 */
.wall[data-layout="justified"]::after {
  content: "";
  flex-grow: 999999;
}

.wall[data-layout="justified"] :deep(.cell) {
  flex: var(--ar) 1 calc(var(--ar) * var(--row-h));
  aspect-ratio: var(--ar);

  /* 夾擠：最後一列只剩一張時不要撐到超寬；全景圖不要吃掉整列 */
  min-width: 120px;
  max-width: 60%;
}

/* ---- masonry：等寬直向瀑布流，欄由 JS 分好（見 masonryColumns） ------------- */
.wall[data-layout="masonry"] {
  display: flex;
  gap: var(--gap);
}

.column {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: var(--gap);
  min-width: 0;
}

.wall[data-layout="masonry"] :deep(.cell) {
  aspect-ratio: var(--ar);
}

/* ---- square：等大方格，一眼掃完整本 ---------------------------------------- */
.wall[data-layout="square"] {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--gap);
}

.wall[data-layout="square"] :deep(.cell) {
  aspect-ratio: 1;
}

@media (width <= 1024px) {
  .wall {
    --row-h: 240px;
  }

  .wall[data-layout="square"] {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}

@media (width <= 640px) {
  .wall {
    --row-h: 180px;
    --gap: 4px;
  }

  /* 視窗窄到一列只放得下一張時，不要再夾在 60% —— 那會在右邊留一大塊空白 */
  .wall[data-layout="justified"] :deep(.cell) {
    max-width: 100%;
  }

  .wall[data-layout="square"] {
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  }
}
</style>
