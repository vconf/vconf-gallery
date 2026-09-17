<script setup lang="ts">
import type { PublicPhoto } from '#shared/types'
import { useElementBounding, useEventListener, useScrollLock, useSwipe, useWindowSize } from '@vueuse/core'
import { lightboxSizes, lightboxSrcSet, photoUrl, wallSrcSet } from '#shared/utils/photo'

const props = defineProps<{
  photo: PublicPhoto | null
  prevId: string | null
  nextId: string | null
  /** 第幾張 / 共幾張，給位置指示用 */
  index: number
  total: number
  /** 依操作優先序排列的預抓照片。 */
  warmupPhotos?: PublicPhoto[]
}>()

const emit = defineEmits<{
  close: []
  select: [photoId: string]
}>()

// runtime config 不會變，setup 當下取值即可；包成 computed 只會留著惰性求值的地雷
const cloudName = useRuntimeConfig().public.cloudinaryCloudName
const stage = ref<HTMLElement | null>(null)
const overlay = ref<HTMLElement | null>(null)
const imgEl = ref<HTMLImageElement | null>(null)

/**
 * 控制項貼著「照片」放，不是貼著視窗。
 *
 * 照片是 object-contain 置中的，直式或小張照片會在兩側留下大片黑色 —— 把箭頭釘在視窗邊緣
 * 會離照片非常遠，看起來不像同一組東西。改成量圖片實際的 bounding box 再往外推一個間距，
 * 並夾住最小邊距，視窗很窄時才不會被推出畫面。
 */
const GAP = 20
const BUTTON = 48
const EDGE = 16

const { left: imgLeft, right: imgRight, top: imgTop } = useElementBounding(imgEl)
const { width: viewportWidth } = useWindowSize()

const arrowLeft = computed(() => `${Math.max(EDGE, imgLeft.value - GAP - BUTTON)}px`)
const arrowRight = computed(() =>
  `${Math.max(EDGE, viewportWidth.value - imgRight.value - GAP - BUTTON)}px`,
)

/**
 * 關閉鈕**不壓在照片上**。
 *
 * 依序找有空間的地方放：
 *   1. 照片正上方（靠右對齊照片右緣）—— 直式或矮照片通常都有空間
 *   2. 照片右側的黑色留白 —— 照片滿高但不滿寬時
 *   3. 都沒有就退回視窗右上角（照片幾乎滿版，無可避免）
 */
const closePlacement = computed(() => {
  const needed = BUTTON + GAP + EDGE
  const above = imgTop.value >= needed
  const beside = viewportWidth.value - imgRight.value >= needed

  if (above) {
    return {
      top: `${imgTop.value - GAP - BUTTON}px`,
      right: `${Math.max(EDGE, viewportWidth.value - imgRight.value)}px`,
    }
  }

  if (beside) {
    return {
      top: `${Math.max(EDGE, imgTop.value)}px`,
      right: `${Math.max(EDGE, viewportWidth.value - imgRight.value - GAP - BUTTON)}px`,
    }
  }

  return { top: `${EDGE}px`, right: `${EDGE}px` }
})

/**
 * 大圖載好之前先鋪一張照片牆用過的縮圖。
 *
 * 那一張剛剛才顯示過，瀏覽器快取裡就有，所以是「立刻」出現；w1200 約 200KB，
 * 沒有這層墊底的話點下去會空白將近兩秒（實測 1648ms → 加上後 616ms，且感受上即時）。
 */
/**
 * 燈箱的實際顯示寬度。
 *
 * 舞台是 object-contain，所以直式照片是被「高度」限制的 —— 顯示寬度只有
 * `視窗高 × 長寬比`，遠小於 100vw。原本寫死 `sizes="100vw"`，瀏覽器就照視窗寬去挑，
 * 在 1440px / DPR 1 的螢幕上挑走 w_2000（556KB），而實際只需要 w_1200（126KB）。
 */
const sizes = computed(() =>
  props.photo ? lightboxSizes(props.photo.width / props.photo.height) : '100vw',
)

const ready = ref(false)

/** 等 decode 完成後直接換圖，但設 timeout 避免瀏覽器無限延後。 */
async function markReady(img: HTMLImageElement) {
  await Promise.race([
    img.decode().catch(() => {}),
    new Promise(resolve => setTimeout(resolve, 120)),
  ])

  if (img === imgEl.value)
    ready.value = true
}

