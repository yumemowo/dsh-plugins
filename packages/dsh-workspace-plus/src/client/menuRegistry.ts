/**
 * 官方右键菜单注册表在会话行上的读数
 *
 * 官方 `ui-context-menu` 提供 `ctx.contextMenus`：任何插件按目标种类注册一批动作，宿主把它们合并成一份弹出面板
 * 官方 `ui-workspace` 自己的会话菜单（置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID）与第三方插件的追加项都走这条路
 *
 * 本包接替了工作区浏览区域，菜单面板仍由本包渲染（外观与行几何要对齐自己的行）
 * 因此这里只借它的**条目来源**：解析一次拿到动作列表，选中时按 id 交回给同一次解析
 * 于是第三方插件注册进 `session` 的条目会出现在本包的菜单里，本包自己的归组项追加在后面
 *
 * 服务不在场时（宿主没装 `ui-context-menu`）{@link openSessionMenu} 返回 undefined，调用方退回静态条目
 */
import type { ReactNode } from 'react'

/** 注册表交来的一条动作的展示字段，回调不在这里 */
export interface RegistryActionView {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean | undefined
  readonly danger?: boolean | undefined
  /** 在该项之前画一条分隔线 */
  readonly separatorBefore?: boolean | undefined
  /** 图标的键，由 `contextMenu.icon` 那个 keyed 插槽渲染 */
  readonly icon?: { readonly key: string; readonly src?: string | undefined } | undefined
}

/** 一次解析的结果：可订阅的展示条目、执行入口与释放入口 */
export interface RegistryResolution {
  readonly source: {
    getSnapshot: () => readonly RegistryActionView[]
    subscribe: (listener: () => void) => () => void
  }
  readonly ready: Promise<void>
  select: (id: string) => void
  dispose: () => void
}

/** 本模块用到的那部分注册表服务面 */
export interface MenuRegistryFace {
  resolve: (target: {
    readonly kind: 'session'
    readonly value: { readonly sessionId: string; readonly displayTitle: string }
  }) => RegistryResolution
}

/**
 * 从注入面里取出注册表
 *
 * 宿主没装那个插件时 `ctx.get('contextMenus')` 是 undefined，此时本包走静态条目那条路
 * 声明成结构类型而不是导入官方的服务类型：那个包不是本包的 peer，运行期由宿主解析
 * @param candidate - `ctx.get('contextMenus')` 的返回值
 * @returns 可用的注册表，形状不符时为 undefined
 */
export function asMenuRegistry(candidate: unknown): MenuRegistryFace | undefined {
  if (typeof candidate !== 'object' || candidate === null) return undefined
  const resolve = (candidate as { resolve?: unknown }).resolve
  return typeof resolve === 'function' ? (candidate as MenuRegistryFace) : undefined
}

/** 解析的对象：一条会话行的身份与它当前显示的标题 */
export interface SessionMenuTarget {
  readonly sessionId: string
  readonly displayTitle: string
}

/**
 * 为一条会话解析一次菜单
 * @param registry - 注册表服务
 * @param target - 被右键或被行尾按钮打开的会话
 * @returns 这次解析，调用方负责在卸载时释放
 */
export function openSessionMenu(
  registry: MenuRegistryFace,
  target: SessionMenuTarget,
): RegistryResolution {
  return registry.resolve({ kind: 'session', value: target })
}

/** 菜单原语认识的一条可点条目 */
export interface RegistryMenuItem {
  id: string
  label: string
  disabled?: boolean
  danger?: boolean
  icon?: ReactNode
}

/** 菜单原语认识的一行：可点条目，或一条分隔线 */
export type RegistryMenuEntry = RegistryMenuItem | { type: 'separator'; id: string }

/**
 * 把注册表条目换成菜单原语认识的行
 *
 * 图标按 key 取：官方把字形放在 `contextMenu.icon` 那个 keyed 插槽里，由它自己的面板按 key 渲染
 * 本包的面板是自己渲染的，因此字形由调用方解析后交进来；取不到时这一项只剩文字
 * @param views - 注册表交来的条目
 * @param iconOf - 按图标 key 取字形
 * @returns 菜单行，彼此以注册表给出的先后为序
 */
export function registryMenuItems(
  views: readonly RegistryActionView[],
  iconOf: (key: string) => ReactNode,
): RegistryMenuItem[] {
  return views.map((view) => {
    const icon = view.icon === undefined ? undefined : iconOf(view.icon.key)
    return {
      id: view.id,
      label: view.label,
      ...(view.disabled === true ? { disabled: true } : {}),
      ...(view.danger === true ? { danger: true } : {}),
      ...(icon === undefined ? {} : { icon }),
    }
  })
}

/**
 * 一条注册表条目前面那道分隔线该不该画
 *
 * 注册表用 `separatorBefore` 表达分组：本包把整段接到自己的条目之后，因此只有这段里第一条带它的那一项要画线
 * @param views - 注册表交来的条目
 * @param index - 这一项的序号
 * @returns 是否在这一项之前画一条分隔线
 */
export function separatorBeforeAt(
  views: readonly RegistryActionView[],
  index: number,
): boolean {
  return views[index]?.separatorBefore === true && index > 0
}
/**
 * 把注册表条目与本包自有的归组项接成一份菜单
 *
 * 注册表那段整体在前：它的条目由官方与第三方插件共同声明，本包不参与排序，只按它给的先后渲染
 * 本包的归组项接在后面，两者之间画一条分隔线——与原先「官方操作块 + 分隔线 + 归组项」的形状一致
 * 注册表条目里自带 `separatorBefore` 的那一项前面也补一条线：官方用它给自己的操作分段
 * @param registryItems - 注册表那段，已换成菜单行
 * @param ownItems - 本包自有的条目，没有时为空数组
 * @param registryViews - 与 `registryItems` 一一对应的原始条目，用来读 `separatorBefore`
 * @returns 拼好的菜单行
 */
export function composeSessionMenu(
  registryItems: readonly RegistryMenuItem[],
  ownItems: readonly RegistryMenuItem[],
  registryViews: readonly RegistryActionView[],
): RegistryMenuEntry[] {
  if (registryItems.length === 0) return [...ownItems]
  const merged: RegistryMenuEntry[] = []
  registryItems.forEach((item, index) => {
    if (separatorBeforeAt(registryViews, index)) {
      merged.push({ type: 'separator', id: `separator:${item.id}` })
    }
    merged.push(item)
  })
  if (ownItems.length > 0) {
    merged.push({ type: 'separator', id: 'separator:own' })
    merged.push(...ownItems)
  }
  return merged
}