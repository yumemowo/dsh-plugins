/**
 * 测试环境的前置设置
 *
 * React 18 的 `act` 要求 `globalThis.IS_REACT_ACT_ENVIRONMENT` 在 React 被
 * import 之前就为真。放在 `vitest.config.ts` 的 `env` 里不够——那写的是
 * `process.env`，而 React 读的是 `globalThis`。这里由 setupFiles 在测试文件
 * 之前执行，时机正好
 *
 * 本包多数测试跑 node 环境、不碰 `act`，这一格对它们没有影响
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export {}
