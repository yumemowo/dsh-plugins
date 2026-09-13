import { defineTool } from '@deepseek-ai/dsh-tools'
import type { HelloService } from './service.ts'

/**
 * 基于一个 {@link HelloService} 构造面向模型的 `hello_greet` 工具。
 *
 * 按挂载实例而非模块级创建，工具因此始终读取同一行所拥有的服务实例，
 * 重新配置并重载后不会用到上一个 fiber 的问候语。
 *
 * @param hello - 调用该工具的行所拥有的服务实例。
 * @returns 可直接注册的工具定义。
 */
export function createHelloTool(hello: HelloService) {
  return defineTool({
    name: 'hello_greet',
    description: 'Greet a person by name. Use it to verify that this dsh plugin is loaded and reachable.',
    parameters: {
      who: {
        type: 'string',
        required: true,
        description: 'The name to greet.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute(args) {
      return Promise.resolve(hello.greet(args.who))
    },
  })
}
