import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readAllCss, readModuleCss, readReducedMotionCss } from './readCss.ts'

/**
 * 取样式表文本
 *
 * 样式分散在各组件的 `.module.css` 里，而这里的断言针对整份样式表的语义
 * 因此按稳定顺序合并全部样式表，断言里直接写源文件的类名
 */
function readCss(): string {
  return readAllCss()
}

/**
 * 本包样式表里定义的类名（带前导点）
 *
 * 类名不再带包前缀，源文件里与官方同名是常事，因此要判断「选择器是否挂在本包的类上」
 * 只能比对本包真的定义过哪些类，不能靠名字前缀
 */
const OWN_CLASSES = [...new Set([...readCss().matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((m) => `.${m[1]}`))]

describe('client stylesheet', () => {
  it('keeps every stylesheet free of backticks', () => {
    // 样式表由构建脚本按文本读取，反引号不再截断任何东西
    // 但类名与 :global 之外的裸反引号一律是笔误，留一条廉价断言
    expect(readCss()).not.toContain('`')
  })

  it('gives every row container a 2px gap between adjacent rows', () => {
    const css = readCss()
    // CSS 里这几条选择器是写成同一个逗号列表的，因此先把规则拆成
    // 「选择器 -> 声明块」再逐条查，而不是对单个选择器配正则
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))

    /** 存在一条规则：选择器表含该选择器，且声明块里 margin-top 为 2px */
    const hasGapRule = (selector: string): boolean =>
      rules.some(
        (rule) =>
          rule.selectors.includes(selector) &&
          /margin-top:\s*2px/.test(rule.body),
      )

    // 分组结构多包了几层包装元素，每条 `X > * + *` 只作用于自己的直接子项
    // 因此每一层都必须有一条规则，否则「分组头 → 首个会话行」这类跨层相邻会漏掉间距
    for (const container of ['workspace', 'workspaceBody', 'group', 'sessions']) {
      expect(hasGapRule(`.${container} > * + *`), `missing 2px gap rule for .${container}`).toBe(true)
    }
  })

  it('floats the indicator out of the row flow so titles never shift', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 指示器不参与行内流：它是绝对定位，因此状态出现与否都不推动标题
    const indicator = bodyOf('.indicator')
    expect(indicator).toMatch(/position:\s*absolute/)
    // 落点只读内缩量：指示器恒在行的最左侧（容器栏左缘），与层级深度无关
    expect(indicator).toMatch(/left:\s*var\(--wg-indicator-inset\)/)
    expect(indicator).not.toMatch(/--wg-row-start/)

    // 两种字形各一档内缩：图标是 16px 方块，比 3px 宽的色条多缩 2px 才不读成行的左边界
    // 变量必须落在两个布局都覆盖得到的层级上：平铺列表的行不在任何 .workspace 里
    const regionRoot = readModuleCss(join('views', 'WorkspaceGroupsRegion.module.css'))
    expect(regionRoot).toMatch(/--wg-indicator-inset:\s*4px/)
    expect(regionRoot).toMatch(/--wg-indicator-inset-icon:\s*6px/)
    // 行样式表里只许读变量，不许定义它——定义在这儿平铺列表就取不到
    const rowCss = readModuleCss(join('views', 'components', 'rows.module.css'))
    expect(rowCss).not.toMatch(/--wg-indicator-inset(-icon)?:\s*\d/)
    expect(bodyOf("[data-wg-indicator='icon'] .indicator")).toMatch(
      /left:\s*var\(--wg-indicator-inset-icon\)/,
    )
    // 它要浮在行的悬停/选中底色之上，否则底色会盖住指示器
    expect(indicator).toMatch(/z-index:\s*1/)

    // 标题左边距取官方 .title 那 4px：行的缩进下限（24px）本就大于指示器占的 4~20px
    const title = bodyOf('.rowTitle')
    expect(title).toMatch(/margin:\s*0 6px 0 4px/)

    // 「色条」样式的字形自己就是那条色，颜色继承指示器按状态取到的语义词
    const bar = bodyOf('.indicatorBar')
    expect(bar).toMatch(/background:\s*currentColor/)

    // 色条不能在那 16px 的指示器盒里居中：那个盒是给官方 16px 图标用的，
    // 3px 宽的色条居中会让左缘落到 内缩 + 6.5px 上，比设计稿右移 6.5px
    // 靠左对齐后左缘正好压在 --wg-indicator-inset 上，与设计稿的 ::before 落点一致
    expect(bodyOf("[data-wg-indicator='bar'] .indicator")).toMatch(/justify-content:\s*flex-start/)
    // 高度取设计稿那条色条（行高 32、上下各留 6）
    expect(bar).toMatch(/height:\s*20px/)
  })

  it('paints the status fill and deepens it only where there is an accent colour', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''
    const declarations = (selector: string, property: string): string[] =>
      rules
        .filter((rule) => rule.selectors.includes(selector))
        .map((rule) => new RegExp(`${property}:\\s*([^;]+)`).exec(rule.body)?.[1]?.trim() ?? '')

    // 运行与待交互各上一层浅色底；完成与空闲不设底色，否则整段长期泛色
    expect(bodyOf(".row[data-wg-state='ongoing']")).toMatch(/background-color:\s*color-mix\(/)
    expect(bodyOf(".row[data-wg-state='warning']")).toMatch(/background-color:\s*color-mix\(/)
    expect(bodyOf(".row[data-wg-state='done']")).toBe('')

    // 没有强调色的行与官方完全一致：悬停与选中同为那一档浅灰，不另加深
    const neutralHover = bodyOf(
      ".row:not([data-wg-state='ongoing']):not([data-wg-state='warning']):hover",
    )
    const neutralSelected = bodyOf(
      ".row:not([data-wg-state='ongoing']):not([data-wg-state='warning']).rowSelected",
    )
    expect(neutralHover).toMatch(/background-color:\s*var\(--dsw-alias-interactive-bg-hover\)/)
    expect(neutralSelected).toMatch(/background-color:\s*var\(--dsw-alias-interactive-bg-hover\)/)
    // 两者同值，这正是官方那一套的取值
    expect(neutralHover.replace(/\s/g, '')).toBe(neutralSelected.replace(/\s/g, ''))

    // 有强调色的行才走加深，且悬停比选中浅一档
    const pct = (selector: string): number => {
      const value = declarations(selector, 'background-color').find((v) => v.includes('color-mix'))
      return Number(/ (\d+)%/.exec(value ?? '')?.[1] ?? Number.NaN)
    }
    const ongoingHover = pct(".row[data-wg-state='ongoing']:hover")
    const ongoingSelected = pct(".rowSelected[data-wg-state='ongoing']")
    expect(Number.isNaN(ongoingHover)).toBe(false)
    expect(Number.isNaN(ongoingSelected)).toBe(false)
    expect(ongoingHover).toBeLessThan(ongoingSelected)

    const warningHover = pct(".row[data-wg-state='warning']:hover")
    const warningSelected = pct(".rowSelected[data-wg-state='warning']")
    expect(warningHover).toBeLessThan(warningSelected)

    // 选中那档必须同时覆盖 `:hover`：`.row[data-wg-state]:hover` 的权重更高
    // 少了这一档，选中行被悬停时会被悬停那条盖回更浅的值
    expect(
      declarations(".rowSelected[data-wg-state='ongoing']", 'background-color').length,
    ).toBeGreaterThan(0)
    for (const state of ['ongoing', 'warning']) {
      const selectors = rules
        .filter((rule) =>
          rule.selectors.includes(`.rowSelected[data-wg-state='${state}']:hover`),
        )
        .map((rule) => rule.body)
      expect(selectors.length, `.rowSelected[data-wg-state='${state}']:hover is missing`).toBeGreaterThan(0)
      expect(selectors.some((body) => /26%/.test(body))).toBe(true)
    }

    // 强调色行全程用 background-color：叠一层中性灰会把色相稀释掉
    for (const selector of [
      ".row[data-wg-state='ongoing']:hover",
      ".rowSelected[data-wg-state='ongoing']",
    ]) {
      for (const body of declarations(selector, 'background-image')) {
        expect(body).toBe('')
      }
    }
    // 选中只有底色一条通道：官方 active / selected 都不带边框，加描边会与设计不一致
    const selectedRules = rules.filter((rule) =>
      rule.selectors.some((s) => s.includes('.rowSelected')),
    )
    for (const rule of selectedRules) {
      expect(rule.body, `selected row must not draw a border: ${rule.selectors.join(', ')}`)
        .not.toMatch(/box-shadow|outline/)
    }
    expect(css).not.toMatch(/data-wg-indicator='bar'\]\s*\.rowSelected/)

    // 底色一律不用 background 简写：简写会把同一元素上另一条声明一起清掉
    // 只看那些真的在设底色的行规则（`:hover` / `.rowSelected` / `[data-wg-state]`），
    // 行内按钮的 `background: 0 0` 之类与底色无关
    const shorthand = rules.filter(
      (rule) =>
        rule.selectors.some(
          (s) =>
            s.includes('.row') &&
            (s.includes(':hover') || s.includes('.rowSelected') || s.includes('[data-wg-state')),
        ) && /(^|;)\s*background:/.test(rule.body),
    )
    expect(shorthand).toEqual([])
  })

  it('reveals row actions on hover, menu-open, or keyboard focus only', () => {
    // 先剥注释：注释里的示例选择器不该参与断言
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')

    // 隐藏的按钮必须同时关掉指针事件，否则会留下一个看不见却能点中的热区
    const base = [...css.matchAll(/\.rowAction\s*\{([^{}]*)\}/g)].map((m) => m[1] ?? '')
    expect(base.length).toBeGreaterThan(0)
    expect(base.some((body) => /opacity:\s*0/.test(body))).toBe(true)
    expect(base.some((body) => /pointer-events:\s*none/.test(body))).toBe(true)

    // 只保留悬停 / 菜单展开 / 键盘焦点三条显示路径
    const reveal = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /\.rowAction/.test(m[1] ?? '') && /opacity:\s*1/.test(m[2] ?? ''))
      .flatMap((m) => (m[1] ?? '').split(',').map((s) => s.trim()))

    expect(reveal).toContain('.rowAction:focus-visible')
    expect(reveal.some((s) => s.includes(':hover'))).toBe(true)
    expect(reveal).toContain('.rowMenuOpen .rowAction')

    // 这些写法会让按钮在鼠标点过之后常驻：:focus / :focus-within 在点击后持续为真
    // 而选中态与点击无关（当前会话一直是选中的）
    for (const bad of ['.rowAction:focus', '.row:focus-within .rowAction']) {
      expect(reveal, `${bad} makes actions stick after a click`).not.toContain(bad)
    }
    expect(reveal.some((s) => s.includes('rowSelected'))).toBe(false)
  })

  it('indents each hierarchy level by one icon-column step', () => {
    // 注释会连同其后的选择器一起落进 [^{}]+ 里，先把注释剥掉再解析规则
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    /** 取某条选择器规则里的某个声明值 */
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 每一层让出一个 16px 图标列，基准是官方工作区行的 8px
    // 子工作区可以嵌任意层，深度由行组件下发 --wg-depth，因此每档都写成「基准 + 16px × 深度」
    // 缩进经 --wg-row-start 下发：指示器的落点读同一个值，两者不会错位
    // 分组的会话行多了撑开体两层包装，选择器要跟着写穿
    expect(declared('.workspaceHead', '--wg-row-start')).toBe(
      'calc(8px + 16px * var(--wg-depth, 0))',
    )
    expect(declared('.workspaceHead', 'padding-left')).toBe('var(--wg-row-start)')
    expect(declared('.groupHead', '--wg-row-start')).toBe(
      'calc(24px + 16px * var(--wg-depth, 0))',
    )
    expect(declared('.groupHead', 'padding-left')).toBe('var(--wg-row-start)')
    // 会话行仍比同级容器多让一格：指示器不参与这套定位（它钉在行左缘），缩进才是「这几行是会话」的依据
    expect(declared('.workspaceBody > .sessions > .row', '--wg-row-start')).toBe(
      'calc(24px + 16px * var(--wg-depth, 0))',
    )
    expect(
      declared(
        '.group > .expand > .expandClip > .groupBody > .sessions > .row',
        '--wg-row-start',
      ),
    ).toBe('calc(40px + 16px * var(--wg-depth, 0))')
  })

  it('draws one guide line per nested level at the parent icon column', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    /** 找出一条规则：选择器表含该选择器且声明块匹配 */
    const hasRule = (selector: string, pattern: RegExp): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && pattern.test(rule.body))

    // 组内多了一层 .groupBody（子工作区与会话都在它里面）
    // 它只出现在分组体内，因此引导线规则直接挂在它身上，不必再把整条结构链写穿
    const groupBody = '.groupBody'

    // 引导线落在父级图标列的中心，工作区是 8 + 16/2，分组是 24 + 16/2，两者都随深度平移
    expect(hasRule('.workspaceBody::before', /left:\s*calc\(16px \+ 16px \* var\(--wg-depth/)).toBe(
      true,
    )
    expect(
      hasRule(`${groupBody}::before`, /left:\s*calc\(32px \+ 16px \* var\(--wg-depth/),
    ).toBe(true)
    // 线要跟着主题走，不能写死颜色
    expect(hasRule('.workspaceBody::before', /background:\s*var\(--dsw-alias-border-l1\)/)).toBe(
      true,
    )
  })

  it('keeps the time and the action button on the same right edge', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    /** 命中该选择器的规则里，是否有一条声明了给定的属性值 */
    const hasRule = (selector: string, pattern: RegExp): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && pattern.test(rule.body))

    // 静止时操作位必须收成 0 宽，否则会把行尾时间顶到左侧，两者右缘错开一个图标列宽
    expect(hasRule('.rowActionSlot', /width:\s*0/)).toBe(true)
    expect(hasRule('.rowActionSlot', /overflow:\s*hidden/)).toBe(true)

    // 时间隐藏与操作位展开必须由同一组触发条件驱动，任一时刻只有一方占行尾
    const triggers = ['hover', 'rowMenuOpen', 'focus-visible']
    for (const trigger of triggers) {
      const hidesTime = rules.some(
        (rule) =>
          rule.selectors.some((s) => s.includes('.rowTime') && s.includes(trigger)) &&
          /display:\s*none/.test(rule.body),
      )
      const expands = rules.some(
        (rule) =>
          rule.selectors.some((s) => s.includes('.rowActionSlot') && s.includes(trigger)) &&
          /width:\s*16px/.test(rule.body),
      )
      expect(hidesTime, `time must yield on ${trigger}`).toBe(true)
      expect(expands, `action slot must expand on ${trigger}`).toBe(true)
    }
  })

  it('takes the context menu root out of the row flex flow', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const root = rules.find((rule) => rule.selectors.includes('.contextMenu.contextMenu'))

    // 原语根节点是 position: relative 的行内盒
    // 没有 DOM 子节点（面板 portal 到 body）。留在流里会成为一个空 flex 项
    // 行的 gap 照样算，标题与会话数会被推开
    expect(root?.body).toMatch(/display:\s*contents/)
    // 类名写两遍抬一次优先级，原语自己的单类规则谁后注入谁赢，先后不由本包决定
    expect(root).toBeDefined()
  })

  it('gives the region root the official right-side block inset', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 官方 WorkspaceBrowser 的根节点自己带整块右留白
    // 官方那份定义随被接替的组件一起没了，本包必须自己重新定义这三个量
    // header 与列表才能落回原位
    expect(declared('.root', '--dsh-session-list-edge-inset')).toBe(
      'var(--dsh-sidebar-inline-padding, 12px)',
    )
    expect(declared('.root', '--dsh-session-list-scrollbar-width')).toBe('8px')
    expect(declared('.root', '--dsh-session-list-scrollbar-offset')).toBe('2px')
    expect(declared('.root', 'padding-right')).toBe('var(--dsh-session-list-edge-inset)')

    // 对照 tab 只补左侧，右侧一律由 .root 给，否则两层各加 12px
    expect(declared('.tab', 'padding')).toBe('6px 0 0 12px')
  })

  it('keeps the header entry off the region edge like official does', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 官方 header 的 -4px 是相对「自带右留白」的根节点写的，本包根节点有同一份留白
    // 因此这一条照抄即可，相抵后按钮右缘离栏缘 8px，不贴边
    expect(declared('.header', 'margin-right')).toBe('-4px')
    expect(declared('.header', 'height')).toBe('36px')
    expect(declared('.header', 'gap')).toBe('4px')
  })

  it('lets the list cancel the root inset and re-derive its own right edge', () => {
    // 官方 .listArea 用 -edge-inset 让列表靠到栏缘，再由 .list 推回到 edge-inset
    // 本包没有 .listArea，因此这两个值要折进 .list 自己的 margin / padding
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const list = rules.find((rule) => rule.selectors.includes('.list'))
    expect(list).toBeDefined()

    // 折进 -edge-inset，否则列表会被 .root 的右留白再推一次，行右缘偏左
    expect(list?.body).toMatch(
      /margin-right:\s*calc\(\s*var\(--dsh-session-list-scrollbar-offset\)\s*-\s*var\(--dsh-session-list-edge-inset\)\s*\)/,
    )
    expect(list?.body).toMatch(/padding-right:\s*calc\(/)
    expect(list?.body).toMatch(/--dsh-session-list-scrollbar-width/)
    // 两边各 12px 会让内容整体缩进 24px，因此列表必须自己抵掉根节点那份留白
    expect(list?.body).not.toMatch(/margin-right:\s*0/)
  })

  it('gives the header entry the official icon-button geometry', () => {
    // 官方 header 图标按钮是 28px 正圆（.iconButton），与行内 16px 按钮不是一套
    // 这些几何按官方外观取，不能被行内那套带跑
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const base = rules.find((rule) => rule.selectors.includes('.headerAction'))
    expect(base).toBeDefined()
    expect(base?.body).toMatch(/width:\s*28px/)
    expect(base?.body).toMatch(/height:\s*28px/)
    expect(base?.body).toMatch(/border-radius:\s*50%/)
    // 正圆必须配对 round，否则会被主题的全局超级椭圆磨成方圆角
    expect(base?.body).toMatch(/corner-shape:\s*round/)

    // 这一组里的入口都是可用的，每个都有自己的悬停高亮，没有 disabled 占位
    const hover = rules.find((rule) =>
      rule.selectors.some((s) => s.includes('.headerAction:hover')),
    )
    expect(hover).toBeDefined()
    expect(rules.some((rule) => rule.selectors.includes('.headerAction:disabled'))).toBe(false)
  })

  it('sizes the header entry group for every entry it can show', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 容器带 overflow:hidden
    // 而宽栏能同时出现三个 28px 入口（视图选项 / 新建工作区分组 / 添加工作区）
    // 因此宽度上限必须容得下 28*3 + 4*2 = 92。给小了不会报错
    // 只是把最右边那个入口整个裁掉——界面上平白少一个按钮
    const cap = /max-width:\s*(\d+)px/.exec(bodyOf('.headerActions'))?.[1]
    expect(cap).toBe('92')
    expect(bodyOf('.headerActions')).toMatch(/overflow:\s*hidden/)
  })

  it('gives the workspace group row the same folder/chevron swap as a workspace row', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      body: m[2] ?? '',
    }))
    /** 某个选择器是否在规则表里，且声明匹配 */
    const has = (selector: string, pattern: RegExp): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && pattern.test(rule.body))

    // 分组头复用工作区行那一套两个槽，静止显示文件夹、悬停换成箭头。少了分组头这几条
    // 它的箭头会常驻（或文件夹不会让位），与工作区行不一致
    const head = '.virtualWorkspaceHead'
    expect(has(`${head} .chevron`, /display:\s*none/)).toBe(true)
    expect(has(`${head}:hover .chevron`, /display:\s*inline-flex/)).toBe(true)
    expect(has(`${head}:hover .folder`, /display:\s*none/)).toBe(true)
  })

  it('stacks the rail entries instead of clipping them', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 窄栏一行放不下两个 36px 入口，因此改成竖排，定高与裁剪都要撤掉
    // 否则第二个入口看不见（宽栏那条基线规则是给单行写的）
    const rail = bodyOf('.headerRail')
    expect(rail).toMatch(/flex-direction:\s*column/)
    expect(rail).toMatch(/height:\s*auto/)
    expect(rail).toMatch(/overflow:\s*visible/)
  })

  it('enlarges the header entry in the narrow rail like official does', () => {
    // 官方 rail 下这个入口是 36px、label-primary，宽栏 28px、label-secondary
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const rail = rules.find((rule) =>
      rule.selectors.includes('.headerRail .headerAction'),
    )
    expect(rail?.body).toMatch(/width:\s*36px/)
    expect(rail?.body).toMatch(/height:\s*36px/)
    expect(rail?.body).toMatch(/--dsw-alias-label-primary/)
  })

  it('styles the group session count exactly like the session row time', () => {
    // 会话数要与 time 在行尾同形：同样的 tertiary 12px/20px，且不参与伸缩
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    const count = bodyOf('.groupCount')
    const time = bodyOf('.rowTime')
    expect(count).not.toBe('')
    for (const declaration of ['flex: none', 'color: var(--dsw-alias-label-tertiary)']) {
      expect(count).toContain(declaration)
      expect(time).toContain(declaration)
    }
    expect(count).toMatch(/font-size:\s*12px/)
    expect(count).toMatch(/line-height:\s*20px/)

    // 分组头是 gap:6px，而 session 行是 gap:0，差的那份 gap 要还回去
    // 会话数才会落在与 time 同一条右缘线上
    expect(count).toMatch(/margin-right:\s*-6px/)

    // 隐去会话数的三条触发条件要与 time 那组一一对应，只是行类换成分组行
    const hides = (selector: string): boolean =>
      rules.some(
        (rule) =>
          rule.selectors.includes(selector) &&
          rule.body.replace(/\s/g, '').includes('display:none'),
      )
    expect(hides('.groupHead:hover .groupCount')).toBe(true)
    expect(hides('.groupHead.rowMenuOpen .groupCount')).toBe(true)
    expect(hides('.groupHead:has(.rowAction:focus-visible) .groupCount')).toBe(true)
    // 会话行的时间也走同一组触发条件，两者互换关系一致
    expect(hides('.row:hover .rowTime')).toBe(true)
  })

  it('gives the group row the same collapsible action slot as the session row', () => {
    // 会话数要贴到行右，操作位就必须像 session 行那样静止时不占宽
    // 三条展开触发条件与上面隐去会话数的那组一一对应，这样两者严格互换
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const expands = (selector: string): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && /width:\s*auto/.test(rule.body))

    expect(expands('.groupHead:hover .rowActionSlot')).toBe(true)
    expect(expands('.groupHead.rowMenuOpen .rowActionSlot')).toBe(true)
    expect(
      expands('.groupHead:has(.rowAction:focus-visible) .rowActionSlot'),
    ).toBe(true)

    // 分组行里是两个按钮，自然宽不是会话行的单个 16px
    const slot = rules.find((rule) => rule.selectors.includes('.rowActionSlot'))?.body ?? ''
    expect(slot).toMatch(/width:\s*0/)
  })

  it('animates the expand body by track height instead of a hard-coded size', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 收起态与展开态只差轨道高度（0fr ↔ 1fr）：轨道高度由内容自身决定
    // 因此子元素有多少个、各自多高都不需要预先知道
    expect(bodyOf('.expand')).toMatch(/grid-template-rows:\s*0fr/)
    expect(bodyOf('.expandOpen')).toMatch(/grid-template-rows:\s*1fr/)

    // 轨道高度可动画的前提是内层裁剪 + 自动最小尺寸归零：缺了任一条
    // 内容都会把 0fr 的轨道顶开，收不到底
    const clip = bodyOf('.expandClip')
    expect(clip).toMatch(/overflow:\s*hidden/)
    expect(clip).toMatch(/min-height:\s*0/)
    // 收起后内容仍在文档里，必须自己让出焦点顺序
    expect(clip).toMatch(/visibility:\s*hidden/)

    // 这套做法不依赖任何写死的尺寸或序号。只查折叠相关的规则：
    // 样式表里别处出现 max-height（如下拉菜单的高度上限）与这条取舍无关
    const expandBodies = rules
      .filter((rule) => rule.selectors.some((selector) => selector.includes('expand')))
      .map((rule) => rule.body)
      .join('\n')
    expect(expandBodies).not.toMatch(/max-height/)
    expect(css).not.toMatch(/nth-child/)
  })

  it('fades rows in from a per-row order variable without listing them', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 不透明是元素的自然状态：展开态不得有任何规则写 opacity
    // 否则过渡没跑或主线程被占住时元素会留在透明上
    // 透明只挂在「所在撑开体还没展开」这条结构条件上
    expect(bodyOf('.expandClip [data-wg-stagger]')).not.toMatch(/opacity\s*:/)
    expect(
      bodyOf('.expand:not(.expandOpen) > .expandClip [data-wg-stagger]'),
    ).toMatch(/opacity:\s*0/)

    const revealed = bodyOf('.expandClip [data-wg-stagger]')
    // 延迟逐元素不同（撑开那段等待 + 该元素的先后），由撑开体量几何后逐个下发
    // 样式只消费一个变量，因此没有任何逐元素写死的值或序号
    expect(revealed).toMatch(/transition-delay:\s*var\(--wg-expand-delay/)
  })

  it('fades every row out together when the body closes', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const closed = rules.find((rule) =>
      rule.selectors.includes('.expand:not(.expandOpen) > .expandClip [data-wg-stagger]'),
    )?.body

    // 收起时这条更具体，且把延迟归零，所有行同时淡出（步进的延迟只挂在展开态那条）
    expect(closed).toBeDefined()
    expect(closed).toMatch(/transition-delay:\s*0ms/)
  })

  it('drops the expand animation under prefers-reduced-motion', () => {
    const reduced = readReducedMotionCss()

    // 关掉动画还不够：visibility 的延时不跟着去掉
    // 收起后内容仍会多挡一个动画时长才交出焦点
    expect(reduced).toMatch(/\.expand\s*\{\s*transition:\s*none/)
    expect(reduced).toMatch(/\.expandClip\s*\{\s*transition:\s*visibility 0s linear/)
    // 逐个淡入也要一并落位。延迟由组件逐个下发，因此那条展开态规则要一起清掉
    // 否则 reduced-motion 下行仍是逐个出现
    expect(reduced).toMatch(/\[data-wg-stagger\][\s\S]*?transition:\s*none/)
  })

  it('indents a grouped workspace one more level and draws its guide line', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
      body: m[2] ?? '',
    }))
    /** 命中该选择器的规则里，是否有一条声明了给定的属性值 */
    const hasRule = (selector: string, pattern: RegExp): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && pattern.test(rule.body))

    // 工作区分组行本身落在根节点上，缩进与工作区行同为 8px，不是会话分组那档 24px
    expect(hasRule('.groupHead.virtualWorkspaceHead', /padding:\s*0 8px/)).toBe(true)
    // 缩进层级不用 CSS 变量在容器间累加，把变量定义成「它自己 + 1」是循环引用
    // 浏览器会把整条声明当作无效值丢掉，偏移因此恒为 0、缩进静默失效
    // 层级改由 JS 算好（nesting.levelOf）经 --wg-depth 下发，样式表只做一次重命名
    expect(css).not.toContain('--wg-depth-offset')
    // 每档缩进都直接读这一个变量，它由组件下发，样式表不再二次加工
    // 缩进经 --wg-row-start 中转一次，好让指示器的落点与标题读同一个值
    expect(hasRule('.workspaceHead', /--wg-row-start:\s*calc\(8px \+ 16px \* var\(--wg-depth, 0\)\)/)).toBe(true)
  })

  it('fades the whole panel in like the official tree body', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 官方给三种内容体共用的 .treeBody 挂了 .2s 的 wide-in 动画
    // 本包的面板类取同一条节奏
    const panel = bodyOf('.panel')
    expect(panel).toMatch(/animation:\s*panelIn\s*\.2s/)
    expect(panel).toMatch(/var\(--ds-ease-in-out/)
    // 只从 0% 的不透明起，终态留给元素自然状态——这样动画没跑或被打断时面板仍是可见的
    // 不会停在透明上。关键帧内部的 `0%` 会连同外层选择器一起落进 [^{}]+
    // 因此按整块文本查
    expect(css).toMatch(/@keyframes panelIn\s*\{\s*0%\s*\{\s*opacity:\s*0/)
  })

  it('drops the panel fade under prefers-reduced-motion', () => {
    const reduced = readReducedMotionCss()

    // 面板动画的初态是 opacity: 0，这里必须整条 animation 撤掉而不是只撤 transition——
    // 否则 reduced-motion 下面板会一直停在不可见
    expect(reduced).toMatch(/\.panel\s*\{\s*animation:\s*none/)
  })

  it('drops the search expand motion under prefers-reduced-motion', () => {
    const reduced = readReducedMotionCss()

    // 展开、输入框淡入、标题与入口组的让位都要一起落位，漏掉哪一条
    // 那一项就会在 reduced-motion 下继续动
    for (const selector of [
      '.search',
      '.searchSlot',
      '.searchInput',
      '.headerTitle',
      '.headerActions',
      // 两处箭头也要一起落位
      '.headerCaret',
      '.pickerCaret',
    ]) {
      expect(reduced, `${selector} keeps animating`).toContain(selector)
    }
  })

  it('animates the search exactly like the official section header', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 收起态是 28px 正圆（与 header 图标按钮同形），展开后拉满并把圆角收成 10px
    expect(bodyOf('.searchSlot')).toMatch(/max-width:\s*28px/)
    expect(bodyOf('.searchSlotExpanded')).toMatch(/max-width:\s*100%/)
    expect(bodyOf('.search')).toMatch(/height:\s*28px/)
    expect(bodyOf('.search')).toMatch(/border-radius:\s*50%/)
    expect(bodyOf('.searchExpanded')).toMatch(/height:\s*30px/)
    expect(bodyOf('.searchExpanded')).toMatch(/border-radius:\s*10px/)

    // 时长与缓动取官方那套（.18s 展开 / .12s 淡入，--ds-ease-in-out）
    expect(bodyOf('.search')).toMatch(/\.18s var\(--ds-ease-in-out/)
    expect(bodyOf('.searchInput')).toMatch(/\.12s var\(--ds-ease-in-out/)

    // 标题与入口组的让位是对称的两条：一个向左收、一个向右收
    // 宽度上限挂在整个标题块上（两行共用一条右缘），因此收拢也发生在那一层
    expect(bodyOf('.headerTitleHidden')).toMatch(/max-width:\s*0/)
    expect(bodyOf('.headerTitleHidden')).toMatch(/transform:\s*translate\(-4px\)/)
    expect(bodyOf('.headerActionsHidden')).toMatch(/max-width:\s*0/)
    expect(bodyOf('.headerActionsHidden')).toMatch(/transform:\s*translate\(4px\)/)
  })

  it('styles the result row like the official flat search result', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 官方 .searchResultRow：48px 起、两行内容、8px 圆角
    const row = bodyOf('.searchResult')
    expect(row).toMatch(/min-height:\s*48px/)
    expect(row).toMatch(/border-radius:\s*8px/)
    expect(row).toMatch(/flex-direction:\s*column/)

    // 第二行整体缩进一个状态位槽（16 + 4），与标题左缘对齐
    expect(bodyOf('.searchResultMeta')).toMatch(/margin-left:\s*20px/)

    // 那一行的 6px gap 是官方给「工作区名 / 摘录」两格用的，本包没有摘录
    // 路径必须整体成项，否则 gap 会落进「工作区 / 分组」之间，把一条连续路径读成两截
    expect(bodyOf('.searchResultMeta')).toMatch(/gap:\s*6px/)
    const path = bodyOf('.searchResultPath')
    expect(path).toMatch(/gap:\s*0/)
    expect(path).toMatch(/flex:/)
    // 宽度上限挂在路径这一层：挂到段上会按路径自身宽度算百分比，越窄越缩
    // 长工作区名一开始就被截断
    expect(path).toMatch(/max-width:\s*60%/)
    expect(bodyOf('.searchResultWorkspace')).not.toMatch(/max-width/)

    // 路径两段同格（12px/17px）但不同色阶：工作区更强、分组更弱
    // 靠对比区分「容器」与「组」
    const workspace = bodyOf('.searchResultWorkspace')
    expect(workspace).toMatch(/color:\s*var\(--dsw-alias-label-secondary\)/)
    expect(workspace).toMatch(/font-size:\s*12px/)
    expect(workspace).toMatch(/line-height:\s*17px/)

    const group = bodyOf('.searchResultGroup')
    // 分组比工作区弱一整档（caption 而非 tertiary），对比才看得出来
    expect(group).toMatch(/color:\s*var\(--dsw-alias-label-caption/)
    expect(group).toMatch(/font-size:\s*12px/)
    expect(group).toMatch(/line-height:\s*17px/)

    // 两段必须真的是两档色阶——写成同一个变量就退化成一条长名字
    expect(workspace).not.toBe(group)
    // 分隔符不单独着色：它作为分组那一段的文本继承同一色阶
    // 样式里不该有一个只给分隔符用的颜色规则
    expect(bodyOf('.wg-search-result-separator')).toBe('')
  })

  it('indents a session row whether or not a hover card wraps it', () => {
    // 挂了悬停卡片的会话行会被官方 HoverCard 的根节点包一层
    // 行就不再是 .sessions 的直接子项，两条选择器都要写，缩进才不会因为有没有卡片而不同
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    /** 某条选择器声明的 --wg-row-start 缩进 */
    const indentOf = (selector: string): string | undefined =>
      rules
        .filter((rule) => rule.selectors.includes(selector))
        .map((rule) => /--wg-row-start:\s*([^;]+)/.exec(rule.body)?.[1]?.trim())
        .find((value) => value !== undefined)

    const wrapped = '.workspaceBody > .sessions > * > .row'
    const groupedWrapped =
      '.group > .expand > .expandClip > .groupBody > .sessions > * > .row'

    expect(indentOf(wrapped)).toBe('calc(24px + 16px * var(--wg-depth, 0))')
    expect(indentOf(groupedWrapped)).toBe('calc(40px + 16px * var(--wg-depth, 0))')
  })

  it('paints the hover card text for a dark card rather than a theme-tinted one', () => {
    // 卡片底色在两种主题下都是原语写死的深色，因此三档文字色必须是浅色常量：
    // 用随主题翻转的 --dsw-alias-label-* 会在浅色主题下变成近黑的字压在深色卡片上
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    for (const selector of [
      '.hoverTitle',
      '.hoverPath',
      '.hoverTime',
      '.hoverStatus',
    ]) {
      const body = bodyOf(selector)
      expect(body, `${selector} is missing`).not.toBe('')
      expect(body, `${selector} must not use a theme-tinted label token`).not.toContain(
        '--dsw-alias-label',
      )
    }

    // 长路径要能断行，否则卡片那 244px 宽的盒子里会被撑破
    expect(bodyOf('.hoverPath')).toMatch(/word-break:\s*break-all/)
    // 标题同理：行上被省略号截断，卡片就是「看清全名」的入口
    expect(bodyOf('.hoverTitle')).toMatch(/overflow-wrap:\s*break-word/)

    // 状态行是「点 + 文案」，间距取官方卡片那 8px
    expect(bodyOf('.hoverStatus')).toMatch(/gap:\s*8px/)
    expect(bodyOf('.hoverContent')).toMatch(/gap:\s*8px/)
  })

  it('flips the official floating panels only under the body marker', () => {
    // 官方浮层固定向右展开，对照模式下区域贴窗口右缘会把它们顶到屏幕外
    // 翻转必须收在 body 的标记之下，产品形态（左侧栏）要保留原语的向右展开
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 二级菜单面板：翻到列表左侧，并把它那条「悬停缓冲区」伪元素一起翻过去
    expect(bodyOf("body[data-wg-flip] [role='menu'] [role='menu']")).toMatch(/right:\s*calc\(100% \+ 10px\)/)
    expect(bodyOf("body[data-wg-flip] [role='menu'] [role='menu']::before")).toMatch(/right:\s*-10px/)

    // 悬停卡片，位置是原语算出来的内联 left，只有 !important 压得过
    // 落点取 body 上那个由宿主量得的变量
    const card = bodyOf('body[data-wg-flip] [data-wg-hover-card]')
    expect(card).toMatch(/left:\s*auto\s*!important/)
    expect(card).toMatch(/right:\s*var\(--wg-flip-right\)\s*!important/)

    // 选择器必须带本包的卡片标记：卡片 portal 到 document.body
    // 与官方左侧栏的卡片同处一个父节点，少了这层限定会把官方卡片一起翻出屏幕
    expect(card).not.toBe('')
    for (const rule of rules) {
      if (!/--wg-flip-right/.test(rule.body)) continue
      expect(rule.selectors.some((s) => s.includes('[data-wg-hover-card]'))).toBe(true)
    }
  })

  it('lets the two-line title size the header instead of the official 36px', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 基线那条 36px 定高是官方为单行标题写的，两行各 20px 行高放不下
    // 而 header 带 overflow:hidden——沿用定高只会把第二行连同裁剪一起吞掉
    // 界面上就是「聚焦的那一行不见了」，不会有任何报错
    expect(bodyOf('.headerTitled')).toMatch(/height:\s*auto/)

    // 宽度上限挂在整个标题块上，两行共用同一条右缘。挂到行上会让较窄的那行先截断
    // 而较宽的那行顶出 45% 的约束
    expect(bodyOf('.headerTitle')).toMatch(/max-width:\s*45%/)

    // 命中余量由标题块这一个按钮自己带，基线那条要撤掉，否则叠加成 8px 而标题缩进
    expect(bodyOf('.headerTitled')).toMatch(/padding-left:\s*0/)
    expect(bodyOf('.headerTitle')).toMatch(/padding:\s*2px 4px/)
    // 第二行不能再自己带横向内边距：两行在同一个按钮盒子里
    // 各自加偏移会让它们的左缘错开
    expect(bodyOf('.headerFocus')).not.toMatch(/padding/)
  })

  it('makes the whole two-line title one button', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 两行是同一个按钮：标题块本身是可点的那一层，两行都只是它的内容
    expect(bodyOf('.headerTitle')).toMatch(/cursor:\s*pointer/)
    expect(bodyOf('.headerTitle')).toMatch(/background:\s*0 0/)
    expect(bodyOf('.headerTitle')).toMatch(/border:\s*none/)
    // 悬停反馈挂在整块上，而不是其中某一行
    expect(bodyOf('.headerTitle:hover')).toMatch(/--dsw-alias-interactive-bg-hover/)

    // 箭头不再是独立按钮，它只是这块按钮的开合指示，开合之间翻转
    expect(bodyOf('.headerHeading')).toMatch(/gap:\s*2px/)
    expect(bodyOf('.headerCaretOpen')).toMatch(/transform:\s*rotate\(180deg\)/)
  })

  it('steps the focused line down in size and up in contrast', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    /** 取某条规则里某个声明的数值，没有该声明时为 NaN */
    const px = (selector: string, property: string): number => {
      const found = new RegExp(`${property}:\\s*(\\d+)px`).exec(bodyOf(selector))
      return found === null ? Number.NaN : Number(found[1])
    }

    // 上行是层级名（工作区），下行是层级里的取值——两个层级的信息，字号与色阶都要分开
    // 两行同色同字号时读起来像同一个标题被折成了两行
    expect(px('.headerFocus', 'font-size')).toBeLessThan(px('.headerLabel', 'font-size'))
    expect(px('.headerFocus', 'line-height')).toBeLessThan(
      px('.headerLabel', 'line-height'),
    )
    // 下行更亮一档：它是当前真正在看的东西，上行只是分类名。两行各自声明色阶
    // 因此不必回到按钮那一层去找继承来的值
    expect(bodyOf('.headerHeading')).toMatch(/--dsw-alias-label-tertiary/)
    expect(bodyOf('.headerFocus')).toMatch(/--dsw-alias-label-secondary/)
    expect(bodyOf('.headerTitle')).not.toMatch(/color:/)
  })

  it('reuses the shared row-action reveal for the picker rows', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const selectorsOf = (pattern: RegExp): string[] =>
      rules.filter((rule) => pattern.test(rule.body)).flatMap((rule) => rule.selectors)

    // 菜单里的条目行与列表行共用同一套操作位：
    // `.rowAction` 的隐藏与三条显示路径都只有一份，因此两处的显隐语义不可能漂移
    const base = rules.find((rule) => rule.selectors.includes('.rowAction'))?.body ?? ''
    expect(base).toMatch(/opacity:\s*0/)
    expect(base).toMatch(/pointer-events:\s*none/)

    const reveal = selectorsOf(/opacity:\s*1/)
    expect(reveal).toContain('.rowAction:focus-visible')
    expect(reveal).toContain('.row:hover .rowAction')

    // 菜单里只覆盖两处：置顶按下时常驻可见、删除悬停时用错误色
    // 样式认 aria-pressed，与 IconButton 声明的是同一个事实
    expect(reveal.some((selector) => selector.includes("[aria-pressed='true']"))).toBe(true)
    const danger = rules
      .filter((rule) => rule.selectors.some((s) => s.includes('rowActionDanger')))
      .map((rule) => rule.body)
      .join('\n')
    expect(danger).toMatch(/--dsw-alias-state-error-primary/)
  })

  it('shapes the picker row like the workspace row instead of two siblings', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 条目行是 `.row` 那一套再加上菜单项的几何：行本身可点，三枚按钮嵌在行内
    expect(bodyOf('.pickerRow')).toMatch(/min-height:\s*34px/)
    expect(bodyOf('.pickerRow')).toMatch(/gap:\s*8px/)
    expect(bodyOf('.pickerRow')).toMatch(/padding:\s*5px 10px/)
    // 操作位在菜单里常驻占位（不是列表行那种从 0 宽展开）
    expect(bodyOf('.pickerRow .rowActions')).toMatch(/gap:\s*8px/)

    // 旧的两个并排热区已经不存在，行按钮 + 兄弟按钮那套选择器不该留残骸
    for (const gone of ['.wg-picker-item', '.wg-picker-action', '.wg-picker-row-focused']) {
      expect(bodyOf(gone), `${gone} is a leftover from the sibling-button layout`).toBe('')
    }
  })

  it('makes the dialog checkbox a full-row label', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 整行做成 label，勾选框自己只有 16px，而那句话是要读的，点文字也该切换它
    expect(bodyOf('.dialogCheck')).toMatch(/cursor:\s*pointer/)
    expect(bodyOf('.dialogCheck')).toMatch(/display:\s*flex/)
    expect(bodyOf('.dialogCheck input')).toMatch(/width:\s*16px/)
  })

  it('floats the picker panel above the list', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const body = rules.find((rule) => rule.selectors.includes('.pickerMenu'))?.body ?? ''

    // 面板 portal 到 body，落点由组件量出来写成内联的 left/top
    expect(body).toMatch(/position:\s*fixed/)
    // 与官方 .portal 面板同一个层级（官方菜单是 1100），不是随手取的小数字
    expect(body).toMatch(/z-index:\s*1100/)
    // 内容可能比窗口高：给它自己的滚动兜底
    expect(body).toMatch(/max-height:/)
    expect(body).toMatch(/overflow-y:\s*auto/)
  })

  it('paints the picker panel with the official menu surface tokens', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const body = rules.find((rule) => rule.selectors.includes('.pickerMenu'))?.body ?? ''

    // 面板是浮层，底下就是会话列表：底色必须真的解析出来
    // 这里只认官方菜单面板那两个 token——
    // 写一个不存在的名字（如 --dsw-alias-bg-elevated）时 background 整条失效
    // 面板变透明、后面的会话穿过来，而界面上不会有任何报错
    expect(body).toMatch(/background:\s*var\(--dsw-specific-menu\)/)
    expect(body).toMatch(/box-shadow:\s*var\(--dsw-elevation-prominent\)/)
    expect(body).toMatch(/--dsw-elevation-stroke-color:\s*var\(--dsw-alias-border-l1\)/)
    // 不写会让整条 background 失效的回退值：面板必须有底色
    expect(body).not.toMatch(/background:\s*var\([^)]*,[^)]*\)/)

    // 底色带 alpha，背面模糊因此不可省
    // 少了它后面的会话会清晰地穿过来，面板读起来像没上底色
    expect(body).toMatch(/backdrop-filter:\s*var\(--dsw-menu-backdrop-filter\)/)

    // 圆角与最小宽度取官方 .list / .submenu 面板的同一组值
    expect(body).toMatch(/border-radius:\s*20px/)
    expect(body).toMatch(/min-width:\s*218px/)
  })

  it('paints the view options panel with the official menu surface tokens', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 与工作区选择器面板同一条理由，面板是浮层，底下就是会话列表
    // token 名写错时 background 整条失效、面板变透明，而界面上不会有任何报错
    const panel = bodyOf('.viewMenu')
    expect(panel).toMatch(/background:\s*var\(--dsw-specific-menu/)
    // 底色带 alpha，背面模糊必须跟着给
    expect(panel).toMatch(/backdrop-filter:\s*var\(--dsw-menu-backdrop-filter\)/)
    expect(panel).toMatch(/box-shadow:\s*var\(--dsw-elevation-prominent\)/)
    expect(panel).toMatch(/--dsw-elevation-stroke-color:\s*var\(--dsw-alias-border-l1\)/)
    // 落点由组件量出来写成内联的 left/top，层级与官方菜单面板同档
    expect(panel).toMatch(/position:\s*fixed/)
    expect(panel).toMatch(/z-index:\s*1100/)

    // 条目行不可点，只有开关本身可交互，行若也承诺可点就是两个控件抢一次点击
    const option = bodyOf('.viewOption')
    expect(option).toMatch(/display:\s*flex/)
    expect(option).not.toMatch(/cursor:\s*pointer/)
    // 开关排在行尾，不被设置名挤动
    expect(bodyOf('.viewOptionSwitch')).toMatch(/flex:\s*none/)
    expect(bodyOf('.viewOptionLabel')).toMatch(/flex:\s*1/)
  })

  it('paints the display mode rows as clickable and the group label as inert', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 可选行与开关行相反：它整行可点，因此必须有指针与悬停底色
    const row = bodyOf('.viewOptionRow')
    expect(row).toMatch(/display:\s*flex/)
    expect(row).toMatch(/cursor:\s*pointer/)
    expect(bodyOf('.viewOptionRow:hover')).toMatch(
      /background:\s*var\(--dsw-alias-interactive-bg-hover\)/,
    )
    // 标题只是说明这一组选的是哪件事，不可点也不是停点
    expect(bodyOf('.viewGroupLabel')).not.toMatch(/cursor:\s*pointer/)
    // 分隔线取官方菜单 separator 同一档：0.5px 的 border-l2
    const separator = bodyOf('.viewSeparator')
    expect(separator).toMatch(/height:\s*0\.5px/)
    expect(separator).toMatch(/background:\s*var\(--dsw-alias-border-l2\)/)
  })

  it('lays the flat list out as one column at the grouped view row spacing', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 一条列表的成员排成一列，行距与工作区体内那几段同值（2px）
    expect(bodyOf('.flatList')).toMatch(/flex-direction:\s*column/)
    expect(bodyOf('.flatList > * + *')).toMatch(/margin-top:\s*2px/)
    // 平铺没有层级，但指示器仍占行左缘那 4~20px，缩进取会话行的下限 24px 让开它
    // 它那两条选择器写在同一个逗号列表里，命中其一即可
    const flatIndent = rules
      .filter((rule) => rule.selectors.includes('.flatList > .row'))
      .map((rule) => /--wg-row-start:\s*([^;]+)/.exec(rule.body)?.[1]?.trim())
      .find((value) => value !== undefined)
    expect(flatIndent).toBe('24px')
    // 平铺行也要拿得到内缩量，否则指示器退化成 left:auto 压到标题上
    expect(rules.some((rule) => rule.selectors.includes('.flatList'))).toBe(true)
  })

  it('paints the submenu card opaque so it does not show the list through', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const body = rules.find((rule) => rule.selectors.includes(".menuList [role='menu']"))?.body ?? ''

    // 二级面板是官方 .list 的后代，而 .list 自带 backdrop-filter，会形成 backdrop root
    // 二级面板落在父层盒子之外，模糊采样不到内容，只剩半透明底色 → 后面的会话透出来
    // 因此这里必须给不透明底色，并显式撤掉那条失效的模糊
    expect(body).toMatch(/background:\s*var\(--dsw-alias-bg-layer-3\)/)
    expect(body).toMatch(/backdrop-filter:\s*none/)
    // 取带 alpha 的菜单底色等于没换
    expect(body).not.toMatch(/background:\s*var\(--dsw-specific-menu\)/)

    // 作用域必须挂在本包自己的类上：面板 portal 到 body，用官方 hash 类名会波及官方与其他插件的菜单
    // 源文件里的类名不带前缀，靠「是否是本包定义的类」判断，见下面的 OWN_CLASSES
    const unscoped = rules.filter(
      (rule) =>
        rule.body.includes('--dsw-alias-bg-layer-3') &&
        rule.selectors.some(
          (sel) => sel.includes("[role='menu']") && !OWN_CLASSES.some((cls) => sel.includes(cls)),
        ),
    )
    expect(unscoped).toEqual([])
  })

  it('pushes the submenu arrow to the right edge of the item', () => {
    // 官方 Menu 的项没有「悬停展开」槽位
    // 箭头由本包塞进 label（见 menus.tsx 的 submenuParentLabel）。文案必须吃掉余量
    // 箭头不参与伸缩，箭头才会落在项的最右缘，反过来写会让箭头跟着文字长度浮动
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    expect(bodyOf('.menuLabel')).toMatch(/display:\s*flex/)
    const text = bodyOf('.menuLabelText')
    expect(text).toMatch(/flex:\s*1/)
    // 缺了 min-width: 0，长文案会把箭头挤出项外而不是走省略号
    expect(text).toMatch(/min-width:\s*0/)
    expect(text).toMatch(/text-overflow:\s*ellipsis/)
    expect(bodyOf('.menuArrow')).toMatch(/flex:\s*none/)

    // 箭头色阶与官方项图标同档，不抢文案权重
    expect(bodyOf('.menuArrow')).toContain('var(--dsw-alias-label-tertiary)')

    // 箭头恒指向右，翻转态下二级面板改从左侧展开，箭头也不跟着镜像
    // 断言落在「没有任何一条含 .menuArrow 的规则声明 transform」上——
    // 只要有人给箭头加了翻转，这条就失败
    expect(
      rules.filter((rule) => rule.selectors.some((s) => s.includes('.menuArrow'))),
    ).not.toHaveLength(0)
    for (const rule of rules) {
      if (!rule.selectors.some((s) => s.includes('.menuArrow'))) continue
      expect(rule.body).not.toMatch(/transform/)
    }
  })
})
