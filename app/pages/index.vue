<script setup lang="ts">
import type { AlbumSummary } from '#shared/types'

/**
 * 不要 await：`await useFetch(...)` 會讓 setup 變成 async，之後 `getCurrentInstance()` 是 null，
 * 任何需要 Nuxt instance 的 composable 都會壞掉。SSR 不受影響，Nuxt 本來就會等 asyncData。
 */
const { data: albums } = useFetch<AlbumSummary[]>('/api/albums')

const { site } = useAppConfig()

// contact sheet 拿各相簿最前面的幾張混成一條，代表「這個活動長什麼樣子」。
// 每一張都連回它自己那本相簿的那張照片 —— 會動又不能點就只是裝飾。
const stripPhotos = computed(() =>
  (albums.value ?? []).flatMap(album =>
    album.previewPhotoIds.slice(0, 4).map(id => ({
      id,
      href: `/albums/${album.slug}/${id}`,
      label: `${album.name}的照片`,
    })),
  ),
)

useSeoMeta({
  title: site.name,
  description: site.description,
  ogTitle: site.name,
  ogDescription: site.description,
})
</script>

<template>
  <div>
    <GalleryContactStrip
      :photos="stripPhotos"
      class="mb-12"
    />

    <div class="mx-auto max-w-[1440px] px-4 md:px-6">
      <h1 class="sr-only">
        {{ site.name }}
      </h1>

      <div v-if="albums?.length">
        <GalleryAlbumRow
          v-for="album in albums"
          :key="album.slug"
          :album="album"
        />
      </div>

      <!-- 空狀態是邀請，不是道歉 -->
      <p
        v-else
        class="py-24 text-[15px] text-haze"
      >
        還沒有公開的相簿。到後台建立第一本。
      </p>
    </div>
  </div>
</template>
