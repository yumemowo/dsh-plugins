import z from '@deepseek-ai/schemastery'

/** 未配置 `greeting` 时使用的问候语。 */
export const DEFAULT_GREETING = 'Hello'

/**
 * `hello` 行的配置校验规则。
 *
 * 加载器会在插件启动前用此 schema 校验行配置，因此 `apply` 不会收到非法值。
 * 字段带默认值，`cordis.patch.yml` 中可以省略整个 `config`。
 */
export const Config = z.object({
  greeting: z.string().default(DEFAULT_GREETING),
})

/** 校验后的配置结构，与 {@link Config} 的输出一致。 */
export interface HelloConfig {
  readonly greeting?: string
}
