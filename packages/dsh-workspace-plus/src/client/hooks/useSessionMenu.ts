/**
 * 一条会话行的菜单：官方注册表那段 + 本包自有的归组项
 *
 * 注册表的解析按需发生：行可能永远不被打开菜单，因此不在挂载期解析
 * 打开时解析一次，订阅它发布的变化（插件可能异步准备条目），关闭时释放
 * 注册表不在场时整段跳过，只用本包自有的条目——与改动前完全一致
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { composeSessionMenu, openSessionMenu, registryMenuItems } from '../menuRegistry.ts'
import type { MenuRegistryFace, RegistryActionView, RegistryMenuItem, RegistryResolution } from '../menuRegistry.ts'

/** 本钩子交出的菜单面 */
export interface SessionMenuHandle {
  /** 当前该渲染的条目：注册表那段在前，本包自有的接在后面 */
  items: readonly MenuItem[]
  /**
   * 分派一次选中
   *
   * 注册表条目交回给这次解析执行，本包自有的条目落到 `ownSelect`
   * @param id - 被选中的条目 id
   * @param ownSelect - 本包自有条目的分派，注册表不认识的 id 交给它
   */
  select: (id: string, ownSelect: (id: string) => void) => void
  /** 菜单打开前调用：解析注册表一次，已解析过则什么也不做 */
  prepare: () => void
  /** 菜单关闭时调用：释放这一次解析 */
  release: () => void
}

/**
 * 装配一条会话行的菜单
 * @param registry - 官方菜单注册表，缺省表示宿主没装它
 * @param iconOf - 按图标键取字形，缺省时注册表条目只剩文字
 * @param target - 这一行的会话身份与当前标题
 * @param ownItems - 本包自有的条目，接在注册表那段之后
 * @returns 菜单面
 */
export function useSessionMenu(
  registry: MenuRegistryFace | undefined,
  iconOf: ((key: string) => ReactNode) | undefined,
  target: { readonly sessionId: string; readonly displayTitle: string },
  ownItems: readonly MenuItem[],
): SessionMenuHandle {
  const resolution = useRef<RegistryResolution | null>(null)
  const unsubscribe = useRef<(() => void) | null>(null)
  const [views, setViews] = useState<readonly RegistryActionView[]>([])

  const release = useCallback((): void => {
    unsubscribe.current?.()
    unsubscribe.current = null
    resolution.current?.dispose()
    resolution.current = null
  }, [])

  // 行被卸载时释放，避免解析回调落在已经不在树上的组件上
  useEffect(() => release, [release])

  const prepare = useCallback((): void => {
    if (registry === undefined || resolution.current !== null) return
    const opened = openSessionMenu(registry, target)
    resolution.current = opened
    const apply = (): void => { setViews(opened.source.getSnapshot()) }
    apply()
    unsubscribe.current = opened.source.subscribe(apply)
  }, [registry, target])

  const select = useCallback((id: string, ownSelect: (id: string) => void): void => {
    const opened = resolution.current
    if (opened !== null && views.some((view) => view.id === id)) {
      opened.select(id)
      return
    }
    ownSelect(id)
  }, [views])

  const registryItems: RegistryMenuItem[] = iconOf === undefined
    ? registryMenuItems(views, () => null)
    : registryMenuItems(views, iconOf)

  return {
    items: composeSessionMenu(registryItems, ownItems as RegistryMenuItem[], views) as readonly MenuItem[],
    select,
    prepare,
    release,
  }
}
