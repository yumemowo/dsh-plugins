/**
 * 从注入面里取出官方右键菜单注册表
 *
 * 那个服务由 `ui-context-menu` 提供，加载顺序不受本包约束，因此在渲染期解析而不是在 inject 里读一次
 * 解析结果按服务身份缓存：这一格会传进行级 memo 的比对，每次渲染新建一个会让每一行都判定为变过
 *
 * 宿主没装那个插件时 `ctx.get` 返回 undefined，此时本包只用自有的归组项
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MenuRegistryFace } from './menuRegistry.ts'

/**
 * 造一个解析器
 * @param ctx - 客户端根 context
 * @returns 解析器，宿主没装那个插件时返回 undefined
 */
export function menuRegistryActions(
  ctx: Context,
): () => MenuRegistryFace | undefined {
  let cached: { readonly service: MenuRegistryFace; readonly value: MenuRegistryFace } | undefined
  return () => {
    const service = ctx.get('contextMenus')
    if (service === undefined) return undefined
    if (cached !== undefined && cached.service === service) return cached.value
    cached = { service, value: service }
    return service
  }
}
