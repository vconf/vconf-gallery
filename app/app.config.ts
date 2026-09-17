/**
 * 站台的身分與導覽資料。畫面一律從這裡讀，不在元件裡各寫一份。
 *
 * 放 app.config 而不是 runtimeConfig：這些是文案，build 時就定了，
 * 不需要（也不該）被執行時的環境變數換掉。runtimeConfig 留給真正會隨環境變動的值。
 */
export default defineAppConfig({
  site: {
    name: 'v-conf Taiwan Gallery',
    description: 'v-conf Taiwan 活動現場照片。',
    /** 頁尾那一行。跟 name 不同字：頁尾是署名，不是標題 */
    footer: 'v-conf Taiwan · 活動現場照片',
  },

  /** 頁首右側的站外連結。之後要加第二條，這裡加一筆就好，版面不用動 */
  navLinks: [
    { label: '官方網站', href: 'https://v-conf.vue.tw/' },
  ],
})
