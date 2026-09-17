/**
 * 決定哪些導頁交給 Nuxt 的自動 View Transition。
 *
 * 只有「真的換頁」可以：首頁 ↔ 相簿、相簿 ↔ 相簿。
 *
 * **同一本相簿內的導頁一律關掉**（開燈箱、換照片、關燈箱）。理由是 Nuxt 的實作會等
 * `page:finish`，但 `/albums/x` 與 `/albums/x/{id}` 是同一個頁面元件、參數變化不會重新掛載，
 * 那個 hook 不會再觸發 —— 轉場的 promise 永遠不 resolve，撐到瀏覽器 4 秒逾時才放棄，
 * 並丟出 `TimeoutError: Transition was aborted because of timeout in DOM update`。
 *
 * 燈箱的形變改由 `useViewTransition()` 自己包，promise 由我們控制。
 */
export default defineNuxtRouteMiddleware((to, from) => {
  if (to.params.slug && to.params.slug === from.params.slug)
    to.meta.viewTransition = false
})
