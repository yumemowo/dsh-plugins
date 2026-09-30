import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
    environment: 'node',
    // DOM 冒烟测试（文件头的 `@vitest-environment jsdom`）用 `act` 驱动 React
    // 而那个全局标记必须早于 React 被 import，见 test/setup.ts
    setupFiles: ['test/setup.ts'],
    // 组件从各自的 .module.css 取类名，测试里也要能解析
    // 不配 css.include 时 vitest 只给一个惰性代理：Object.keys 为空、序列化成 {}
    // 但 styles.foo 又能取到值，DOM 断言与快照因此都不稳
    // classNameStrategy 让类名保持源文件里的原名（生产构建才哈希）
    // 测试断言的是「哪个元素带哪条规则」，不是哈希值本身
    css: {
      include: /\.module\.css$/,
      modules: { classNameStrategy: 'non-scoped' },
    },
  },
  // @deepseek-ai/dsh-client-ui-primitives 只存在于客户端基线模块表
  // node 测试环境用最小替身满足 require
  // @deepseek-ai/dsh-client-store 是同一类基线模块，而它的引擎依赖 zustand / immer 未随本仓库安装
  // 替身只提供测试用到的那部分（defineStore 与 localStorage 持久化），见 test/store-stub.mjs
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': new URL(
        './test/primitives-stub.mjs',
        import.meta.url,
      ).pathname,
      '@deepseek-ai/dsh-client-store': new URL('./test/store-stub.mjs', import.meta.url).pathname,
    },
  },
})
