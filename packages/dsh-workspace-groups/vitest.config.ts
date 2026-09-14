import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
  // @deepseek-ai/dsh-client-ui-primitives 只存在于客户端基线模块表，
  // node 测试环境用最小替身满足 require。
  resolve: {
    alias: {
      '@deepseek-ai/dsh-client-ui-primitives': new URL(
        './test/primitives-stub.mjs',
        import.meta.url,
      ).pathname,
    },
  },
})
