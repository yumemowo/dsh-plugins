import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  IconPinFill16,
  IconPinOutline16,
  IconVirtualFolder16,
  IconVirtualWorkspace16,
} from '../src/client/icons.tsx'

/**
 * 自绘图标的几何
 *
 * 这个字形是照官方 primitives 的比例量出来再画的（网格边距、圆角
 * 壁厚都写在 `docs/custom-icons.md`），而不是「看着差不多」的近似值
 * 这里把它固定下来：后续若有人顺手改窄一格或换掉圆角，会在这里失败
 * 而不是等到界面上与官方图标并排时才发现不同族
 *
 * 断的是渲染出的 SVG 属性，不是源码文本：真正进 DOM 的就是这一份
 */
describe('IconVirtualWorkspace16', () => {
  /** 渲染成静态标记，取真实会进 DOM 的那份属性 */
  function markup(): string {
    return renderToStaticMarkup(IconVirtualWorkspace16({}))
  }

  it('uses the official inline-SVG form', () => {
    const svg = markup()

    // 16px 网格、内联、无 xmlns——官方那几个 primitives 图标就是这样内联的
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).not.toContain('xmlns')
    // 默认尺寸 16
    expect(svg).toContain('width="16"')
    expect(svg).toContain('height="16"')
  })

  it('inherits the row text color instead of hard-coding one', () => {
    // 颜色必须走 currentColor：图标要跟着行的文字色与主题走
    const svg = markup()

    expect(svg).toContain('stroke="currentColor"')
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/)
    expect(svg).not.toContain('var(--dsw')
  })

  it('keeps the official folder midline, which is what fixes the apparent size', () => {
    const svg = markup()

    // 官方 IconFolderClose16 是填充字形（壁半宽 0.65），照抄它的 d 去描边会小一圈
    // 这里锁的是它的**中线**取值：x 1.5~14.5、y 2.429~13.5863、圆角 1.6736
    // 上一版用的 y 3.73~12.93 / 圆角 1.9~2.1 只有 14x11 的墨迹
    // 比官方文件夹（14x14）矮 3px，肉眼就是「小一圈」
    expect(svg).toContain('1.5 11.9127')
    expect(svg).toContain('3.1736 2.429')
    expect(svg).toContain('12.8264 13.5863')
    expect(svg).toMatch(/A1\.6736 1\.6736/)
    expect(svg).toMatch(/stroke-width="1\.3"/)
  })

  it('draws only outlines so it stays in the official outline family', () => {
    const svg = markup()

    expect(svg).toContain('fill="none"')
    // 文件夹一笔（右上角不闭合）+ 加号一笔
    expect(svg.match(/<path/g)).toHaveLength(2)
    // 加号是平头的：官方那份加号同样平头，圆头会让四臂长出半格并粘到缺口
    expect(svg).not.toContain('stroke-linecap="round"')
  })

  it('carries a plus at the official position and length', () => {
    const svg = markup()

    // 中心 (12.52, 5.52)、全长 6——
    // 两个值都直接取自官方 IconProjectAddOutline16 的实心加号（6x6，中心即其几何中心）
    expect(svg).toContain('M9.52 5.52H15.52')
    expect(svg).toContain('M12.52 2.52V8.52')
    // 加号与文件夹壁同粗：官方同此，加粗会让 16px 下与缺口粘连
    const widths = [...svg.matchAll(/stroke-width="([\d.]+)"/g)].map((m) => Number(m[1]))
    expect(new Set(widths)).toEqual(new Set([1.3]))
  })

  it('leaves the top-right corner open so the plus is not crowded', () => {
    const svg = markup()

    // 轮廓在页签右肩 (8.0231, 4.295) 收笔，右壁从 (14.5, 10.2) 起笔：
    // 右上这一整段缺口就是加号所在的位置。闭合版的写法（身顶拉到右壁
    // 右壁从 5.9686 开始）在这里必须不出现
    expect(svg).toContain('L8.0231 4.295"')
    expect(svg).toMatch(/M14\.5 10\.2V11\.9127/)
    expect(svg).not.toContain('14.5 5.9686V11.9127')
    // 不闭合（无 Z），否则缺口被封住
    expect(svg).not.toMatch(/Z"/)
  })

  it('shares the dashed opening of IconVirtualFolder16', () => {
    // 两个图标同属文件夹族，虚线密度与相位必须一致
    expect(markup()).toContain('stroke-dasharray="1.6 1.1"')
    expect(renderToStaticMarkup(IconVirtualFolder16({}))).toContain(
      'stroke-dasharray="1.6 1.1"',
    )
  })

  it('honours a custom size for the narrow rail', () => {
    // 窄栏下入口放大到 18px，与「添加工作区」同一做法
    const svg = renderToStaticMarkup(IconVirtualWorkspace16({ size: 18 }))

    expect(svg).toContain('width="18"')
    expect(svg).toContain('height="18"')
    // 尺寸变了，网格与壁厚不变：缩放的是外面的盒子，不是把几何改一遍
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toMatch(/stroke-width="1\.3"/)
  })

  it('carries the className through for the host theme', () => {
    expect(renderToStaticMarkup(IconVirtualWorkspace16({ className: 'wg-x' }))).toContain(
      'class="wg-x"',
    )
  })
})

