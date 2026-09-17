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

    /*
     * 標記「這是燈箱的形變」，讓 CSS 把整頁的淡入淡出關掉（見 main.css）。
     * 照片在展開的同時背景又在淡，看起來會像整頁離場 —— 而使用者的心理模型是
     * 「這張照片放大了」，不是「換了一頁」。
     */
    const root = document.documentElement
    root.dataset.viewTransition = 'photo'

    const vt = document.startViewTransition(async () => {
      await update()
      await nextTick()
    })

    // 被下一個轉場打斷是正常的（連按時會發生），不要讓它變成未處理的 rejection
    vt.finished.catch(() => {}).finally(() => {
      delete root.dataset.viewTransition
    })
  }
}