async function onLoad(event: Event) {
  await markReady(event.target as HTMLImageElement)
}

/** 補抓 hydration 前已載完的圖片，避免燈箱永久透明。 */
async function syncReady() {
  await nextTick()

  if (imgEl.value?.complete && imgEl.value.naturalWidth > 0)
    await markReady(imgEl.value)
}

watch(() => props.photo?.id, () => {
  ready.value = false
  void syncReady()
}, { flush: 'post' })
onMounted(syncReady)

function go(id: string | null) {
  if (id)
    emit('select', id)
}

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    emit('close')
  }
  else if (e.key === 'ArrowLeft') {
    e.preventDefault()
    go(props.prevId)
  }
  else if (e.key === 'ArrowRight') {
    e.preventDefault()
    go(props.nextId)
  }
})

/**
 * 手機沒有左右鍵，改用滑動。
 *
 * 綁在整個燈箱而不是照片本身：手機上照片只佔畫面中間一條（448 寬的螢幕上只有 299 高），
 * 上下大片都是黑色 —— 只綁照片的話，滑在黑色區域完全沒反應，而使用者不會特地瞄準照片。
 */
useSwipe(overlay, {
  threshold: 48,
  onSwipeEnd(_e, direction) {
    if (direction === 'left')
      go(props.nextId)
    else if (direction === 'right')
      go(props.prevId)
  },
})

/**
 * 燈箱開著時才鎖住背景捲動。
 *
 * 一定要跟著 `photo` 走，不能寫在 onMounted —— 這個元件在燈箱關著時也是掛載狀態，
 * 無條件鎖的話整個相簿頁都捲不動。
 */
const locked = useScrollLock(computed(() => (import.meta.client ? document.body : null)))
watch(() => !!props.photo, (open) => {
  locked.value = open
}, { immediate: true })
onBeforeUnmount(() => (locked.value = false))

/** 每張用自己的比例產生 sizes，確保預抓與燈箱選到同一個候選。 */
const { warm } = usePhotoWarmup(cloudName)

watch(() => props.warmupPhotos, (photos) => {
  for (const photo of photos ?? [])
    warm(photo.id, photo.width / photo.height)
}, { immediate: true })
</script>