/**
 * 虚拟文件夹：官方文件夹族的虚线版
 *
 * 官方三个文件夹图标（`IconFolderClose16` / `IconFolderOpen16` / `IconFolderOpenOutline16`）全是实线
 * 没有可复用的虚线版，因此照 `IconFolderClose16` 的轮廓自绘一份
 * 这里固化「与官方同族」的那几项取值，以及虚线这个语义本身
 */
describe('IconVirtualFolder16', () => {
  /** 渲染成静态标记，取真实会进 DOM 的那份属性 */
  function markup(size?: number): string {
    return renderToStaticMarkup(
      size === undefined ? IconVirtualFolder16({}) : IconVirtualFolder16({ size }),
    )
  }

  it('is dashed, which is the whole point of the silhouette', () => {
    const svg = markup()

    // 虚线是 DSH 表达「尚未真实存在 / 占位」的既有语言（待办未开始的圆圈用 2.4/2.4
    // composer 的工作区占位框用 4/4）。断口取 1.6/1.1：
    // 再密会在 16px 下糊成一条灰毛边，再疏则轮廓出现断开感
    expect(svg).toContain('stroke-dasharray="1.6 1.1"')
  })

  it('stays in the official folder family', () => {
    const svg = markup()

    // 与官方文件夹同族：同样的描边粗度、圆角连接、16px 网格与尺寸域
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).not.toContain('xmlns')
    expect(svg).toMatch(/stroke-width="1\.3"/)
    expect(svg).toContain('stroke-linejoin="round"')
    expect(svg).toContain('stroke="currentColor"')
    // 不填充：填空的文件夹在 16px 下与官方那几个实心图标会糊在一起
    expect(svg).toContain('fill="none"')
    // 与官方 IconFolderClose16 同域：它的**中线** x 1.5~14.5、y 2.429~13.5863
    // 这条断言防的是「照抄填充字形的 d」——那样描出来只有 14x11，比官方矮 3px
    expect(svg).toContain('M3.1736 2.429')
    expect(svg).toMatch(/A1\.6736 1\.6736 0 0 1 14\.5 5\.9686/)
    expect(svg).toContain('12.8264 13.5863')
    expect(svg).toContain('1.5 11.9127')
  })

  it('has exactly one closed contour so the shape never looks unfinished', () => {
    const svg = markup()

    // 单条闭合路径（末尾 Z）：多段路径的虚线会在接缝处出现意外的长断口
    expect(svg.match(/<path/g)).toHaveLength(1)
    expect(svg.trim().endsWith('</svg>')).toBe(true)
    expect(svg).toMatch(/Z"/)
  })

  it('honours a custom size', () => {
    const svg = markup(18)

    expect(svg).toContain('width="18"')
    expect(svg).toContain('height="18"')
    // 缩放的是外盒，不是把几何改一遍
    expect(svg).toContain('viewBox="0 0 16 16"')
    expect(svg).toContain('stroke-dasharray="1.6 1.1"')
  })
})

