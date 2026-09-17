<script setup lang="ts">
import type { WallLayout } from './wallLayouts'
import { useLocalStorage } from '@vueuse/core'
import { DEFAULT_WALL_LAYOUT, isWallLayout, WALL_LAYOUTS } from './wallLayouts'

const layout = defineModel<WallLayout>({ required: true })

/**
 * 排列偏好記在瀏覽器就好：這是個人的看法習慣，不需要進資料庫。
 * useLocalStorage 會自己處理 SSR（伺服器端回預設值）與讀寫失敗。
 */
const stored = useLocalStorage<WallLayout>('vconf-gallery:layout', DEFAULT_WALL_LAYOUT)

onMounted(() => {
  // 存過的值可能是舊版本留下、現在已經不存在的排列，所以要驗過才套用
  if (isWallLayout(stored.value))
    layout.value = stored.value
})

watch(layout, value => (stored.value = value))
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
      class="grid size-8 place-items-center rounded-full transition-colors"
      :class="layout === option.value
        ? 'bg-white/12 text-paper'
        : 'text-haze hover:text-paper'"
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
