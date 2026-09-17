/**
 * 用原生 View Transition 包住一次導頁。
 *
 * 跟 Nuxt 內建的差別是 promise 由我們自己 resolve（DOM 更新完就好），
 * 不依賴 `page:finish` —— 同一個頁面元件內的參數變化不會觸發那個 hook。
 *
 * 不支援的瀏覽器直接執行，不需要 fallback；`prefers-reduced-motion` 由 CSS 那邊關掉動畫。
 */
export function useViewTransition() {
  return async function transition(update: () => void | Promise<void>) {
    if (!import.meta.client || typeof document.startViewTransition !== 'function') {
      await update()

      return
    }

    const vt = document.startViewTransition(async () => {
      await update()
      await nextTick()
    })

    // 被下一個轉場打斷是正常的（連按時會發生），不要讓它變成未處理的 rejection
    vt.finished.catch(() => {})
  }
}
