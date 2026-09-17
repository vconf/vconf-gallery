<script setup lang="ts">
import type { WallLayout } from './PhotoWall.vue'
import { useLocalStorage } from '@vueuse/core'

const layout = defineModel<WallLayout>({ required: true })

const OPTIONS: { value: WallLayout, label: string }[] = [
  { value: 'justified', label: '等高橫列' },
  { value: 'masonry', label: '瀑布流' },
  { value: 'square', label: '方格' },
]

/**
 * 排列偏好記在瀏覽器就好：這是個人的看法習慣，不需要進資料庫。
 * useLocalStorage 會自己處理 SSR（伺服器端回預設值）與讀寫失敗。
 */
const stored = useLocalStorage<WallLayout>('vconf-gallery:layout', 'justified')

onMounted(() => {
  if (OPTIONS.some(o => o.value === stored.value))
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
      v-for="option in OPTIONS"
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
      <!--
        三個圖示要一眼分得出來，所以刻意把「方向」拉到最大對比：
        橫列＝扁平的橫條、瀑布流＝細長的直條、方格＝等大方塊。
        只靠「幾個小矩形排列不同」在 16px 下分不出來。
      -->

      <!-- 等高橫列：兩條扁橫列，每列切成不等寬 -->
      <svg
        v-if="option.value === 'justified'"
        viewBox="0 0 16 16"
        class="size-4"
        aria-hidden="true"
        fill="currentColor"
      >
        <rect
          x="1"
          y="3"
          width="9"
          height="4"
          rx="1"
        />
        <rect
          x="11"
          y="3"
          width="4"
          height="4"
          rx="1"
        />
        <rect
          x="1"
          y="9"
          width="4"
          height="4"
          rx="1"
        />
        <rect
          x="6"
          y="9"
          width="9"
          height="4"
          rx="1"
        />
      </svg>

      <!-- 瀑布流：三根細直條，長度不一 -->
      <svg
        v-else-if="option.value === 'masonry'"
        viewBox="0 0 16 16"
        class="size-4"
        aria-hidden="true"
        fill="currentColor"
      >
        <rect
          x="1.5"
          y="2"
          width="3.5"
          height="9"
          rx="1"
        />
        <rect
          x="6.25"
          y="2"
          width="3.5"
          height="12"
          rx="1"
        />
        <rect
          x="11"
          y="2"
          width="3.5"
          height="6"
          rx="1"
        />
      </svg>

      <!-- 方格：等大方塊 -->
      <svg
        v-else
        viewBox="0 0 16 16"
        class="size-4"
        aria-hidden="true"
        fill="currentColor"
      >
        <rect
          x="1.5"
          y="2"
          width="5.5"
          height="5.5"
          rx="1"
        />
        <rect
          x="9"
          y="2"
          width="5.5"
          height="5.5"
          rx="1"
        />
        <rect
          x="1.5"
          y="8.5"
          width="5.5"
          height="5.5"
          rx="1"
        />
        <rect
          x="9"
          y="8.5"
          width="5.5"
          height="5.5"
          rx="1"
        />
      </svg>
    </button>
  </div>
</template>
