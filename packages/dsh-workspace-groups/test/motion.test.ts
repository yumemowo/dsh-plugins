import { describe, expect, it } from 'vitest'
import {
  COLLAPSE_VARS,
  DEFAULT_COLLAPSE_MOTION,
  collapseMotionVars,
} from '../src/client/utils/collapseMotion.ts'
import { CSS } from '../src/client/styles.ts'
import { staggerDelayMs } from '../src/client/views/components/CollapsibleBody.tsx'

describe('collapse motion parameters', () => {
  it('exposes the durations and the easing as inline custom properties', () => {
    const vars = collapseMotionVars(DEFAULT_COLLAPSE_MOTION) as Record<string, string>

    // 这三项对所有元素相同，下发一次由自定义属性继承下去
    expect(vars['--wg-collapse-duration']).toBe('180ms')
    expect(vars['--wg-collapse-easing']).toBe(DEFAULT_COLLAPSE_MOTION.easing)
    expect(vars['--wg-collapse-fade']).toBe(`${DEFAULT_COLLAPSE_MOTION.fade}ms`)

    // 延迟逐元素不同，因此不进这里，由排期逐个下发
    expect(vars['--wg-collapse-delay']).toBeUndefined()
  })

  it('writes the default constant into the CSS fallbacks', () => {
    // 回退值直接由常量插值而来，两者不可能漂移，这里确认插值确实落到了 CSS 里
    // 而不是留下 `${...}` 字面量或手写数字
    const css = CSS
    expect(css).toContain(`var(${COLLAPSE_VARS.duration}, ${DEFAULT_COLLAPSE_MOTION.duration}ms)`)
    expect(css).toContain(`var(${COLLAPSE_VARS.easing}, ${DEFAULT_COLLAPSE_MOTION.easing})`)
    expect(css).toContain(`var(${COLLAPSE_VARS.fade}, ${DEFAULT_COLLAPSE_MOTION.fade}ms)`)
    expect(css).not.toContain('${')
  })

  it('lets a caller override a single field without restating the rest', () => {
    // motion 是 Partial，调用点只想调快容器时可以只给 duration
    const merged = { ...DEFAULT_COLLAPSE_MOTION, duration: 320 }
    const vars = collapseMotionVars(merged) as Record<string, string>

    expect(vars['--wg-collapse-duration']).toBe('320ms')
    // 其余字段保持默认，不必抄写
    expect(vars['--wg-collapse-fade']).toBe(`${DEFAULT_COLLAPSE_MOTION.fade}ms`)
  })

  it('spaces the elements by the default step', () => {
    // 默认 step=16：逐个感不因列表长短而消失
    expect(DEFAULT_COLLAPSE_MOTION.step).toBe(16)
    const timing = { step: DEFAULT_COLLAPSE_MOTION.step, cap: DEFAULT_COLLAPSE_MOTION.cap }
    const delays = [0, 1, 2, 3].map((n) => staggerDelayMs(n, timing))

    expect(delays).toEqual([0, 16, 32, 48])
  })

  it('caps the stagger so the tail of a long list does not wait too long', () => {
    const timing = { step: DEFAULT_COLLAPSE_MOTION.step, cap: DEFAULT_COLLAPSE_MOTION.cap }
    expect(staggerDelayMs(1000, timing)).toBe(DEFAULT_COLLAPSE_MOTION.cap)
  })

  it('keeps the focus handoff delay tied to the same duration variable', () => {
    const css = CSS

    // 收起后交出焦点顺序的延时若与容器时长各写一份，改一处就会失配
    // 两者必须同源，内容可能在视觉上没合拢时就能被 Tab 聚焦
    expect(css).toMatch(
      new RegExp(`\\.wg-collapse-clip\\s*\\{[^}]*transition:\\s*visibility 0s linear var\\(${COLLAPSE_VARS.duration}`),
    )
    expect(css).not.toMatch(/transition:\s*visibility 0s linear \d/)
  })

  it('drops the stagger delay too when motion is reduced', () => {
    const css = CSS
    const reduced =
      /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? ''

    // 逐个淡入的延迟由组件下发到元素上，reduced-motion 下要把那条展开态规则的过渡
    // 一起清掉，否则行仍是逐个出现
    expect(reduced).toMatch(/\[data-wg-stagger\]/)
    expect(reduced).toMatch(/transition-delay:\s*0s/)
  })
})
