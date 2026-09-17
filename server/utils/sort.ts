/**
 * 稀疏排序。
 *
 * 拖拉一張照片只送「這一張的新位置」，值取前後鄰居的中點，永遠是 1 個 UPDATE。
 * 這是被 D1 Free 逼出來的：每次 invocation 只有 50 個 query、每個 query 只有 100 個
 * bound parameter，送 500 張的完整順序陣列不論怎麼拆都會撞牆。
 *
 * sort_order 因此是 REAL 而不是 INTEGER：間隔 1000 的整數在同一個位置只能插 10 次
 * 就碰撞，浮點可撐數十次。真的撞到精度時再跑一次整本 renormalize。
 */

/** 批次上傳時前端自己算位置用的間隔。Worker 不准讀 MAX()：並行上傳會撞號 */
export const SORT_STEP = 1000

/** 兩個浮點數之間還有沒有空間可插。低於這個差距就該 renormalize 了 */
export const SORT_MIN_GAP = 1e-6

export function midpoint(before: number | null, after: number | null): number {
  if (before === null && after === null)
    return SORT_STEP
  if (before === null)
    return after! - SORT_STEP
  if (after === null)
    return before + SORT_STEP

  return (before + after) / 2
}

export function needsRenormalize(before: number | null, after: number | null): boolean {
  return before !== null && after !== null && Math.abs(after - before) < SORT_MIN_GAP
}
