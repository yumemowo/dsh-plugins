/**
 * 对照模式下官方浮层的翻转
 *
 * 官方两处浮层都固定向右展开，且都由原语自己算位置、不给调用方方位选项：
 *
 * - `Menu` 的二级面板：`left: calc(100% + 10px)`
 * - `HoverCard` 的详情卡片：在**原语的 JS 里**取锚点矩形的 `right + 8` 当 `left`，
 *   而且只夹垂直方向，水平方向不夹
 *
 * 于是区域停在窗口哪一列就决定浮层能不能看见：产品形态在左侧栏，向右展开正好；
 * 对照模式下区域挂右侧栏、贴着窗口右缘，卡片会整块开到窗口外。
 *
 * 卡片比菜单更难办一层：它的位置是**内联**样式，还会随滚动与改变尺寸被原语重写，
 * 而它的盒子 portal 到 `document.body`，与官方左侧栏的卡片同处一个父节点。因此
 * 翻转要同时满足两点——用 `!important` 压过内联样式，以及只落在本包自己的卡片上
 * （靠正文给自己那张卡片打的标记）。
 *
 * 「右边还剩多少地方」只能量出来：判定在这里写成纯函数，量测留给组件
 */

/**
 * 挂在 body 上的属性名
 *
 * 带它即表示区域右缘放不下浮层、该翻向左侧。官方 `Menu` 的二级面板与本包的
 * 悬停卡片都吃这一条
 */
export const FLIP_ATTRIBUTE = 'data-wg-flip'

/**
 * body 上的自定义属性：翻转后卡片右缘距窗口右缘的距离
 *
 * 卡片是 `position: fixed` 的 body 子节点，`right` 因此直接相对窗口右缘。写具体
 * 像素而不用 `calc(100vw - ...)`：`100vw` 含滚动条宽度，与 fixed 定位的参照系
 * 不是同一个
 */
export const FLIP_RIGHT_VAR = '--wg-flip-right'

/**
 * 挂在卡片盒上的属性名
 *
 * 由卡片正文打在自己的直接父节点上：原语把正文作为卡片的唯一子节点渲染，父节点
 * 就是那张卡片。用属性而不是官方 CSS Module 的哈希类名做选择器——哈希随
 * primitives 版本变，属性是本包自己控制的
 */
export const CARD_ATTRIBUTE = 'data-wg-hover-card'

/** 官方卡片盒的固定宽度（原语 CSS 里写死 244px） */
const CARD_WIDTH = 244

/** 卡片与区域之间的间隙，取官方原语贴锚点用的同一个 8px */
const CARD_GAP = 8

/** 一次翻转判定的结果 */
export type FlipPlacement = { flipped: false } | { flipped: true; right: string }

/**
 * 判断浮层要不要翻到左侧，并给出落点
 *
 * 翻的条件是「区域右边放不下整张卡片」；两侧都放不下时保持原语原本的向右展开——
 * 那时窗口本身已经比一张卡片宽不了多少，翻过去只是换一端被裁
 * @param region - 区域（侧栏内容或对照 tab）的矩形边界
 * @param viewportWidth - 窗口宽度
 * @returns 翻转与否；翻转时带卡片右缘距窗口右缘的距离
 */
export function flipPlacement(
  region: { left: number; right: number },
  viewportWidth: number,
): FlipPlacement {
  const roomOnRight = viewportWidth - region.right
  if (roomOnRight >= CARD_WIDTH + CARD_GAP) return { flipped: false }
  if (region.left < CARD_WIDTH + CARD_GAP) return { flipped: false }
  return { flipped: true, right: `${viewportWidth - region.left + CARD_GAP}px` }
}