/**
 * 图钉的两个状态
 *
 * 官方 primitives 的导出表里没有任何图钉字形，因此这一对是自绘的。这里守两类事实：
 * 几何逐点对齐（两态是同一枚图钉，只有描边 / 填充之差）
 * 以及三段的取值与 `docs/custom-icons.md` 记下的量测一致
 */
describe('pin icons', () => {
  /** 两个状态的静态标记；它们必须来自同一份几何 */
  const outline = renderToStaticMarkup(IconPinOutline16({}))
  const filled = renderToStaticMarkup(IconPinFill16({}))

  it('uses the official inline-SVG form', () => {
    for (const svg of [outline, filled]) {
      expect(svg).toContain('viewBox="0 0 16 16"')
      expect(svg).not.toContain('xmlns')
      expect(svg).toContain('width="16"')
      expect(svg).toContain('height="16"')
      expect(svg).toContain('fill="none"')
    }
  })

  it('inherits the row text color instead of hard-coding one', () => {
    // 颜色必须走 currentColor：图标要跟着菜单项的色阶与主题走
    for (const svg of [outline, filled]) {
      expect(svg).toContain('currentColor')
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,6}/)
      expect(svg).not.toContain('var(--dsw')
    }
  })

  it('shares one cap and one needle between the two states', () => {
    // 两态是同一枚图钉：钉帽与钉子逐点相同，差别只在钉身
    const cap = 'M6.80 3.12L12.88 9.20'
    const needle = 'M7.15 8.85L4.18 11.82'

    for (const svg of [outline, filled]) {
      expect(svg).toContain(cap)
      expect(svg).toContain(needle)
    }
  })

  it('draws the outline pin with strokes only', () => {
    // 未置顶那一枚整枚走描边，与官方 outline 图标同族
    expect(outline).toContain('stroke-width="1.3"')
    expect(outline).toContain('stroke-linejoin="round"')
    expect(outline).not.toContain('fill="currentColor"')
  })

  it('fills the body for the pinned state', () => {
    // 置顶态不只靠颜色：色阶在浅色主题下对比有限，实心与描边才是一眼可分的差别
    expect(filled).toContain('fill="currentColor"')
  })

  it('leans the pin on a 45 degree axis rather than standing it up', () => {
    // 正交的图钉在 16px 下读成漏斗或过滤器（钉帽横线 + 收拢的钉身）
    // 斜 45° 之后轮廓才立得住。三条线段都按轴算出，而不是整体 rotate()——
    // 旋转会把描边推离像素栅格，拐角处糊成一团
    expect(outline).toContain('M6.80 3.12L7.15 8.85L12.88 9.20')

    // 45° 轴意味着钉帽两端与钉子等长的对角线位移
    const dx = 12.88 - 6.8
    const dy = 9.2 - 3.12
    expect(dx).toBeCloseTo(dy, 1)
  })

  it('keeps the ink inside the folder size domain', () => {
    // 与官方文件夹同域是两个自绘字形并排时的前提：文件夹中线 y 2.429~13.5863
    // 图钉墨迹 x 3~13、y 2~12（量法见 docs/custom-icons.md）
    expect(filled).toContain('M6.80 3.12L12.88 9.20')
    expect(filled).toContain('M6.80 3.12L7.15 8.85L12.88 9.20Z')
    expect(filled).toContain('M7.15 8.85L4.18 11.82')
  })

  it('honours a custom size', () => {
    const big = renderToStaticMarkup(IconPinFill16({ size: 20 }))

    expect(big).toContain('width="20"')
    expect(big).toContain('height="20"')
    // 缩放的是外盒，不是把几何改一遍
    expect(big).toContain('viewBox="0 0 16 16"')
  })
})
