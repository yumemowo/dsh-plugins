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
})
