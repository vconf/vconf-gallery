<script setup lang="ts">
import type { WallLayout } from './wallLayouts'
import { useLocalStorage } from '@vueuse/core'
import { DEFAULT_WALL_LAYOUT, WALL_LAYOUT_STORAGE_KEY, WALL_LAYOUTS } from './wallLayouts'

const layout = defineModel<WallLayout>({ required: true })

/**
 * 排列偏好記在瀏覽器就好：這是個人的看法習慣，不需要進資料庫。
 * useLocalStorage 會自己處理 SSR（伺服器端回預設值）與讀寫失敗。
 */
const stored = useLocalStorage<WallLayout>(WALL_LAYOUT_STORAGE_KEY, DEFAULT_WALL_LAYOUT)

/**
 * 同時把目前的排列寫到 `<html data-wall-layout>`。
 *
 * 「哪一顆看起來是選中的」完全由 CSS 依 `aria-pressed` 決定，而那個屬性在 hydration
 * 之前就由相簿頁的 prehydrate 腳本設好了 —— 這個 watch 只是讓後續的切換繼續跟上。
 * 這裡**不**在 onMounted 回填 layout：那會等到 hydration 完成才跑，
 * 深連結進站時實測有 460ms 是亮著預設的第一顆。改由頁面在 setup 當下讀屬性。
 */
watch(layout, (value) => {
  stored.value = value

  if (import.meta.client)
    document.documentElement.dataset.wallLayout = value
}, { immediate: true })
</script>

<template>
  <div
    class="flex items-center gap-0.5 rounded-full border border-white/12 p-1"
    role="group"
    aria-label="照片排列方式"
  >
    <button
      v-for="option in WALL_LAYOUTS"
      :key="option.value"
      type="button"
      class="opt grid size-8 place-items-center rounded-full transition-colors"
      :data-option="option.value"
      :aria-pressed="layout === option.value"
      :aria-label="option.label"
      :title="option.label"
      @click="layout = option.value"
    >
      <svg
        viewBox="0 0 16 16"
        class="size-4"
        aria-hidden="true"
        fill="currentColor"
      >
        <rect
          v-for="([x, y, width, height], index) in option.icon"
          :key="index"
          :x="x"
          :y="y"
          :width="width"
          :height="height"
          rx="1"
        />
      </svg>
    </button>
  </div>
</template>

<style scoped>
/*
 * 選中的樣子綁在 `aria-pressed` 上，不綁 class。
 *
 * 這樣「哪一顆亮」只有一個來源，而且那個來源是伺服器渲染的 HTML 裡就有的屬性 ——
 * prehydrate 腳本改完屬性，第一次繪製就是對的，不必等 Vue hydrate 完才修正。
 */
.opt {
  color: var(--color-haze);
}

.opt:hover {
  color: var(--color-paper);
}

.opt[aria-pressed="true"] {
  background-color: rgb(255 255 255 / 12%);
  color: var(--color-paper);
}
</style>
