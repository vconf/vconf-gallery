<script setup lang="ts">
import type { PublicPhoto } from '#shared/types'
import { photoUrl, wallSrcSet } from '#shared/utils/photo'

defineProps<{
  photo: PublicPhoto
  href: string
  cloudName: string
  /** 首屏的幾張不要 lazy */
  eager: boolean
  /** 真正的 LCP 候選才給 high，給太多等於沒有優先序 */
  priority: boolean
  /** 圖片已經可以顯示；在那之前蓋著 LQIP */
  loaded: boolean
  /** 這張正要被點開，掛上 view-transition-name 讓它形變成燈箱大圖 */
  morph: boolean
}>()

const emit = defineEmits<{
  open: [event: MouseEvent]
  warm: []
  load: [event: Event]
}>()
</script>

<template>
  <NuxtLink
    :to="href"
    class="cell"
    :style="{ '--ar': photo.width / photo.height, 'backgroundColor': photo.placeholderColor ?? '#0d1226' }"
    :aria-label="photo.caption ?? '放大檢視照片'"
    @click="emit('open', $event)"
    @mouseenter="emit('warm')"
    @focus="emit('warm')"
    @touchstart.passive="emit('warm')"
  >
    <!--
      LQIP 延遲 300ms 才現身（純 CSS animation delay，不需要計時器）。
      真圖若在那之前就回來，這一層根本不會被畫出來，省掉一次「模糊→清晰」的重繪。
    -->
    <div
      v-if="photo.placeholder && !loaded"
      class="lqip"
      :style="{ backgroundImage: `url(${photo.placeholder})` }"
      aria-hidden="true"
    />

    <img
      v-if="cloudName"
      :src="photoUrl(cloudName, photo.id, 'h480')"
      :srcset="wallSrcSet(cloudName, photo.id)"
      :alt="photo.caption ?? ''"
      :width="photo.width"
      :height="photo.height"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="priority ? 'high' : 'auto'"
      decoding="async"
      :data-photo-id="photo.id"
      :style="{ viewTransitionName: morph ? 'photo' : undefined }"
      :class="loaded ? 'opacity-100' : 'opacity-0'"
      @load="emit('load', $event)"
    >
  </NuxtLink>
</template>

<style scoped>
.cell {
  position: relative;
  overflow: hidden;
}

/* LQIP 只有 20px 寬，放大本身就是模糊的，不需要另外上 filter */
.lqip {
  position: absolute;
  inset: 0;
  background-position: center;
  background-size: cover;
  opacity: 0;

  /* 0 秒的動畫、延遲 300ms —— 等於「300ms 後才顯示」 */
  animation: lqip-in 0s 300ms forwards;
}

@keyframes lqip-in {
  to {
    opacity: 1;
  }
}

.cell img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;

  /* 刻意沒有 opacity 的 transition：LQIP 與真圖是同一張畫面，交叉淡入會疊加合成造成閃爍 */
  transition: transform 0.5s ease-out;
}

/* 與官網一致的 hover：圖片本身微幅放大，外框不動 */
@media (prefers-reduced-motion: no-preference) {
  .cell:hover img,
  .cell:focus-visible img {
    transform: scale(1.04);
  }
}
</style>
