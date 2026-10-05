/**
 * 测试环境的前置设置
 *
 * React 18 的 `act` 要求 `globalThis.IS_REACT_ACT_ENVIRONMENT` 在 React 被 import 之前就为真
 * 放在 `vitest.config.ts` 的 `env` 里不够——那写的是 `process.env`，而 React 读的是 `globalThis`
 * 这里由 setupFiles 在测试文件之前执行，时机正好
 *
 * 本包多数测试跑 node 环境、不碰 `act`，这一格对它们没有影响
 *
 * jsdom 还缺 `matchMedia`，而置顶区按它决定溢出给法，因此一并在这里替出来
 * 替身只装在 jsdom 用例里（node 环境没有 `window`），默认档是「有悬停」
 */
import { afterEach } from 'vitest'
import { installMatchMedia, resetHoverCapable } from './matchMedia-stub.ts'

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

installMatchMedia()

afterEach(() => {
  // 用例可以切到「无悬停」，切完要还回默认档，否则影响同一文件里后面的用例
  resetHoverCapable()
})

export {}
