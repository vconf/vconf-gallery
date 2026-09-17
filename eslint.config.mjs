import antfu from '@antfu/eslint-config'

export default antfu({
  vue: true,
  typescript: true,
  ignores: [
    // build 產生的資料快照，不是手寫的程式碼
    'server/assets/gallery.json',
    'scripts/*.sql',
    '.nuxt',
    '.output',
    '.wrangler',
    'worker-configuration.d.ts',
  ],
}, {
  rules: {
    // 與 Vconf 官網一致：每行最多 3 個屬性
    'vue/max-attributes-per-line': ['error', { singleline: 3 }],
  },
})
