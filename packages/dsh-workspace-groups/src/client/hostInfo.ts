/**
 * 宿主固定事实（home 目录）的读数
 *
 * 工作区悬停卡片要像官方一样把 POSIX home 缩写成 `~`，这需要宿主的 home。官方
 * `ui-workspace` 从 inject 面的 `hooks.hostInfo` 取（订阅 `ctx.remote.$host`，
 * 连接重置时重新读）；本包照同一套做法自己起一份源，交给渲染器绑成
 * `useHostInfo` 选择器
 */
import type { Context } from '@deepseek-ai/cordis'

/** 宿主固定事实里本包用到的部分 */
export interface HostInfo {
  /** 宿主 home 目录；首帧就绪前为空 */
  home: string | undefined
}

/**
 * 宿主事实源
 *
 * 与官方 `hostInfo` 源同形：快照直接读 `ctx.remote.$host`（它按 home 值缓存，
 * 值没变时引用稳定，因此 `useSyncExternalStore` 不会空转），连接重置时通知订阅读者
 * @param ctx - 客户端根 context
 * @returns 与官方同形的可订阅源
 */
export function hostInfoSource(ctx: Context): {
  getSnapshot: () => HostInfo
  subscribe: (listener: () => void) => () => void
} {
  return {
    getSnapshot: () => ctx.remote.$host,
    subscribe: (listener: () => void) => ctx.on('connection/reset', listener),
  }
}
