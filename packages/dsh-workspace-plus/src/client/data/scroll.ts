/**
 * 拖到容器边缘时的自动滚动
 *
 * 原生拖放自带边缘自动滚动，但指针要进到贴着容器边缘的十几像素里才生效，再往里一点就完全不滚
 * 拖拽期间滚轮又被浏览器吞在自己的拖放循环里，事件根本不到页面
 * 两条叠起来就是「拖着会话想翻到列表另一头几乎没法用」，这一段因此由本包自己补
 *
 * 纯算术：各容器矩形与指针位置都由调用方取好传进来，这里不碰 DOM
 * jsdom 不做版式，这一层的用例因此在 node 环境下按数值断言
 */

/** 触发带宽度：指针进到距边缘这么多像素以内就开始滚 */
export const SCROLL_REACH = 48

/** 贴住边缘时每秒滚动的像素上限 */
export const SCROLL_MAX_SPEED = 1000

/** 一个可滚容器在视口里的范围 */
export interface ScrollBox {
  top: number
  bottom: number
  left: number
  right: number
}

/** 一次滚动落点：滚哪个容器、这一帧滚多少像素 */
export interface ScrollStep {
  /** 容器在传入数组里的下标，不滚时为 -1 */
  index: number
  /** 这一帧的位移，正数向下 */
  step: number
}

/**
 * 触发带的实际宽度
 *
 * 容器太矮时上下两条带会在中间重叠，那时各取一半：
 * 宁可带子窄，也不要同一处既算向上又算向下，两处一起滚会互相抵消
 * @param box - 容器范围
 * @param reach - 期望的触发带宽度
 */
function bandWidthOf(box: ScrollBox, reach: number): number {
  return Math.min(reach, (box.bottom - box.top) / 2)
}

/**
 * 指针这一帧落在哪一个容器的触发带里
 *
 * 先取指针在其范围内的那一个，同在其中时取文档序里靠后的（嵌套容器先滚内层）
 * 都不在范围内时，取纵向离边缘最近的那一个
 *
 * 横向必须落在容器的左右缘之间。侧栏之外是会话区，指针移到那边不该把侧栏滚起来
 * 纵向则允许越出：用户把指针推到容器下缘之下、窗口底缘，正是最常见的那一手
 *
 * @param boxes - 各容器的范围，按文档序
 * @param pointer - 指针位置
 * @param reach - 触发带宽度
 * @returns 容器的下标，哪个都不在带里时返回 -1
 */
function scrollTargetOf(
  boxes: readonly ScrollBox[],
  pointer: { x: number; y: number },
  reach: number,
): number {
  let inside = -1
  let outside = -1
  let nearest = Number.POSITIVE_INFINITY
  for (let index = 0; index < boxes.length; index += 1) {
    const box = boxes[index]
    if (box === undefined) continue
    if (pointer.x < box.left || pointer.x > box.right) continue
    const width = bandWidthOf(box, reach)
    if (width <= 0) continue
    if (pointer.y >= box.top && pointer.y <= box.bottom) {
      inside = index
      continue
    }
    const gap = pointer.y < box.top ? box.top - pointer.y : pointer.y - box.bottom
    if (gap >= width) continue
    if (gap < nearest) {
      nearest = gap
      outside = index
    }
  }
  return inside >= 0 ? inside : outside
}

/**
 * 这一帧该滚哪一个容器、滚多少像素
 *
 * 速度随指针深入触发带线性增长：刚进带时最慢，贴住边缘时到上限
 * @param input - 各容器的范围、指针位置与本帧时长，后两项缺省取本模块的常量档
 * @returns 容器下标与这一帧的位移，不滚时为 -1 与 0
 */
export function autoScrollStep(input: {
  boxes: readonly ScrollBox[]
  pointer: { x: number; y: number }
  elapsedMs: number
  reach?: number
  maxSpeed?: number
}): ScrollStep {
  const none: ScrollStep = { index: -1, step: 0 }
  if (input.elapsedMs <= 0) return none
  const reach = input.reach ?? SCROLL_REACH
  const index = scrollTargetOf(input.boxes, input.pointer, reach)
  if (index < 0) return none
  const box = input.boxes[index]
  if (box === undefined) return none
  const width = bandWidthOf(box, reach)
  if (width <= 0) return none

  const fromTop = input.pointer.y - box.top
  const fromBottom = box.bottom - input.pointer.y
  const upwards = fromTop < fromBottom
  const gap = upwards ? fromTop : fromBottom
  // 指针落在容器的中段时离两边都比触发带远，这一档不滚
  if (gap >= width) return none

  const ratio = Math.min(Math.max((width - gap) / width, 0), 1)
  const maxSpeed = input.maxSpeed ?? SCROLL_MAX_SPEED
  const pixels = maxSpeed * ratio * (input.elapsedMs / 1000)
  // 刚进带时每帧不足一个像素，四舍五入会变成零；只要还在带里就至少挪一个像素
  const step = Math.max(1, Math.round(pixels))
  return { index, step: upwards ? -step : step }
}
