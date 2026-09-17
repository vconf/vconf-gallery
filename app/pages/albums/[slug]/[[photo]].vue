<script setup lang="ts">
import type { PublicPhoto } from '#shared/types'
import type { WallLayout } from '~/components/gallery/wallLayouts'
import { useInfiniteScroll, useMediaQuery } from '@vueuse/core'
import { PHOTO_PAGE_SIZE, photoUrl } from '#shared/utils/photo'
import { DEFAULT_WALL_LAYOUT, MOBILE_WALL_LAYOUT } from '~/components/gallery/wallLayouts'

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
const layout = ref<WallLayout>(DEFAULT_WALL_LAYOUT)

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
  () => (visible.value += PHOTO_PAGE_SIZE),
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
const index = computed(() => (photoId.value ? all.value.findIndex(p => p.id === photoId.value) : -1))
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

  return all.value[(index.value + offset + n) % n]!.id
}

const prevId = computed(() => wrapped(-1))
const nextId = computed(() => wrapped(1))

/** 往後再多備兩張：連按右鍵瀏覽是最常見的行為，只備一張會被追過。同樣會繞一圈 */
const lookahead = computed(() => [wrapped(2), wrapped(3)].filter((id): id is string => !!id))

const effectiveLayout = computed<WallLayout>(() => (isMobile.value ? MOBILE_WALL_LAYOUT : layout.value))
const base = computed(() => `/albums/${slug.value}`)

const stripPhotos = computed(() =>
  all.value.slice(0, 12).map(photo => ({
    id: photo.id,
    href: `${base.value}/${photo.id}`,
    label: photo.caption ?? '放大檢視照片',
  })),
)

function selectPhoto(id: string) {
  // replace：瀏覽 20 張只留一筆 history，不是 20 筆。
  // 這裡刻意不做轉場：換一張只要 44ms，套上形變反而讓人覺得變慢。
  navigateTo(`${base.value}/${id}`, { replace: true })
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
      :lookahead="lookahead"
      @close="closeLightbox"
      @select="selectPhoto"
    />
  </div>
</template>
