import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import systemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import { ToolCallId } from '@deepseek-ai/dsh-llm/brand'
import * as helloPlugin from '../src/index.ts'
import { name as pluginName, Config } from '../src/index.ts'
import type { HelloConfig } from '../src/index.ts'
import type { Fiber } from '@deepseek-ai/cordis'

/**
 * 在最小但真实的依赖链上挂载插件。
 *
 * 这里刻意不使用 mock：`dsh-tools` 启动前需要 `systemPrompt`，而插件声明了
 * `inject: ['tools']`。挂载真实服务才能证明该行在 profile 中确实可加载。
 * @param config - 行配置，与 `cordis.patch.yml` 提供的形态一致。
 * @returns 根 context 与插件 fiber，供后续释放。
 */
async function mountHello(config?: HelloConfig) {
  const ctx = new Context()
  await ctx.plugin(systemPrompt)
  await ctx.plugin(ToolRuntime)
  const fiber = await ctx.plugin(helloPlugin, config)
  return { ctx, fiber }
}

/** 释放已挂载的插件及其依赖链，避免残留挂起的 fiber。 */
async function disposeAll(fiber: Fiber, ctx: Context): Promise<void> {
  await fiber.dispose()
  await ctx.fiber.dispose()
}

describe('dsh-hello plugin', () => {
  it('provides the hello service when mounted', async () => {
    const { ctx, fiber } = await mountHello()

    expect(ctx.hello).toBeDefined()
    expect(ctx.hello.name).toBe('hello')

    await disposeAll(fiber, ctx)
  })

  it('greets with the default greeting', async () => {
    const { ctx, fiber } = await mountHello()

    expect(ctx.hello.greet('dsh')).toBe('Hello, dsh!')

    await disposeAll(fiber, ctx)
  })

  it('greets with the configured greeting', async () => {
    const { ctx, fiber } = await mountHello({ greeting: '你好' })

    expect(ctx.hello.greet('dsh')).toBe('你好, dsh!')

    await disposeAll(fiber, ctx)
  })

  it('registers the hello_greet tool', async () => {
    const { ctx, fiber } = await mountHello()

    const names = ctx.tools.schemas().map((schema) => schema.name)
    expect(names).toContain('hello_greet')

    await disposeAll(fiber, ctx)
  })

  it('greets the requested name when the tool runs', async () => {
    const { ctx, fiber } = await mountHello()

    const result = await ctx.tools.execute({
      callId: ToolCallId('test-call-1'),
      name: 'hello_greet',
      arguments: { who: 'DeepSeek Harness' },
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(false)
    expect(result.content).toEqual([{ type: 'text', text: 'Hello, DeepSeek Harness!' }])

    await disposeAll(fiber, ctx)
  })

  it('rejects a tool call that omits the who argument', async () => {
    const { ctx, fiber } = await mountHello()

    const result = await ctx.tools.execute({
      callId: ToolCallId('test-call-2'),
      name: 'hello_greet',
      arguments: {},
      signal: new AbortController().signal,
    })

    expect(result.isError).toBe(true)

    await disposeAll(fiber, ctx)
  })

  it('unregisters the tool and service when the plugin is disposed', async () => {
    const { ctx, fiber } = await mountHello()
    expect(ctx.tools.schemas().map((schema) => schema.name)).toContain('hello_greet')

    await fiber.dispose()

    // 服务与工具都归属于已释放的 fiber，
    // 干净卸载后不会留下任何东西干扰下一行。
    expect(ctx.tools.schemas().map((schema) => schema.name)).not.toContain('hello_greet')

    await ctx.fiber.dispose()
  })

  it('declares its name, injection, and config schema', () => {
    expect(pluginName).toBe('hello')
    expect(helloPlugin.inject).toEqual(['tools'])
    expect(helloPlugin.Config).toBe(Config)
    expect(Config({})).toEqual({ greeting: 'Hello' })
    // 加载器会在 `apply` 运行前校验行配置，
    // 因此非法的 patch 值应被 schema 拒绝，而不会进入代码。
    expect(() => Config({ greeting: 42 } as unknown as HelloConfig)).toThrow()
  })
})
