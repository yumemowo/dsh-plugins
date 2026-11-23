import { describe, expect, it } from 'vitest'
import { readAllCss, stripComments } from './readCss.ts'

/**
 * 行尾操作位与标题的形态
 *
 * 两条都是「界面看起来只是有点不对」那一类：不报错，也不会被抓到
 * 一条是行尾按钮挤成一团，一条是跑马灯文字中间夹着三个点
 */

/** 剥掉注释后按选择器与声明体拆开 */
function rulesOf(css: string): { selectors: string[]; body: string }[] {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selectors: (m[1] ?? '').split(',').map((s) => s.trim().replace(/\s+/g, ' ')),
    body: m[2] ?? '',
  }))
}

/** 取某条选择器规则里的某个声明值 */
function declared(selector: string, property: string): string | undefined {
  return rulesOf(stripComments(readAllCss()))
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => new RegExp(`${property}:\\s*([^;]+)`).exec(rule.body)?.[1]?.trim())
    .find((value) => value !== undefined)
}

describe('session row tail and title', () => {
  it('lets the action slot take its natural width', () => {
    // 这一格里除了省略号，还排着别的插件注册的行尾按钮（官方那两枚置顶与归档就在这儿）
    // 写死一个图标列宽会把它们压在同一格里，图标挤成一团、overflow 还会裁掉一半
    // 静止态仍收成 0，行尾时间因此照旧贴住行的右内边距
    const css = stripComments(readAllCss())
    const rules = rulesOf(css)
    const expanded = rules
      .filter((rule) => rule.selectors.some((s) => s.includes('.rowActionSlot') && s.includes(':hover')))
      .map((rule) => rule.body)
      .join('\n')

    expect(expanded).toMatch(/width:\s*auto/)
    expect(expanded).not.toMatch(/width:\s*16px/)
    expect(declared('.rowActionSlot', 'width')).toBe('0')
  })

  it('lays the occupants out as direct flex children of the slot', () => {
    // 占用者的包裹层若留在流里，它自己是 flex 项、里面又走行内排布
    // 两枚按钮的间距就变成由空白字符决定，与 gap 无关
    expect(declared('.rowActionSlot [data-wg-slot]', 'display')).toBe('contents')
  })

  it('keeps the slot gap at the official row-action value', () => {
    // 官方 .rowActions 是 gap:13px，两枚按钮各带 -4px 外边距，实际间距因此是 5px
    // 本包沿用同一个值，省略号与占用者按钮的中心距才与官方一致
    expect(declared('.rowActionSlot', 'gap')).toBe('13px')
  })

  it('drops the ellipsis exactly while the title is marqueeing', () => {
    // 省略号固在右缘，文字一挪就压在中间那截字身上
    // 因此它挂在「正在移出」那个标记上，而不是挂在文字位置上
    expect(declared('.rowTitle[data-marquee]', 'text-overflow')).toBe('clip')
    // 静止时仍画省略号：被裁掉的地方需要一个「后面还有」的标记
    expect(declared('.rowTitle', 'text-overflow')).toBe('ellipsis')
  })
})
