/**
 * 一行菜单上的官方注册表那段
 *
 * 行的种类不同，注册表按目标种类过滤 provider：会话行取 `session`，工作区行取 `workspace`
 * 两边的装配过程一样，因此这里按目标种类参数化，两行各自只用传自己的身份
 *
 * 注册表的解析按需发生：行可能永远不被打开菜单，因此不在挂载期解析
 * 打开时解析一次，订阅它发布的变化（插件可能异步准备条目），关闭时释放
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { MenuItem } from '@deepseek-ai/dsh-client-ui-primitives'
import { composeSessionMenu, registryMenuItems, resolveMenu } from '../menuRegistry.ts'
import type {
  MenuRegistryFace,
  MenuTarget,
  RegistryActionView,
  RegistryMenuItem,
  RegistryResolution,
} from '../menuRegistry.ts'

/** 本钩子交出的菜单面 */
export interface RowMenuHandle {
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
 * 装配一行的菜单
 * @param registry - 官方菜单注册表
 * @param iconOf - 按图标键取字形，缺省时注册表条目只剩文字
 * @param target - 这一行的身份，缺省表示该行没有可解析的身份（如「未分组」桶标题）
 * @param ownItems - 本包自有的条目，接在注册表那段之后
 * @param excluded - 注册表交来但本包自己实现、不该重复出现的条目 id
 * @param leading - 本包的条目里要排在注册表之前的那几项，没有时为空数组
 * @param intercepted - 注册表交来但要由本包执行的条目 id，见 {@link RowMenuHandle.select}
 * @returns 菜单面
 */
export function useRowMenu(
  registry: MenuRegistryFace,
  iconOf: ((key: string) => ReactNode) | undefined,
  target: MenuTarget | undefined,
  ownItems: readonly MenuItem[],
  excluded: readonly string[] = [],
  leading: readonly MenuItem[] = [],
  intercepted: readonly string[] = [],
): RowMenuHandle {
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
    if (target === undefined || resolution.current !== null) return
    const opened = resolveMenu(registry, target)
    resolution.current = opened
    const apply = (): void => { setViews(opened.source.getSnapshot()) }
    apply()
    unsubscribe.current = opened.source.subscribe(apply)
  }, [registry, target])

  const select = useCallback((id: string, ownSelect: (id: string) => void): void => {
    // 拦截项在条目表里、执行却归本包：官方那份执行时看不到要处理的东西（如分叉出的子会话 id）
    if (intercepted.includes(id)) {
      ownSelect(id)
      return
    }
    const opened = resolution.current
    if (opened !== null && views.some((view) => view.id === id)) {
      opened.select(id)
      return
    }
    ownSelect(id)
  }, [views, intercepted])

  const shown = excluded.length === 0
    ? views
    : views.filter((view) => !excluded.includes(view.id))
  const registryItems: RegistryMenuItem[] = iconOf === undefined
    ? registryMenuItems(shown, () => null)
    : registryMenuItems(shown, iconOf)

  return {
    items: composeSessionMenu(
      registryItems,
      ownItems as RegistryMenuItem[],
      shown,
      leading as RegistryMenuItem[],
    ) as readonly MenuItem[],
    select,
    prepare,
    release,
  }
}
