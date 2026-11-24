/**
 * 从注入面里取出官方右键菜单注册表
 *
 * `contextMenus` 在插件的 `inject` 里声明，cordis 因此在它到位后才跑 `apply`
 * 取到的必然是在场的那个服务，它在 `apply` 期间不会换人，直接交给调用方即可
 */
import type { Context } from '@deepseek-ai/cordis'
import type { MenuRegistryFace } from './menuRegistry.ts'

/**
 * 造一个解析器
 * @param ctx - 客户端根 context
 * @returns 解析器
 */
export function menuRegistryActions(ctx: Context): () => MenuRegistryFace {
  return () => ctx.get('contextMenus') as MenuRegistryFace
}
