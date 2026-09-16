import { describe, expect, it } from 'vitest'
import { CSS } from '../src/client/styles.ts'

/**
 * 取样式表文本
 *
 * 直接读**求值后**的导出：节奏参数以插值进入 CSS，按源文本切割只会拿到 ${...}
 * 字面量。同理不再按反引号定界解析——那会与被测对象互相污染
 */
function readCss(): string {
  return CSS
}

describe('client stylesheet', () => {
  it('keeps the CSS template literal free of backticks', () => {
    // CSS 块由反引号定界，块内再出现反引号会直接截断模板字符串：
    // tsc 报的是一串与样式无关的语法错，排查成本远高于这里一行断言
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

    // 分组结构多包了几层包装元素，每条 `X > * + *` 只作用于自己的直接子项，
    // 因此每一层都必须有一条规则，否则「分组头 → 首个会话行」这类
    // 跨层相邻会漏掉间距
    for (const container of ['wg-workspace', 'wg-workspace-body', 'wg-group', 'wg-sessions']) {
      expect(hasGapRule(`.${container} > * + *`), `missing 2px gap rule for .${container}`).toBe(true)
    }
  })

  it('reveals row actions on hover, menu-open, or keyboard focus only', () => {
    // 先剥注释：注释里的示例选择器不该参与断言。
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')

    // 隐藏的按钮必须同时关掉指针事件，否则会留下一个看不见却能点中的热区。
    const base = [...css.matchAll(/\.wg-row-action\s*\{([^{}]*)\}/g)].map((m) => m[1] ?? '')
    expect(base.length).toBeGreaterThan(0)
    expect(base.some((body) => /opacity:\s*0/.test(body))).toBe(true)
    expect(base.some((body) => /pointer-events:\s*none/.test(body))).toBe(true)

    // 只保留悬停 / 菜单展开 / 键盘焦点三条显示路径。
    const reveal = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .filter((m) => /\.wg-row-action/.test(m[1] ?? '') && /opacity:\s*1/.test(m[2] ?? ''))
      .flatMap((m) => (m[1] ?? '').split(',').map((s) => s.trim()))

    expect(reveal).toContain('.wg-row-action:focus-visible')
    expect(reveal.some((s) => s.includes(':hover'))).toBe(true)
    expect(reveal).toContain('.wg-row-menu-open .wg-row-action')

    // 这些写法会让按钮在鼠标点过之后常驻：:focus / :focus-within 在点击后
    // 持续为真，而选中态与点击无关（当前会话一直是选中的）。
    for (const bad of ['.wg-row-action:focus', '.wg-row:focus-within .wg-row-action']) {
      expect(reveal, `${bad} makes actions stick after a click`).not.toContain(bad)
    }
    expect(reveal.some((s) => s.includes('wg-row-selected'))).toBe(false)
  })

  it('indents each hierarchy level by one icon-column step', () => {
    // 注释会连同其后的选择器一起落进 [^{}]+ 里，先把注释剥掉再解析规则。
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    /** 取某条选择器规则里的某个声明值 */
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 工作区行保持官方几何；分组层与组内会话各再让出一层，层级因此可读。
    // padding 简写按「上 右 下 左」读，左边即该层的缩进量。分组的会话行多了
    // 折叠体两层包装，选择器要跟着写穿
    expect(declared('.wg-workspace-head', 'padding')).toBe('0 8px')
    expect(declared('.wg-group-head', 'padding')).toBe('0 8px 0 24px')
    expect(declared('.wg-workspace-body > .wg-sessions > .wg-row', 'padding-left')).toBe('24px')
    expect(
      declared(
        '.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions > .wg-row',
        'padding-left',
      ),
    ).toBe('40px')
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

    const groupSessions = '.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions'

    // 引导线落在父级图标列的中心：工作区是 8 + 16/2，分组是 24 + 16/2。
    expect(hasRule('.wg-workspace-body::before', /left:\s*16px/)).toBe(true)
    expect(hasRule(`${groupSessions}::before`, /left:\s*32px/)).toBe(true)
    // 线要跟着主题走，不能写死颜色。
    expect(hasRule('.wg-workspace-body::before', /background:\s*var\(--dsw-alias-border-l1\)/)).toBe(
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

    // 静止时操作位必须收成 0 宽，否则会把行尾时间顶到左侧，两者右缘错开
    // 一个图标列宽——这正是本次修掉的观感问题。
    expect(hasRule('.wg-row-action-slot', /width:\s*0/)).toBe(true)
    expect(hasRule('.wg-row-action-slot', /overflow:\s*hidden/)).toBe(true)

    // 时间隐藏与操作位展开必须由同一组触发条件驱动，任一时刻只有一方占行尾。
    const triggers = ['hover', 'wg-row-menu-open', 'focus-visible']
    for (const trigger of triggers) {
      const hidesTime = rules.some(
        (rule) =>
          rule.selectors.some((s) => s.includes('.wg-row-time') && s.includes(trigger)) &&
          /display:\s*none/.test(rule.body),
      )
      const expands = rules.some(
        (rule) =>
          rule.selectors.some((s) => s.includes('.wg-row-action-slot') && s.includes(trigger)) &&
          /width:\s*16px/.test(rule.body),
      )
      expect(hidesTime, `time must yield on ${trigger}`).toBe(true)
      expect(expands, `action slot must expand on ${trigger}`).toBe(true)
    }
  })

  it('gives the region root the official right-side block inset', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 官方 WorkspaceBrowser 的根节点自己带整块右留白；官方那份定义随被接替的
    // 组件一起没了，本包必须自己重新定义这三个量，header 与列表才能落回原位
    expect(declared('.wg-root', '--dsh-session-list-edge-inset')).toBe(
      'var(--dsh-sidebar-inline-padding, 12px)',
    )
    expect(declared('.wg-root', '--dsh-session-list-scrollbar-width')).toBe('8px')
    expect(declared('.wg-root', '--dsh-session-list-scrollbar-offset')).toBe('2px')
    expect(declared('.wg-root', 'padding-right')).toBe('var(--dsh-session-list-edge-inset)')

    // 对照 tab 只补左侧：右侧一律由 .wg-root 给，否则两层各加 12px
    expect(declared('.wg-tab', 'padding')).toBe('6px 0 0 12px')
  })

  it('keeps the header entry off the region edge like official does', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 官方 header 的 -4px 是相对「自带右留白」的根节点写的；本包根节点现在有
    // 同一份留白，因此这一条照抄即可，相抵后按钮右缘离栏缘 8px，不贴边
    expect(declared('.wg-header', 'margin-right')).toBe('-4px')
    expect(declared('.wg-header', 'height')).toBe('36px')
    expect(declared('.wg-header', 'gap')).toBe('4px')
  })

  it('lets the list cancel the root inset and re-derive its own right edge', () => {
    // 官方 .listArea 用 -edge-inset 让列表靠到栏缘，再由 .list 推回到 edge-inset；
    // 本包没有 .listArea，因此这两个值要折进 .wg-list 自己的 margin / padding
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const list = rules.find((rule) => rule.selectors.includes('.wg-list'))
    expect(list).toBeDefined()

    // 折进 -edge-inset：否则列表会被 .wg-root 的右留白再推一次，行右缘偏左
    expect(list?.body).toMatch(
      /margin-right:\s*calc\(\s*var\(--dsh-session-list-scrollbar-offset\)\s*-\s*var\(--dsh-session-list-edge-inset\)\s*\)/,
    )
    expect(list?.body).toMatch(/padding-right:\s*calc\(/)
    expect(list?.body).toMatch(/--dsh-session-list-scrollbar-width/)
    // 两边各 12px 会让内容整体缩进 24px——这正是本次修掉的观感问题
    expect(list?.body).not.toMatch(/margin-right:\s*0/)
  })

  it('gives the header entry the official icon-button geometry', () => {
    // 官方 header 图标按钮是 28px 正圆（.iconButton），与行内 16px 按钮
    // 不是一套；本轮改动是按官方外观来的，尺寸不能被行内那套带跑
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const base = rules.find((rule) => rule.selectors.includes('.wg-header-action'))
    expect(base).toBeDefined()
    expect(base?.body).toMatch(/width:\s*28px/)
    expect(base?.body).toMatch(/height:\s*28px/)
    expect(base?.body).toMatch(/border-radius:\s*50%/)
    // 正圆必须配对 round，否则会被主题的全局超级椭圆磨成方圆角
    expect(base?.body).toMatch(/corner-shape:\s*round/)

    // 未实现的入口渲染成 disabled 占位，且不能沿用悬停高亮——否则看起来仍可点
    const hover = rules.find((rule) =>
      rule.selectors.some((s) => s.includes('.wg-header-action:hover')),
    )
    expect(hover?.selectors.join()).toContain(':not(:disabled)')
    expect(rules.some((rule) => rule.selectors.includes('.wg-header-action:disabled'))).toBe(true)
  })

  it('enlarges the header entry in the narrow rail like official does', () => {
    // 官方 rail 下这个入口是 36px、label-primary；宽栏 28px、label-secondary
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const rail = rules.find((rule) =>
      rule.selectors.includes('.wg-header-rail .wg-header-action'),
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

    const count = bodyOf('.wg-group-count')
    const time = bodyOf('.wg-row-time')
    expect(count).not.toBe('')
    for (const declaration of ['flex: none', 'color: var(--dsw-alias-label-tertiary)']) {
      expect(count).toContain(declaration)
      expect(time).toContain(declaration)
    }
    expect(count).toMatch(/font-size:\s*12px/)
    expect(count).toMatch(/line-height:\s*20px/)

    // 分组头是 gap:6px，而 session 行是 gap:0；差的那份 gap 要还回去，
    // 会话数才会落在与 time 同一条右缘线上
    expect(count).toMatch(/margin-right:\s*-6px/)

    // 隐去会话数的三条触发条件要与 time 那组一一对应，只是行类换成分组行
    const hides = (selector: string): boolean =>
      rules.some(
        (rule) =>
          rule.selectors.includes(selector) &&
          rule.body.replace(/\s/g, '').includes('display:none'),
      )
    expect(hides('.wg-group-head:hover .wg-group-count')).toBe(true)
    expect(hides('.wg-group-head.wg-row-menu-open .wg-group-count')).toBe(true)
    expect(hides('.wg-group-head:has(.wg-row-action:focus-visible) .wg-group-count')).toBe(true)
    // 会话行的 time 照旧，不能被这轮改动带跑
    expect(hides('.wg-row:hover .wg-row-time')).toBe(true)
  })

  it('gives the group row the same collapsible action slot as the session row', () => {
    // 会话数要贴到行右，操作位就必须像 session 行那样静止时不占宽。
    // 三条展开触发条件与上面隐去会话数的那组一一对应，这样两者严格互换
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const expands = (selector: string): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && /width:\s*auto/.test(rule.body))

    expect(expands('.wg-group-head:hover .wg-row-action-slot')).toBe(true)
    expect(expands('.wg-group-head.wg-row-menu-open .wg-row-action-slot')).toBe(true)
    expect(
      expands('.wg-group-head:has(.wg-row-action:focus-visible) .wg-row-action-slot'),
    ).toBe(true)

    // 分组行里是两个按钮，自然宽不是会话行的单个 16px
    const slot = rules.find((rule) => rule.selectors.includes('.wg-row-action-slot'))?.body ?? ''
    expect(slot).toMatch(/width:\s*0/)
  })

  it('animates the collapse body by track height instead of a hard-coded size', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 收起态与展开态只差轨道高度（0fr ↔ 1fr）：轨道高度由内容自身决定，
    // 因此子元素有多少个、各自多高都不需要预先知道
    expect(bodyOf('.wg-collapse')).toMatch(/grid-template-rows:\s*0fr/)
    expect(bodyOf('.wg-collapse-open')).toMatch(/grid-template-rows:\s*1fr/)

    // 轨道高度可动画的前提是内层裁剪 + 自动最小尺寸归零：缺了任一条，
    // 内容都会把 0fr 的轨道顶开，收不到底
    const clip = bodyOf('.wg-collapse-clip')
    expect(clip).toMatch(/overflow:\s*hidden/)
    expect(clip).toMatch(/min-height:\s*0/)
    // 收起后内容仍在文档里，必须自己让出焦点顺序
    expect(clip).toMatch(/visibility:\s*hidden/)

    // 这套做法不依赖任何写死的尺寸或序号
    expect(css).not.toMatch(/max-height/)
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

    // 基准态透明；显隐由折叠体逐个挂/摘 .wg-reveal，不能写成「展开祖先的后代」，
    // 否则嵌套折叠体里收着的行会被外层展开态一起点亮，等自己展开时已是不透明的
    expect(bodyOf('.wg-collapse-clip [data-wg-stagger]')).toMatch(/opacity:\s*0/)
    for (const selector of rules.map((rule) => rule.selectors.join(', '))) {
      // 展开态的选择器必须带 .wg-reveal，且不能只靠祖先类名点灯
      if (!selector.includes('wg-collapse-open')) continue
      expect(selector).not.toContain('[data-wg-stagger]')
    }

    const revealed = bodyOf('.wg-collapse-clip [data-wg-stagger].wg-reveal')
    expect(revealed).toMatch(/opacity:\s*1/)
    // 延迟逐元素不同（取该元素完全露出时的容器进度），由折叠体量几何后逐个下发；
    // 样式只消费一个变量，因此没有任何逐元素写死的值或序号
    expect(revealed).toMatch(/transition-delay:\s*var\(--wg-collapse-delay/)
  })

  it('fades every row out together when the body closes', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const base = rules.find((rule) =>
      rule.selectors.includes('.wg-collapse-clip [data-wg-stagger]'),
    )?.body

    // 收起时 .wg-reveal 被摘掉就落回基准规则：延迟不在基准规则里，因此归零，
    // 所有行同时淡出（步进的延迟只挂在展开态那条规则上）
    expect(base).toBeDefined()
    expect(base).not.toMatch(/transition-delay/)
    expect(base).toMatch(/transition:\s*opacity/)
  })

  it('drops the collapse animation under prefers-reduced-motion', () => {
    const css = readCss()
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

    // 关掉动画还不够：visibility 的延时不跟着去掉，收起后内容仍会多挡
    // 一个动画时长才交出焦点
    expect(reduced).toMatch(/\.wg-collapse\s*\{\s*transition:\s*none/)
    expect(reduced).toMatch(/\.wg-collapse-clip\s*\{\s*transition:\s*visibility 0s linear/)
    // 逐个淡入也要一并落位。延迟挂在 .wg-reveal 上且更具体，因此那条也要清掉，
    // 否则 reduced-motion 下行仍是逐个出现
    expect(reduced).toMatch(/\[data-wg-stagger\]\.wg-reveal[\s\S]*?transition:\s*none/)
  })
})
