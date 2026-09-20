import { describe, expect, it } from 'vitest'
import { CSS } from '../src/client/styles.ts'

/**
 * 取样式表文本
 *
 * 直接读**求值后**的导出：节奏参数以插值进入 CSS，按源文本切割只会拿到 ${...}
 * 字面量。同理不按反引号定界解析：那会与被测对象互相污染
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
    // 一个图标列宽
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

  it('takes the context menu root out of the row flex flow', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const root = rules.find((rule) => rule.selectors.includes('.wg-context-menu.wg-context-menu'))

    // 原语根节点是 position: relative 的行内盒，没有 DOM 子节点（面板 portal 到
    // body）。留在流里会成为一个空 flex 项，行的 gap 照样算，标题与会话数会被推开
    expect(root?.body).toMatch(/display:\s*contents/)
    // 类名写两遍抬一次优先级：原语自己的单类规则谁后注入谁赢，先后不由本包决定
    expect(root).toBeDefined()
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

    // 官方 header 的 -4px 是相对「自带右留白」的根节点写的；本包根节点有
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
    // 两边各 12px 会让内容整体缩进 24px，因此列表必须自己抵掉根节点那份留白
    expect(list?.body).not.toMatch(/margin-right:\s*0/)
  })

  it('gives the header entry the official icon-button geometry', () => {
    // 官方 header 图标按钮是 28px 正圆（.iconButton），与行内 16px 按钮
    // 不是一套；这些几何按官方外观取，不能被行内那套带跑
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

  it('sizes the header entry group for every entry it can show', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 容器带 overflow:hidden，而宽栏能同时出现三个 28px 入口（视图选项 /
    // 新建工作区分组 / 添加工作区），因此宽度上限必须容得下 28*3 + 4*2 = 92。
    // 给小了不会报错，只是把最右边那个入口整个裁掉——界面上平白少一个按钮
    const cap = /max-width:\s*(\d+)px/.exec(bodyOf('.wg-header-actions'))?.[1]
    expect(cap).toBe('92')
    expect(bodyOf('.wg-header-actions')).toMatch(/overflow:\s*hidden/)
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

    // 分组头复用工作区行那一套两个槽：静止显示文件夹、悬停换成箭头。
    // 少了分组头这几条，它的箭头会常驻（或文件夹不会让位），与工作区行不一致
    const head = '.wg-virtual-workspace-head'
    expect(has(`${head} .wg-chevron`, /display:\s*none/)).toBe(true)
    expect(has(`${head}:hover .wg-chevron`, /display:\s*inline-flex/)).toBe(true)
    expect(has(`${head}:hover .wg-folder`, /display:\s*none/)).toBe(true)
  })

  it('stacks the rail entries instead of clipping them', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 窄栏一行放不下两个 36px 入口，因此改成竖排；定高与裁剪都要撤掉，
    // 否则第二个入口看不见（宽栏那条基线规则是给单行写的）
    const rail = bodyOf('.wg-header-rail')
    expect(rail).toMatch(/flex-direction:\s*column/)
    expect(rail).toMatch(/height:\s*auto/)
    expect(rail).toMatch(/overflow:\s*visible/)
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
    // 会话行的时间也走同一组触发条件，两者互换关系一致
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

    // 不透明是元素的自然状态：展开态不得有任何规则写 opacity，否则过渡没跑或主线程
    // 被占住时元素会留在透明上。透明只挂在「所在折叠体还没展开」这条结构条件上
    expect(bodyOf('.wg-collapse-clip [data-wg-stagger]')).not.toMatch(/opacity\s*:/)
    expect(
      bodyOf('.wg-collapse:not(.wg-collapse-open) > .wg-collapse-clip [data-wg-stagger]'),
    ).toMatch(/opacity:\s*0/)

    const revealed = bodyOf('.wg-collapse-clip [data-wg-stagger]')
    // 延迟逐元素不同（撑开那段等待 + 该元素的先后），由折叠体量几何后逐个下发；
    // 样式只消费一个变量，因此没有任何逐元素写死的值或序号
    expect(revealed).toMatch(/transition-delay:\s*var\(--wg-collapse-delay/)
  })

  it('fades every row out together when the body closes', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const closed = rules.find((rule) =>
      rule.selectors.includes('.wg-collapse:not(.wg-collapse-open) > .wg-collapse-clip [data-wg-stagger]'),
    )?.body

    // 收起时这条更具体，且把延迟归零：所有行同时淡出（步进的延迟只挂在展开态那条）
    expect(closed).toBeDefined()
    expect(closed).toMatch(/transition-delay:\s*0ms/)
  })

  it('drops the collapse animation under prefers-reduced-motion', () => {
    const css = readCss()
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

    // 关掉动画还不够：visibility 的延时不跟着去掉，收起后内容仍会多挡
    // 一个动画时长才交出焦点
    expect(reduced).toMatch(/\.wg-collapse\s*\{\s*transition:\s*none/)
    expect(reduced).toMatch(/\.wg-collapse-clip\s*\{\s*transition:\s*visibility 0s linear/)
    // 逐个淡入也要一并落位。延迟由组件逐个下发，因此那条展开态规则要一起清掉，
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

    // 工作区分组行本身落在根节点上：缩进与工作区行同为 8px，不是会话分组那档 24px
    expect(hasRule('.wg-group-head.wg-virtual-workspace-head', /padding:\s*0 8px/)).toBe(true)
    // 组内工作区再让出一格，层级因此读得出来
    expect(
      hasRule(
        '.wg-virtual-workspace-body > .wg-workspace > .wg-workspace-head',
        /padding-left:\s*24px/,
      ),
    ).toBe(true)
    // 引导线落在父级图标列中心：根 8 + 16/2 = 16
    expect(hasRule('.wg-virtual-workspace-body::before', /left:\s*16px/)).toBe(true)
  })

  it('fades the whole panel in like the official tree body', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    const bodyOf = (selector: string): string =>
      rules.find((rule) => rule.selectors.includes(selector))?.body ?? ''

    // 官方给三种内容体共用的 .treeBody 挂了 .2s 的 wide-in 动画，本包的面板
    // 类取同一条节奏
    const panel = bodyOf('.wg-panel')
    expect(panel).toMatch(/animation:\s*wg-panel-in\s*\.2s/)
    expect(panel).toMatch(/var\(--ds-ease-in-out/)
    // 只从 0% 的不透明起，终态留给元素自然状态——这样动画没跑或被打断时
    // 面板仍是可见的，不会停在透明上。关键帧内部的 `0%` 会连同外层选择器一起
    // 落进 [^{}]+，因此按整块文本查
    expect(css).toMatch(/@keyframes wg-panel-in\s*\{\s*0%\s*\{\s*opacity:\s*0/)
  })

  it('drops the panel fade under prefers-reduced-motion', () => {
    const css = readCss()
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

    // 面板动画的初态是 opacity: 0，这里必须整条 animation 撤掉而不是只撤
    // transition——否则 reduced-motion 下面板会一直停在不可见
    expect(reduced).toMatch(/\.wg-panel\s*\{\s*animation:\s*none/)
  })

  it('drops the search expand motion under prefers-reduced-motion', () => {
    const css = readCss()
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

    // 展开、输入框淡入、标题与入口组的让位都要一起落位；漏掉哪一条，那一项
    // 就会在 reduced-motion 下继续动
    for (const selector of [
      '.wg-search',
      '.wg-search-slot',
      '.wg-search-input',
      '.wg-header-label',
      '.wg-header-actions',
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
    expect(bodyOf('.wg-search-slot')).toMatch(/max-width:\s*28px/)
    expect(bodyOf('.wg-search-slot-expanded')).toMatch(/max-width:\s*100%/)
    expect(bodyOf('.wg-search')).toMatch(/height:\s*28px/)
    expect(bodyOf('.wg-search')).toMatch(/border-radius:\s*50%/)
    expect(bodyOf('.wg-search-expanded')).toMatch(/height:\s*30px/)
    expect(bodyOf('.wg-search-expanded')).toMatch(/border-radius:\s*10px/)

    // 时长与缓动取官方那套（.18s 展开 / .12s 淡入，--ds-ease-in-out）
    expect(bodyOf('.wg-search')).toMatch(/\.18s var\(--ds-ease-in-out/)
    expect(bodyOf('.wg-search-input')).toMatch(/\.12s var\(--ds-ease-in-out/)

    // 标题与入口组的让位是对称的两条：一个向左收、一个向右收
    expect(bodyOf('.wg-header-label-hidden')).toMatch(/max-width:\s*0/)
    expect(bodyOf('.wg-header-label-hidden')).toMatch(/transform:\s*translate\(-4px\)/)
    expect(bodyOf('.wg-header-actions-hidden')).toMatch(/max-width:\s*0/)
    expect(bodyOf('.wg-header-actions-hidden')).toMatch(/transform:\s*translate\(4px\)/)
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
    const row = bodyOf('.wg-search-result')
    expect(row).toMatch(/min-height:\s*48px/)
    expect(row).toMatch(/border-radius:\s*8px/)
    expect(row).toMatch(/flex-direction:\s*column/)

    // 第二行整体缩进一个状态位槽（16 + 4），与标题左缘对齐
    expect(bodyOf('.wg-search-result-meta')).toMatch(/margin-left:\s*20px/)

    // 那一行的 6px gap 是官方给「工作区名 / 摘录」两格用的；本包没有摘录，
    // 路径必须整体成项，否则 gap 会落进「工作区 / 分组」之间，把一条连续
    // 路径读成两截
    expect(bodyOf('.wg-search-result-meta')).toMatch(/gap:\s*6px/)
    const path = bodyOf('.wg-search-result-path')
    expect(path).toMatch(/gap:\s*0/)
    expect(path).toMatch(/flex:/)
    // 宽度上限挂在路径这一层：挂到段上会按路径自身宽度算百分比，越窄越缩，
    // 长工作区名一开始就被截断
    expect(path).toMatch(/max-width:\s*60%/)
    expect(bodyOf('.wg-search-result-workspace')).not.toMatch(/max-width/)

    // 路径两段同格（12px/17px）但不同色阶：工作区更强、分组更弱，
    // 靠对比区分「容器」与「组」
    const workspace = bodyOf('.wg-search-result-workspace')
    expect(workspace).toMatch(/color:\s*var\(--dsw-alias-label-secondary\)/)
    expect(workspace).toMatch(/font-size:\s*12px/)
    expect(workspace).toMatch(/line-height:\s*17px/)

    const group = bodyOf('.wg-search-result-group')
    // 分组比工作区弱一整档（caption 而非 tertiary），对比才看得出来
    expect(group).toMatch(/color:\s*var\(--dsw-alias-label-caption/)
    expect(group).toMatch(/font-size:\s*12px/)
    expect(group).toMatch(/line-height:\s*17px/)

    // 两段必须真的是两档色阶——写成同一个变量就退化成一条长名字
    expect(workspace).not.toBe(group)
    // 分隔符不单独着色：它作为分组那一段的文本继承同一色阶，样式里不该有
    // 一个只给分隔符用的颜色规则
    expect(bodyOf('.wg-search-result-separator')).toBe('')
  })

  it('indents a session row whether or not a hover card wraps it', () => {
    // 挂了悬停卡片的会话行会被官方 HoverCard 的根节点包一层，行就不再是
    // .wg-sessions 的直接子项。两条选择器都要在，缩进才不会因为有没有卡片而不同
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    /** 某条选择器声明的 padding-left */
    const indentOf = (selector: string): string | undefined =>
      rules
        .filter((rule) => rule.selectors.includes(selector))
        .map((rule) => /padding-left:\s*([^;]+)/.exec(rule.body)?.[1]?.trim())
        .find((value) => value !== undefined)

    const wrapped = '.wg-workspace-body > .wg-sessions > * > .wg-row'
    const groupedWrapped =
      '.wg-group > .wg-collapse > .wg-collapse-clip > .wg-sessions > * > .wg-row'

    expect(indentOf(wrapped)).toBe('24px')
    expect(indentOf(groupedWrapped)).toBe('40px')
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
      '.wg-hover-title',
      '.wg-hover-path',
      '.wg-hover-time',
      '.wg-hover-status',
    ]) {
      const body = bodyOf(selector)
      expect(body, `${selector} is missing`).not.toBe('')
      expect(body, `${selector} must not use a theme-tinted label token`).not.toContain(
        '--dsw-alias-label',
      )
    }

    // 长路径要能断行，否则卡片那 244px 宽的盒子里会被撑破
    expect(bodyOf('.wg-hover-path')).toMatch(/word-break:\s*break-all/)
    // 标题同理：行上被省略号截断，卡片就是「看清全名」的入口
    expect(bodyOf('.wg-hover-title')).toMatch(/overflow-wrap:\s*break-word/)

    // 状态行是「点 + 文案」，间距取官方卡片那 8px
    expect(bodyOf('.wg-hover-status')).toMatch(/gap:\s*8px/)
    expect(bodyOf('.wg-hover-content')).toMatch(/gap:\s*8px/)
  })

  it('flips the official floating panels only under the body marker', () => {
    // 官方浮层固定向右展开，对照模式下区域贴窗口右缘会把它们顶到屏幕外。翻转必须
    // 收在 body 的标记之下：产品形态（左侧栏）要保留原语的向右展开
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

    // 悬停卡片：位置是原语算出来的内联 left，只有 !important 压得过；落点取 body
    // 上那个由宿主量得的变量
    const card = bodyOf('body[data-wg-flip] [data-wg-hover-card]')
    expect(card).toMatch(/left:\s*auto\s*!important/)
    expect(card).toMatch(/right:\s*var\(--wg-flip-right\)\s*!important/)

    // 选择器必须带本包的卡片标记：卡片 portal 到 document.body，与官方左侧栏的
    // 卡片同处一个父节点，少了这层限定会把官方卡片一起翻出屏幕
    expect(card).not.toBe('')
    for (const rule of rules) {
      if (!/--wg-flip-right/.test(rule.body)) continue
      expect(rule.selectors.some((s) => s.includes('[data-wg-hover-card]'))).toBe(true)
    }
  })
})
