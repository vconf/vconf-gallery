import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * GSAP 只在 client 載入：捲動進場純粹是裝飾，SSR 不需要它，
 * 也不該進到 Worker 的 bundle（免費方案每次請求只有 10ms CPU）。
 */
export default defineNuxtPlugin(() => {
  gsap.registerPlugin(ScrollTrigger)

  return {
    provide: { gsap, ScrollTrigger },
  }
})
