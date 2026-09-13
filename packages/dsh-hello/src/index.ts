/**
 * 本 monorepo 的参考插件。
 *
 * 展示每个 dsh 插件包都需要的三部分：
 *  1. Cordis 插件入口，导出 `name`、可选的 `inject` 与 `apply`；
 *  2. `cordis.patch.yml` bundle patch，插入一行 loader 条目；
 *  3. `package.json` 中的 `dsh.bundle.patch` 声明，使安装本包的 profile
 *     自动把它作为一个 patch 层。
 *
 * npm 包名带 scope，但源码中的 {@link name} 保持简短且不带 scope：它命名的是
 * fiber 而非包，带 scope 的包身份由 patch 的 `name:` 字段承载。
 *
 * @module @your-scope/dsh-hello
 */
import type { Context } from '@deepseek-ai/cordis'
import { Config } from './config.ts'
import type { HelloConfig } from './config.ts'
import { HelloService } from './service.ts'
import { createHelloTool } from './tool.ts'

/** 插件名，用于 fiber 诊断与日志前缀。 */
export const name = 'hello'

/**
 * 插件启动前需要就绪的服务。
 *
 * 声明 `tools` 后，`apply` 只在工具注册表存在时才运行；Cordis 会先把插件挂起，
 * 该服务消失时再卸载插件，因此 `apply` 中无需判空 `ctx.tools`。
 */
export const inject = ['tools']

/** 行配置 schema，对外导出以供加载器校验 `config`。 */
export { Config }
export type { HelloConfig }

/**
 * 插件入口。
 * @param ctx - 插件自身的 context，作用域限于本行。
 * @param config - 已按 {@link Config} 校验过的配置。
 */
export function apply(ctx: Context, config: HelloConfig = {}): void {
  const hello = new HelloService(ctx, config)
  ctx.logger.info('hello plugin loaded (greeting: %s)', hello.greeting)

  // 注册生命周期绑定到 fiber：卸载本插件即注销该工具。
  ctx.tools.register(createHelloTool(hello))
}
