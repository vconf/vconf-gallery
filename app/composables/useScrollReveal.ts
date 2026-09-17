import { usePreferredReducedMotion } from '@vueuse/core'

/**
 * 捲動進場。
 *
 * **觸發用 IntersectionObserver，不用 GSAP 的 ScrollTrigger。**
 * ScrollTrigger 是拿「建立當下算好的捲動座標」去比對，而這個照片牆會一直追加項目、
 * 座標一直變 —— 實測慢捲時會有 6 格已經捲過去卻仍停在 opacity: 0，看起來就是「圖片跑不出來」。
 * IntersectionObserver 由瀏覽器逐幀算交集，不依賴預先算好的位置，快捲慢捲都可靠。
 *
 * 動畫本身仍然用 GSAP。
 *
 * 另外三件事都不能拿掉：
 * 1. **首屏元素整個跳過** —— 不是延後播，是完全不套用初始狀態，否則短視窗時第一排會停在隱形。
 * 2. **已現身的永遠不再被重設** —— 用 `data-revealed` 標記。載入更多時這支會重跑，
 *    不排除的話畫面上看過的照片會整批消失再重播一次，那就是閃爍。
 * 3. **保險：已經在視窗上方的一律直接顯示** —— 任何觸發機制都可能漏，漏掉的代價是照片永遠不出現。
 */
export function useScrollReveal(
  container: Ref<HTMLElement | null>,
  selector: string,
  deps: () => unknown = () => null,
) {
  const reduced = usePreferredReducedMotion()
  const { $gsap } = useNuxtApp() as unknown as { $gsap: typeof import('gsap').gsap }

  let observer: IntersectionObserver | null = null

  function reveal(el: HTMLElement, animate: boolean) {
    if (el.dataset.revealed === '1')
      return

    el.dataset.revealed = '1'
    observer?.unobserve(el)

    if (!animate || !$gsap) {
      el.style.opacity = ''
      el.style.transform = ''

      return
    }

    $gsap.to(el, {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.5,
      ease: 'power3.out',
      overwrite: true,
      clearProps: 'opacity,transform',
    })
  }

  function setup() {
    if (!container.value)
      return

    const all = Array.from(container.value.querySelectorAll<HTMLElement>(selector))
      .filter(el => el.dataset.revealed !== '1')

    if (reduced.value === 'reduce') {
      for (const el of all) reveal(el, false)

      return
    }

    observer ??= new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement

        // 已經捲過去（整個在視窗上方）的也要現身 —— 漏掉的代價是照片永遠不出現
        if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0)
          reveal(el, entry.isIntersecting)
      }
    }, { rootMargin: '0px 0px -80px 0px' })

    for (const el of all) {
      // 首屏的不做動畫，直接標記成已現身，否則下一輪重跑會把它們藏起來
      if (el.getBoundingClientRect().top < window.innerHeight) {
        reveal(el, false)
        continue
      }

      $gsap?.set(el, { opacity: 0, y: 24, scale: 0.98 })
      observer!.observe(el)
    }
  }

  onMounted(() => nextTick(setup))
  watch(deps, () => nextTick(setup))
  onBeforeUnmount(() => {
    observer?.disconnect()
    observer = null
  })
}
