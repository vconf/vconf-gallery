/**
 * 照片牆的排列方式。這是 `WallLayout` 這個型別、切換器的按鈕、以及預設值的**唯一**來源。
 *
 * 圖示也放在這裡（而不是在切換器的 template 裡寫三段 SVG）：
 * 每個排列的按鈕長得一樣，只有矩形座標不同，用 v-if 一段一段展開的話，
 * 多一種排列就得同時改資料與版面兩處，而版面那處很容易漏。
 *
 * 三個圖示刻意把「方向」拉到最大對比 —— 橫列＝扁橫條、瀑布流＝細直條、方格＝等大方塊。
 * 只靠「幾個小矩形排列不同」在 16px 下分不出來。
 */

/** 16×16 viewBox 裡的一個矩形：[x, y, width, height] */
export type IconRect = readonly [number, number, number, number]

export const WALL_LAYOUTS = [
  {
    value: 'justified',
    label: '等高橫列',
    // 兩條扁橫列，每列切成不等寬
    icon: [[1, 3, 9, 4], [11, 3, 4, 4], [1, 9, 4, 4], [6, 9, 9, 4]],
  },
  {
    value: 'masonry',
    label: '瀑布流',
    // 三根細直條，長度不一
    icon: [[1.5, 2, 3.5, 9], [6.25, 2, 3.5, 12], [11, 2, 3.5, 6]],
  },
  {
    value: 'square',
    label: '方格',
    // 等大方塊
    icon: [[1.5, 2, 5.5, 5.5], [9, 2, 5.5, 5.5], [1.5, 8.5, 5.5, 5.5], [9, 8.5, 5.5, 5.5]],
  },
] as const satisfies readonly {
  value: string
  label: string
  icon: readonly IconRect[]
}[]

export type WallLayout = (typeof WALL_LAYOUTS)[number]['value']

export const DEFAULT_WALL_LAYOUT: WallLayout = 'justified'

/** 窄螢幕強制用的排列。是版型的物理限制，不是使用者偏好，所以不進 localStorage */
export const MOBILE_WALL_LAYOUT: WallLayout = 'masonry'

export function isWallLayout(value: unknown): value is WallLayout {
  return WALL_LAYOUTS.some(option => option.value === value)
}