<template>
  <Teleport to="body">
    <!--
      關閉時淡出 150ms。
      手機上 fixed 疊層一被移除，底下的頁面會整個重繪、網址列也可能跟著回來改變視窗高度，
      直接消失就會看到閃一下；淡出把那一瞬間蓋掉。
    -->
    <Transition
      enter-active-class="transition-opacity duration-150"
      leave-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      leave-to-class="opacity-0"
    >
      <div
        v-if="photo"
        ref="overlay"
        class="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black py-16"
        role="dialog"
        aria-modal="true"
        :aria-label="photo.caption ?? '照片檢視'"
        @click.self="emit('close')"
      >
        <!--
          背景用同一張照片的 LQIP 放大鋪滿，再壓一層暗色。
          LQIP 只有 20px 寬，放大本身就是模糊的，不需要 filter: blur()（那在大面積上很吃 GPU）。
          資料已經在 payload 裡，零額外請求。
        -->
        <div
          v-if="photo.placeholder"
          class="pointer-events-none absolute inset-0 scale-110 bg-cover bg-center"
          :style="{ backgroundImage: `url(${photo.placeholder})` }"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute inset-0 bg-black/65"
          aria-hidden="true"
        />

        <!--
          跟照片牆的縮圖共用 `view-transition-name: photo`，瀏覽器才知道這兩者是「同一張」，
          會做形變而不是把縮圖當成「離場的元素」淡掉。

          名字掛在舞台、不是大圖本身：大圖在 decode 完成前是 opacity 0，
          拿它當新快照會形變成一片看不見的東西。舞台包住大圖與墊底縮圖，
          盒子大小就是照片實際顯示的大小，而且裡面永遠有一張看得到的圖。
        -->
        <div
          ref="stage"
          class="relative"
          :style="{ viewTransitionName: 'photo' }"
        >
          <img
            :key="photo.id"
            ref="imgEl"
            :src="photoUrl(cloudName, photo.id, 'w1200')"
            :srcset="lightboxSrcSet(cloudName, photo.id)"
            :sizes="sizes"
            :alt="photo.caption ?? ''"
            :width="photo.width"
            :height="photo.height"
            class="block h-auto max-h-[calc(100svh-8rem)] w-auto max-w-full object-contain"
            :class="ready ? 'opacity-100' : 'opacity-0'"
            decoding="async"
            fetchpriority="high"
            @load="onLoad"
          >
          <!-- 墊底的縮圖：與大圖同比例、同位置，所以切換時不會跳動 -->
          <!-- 墊底縮圖用「跟照片牆完全一樣的 srcset」，才保證命中瀏覽器快取、立刻出現 -->
          <img
            v-show="!ready"
            :src="photoUrl(cloudName, photo.id, 'h480')"
            :srcset="wallSrcSet(cloudName, photo.id)"
            alt=""
            aria-hidden="true"
            class="pointer-events-none absolute inset-0 size-full object-contain"
          >
        </div>

        <!--
        上下各留 4rem：照片幾乎滿版時，48px 的按鈕在黑邊裡物理上放不下 ——
        不保留這段空間，「叉叉不壓在照片上」就只能是「盡量不壓」。

        chrome：關閉、上下張、位置。
        刻意「常駐不自動隱藏」—— 會自己消失的控制項讓人不確定還能不能操作，
        而且要再動一次滑鼠才找得回來。半透明底 + backdrop blur 已經夠安靜，不會跟照片搶。
      -->
        <div class="pointer-events-none fixed inset-0">
          <button
            type="button"
            class="chrome-btn pointer-events-auto absolute grid size-10"
            :style="closePlacement"
            aria-label="關閉"
            @click="emit('close')"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-4"
              aria-hidden="true"
            >
              <path
                d="M2 2L22 22M22 2L2 22"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>

          <button
            v-if="prevId"
            type="button"
            class="chrome-btn pointer-events-auto absolute top-1/2 hidden size-12 -translate-y-1/2 md:grid"
            :style="{ left: arrowLeft }"
            aria-label="上一張"
            @click="go(prevId)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5"
              aria-hidden="true"
            >
              <path
                d="M15 3L6 12l9 9"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            v-if="nextId"
            type="button"
            class="chrome-btn pointer-events-auto absolute top-1/2 hidden size-12 -translate-y-1/2 md:grid"
            :style="{ right: arrowRight }"
            aria-label="下一張"
            @click="go(nextId)"
          >
            <svg
              viewBox="0 0 24 24"
              class="size-5"
              aria-hidden="true"
            >
              <path
                d="M9 3l9 9-9 9"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <!--
            位置指示做成膠囊：純文字疊在照片上，遇到亮的照片就看不清楚。
            底色與模糊跟關閉／左右鍵那幾顆一致，才像同一組控制項。
          -->
          <p class="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-3.5 py-1.5 text-[13px] leading-none tabular-nums text-paper ring-1 ring-white/15 backdrop-blur-md">
            <span>{{ index + 1 }}</span>
            <span class="mx-1 text-haze">/</span>
            <span class="text-haze">{{ total }}</span>
          </p>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/**
 * 燈箱上的控制項。
 *
 * 原本用 `bg-white/10`，疊在亮色照片上幾乎看不見 —— 活動照片有大量白牆與投影幕。
 * 改成深色半透明 + 細邊框 + blur（跟位置指示膠囊同一套），亮暗照片都讀得到。
 */
/*
 * 刻意不在這裡寫 display —— scoped style 會編成 `.chrome-btn[data-v-x]`，
 * 特異性 (0,2,0) 高過 Tailwind 的 `.hidden` (0,1,0)，
 * 會讓 `hidden md:grid` 完全失效（箭頭在手機上照樣出現）。display 一律由 utility 決定。
 */
.chrome-btn {
  place-items: center;
  border-radius: 9999px;
  background-color: rgb(0 0 0 / 45%);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 15%);
  color: var(--color-paper);
  backdrop-filter: blur(12px);

  /* 只換底色，不做位移或縮放 —— 放大會讓按鈕的可命中範圍跟著變，
     游標停在邊緣時就會 hover 進、放大、脫離、縮回，反覆彈跳。 */
  transition: background-color 0.2s ease;
}

.chrome-btn:hover,
.chrome-btn:focus-visible {
  background-color: rgb(0 0 0 / 65%);
}
</style>
