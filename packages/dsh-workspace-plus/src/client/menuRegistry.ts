/**
 * 官方右键菜单注册表在会话行上的读数
 *
 * 官方 `ui-context-menu` 提供 `ctx.contextMenus`：任何插件按目标种类注册一批动作，宿主把它们合并成一份弹出面板
 * 官方 `ui-workspace` 自己的会话菜单（置顶 / 重命名 / 分叉 / 归档 / 复制 Session ID）与第三方插件的追加项都走这条路
 *
 * 本包接替了工作区浏览区域，菜单面板仍由本包渲染（外观与行几何要对齐自己的行）
 * 因此这里只借它的条目来源：解析一次拿到动作列表，选中时按 id 交回给同一次解析
 * 于是第三方插件注册进 `session` 的条目会出现在本包的菜单里，本包自己的归组项追加在后面
 *
 * 服务不在场时渲染期解析的读取面返回 undefined，调用方只用本包自有的归组项
 * 官方 `ui-workspace` 把 `contextMenus` 声明为必需注入，因此它在场的那个版本起必然可用
 */
import type { ReactNode } from 'react'
import type {
  ContextMenuTarget,
  ContextMenuTargetMap,
  ContextMenus,
  MenuActionView,
  MenuResolution,
} from '@deepseek-ai/dsh-client-ui-context-menu/client'
// 只为引入官方向 `ContextMenuTargetMap` 里那条 workspace 声明
// 它把 `path` 定成必填，本包少给一个字段会在 tsc 阶段就报出来
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'

/** 注册表交来的一条动作的展示字段，回调不在这里 */
export type RegistryActionView = MenuActionView

/** 一次解析的结果：可订阅的展示条目、执行入口与释放入口 */
export type RegistryResolution = MenuResolution

/**
 * 解析的对象：按 `kind` 区分是哪个目标种类
 *
 * 种类与各自的字段全由官方声明，本包不自带一份，`session` 与 `workspace` 之外还有
 * `file` / `directory` / `url` / `image` / `tab` 五种，本包只解析前两种但类型不必砍窄
 */
export type MenuTarget = ContextMenuTarget

/**
 * 一个工作区行的身份、目录与当前标题
 *
 * 是官方 `workspace` 目标的那一格：三个字段都由官方声明，`path` 不是可省的摆设
 * 官方的 `open-in-app` 那个提供者按它 stat 目录再打开文件管理器，缺了它静默退化成禁用项
 */
export type WorkspaceMenuTarget = ContextMenuTargetMap['workspace']

/** 本模块用到的那部分注册表服务面 */
export type MenuRegistryFace = Pick<ContextMenus, 'resolve'>

/**
 * 造一条会话行的解析目标
 *
 * 官方把 `sessionId` 声明成品牌类型，本包的 `SessionRow.id` 是普通串，它一路走 JSON，品牌在序列化后就没了
 * 这个 cast 是那条边界上唯一的一处：行 id 来自宿主给的会话 id，运行期就是合法的 `SessionId`，只是类型系统看不到这一层来历
 * @param sessionId - 行上的会话 id
 * @param displayTitle - 该行当前显示的标题
 * @returns 注册表认得的会话目标
 */
export function sessionTarget(sessionId: string, displayTitle: string): MenuTarget {
  return { kind: 'session', value: { sessionId: sessionId as never, displayTitle } }
}

/**
 * 一条工作区行交给注册表的三个字段
 *
 * 不用官方的 {@link WorkspaceMenuTarget}：那上面的 `workspaceId` 是品牌类型，而本包的行模型一路走 JSON，品牌在序列化时就没了
 * 字段名与官方一致，少一个 tsc 就报
 */
export interface WorkspaceTargetInput {
  readonly workspaceId: string
  readonly path: string
  readonly displayTitle: string
}

/**
 * 造一条工作区行的解析目标
 *
 * 与 {@link sessionTarget} 同一处 cast，理由相同
 * @param workspace - 工作区 id、目录与当前标题
 * @returns 注册表认得的工作区目标
 */
export function workspaceTarget(workspace: WorkspaceTargetInput): MenuTarget {
  return {
    kind: 'workspace',
    value: {
      workspaceId: workspace.workspaceId as never,
      path: workspace.path,
      displayTitle: workspace.displayTitle,
    },
  }
}

/**
 * 解析一次菜单
 *
 * 目标种类决定注册表把哪些 provider 的条目合进来：`session` 与 `workspace` 是两条独立的线
 * @param registry - 注册表服务
 * @param target - 被右键或被行尾按钮打开的那一行
 * @returns 这次解析，调用方负责在卸载时释放
 */
export function resolveMenu(
  registry: MenuRegistryFace,
  target: MenuTarget,
): RegistryResolution {
  return registry.resolve(target)
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
 * 本包的面板是自己渲染的，因此字形由调用方解析后交进来，取不到时这一项只剩文字
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
 * 本包的归组项接在后面，两者之间画一条分隔线，与原先「官方操作块 + 分隔线 + 归组项」的形状一致
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