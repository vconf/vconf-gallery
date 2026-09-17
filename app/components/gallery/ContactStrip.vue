<script setup lang="ts">
import { useDocumentVisibility, useElementVisibility, useMediaQuery, usePreferredReducedMotion } from '@vueuse/core'
import { photoUrl, stripSrcSet } from '#shared/utils/photo'

export interface StripPhoto {
  id: string
  /**
   * 長寬比（寬 / 高）。每張的高度固定，寬度由這個值決定。
   *
   * 一定要給：沒有它就得等圖片載入完才知道有多寬，而每一張載完都會把後面全部往右推 ——
   * 實測那是相簿頁 0.18 / 首頁 0.13 的 CLS，畫面上就是頂端那條橫著抖一下。
   */
  ar: number
  /** 點下去要去哪 —— 相簿頁是同一本，首頁則各自回到自己那本 */
  href: string
  label: string
}

const props = defineProps<{
  photos: StripPhoto[]
}>()

// runtime config 不會變，setup 當下取值即可；包成 computed 只會留著惰性求值的地雷
const cloudName = useRuntimeConfig().public.cloudinaryCloudName
const root = ref<HTMLElement | null>(null)

/**
 * 無限迴圈的動畫離開視窗或分頁切走時一定要停 —— 否則 rAF 會一直跑，
 * 白白燒 CPU 與電池。`prefers-reduced-motion: reduce` 則整個不動。
 */
const reduced = usePreferredReducedMotion()
const onScreen = useElementVisibility(root)
const pageVisible = useDocumentVisibility()
/**
 * 互動中就停下來。
 *
 * `:hover` 在觸控裝置上不成立，所以另外聽 touch：手指按著就停、放開才繼續，
 * 讓人可以在手機上按住看清楚某一張。
 */
const interacting = ref(false)

const running = computed(() =>
  reduced.value !== 'reduce'
  && onScreen.value
  && pageVisible.value === 'visible'
  && !interacting.value,
)

/**
 * 跑一圈的時間跟照片數成正比，張數多也不會變快。
 * 手機一次只看得到兩三張，速度要放慢，不然會覺得在閃。
 */
const isMobile = useMediaQuery('(max-width: 640px)')
const duration = computed(() => {
  const perPhoto = isMobile.value ? 5.5 : 3.5

  return `${Math.max(30, props.photos.length * perPhoto)}s`
})

/**
 * 同一份跑兩次，位移到 -50% 時剛好接回開頭。
 * 第二份是純視覺的複本：不進 tab 順序、對輔助技術隱藏，否則鍵盤會走到兩次同樣的照片。
 */
const track = computed(() => [
  ...props.photos.map(photo => ({ ...photo, clone: false })),
  ...props.photos.map(photo => ({ ...photo, clone: true })),
])
</script>

<template>
  <div
    v-if="photos.length"
    ref="root"
    class="strip"
    @pointerenter="interacting = true"
    @pointerleave="interacting = false"
    @touchstart.passive="interacting = true"
    @touchend.passive="interacting = false"
    @touchcancel.passive="interacting = false"
  >
    <div
      class="track"
      :class="{ 'track--paused': !running }"
      :style="{ '--duration': duration }"
    >
      <NuxtLink
        v-for="(photo, index) in track"
        :key="`${photo.id}-${index}`"
        :to="photo.href"
        no-prefetch
        class="shot"
        :style="{ '--ar': photo.ar }"
        :tabindex="photo.clone ? -1 : undefined"
        :aria-hidden="photo.clone ? 'true' : undefined"
        :aria-label="photo.clone ? undefined : photo.label"
      >
        <img
          :src="photoUrl(cloudName, photo.id, 'h320')"
          :srcset="stripSrcSet(cloudName, photo.id)"
          alt=""
          loading="lazy"
          decoding="async"
        >
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.strip {
  overflow: hidden;
  height: 180px;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
  mask-image: linear-gradient(to right, transparent, #000 6%, #000 94%, transparent);
}

.track {
  display: flex;
  gap: 4px;
  width: max-content;
  height: 100%;
  animation: marquee var(--duration, 60s) linear infinite;
  will-change: transform;
}

/* 暫停一律由 interacting / 可見性 / reduced-motion 決定，只有這一個來源 */
.track--paused {
  animation-play-state: paused;
}

.shot {
  display: block;
  height: 100%;
  flex: none;

  /* 高度固定，寬度由長寬比推出來 —— 在圖片載入之前就定下來，才不會逐張推擠 */
  aspect-ratio: var(--ar, 3 / 2);
  overflow: hidden;
}

.shot img {
  height: 100%;
  width: 100%;
  object-fit: cover;
  transition: transform 0.5s ease-out;
}

@media (prefers-reduced-motion: no-preference) {
  .shot:hover img,
  .shot:focus-visible img {
    transform: scale(1.05);
  }
}

@keyframes marquee {
  to {
    transform: translateX(calc(-50% - 2px));
  }
}

/* 平板 */
@media (width <= 1024px) {
  .strip {
    height: 150px;
  }
}

/* 手機 */
@media (width <= 640px) {
  .strip {
    height: 108px;

    /* 視窗窄，邊緣的漸層要收窄一點，否則看得到的照片會太少 */
    -webkit-mask-image: linear-gradient(to right, transparent, #000 4%, #000 96%, transparent);
    mask-image: linear-gradient(to right, transparent, #000 4%, #000 96%, transparent);
  }
}

@media (prefers-reduced-motion: reduce) {
  .track {
    animation: none;
  }
}
</style>
