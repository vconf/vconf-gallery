<script setup lang="ts">
import type { PublicPhoto } from '#shared/types'
import type { WallLayout } from '~/components/gallery/wallLayouts'
import { useInfiniteScroll, useMediaQuery } from '@vueuse/core'
import { PHOTO_PAGE_SIZE, photoUrl } from '#shared/utils/photo'
import { DEFAULT_WALL_LAYOUT, isWallLayout, MOBILE_WALL_LAYOUT } from '~/components/gallery/wallLayouts'

interface AlbumPayload {
  slug: string
  name: string
  description: string | null
  eventDate: string | null
  coverPhotoId: string | null
  photos: PublicPhoto[]
}

/**
 * 這個 script setup **刻意沒有任何 top-level await**。
 *
 * `await useFetch(...)` 會讓 setup 變成 async，而 await 之後 `getCurrentInstance()` 是 null，
 * 之後任何需要 Nuxt instance 的 composable 都會壞掉：輕則靜默失效（useMediaQuery 永遠回
 * 預設值，手機版型卡在 justified），重則整頁 500（NUXT_E1001，深連結單張照片時必現）。
 * 不 await 不影響 SSR／預渲染：Nuxt 本來就會等所有 asyncData 解析完才渲染。
 */
const route = useRoute()
const slug = computed(() => route.params.slug as string)
const photoId = computed(() => (route.params.photo as string | undefined) || null)

/**
 * `cloudName` 必須在 setup 當下就取值，不能包成 computed —— computed 是惰性的，
 * 第一次被讀到會是在 head 求值階段，那時已經離開 instance context。
 */
const cloudName = useRuntimeConfig().public.cloudinaryCloudName

// 同上：站台文案也要在 setup 當下取，才能安全地在 useSeoMeta 的 getter 裡用
const { site } = useAppConfig()

/**
 * 手機只給一種排列：螢幕窄時 justified 一列常常只放得下一張，右邊會留一大塊空白；
 * 而在那麼窄的畫面上提供三種排列，選項本身比差異還顯眼。等寬兩欄最乾淨。
 */
const isMobile = useMediaQuery('(max-width: 640px)')
/**
 * 排列偏好在 hydration **之前**就要套用，否則畫面會先亮預設值再跳掉。
 *
 * 公開頁面是預渲染的靜態檔，所有人拿到同一份 HTML —— 伺服器不可能知道這個人選了什麼
 * （cookie 也救不了，檔案是 build 時就產好的）。所以只能靠一段同步的 inline script：
 * `onPrehydrate` 會把下面這個函式序列化後放在 </body> 之前，DOM 已經在、又還沒繪製。
 *
 * 實測沒有它時：重新載入相簿頁有 20ms 亮著預設值，
 * 而深連結開單張照片再關閉，因為 hydration 較晚，那段長達 460ms。
 *
 * 這個函式**讀不到模組範圍的任何變數**（它是被字串化的），所以 key 與預設值都寫死在裡面。
 */
onPrehydrate(() => {
  try {
    const saved = localStorage.getItem('vconf-gallery:layout')

    if (!saved || !['justified', 'masonry', 'square'].includes(saved))
      return

    document.documentElement.dataset.wallLayout = saved

    // 切換器：選中的樣子綁在 aria-pressed 上，改屬性就等於改外觀
    for (const button of document.querySelectorAll('[data-option]'))
      button.setAttribute('aria-pressed', String((button as HTMLElement).dataset.option === saved))

    /*
     * 照片牆只在 justified ↔ square 之間直接換屬性就好 —— 這兩種是同一份 DOM、純 CSS 差異。
     * masonry 的 DOM 不一樣（自己分欄的 .column），這裡硬改屬性只會得到一個壞掉的版面，
     * 所以留給 Vue 在 hydration 時重建。
     */
    if (saved !== 'masonry') {
      for (const wall of document.querySelectorAll('.wall'))
        (wall as HTMLElement).dataset.layout = saved
    }
  }
  catch {
    // 無痕視窗、封鎖儲存空間：維持預設值即可
  }
})

/** 上面那段腳本已經把偏好放到 `<html>` 上，setup 當下讀它，Vue 第一次渲染就是對的 */
function initialLayout(): WallLayout {
  if (!import.meta.client)
    return DEFAULT_WALL_LAYOUT

  const saved = document.documentElement.dataset.wallLayout

  return isWallLayout(saved) ? saved : DEFAULT_WALL_LAYOUT
}

const layout = ref<WallLayout>(initialLayout())

const { data: album } = useFetch<AlbumPayload>(() => `/api/albums/${slug.value}`)

/**
 * 整本相簿一次拿到手（178 張含 LQIP 也才 116KB），所以「載入更多」只是把切片放大，
 * 完全不必再發請求 —— 捲到底不會有任何等待。
 */
const visible = ref(PHOTO_PAGE_SIZE)
const photos = computed(() => album.value?.photos.slice(0, visible.value) ?? [])
const hasMore = computed(() => visible.value < (album.value?.photos.length ?? 0))

useInfiniteScroll(
  () => (import.meta.client ? document : null),
  () => {
    visible.value += PHOTO_PAGE_SIZE
  },
  { distance: 800, canLoadMore: () => hasMore.value },
)

// 深連結到還沒切出來的那一張時，先把切片放大到看得到它，前後張才算得出來
watch([album, photoId], () => {
  if (!album.value || !photoId.value)
    return

  const index = album.value.photos.findIndex(photo => photo.id === photoId.value)
  if (index >= visible.value)
    visible.value = Math.ceil((index + 1) / PHOTO_PAGE_SIZE) * PHOTO_PAGE_SIZE
}, { immediate: true })

