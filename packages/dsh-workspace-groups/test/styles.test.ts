import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * 从 styles.ts 里取出内联的 CSS 文本。
 *
 * 这里刻意不去正则匹配外层的模板字符串：本文件要断言的正是「CSS 块内部
 * 不得出现反引号」，用反引号做定界符解析会与被测对象互相污染。
 */
function readCss(): string {
  const src = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
  const start = src.indexOf('const CSS = `')
  expect(start).toBeGreaterThanOrEqual(0)
  const body = src.slice(start + 'const CSS = `'.length)
  const end = body.indexOf('`\n')
  expect(end).toBeGreaterThanOrEqual(0)
  return body.slice(0, end)
}

describe('client stylesheet', () => {
  it('keeps the CSS template literal free of backticks', () => {
    // CSS 块由反引号定界，块内再出现反引号会直接截断模板字符串：
    // tsc 报的是一串与样式无关的语法错，排查成本远高于这里一行断言。
    expect(readCss()).not.toContain('`')
  })

  it('gives every row container a 2px gap between adjacent rows', () => {
    const css = readCss()
    // CSS 里这几条选择器是写成同一个逗号列表的，因此先把规则拆成
    // 「选择器 -> 声明块」再逐条查，而不是对单个选择器配正则。
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))

    /** 存在一条规则：选择器表含该选择器，且声明块里 margin-top 为 2px。 */
    const hasGapRule = (selector: string): boolean =>
      rules.some(
        (rule) =>
          rule.selectors.includes(selector) &&
          /margin-top:\s*2px/.test(rule.body),
      )

    // 分组结构多包了几层包装元素，每条 `X > * + *` 只作用于自己的直接子项，
    // 因此每一层都必须有一条规则，否则「分组头 → 首个会话行」这类
    // 跨层相邻会漏掉间距。
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
    /** 取某条选择器规则里的某个声明值。 */
    const declared = (selector: string, property: string): string | undefined =>
      [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
        .filter((m) => (m[1] ?? '').split(',').map((s) => s.trim()).includes(selector))
        .map((m) => new RegExp(`${property}:\\s*([^;]+)`).exec(m[2] ?? '')?.[1]?.trim())
        .find((value) => value !== undefined)

    // 工作区行保持官方几何；分组层与组内会话各再让出一层，层级因此可读。
    // padding 简写按「上 右 下 左」读，左边即该层的缩进量。
    expect(declared('.wg-workspace-head', 'padding')).toBe('0 8px')
    expect(declared('.wg-group-head', 'padding')).toBe('0 8px 0 24px')
    expect(declared('.wg-workspace-body > .wg-sessions > .wg-row', 'padding-left')).toBe('24px')
    expect(declared('.wg-group > .wg-sessions > .wg-row', 'padding-left')).toBe('40px')
  })

  it('draws one guide line per nested level at the parent icon column', () => {
    const css = readCss().replace(/\/\*[\s\S]*?\*\//g, '')
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
      selectors: (m[1] ?? '').split(',').map((s) => s.trim()),
      body: m[2] ?? '',
    }))
    /** 找出一条规则：选择器表含该选择器且声明块匹配。 */
    const hasRule = (selector: string, pattern: RegExp): boolean =>
      rules.some((rule) => rule.selectors.includes(selector) && pattern.test(rule.body))

    // 引导线落在父级图标列的中心：工作区是 8 + 16/2，分组是 24 + 16/2。
    expect(hasRule('.wg-workspace-body::before', /left:\s*16px/)).toBe(true)
    expect(hasRule('.wg-group > .wg-sessions::before', /left:\s*32px/)).toBe(true)
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
    /** 命中该选择器的规则里，是否有一条声明了给定的属性值。 */
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
})
