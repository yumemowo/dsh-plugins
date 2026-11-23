import type { MenuRegistryFace, MenuTarget } from '../../src/client/menuRegistry.ts'

/**
 * 官方右键菜单注册表的替身
 *
 * rc.1 起官方 `ui-workspace` 把 `contextMenus` 声明为必需注入，它因此必然在场；
 * 会话行与工作区行的官方条目都从它来，不用替身就只能测到本包自己那几条
 *
 * 形状照官方的解析结果：条目来自可订阅的源，选中按 id 交回给这次解析
 *
 * 选项：
 * - `items`：交出的条目，缺省按 `pin` 造一份官方 `session` 同形的
 * - `pin`：置顶项的文案与可用性，跟着该行自己的置顶状态变
 * - `run`：选中某项时执行什么
 * - `byKind`：按目标种类交不同条目，验证两个目标各走各的线
 */

/** 官方注册进 `session` 的五项，次序与官方 order 一致 */
export const OFFICIAL_SESSION_IDS = ['pin', 'rename', 'fork', 'archive', 'copy-id'] as const

/** 一条替身条目 */
export interface StubItem {
  readonly id: string
  readonly label: string
  readonly disabled?: boolean
}

/** 置顶项的两态文案与可用性 */
export interface StubPinState {
  readonly pinned: boolean
  readonly canPin: boolean
}

/** 替身的选项 */
export interface StubOptions {
  items?: readonly StubItem[] | undefined
  pin?: StubPinState | undefined
  run?: ((id: string) => void) | undefined
  /** 按目标种类交不同的条目，缺省两边都给 `items` */
  byKind?:
    | Readonly<Partial<Record<MenuTarget['kind'], readonly StubItem[]>>>
    | undefined
  /** 记下每一次解析用的目标，验证两行各自解析自己那一类 */
  targets?: MenuTarget[] | undefined
}

/**
 * 造一份默认条目，置顶项的文案按该行状态取
 * @param pin - 置顶项的状态
 * @returns 五项条目
 */
function defaultItems(pin: StubPinState): StubItem[] {
  return [
    {
      id: 'pin',
      label: pin.pinned ? '取消置顶' : '置顶会话',
      disabled: !pin.pinned && !pin.canPin,
    },
    { id: 'rename', label: '重命名' },
    { id: 'fork', label: '分叉会话' },
    { id: 'archive', label: '归档会话' },
    { id: 'copy-id', label: '复制 Session ID' },
  ]
}

/**
 * 只交一份注册表面，供直接渲染单个组件时用（那时 props 上的格子要的是面，不是取面的函数）
 * @param options - 替身的选项
 * @returns 注册表面
 */
export function registryFace(options: StubOptions = {}): MenuRegistryFace {
  return registryStub(options)() as MenuRegistryFace
}

/**
 * 造一个注册表替身
 * @param options - 替身的选项
 * @returns 区域 props 认识的菜单注册表入口
 */
export function registryStub(
  options: StubOptions = {},
): NonNullable<{ menuRegistry?: () => MenuRegistryFace | undefined }['menuRegistry']> {
  const fallback = options.items ?? defaultItems(options.pin ?? { pinned: false, canPin: true })
  const face: MenuRegistryFace = {
    resolve: (target: MenuTarget) => {
      options.targets?.push(target)
      const views = options.byKind?.[target.kind] ?? fallback
      const source = { getSnapshot: () => views, subscribe: () => () => {} }
      return {
        source,
        ready: Promise.resolve(),
        select: (id: string) => {
          options.run?.(id)
        },
        dispose: () => {},
      }
    },
  }
  return () => face
}