const all = computed(() => album.value?.photos ?? [])

/**
 * 燈箱正在看哪一張，**由這個本地狀態決定，不是網址**。
 *
 * 原本直接讀 `route.params.photo`。單張照片是獨立的預渲染路由，網址要等 router 導頁 +
 * 抓那一頁的 `_payload.json` 才更新 —— 導頁還沒完成時再按一次，算出來的 `nextId`
 * 還是同一張，導到同一個網址，那次按鍵就被吞掉。實測連按 12 次：間隔 200ms 只前進 8 張、
 * 80ms 只前進 4 張、30ms 只前進 2 張。
 *
 * 網址仍然會跟上（`selectPhoto` 用 replaceState），所以分享與重新整理不受影響。
 */
const activeId = ref<string | null>(null)
watch(photoId, (id) => {
  activeId.value = id
}, { immediate: true })

const index = computed(() => (activeId.value ? all.value.findIndex(p => p.id === activeId.value) : -1))
const lightboxPhoto = computed(() => (index.value >= 0 ? all.value[index.value]! : null))
/**
 * 前後張會繞一圈：最後一張再按下一張就回到第一張，反之亦然。
 *
 * 只有一張時回 null，讓箭頭整個不出現 —— 繞回自己沒有意義。
 */
function wrapped(offset: number) {
  const n = all.value.length
  if (index.value < 0 || n < 2)
    return null

  return all.value[(index.value + offset + n) % n]!
}

const prevId = computed(() => wrapped(-1)?.id ?? null)
const nextId = computed(() => wrapped(1)?.id ?? null)

/** 依操作優先序預抓，每張都保留自己的長寬比，確保瀏覽器挑中正確候選。 */
const warmupPhotos = computed(() => [wrapped(1), wrapped(-1), wrapped(2), wrapped(3)]
  .filter((photo): photo is PublicPhoto => !!photo))

const effectiveLayout = computed<WallLayout>(() => (isMobile.value ? MOBILE_WALL_LAYOUT : layout.value))
const base = computed(() => `/albums/${slug.value}`)

const stripPhotos = computed(() =>
  all.value.slice(0, 12).map(photo => ({
    id: photo.id,
    ar: photo.width / photo.height,
    href: `${base.value}/${photo.id}`,
    label: photo.caption ?? '放大檢視照片',
  })),
)

function selectPhoto(id: string) {
  // 先換畫面：本地狀態是同步的，連按多快都不會掉
  activeId.value = id

  /*
   * 網址用 replaceState 跟上，不走 router。
   *
   * 換一張不需要任何伺服器資料 —— 整本相簿的照片早就在 `all` 裡了。走 router 只會去抓
   * 那一頁的 `_payload.json`，那既是切換延遲的來源，也是連按會掉的原因。
   *
   * 一定要把 `history.state` 原封傳回去：closeLightbox 靠裡面的 `back` 判斷該 back
   * 還是導回相簿，router 的捲動位置也存在同一個物件裡。
   * 用 replace 而不是 push，維持原本「瀏覽 20 張只留一筆 history」的行為。
   */
  history.replaceState(history.state, '', `${base.value}/${id}`)
}

const transition = useViewTransition()

function closeLightbox() {
  // 從照片牆點進來的用 back，捲動位置才會還原；深連結直接進來就導回相簿
  const from = (history.state as { back?: string } | null)?.back

  transition(async () => {
    if (from?.startsWith(base.value))
      useRouter().back()
    else
      await navigateTo(base.value)
  })
}

function formatDate(date: string | null | undefined) {
  return date ? date.replaceAll('-', '.') : null
}

const pageTitle = () => (album.value ? `${album.value.name}｜${site.name}` : site.name)

useSeoMeta({
  title: pageTitle,
  description: () => album.value?.description ?? site.description,
  ogTitle: pageTitle,
  ogImage: () => {
    const id = photoId.value ?? album.value?.coverPhotoId
    return id ? photoUrl(cloudName, id, 'og') : undefined
  },
})
</script>

<template>
  <div v-if="album">
    <GalleryContactStrip
      :photos="stripPhotos"
      class="mb-10"
    />

    <div class="mx-auto max-w-[1440px] px-4 md:px-6">
      <NuxtLink
        to="/"
        class="mb-5 inline-flex items-center gap-1.5 text-[13px] text-haze transition-colors hover:text-paper"
      >
        <svg
          viewBox="0 0 16 16"
          class="size-3"
          aria-hidden="true"
        >
          <path
            d="M10 2L4 8l6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        所有相簿
      </NuxtLink>

      <div class="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 class="font-display text-[clamp(40px,6vw,88px)] leading-[1.05] tracking-[-0.02em]">
            {{ album.name }}
          </h1>
          <p class="mt-2 text-[15px] text-haze">
            {{ album.photos.length }} 張<template v-if="formatDate(album.eventDate)">
              · {{ formatDate(album.eventDate) }}
            </template>
          </p>
        </div>

        <GalleryWallLayoutSwitch
          v-model="layout"
          class="hidden sm:flex"
        />
      </div>

      <GalleryPhotoWall
        :photos="photos"
        :base-path="base"
        :layout="effectiveLayout"
      />

      <p
        v-if="!album.photos.length"
        class="py-24 text-[15px] text-haze"
      >
        這本相簿還沒有照片。到後台上傳。
      </p>
    </div>

    <GalleryPhotoLightbox
      :photo="lightboxPhoto"
      :prev-id="prevId"
      :next-id="nextId"
      :index="index < 0 ? 0 : index"
      :total="album.photos.length"
      :warmup-photos="warmupPhotos"
      @close="closeLightbox"
      @select="selectPhoto"
    />
  </div>
</template>
