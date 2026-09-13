import { Service } from '@deepseek-ai/cordis'
import type { Context } from '@deepseek-ai/cordis'
import { Config, DEFAULT_GREETING } from './config.ts'
import type { HelloConfig } from './config.ts'

/**
 * 本插件对外提供的服务，其他插件通过 `ctx.hello` 使用。
 *
 * 继承 Cordis 的 `Service` 后，实例的生命周期绑定到所属 fiber：卸载本插件的行时
 * `ctx.hello` 会同步消失，无需手动清理。
 */
export class HelloService extends Service {
  /** 让加载器在构造实例前校验行配置。 */
  static readonly Config = Config

  /** 本实例使用的问候语前缀。 */
  readonly greeting: string

  constructor(ctx: Context, config: HelloConfig = {}) {
    super(ctx, 'hello')
    this.greeting = config.greeting ?? DEFAULT_GREETING
  }

  /**
   * 为一个名字生成问候语。
   * @param who - 要问候的名字。
   * @returns 问候语前缀加该名字。
   */
  greet(who: string): string {
    return `${this.greeting}, ${who}!`
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** 由本插件提供，仅在其行加载期间存在。 */
    hello: HelloService
  }
}
