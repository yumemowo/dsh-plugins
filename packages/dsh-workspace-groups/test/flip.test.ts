import { describe, expect, it } from 'vitest'
import {
  CARD_ATTRIBUTE,
  FLIP_ATTRIBUTE,
  FLIP_RIGHT_VAR,
  flipPlacement,
} from '../src/client/utils/flip.ts'

/**
 * 翻转判定的几何规则
 *
 * 官方卡片固定向右展开且宽度写死 244px（见 utils/flip.ts），区域右边放不下整张
 * 卡片时才翻到左侧；这里把阈值两侧、以及「两侧都放不下」的退化情形钉住
 */
describe('flipPlacement', () => {
  /** 官方卡片宽度 + 与锚点的间隙：右边刚好放得下整张卡片的临界值 */
  const NEEDED = 244 + 8

  it('keeps the primitive rightward placement when the card fits on the right', () => {
    // 区域右缘离窗口右缘正好留出一整张卡片：不翻
    expect(flipPlacement({ left: 0, right: 1000 - NEEDED }, 1000)).toEqual({ flipped: false })
  })

  it('flips when the region sits too close to the right edge', () => {
    // 差一个像素放不下就翻；落点是区域左缘再往左一个间隙
    expect(flipPlacement({ left: 700, right: 1000 - NEEDED + 1 }, 1000)).toEqual({
      flipped: true,
      right: `${1000 - 700 + 8}px`,
    })
  })

  it('flips for a region flush against the right edge, as in the compare tab', () => {
    // 对照 tab 贴着窗口右缘：右边一点空间都没有
    expect(flipPlacement({ left: 744, right: 1000 }, 1000)).toEqual({
      flipped: true,
      right: '264px',
    })
  })

  it('stays rightward when neither side fits, rather than swapping which end is clipped', () => {
    // 窗口本身不比一张卡片宽多少：翻过去只是换一端被裁，保持原语行为
    const region = { left: 100, right: 400 }
    expect(flipPlacement(region, 500)).toEqual({ flipped: false })
  })

  it('expresses the landing point as a distance from the right edge', () => {
    // 卡片右缘落在区域左缘左侧一个间隙处，因此距离 = 视口宽 - 区域左缘 + 间隙；
    // 这个值直接给 fixed 卡片的 right 用，不掺 100vw（那会带上滚动条宽度）
    const placement = flipPlacement({ left: 500, right: 900 }, 900)
    expect(placement).toEqual({ flipped: true, right: '408px' })
  })

  it('names the marker hooks the stylesheet and the components share', () => {
    // 样式表与组件各写一遍字面量的话，改名时漏掉一处会静默失效——卡片照样开在
    // 屏幕外却没有报错，因此这里把三个名字固定下来
    expect(FLIP_ATTRIBUTE).toBe('data-wg-flip')
    expect(FLIP_RIGHT_VAR).toBe('--wg-flip-right')
    expect(CARD_ATTRIBUTE).toBe('data-wg-hover-card')
  })
})
