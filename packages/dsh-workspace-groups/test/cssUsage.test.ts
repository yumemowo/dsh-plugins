/**
 * 类名使用的静态检查
 *
 * 类名在构建期被哈希，源码里把类名当裸字符串用会静默失效
 * （类型通过、编译通过、结构测试也可能通过，只是界面上少了样式）
 * 这条测试把它变成失败：类名只能经编译后的映射取用
 */
import { describe, expect, it } from 'vitest'
import { OWN_CLASSES, findBareClassUsage, scanBareClassUsage } from './cssUsage.ts'

describe('class name usage', () => {
  it('finds no bare class usage in the sources', () => {
    const found = scanBareClassUsage()
    const rendered = [...found]
      .map(
        ([file, hits]) =>
          `${file}\n${hits.map((h) => `  ${h.line}: [${h.kind}] ${h.literal}`).join('\n')}`,
      )
      .join('\n')

    // 裸类名在运行期匹配不到任何规则（类名已变成 [hash]_x）
    expect(rendered).toBe('')
  })

  it('collects the classes every stylesheet defines', () => {
    // 判定的依据是「本包定义过哪些类」，这份集合若取空会让整条检查静默失效
    expect(OWN_CLASSES.size).toBeGreaterThan(100)
    expect(OWN_CLASSES.has('row')).toBe(true)
    expect(OWN_CLASSES.has('collapseOpen')).toBe(true)
    // 反向：普通单词不在集合里，避免把任何字符串都当成类名
    expect(OWN_CLASSES.has('workspaceGroup')).toBe(false)
  })

  it('accepts the compiled-map access and the escaping markers', () => {
    // 自己先验证扫描器认得出正确写法、也不会误报变量与标记
    const ok = [
      "import styles from './x.module.css'",
      'const a = styles.row',
      'const b = styles.rowSelected',
      "const c = { '--wg-depth': '1' }",
      'const d = `[data-wg-stagger]`',
      '// 注释里提到 row 不算',
      'const e = `${styles.collapse}:not(.${styles.collapseOpen})`',
      'const f = panel.querySelectorAll(`.${styles.viewOptionRow}`)',
    ].join('\n')
    const bad = [
      'const a = <div className="row" />',
      'const b = <div className="group" />',
      'listClassName="menuList"',
      "panel.querySelectorAll('.viewOptionRow')",
    ].join('\n')

    expect(findBareClassUsage(ok)).toEqual([])
    expect(findBareClassUsage(bad).map((h) => h.literal)).toEqual([
      'row',
      'group',
      'menuList',
      'viewOptionRow',
    ])
  })

  it('does not flag ordinary words that merely look like class names', () => {
    // 类名去前缀后与普通单词同形，判定按位置而非「像不像类名」
    const benign = [
      "export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'remote']",
      "export type ViewMode = 'workspace' | 'flat'",
      "const id = 'group'",
      "setMode('workspace')",
    ].join('\n')

    expect(findBareClassUsage(benign)).toEqual([])
  })
})
