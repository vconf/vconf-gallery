import { lightboxSizes, lightboxSrcSet, photoUrl } from '#shared/utils/photo'

/**
 * 預抓燈箱大圖，降低點下去的空白時間。
 *
 * 為什麼不是「idle 時把整頁都抓下來」：Cloudinary 免費方案一個月只有 20GB 流量，
 * 一頁 30 張 w1200 就是約 6MB，全抓等於每次瀏覽多燒 6MB，很快撞牆。
 *
 * 所以分成三層，由「意圖強度」決定要不要花這個流量：
 *   1. 滑過 / 聚焦 / 觸碰某張縮圖 → 抓那一張（意圖最明確，幾乎零浪費）
 *   2. 空閒時暖前幾張（多數人點的就是前面那幾張）
 *   3. 燈箱開著時抓前後各一張（由 PhotoLightbox 負責）
 *
 * 使用者開了「節省流量」就整個不做。
 */

/**
 * 空閒時暖幾張就好。
 *
 * 每張 w1200 約 130KB，暖 6 張就是 780KB —— 在首屏還在載縮圖時跟它們搶頻寬，
 * 反而讓「看得到的東西」變慢。3 張足以涵蓋多數人第一次點的位置。
 */
const IDLE_WARM_COUNT = 3

function scheduleIdle(task: () => void): number {
  return typeof requestIdleCallback === 'function'
    ? requestIdleCallback(task, { timeout: 2000 })
    : (setTimeout(task, 300) as unknown as number)
}

function cancelIdle(handle: number | undefined) {
  if (handle === undefined)
    return

  if (typeof cancelIdleCallback === 'function')
    cancelIdleCallback(handle)
  else clearTimeout(handle)
}

function saveDataOn(): boolean {
  const connection = (navigator as { connection?: { saveData?: boolean } }).connection

  return Boolean(connection?.saveData)
}

/**
 * 點下去之後最多等大圖多久才開始形變。
 *
 * 滑過縮圖時通常就已經抓完，這裡是立刻回來的；網路很慢時寧可用墊底縮圖先形變，
 * 也不要讓點擊之後畫面完全不動。
 */
const PRELOAD_TIMEOUT = 800

/** 載完並解碼。decode() 可能永遠不 resolve（見 PhotoWall 的 syncLoaded），所以一定要 race */
function settle(img: HTMLImageElement): Promise<void> {
  const loaded = img.complete && img.naturalWidth > 0
    ? Promise.resolve()
    : new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })

  return Promise.race([
    loaded.then(() => img.decode()).catch(() => {}),
    new Promise<void>(resolve => setTimeout(resolve, PRELOAD_TIMEOUT)),
  ])
}

export function usePhotoWarmup(cloudName: MaybeRefOrGetter<string>) {
  const images = new Map<string, HTMLImageElement>()
  let handle: number | undefined
  let stopped = false

  function request(photoId: string, aspectRatio: number): HTMLImageElement | null {
    const cloud = toValue(cloudName)

    if (!import.meta.client || !cloud)
      return null

    const cached = images.get(photoId)
    if (cached)
      return cached

    const img = new Image()
    // 順序要緊：先 sizes、再 srcset，最後才 src
    img.sizes = lightboxSizes(aspectRatio)
    img.srcset = lightboxSrcSet(cloud, photoId)
    img.src = photoUrl(cloud, photoId, 'w1200')
    images.set(photoId, img)

    return img
  }

  /**
   * 預抓一張燈箱大圖。
   *
   * 關鍵是走**跟燈箱完全相同的 srcset + sizes**，讓瀏覽器用同一套演算法挑同一個候選。
   * 自己寫死某一階的話，直式照片會猜中、橫式照片會猜錯 —— 而猜錯就等於完全沒預抓。
   */
  function warm(photoId: string, aspectRatio: number) {
    if (import.meta.client && !saveDataOn())
      request(photoId, aspectRatio)
  }

  /**
   * 點開前等大圖到手，形變才會落在清晰的大圖上，而不是墊底縮圖。
   *
   * 這是點下去「就是它」的意圖，所以不看節省流量 —— 反正燈箱打開也要抓同一張。
   */
  function preload(photoId: string, aspectRatio: number): Promise<void> {
    const img = request(photoId, aspectRatio)

    return img ? settle(img) : Promise.resolve()
  }

  /** 空閒時依序暖前幾張；一次一張，把時間讓回給捲動與解碼 */
  function warmFirst(photos: { id: string, width: number, height: number }[]) {
    if (!import.meta.client || saveDataOn())
      return

    // 重新呼叫時先取消上一輪，否則載入更多之後會有多條鏈同時在跑
    cancelIdle(handle)
    handle = undefined

    const queue = photos.slice(0, IDLE_WARM_COUNT)
    let index = 0

    const step = () => {
      if (stopped || index >= queue.length)
        return

      const photo = queue[index++]!
      warm(photo.id, photo.width / photo.height)
      handle = scheduleIdle(step)
    }

    handle = scheduleIdle(step)
  }

  onScopeDispose(() => {
    stopped = true
    cancelIdle(handle)
  })

  return { warm, warmFirst, preload }
}
