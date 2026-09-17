<script setup lang="ts">
import type { AlbumSummary } from '#shared/types'
import { photoUrl } from '#shared/utils/photo'

defineProps<{
  album: AlbumSummary
}>()

// runtime config 不會變，setup 當下取值即可；包成 computed 只會留著惰性求值的地雷
const cloudName = useRuntimeConfig().public.cloudinaryCloudName

function formatDate(date: string | null) {
  return date ? date.replaceAll('-', '.') : null
}
</script>

<template>
  <!--
    一列一個相簿，而不是等寬方形卡片牆。
    卡片牆是為幾十上百個相簿設計的；這裡只有 5~15 個，列表更好掃、也更像一本目錄。
  -->
  <NuxtLink
    :to="`/albums/${album.slug}`"
    class="group flex items-center justify-between gap-6 border-t border-white/8 py-7 transition-colors hover:border-vue/40"
  >
    <div class="min-w-0">
      <h2 class="font-display text-[clamp(28px,4vw,44px)] leading-[1.1] tracking-[-0.02em]">
        {{ album.name }}
      </h2>
      <p class="mt-1 text-[13px] text-haze">
        {{ album.photoCount }} 張<template v-if="formatDate(album.eventDate)">
          · {{ formatDate(album.eventDate) }}
        </template>
      </p>
    </div>

    <div
      class="hidden shrink-0 gap-1.5 sm:flex"
      aria-hidden="true"
    >
      <img
        v-for="photo in album.previewPhotos.slice(0, 5)"
        :key="photo.id"
        :src="photoUrl(cloudName, photo.id, 'h320')"
        alt=""
        loading="lazy"
        decoding="async"
        class="h-16 w-16 object-cover md:h-20 md:w-20"
      >
    </div>
  </NuxtLink>
</template>
