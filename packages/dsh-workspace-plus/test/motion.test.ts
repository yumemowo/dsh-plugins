import { describe, expect, it } from 'vitest'
import {
  EXPAND_VARS,
  DEFAULT_EXPAND_MOTION,
  expandMotionVars,
} from '../src/client/utils/expandMotion.ts'
import { readAllCss, readReducedMotionCss } from './readCss.ts'
import { staggerDelayMs } from '../src/client/views/components/ExpandableBody.tsx'

describe('expand motion parameters', () => {
  it('exposes the durations and the easing as inline custom properties', () => {
    const vars = expandMotionVars(DEFAULT_EXPAND_MOTION) as Record<string, string>

    // 这三项对所有元素相同，下发一次由自定义属性继承下去
    expect(vars['--wg-expand-duration']).toBe('180ms')
    expect(vars['--wg-expand-easing']).toBe(DEFAULT_EXPAND_MOTION.easing)
    expect(vars['--wg-expand-fade']).toBe(`${DEFAULT_EXPAND_MOTION.fade}ms`)

    // 延迟逐元素不同，因此不进这里，由排期逐个下发
    expect(vars['--wg-expand-delay']).toBeUndefined()
  })

  it('keeps the rhythm values out of the stylesheet', () => {
    // 时长与缓动只由 ExpandableBody 内联下发（它恒设这三个自定义属性）
    // 样式表里再写一份回退值就成了第二个来源，改常量时 CSS 不会跟着变
    // 因此断言样式表只消费变量、不出现默认值本身
    const css = readAllCss()
    expect(css).toContain(`var(${EXPAND_VARS.duration})`)
    expect(css).toContain(`var(${EXPAND_VARS.easing})`)
    expect(css).toContain(`var(${EXPAND_VARS.fade})`)

    // 缓动的默认值形如 var(--ds-ease-in-out, ease-in-out)，字面量 ease-in-out 会命中
    // 因此只查时长：默认毫秒数不得在样式表里出现
    expect(css).not.toContain(`${DEFAULT_EXPAND_MOTION.duration}ms`)
    expect(css).not.toContain(`${DEFAULT_EXPAND_MOTION.fade}ms`)

    // 延迟是个例外：元素没被排期时（如收起态）没有任何内联值，必须有 0 兜底
    expect(css).toContain(`var(${EXPAND_VARS.delay}, 0ms)`)
  })

  it('lets a caller override a single field without restating the rest', () => {
    // motion 是 Partial，调用点只想调快容器时可以只给 duration
    const merged = { ...DEFAULT_EXPAND_MOTION, duration: 320 }
    const vars = expandMotionVars(merged) as Record<string, string>

    expect(vars['--wg-expand-duration']).toBe('320ms')
    // 其余字段保持默认，不必抄写
    expect(vars['--wg-expand-fade']).toBe(`${DEFAULT_EXPAND_MOTION.fade}ms`)
  })

  it('spaces the elements by the default step', () => {
    // 默认 step=16：逐个感不因列表长短而消失
    expect(DEFAULT_EXPAND_MOTION.step).toBe(16)
    const timing = { step: DEFAULT_EXPAND_MOTION.step, cap: DEFAULT_EXPAND_MOTION.cap }
    const delays = [0, 1, 2, 3].map((n) => staggerDelayMs(n, timing))

    expect(delays).toEqual([0, 16, 32, 48])
  })

  it('caps the stagger so the tail of a long list does not wait too long', () => {
    const timing = { step: DEFAULT_EXPAND_MOTION.step, cap: DEFAULT_EXPAND_MOTION.cap }
    expect(staggerDelayMs(1000, timing)).toBe(DEFAULT_EXPAND_MOTION.cap)
  })

  it('keeps the focus handoff delay tied to the same duration variable', () => {
    const css = readAllCss()

    // 收起后交出焦点顺序的延时若与容器时长各写一份，改一处就会失配
    // 两者必须同源，内容可能在视觉上没合拢时就能被 Tab 聚焦
    expect(css).toMatch(
      new RegExp(`\\.expandClip\\s*\\{[^}]*transition:\\s*visibility 0s linear var\\(${EXPAND_VARS.duration}`),
    )
    expect(css).not.toMatch(/transition:\s*visibility 0s linear \d/)
  })

  it('drops the stagger delay too when motion is reduced', () => {
    const reduced = readReducedMotionCss()

    // 逐个淡入的延迟由组件下发到元素上，reduced-motion 下要把那条展开态规则的过渡
    // 一起清掉，否则行仍是逐个出现
    expect(reduced).toMatch(/\[data-wg-stagger\]/)
    expect(reduced).toMatch(/transition-delay:\s*0s/)
  })
})
