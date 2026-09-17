<script setup lang="ts">
// 前台外殼。刻意極簡：照片是主角，chrome 安靜、不做捲動動畫。
</script>

<template>
  <div class="flex min-h-svh flex-col bg-ink text-paper">
    <header class="sticky top-0 z-30 bg-ink/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-6 px-4 md:px-6">
        <NuxtLink
          to="/"
          class="flex items-center"
          aria-label="回到 v-conf Gallery 首頁"
        >
          <img
            src="/brand/nav-logo.svg"
            alt=""
            aria-hidden="true"
            width="220"
            height="38"
            class="h-[22px] w-auto md:h-[26px]"
          >
        </NuxtLink>

        <a
          href="https://v-conf.vue.tw/"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex shrink-0 items-center gap-1.5 text-[13px] text-haze transition-colors hover:text-paper"
        >
          官方網站
          <svg
            viewBox="0 0 12 12"
            class="size-2.5"
            aria-hidden="true"
          >
            <path
              d="M4 2h6v6M10 2L2 10"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
          <span class="sr-only">（開新視窗）</span>
        </a>
      </div>
    </header>

    <main class="flex-1 pt-6 md:pt-8">
      <slot />
    </main>

    <footer class="mx-auto mt-20 w-full max-w-[1440px] px-4 pb-14 text-[13px] text-haze md:px-6">
      <p>v-conf Taiwan · 活動現場照片</p>
    </footer>
  </div>
</template>
