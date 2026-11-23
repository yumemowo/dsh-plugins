import type { MenuRegistryFace } from '../../src/client/menuRegistry.ts'

/**
 * 官方右键菜单注册表的替身，条目就是官方 `ui-workspace` 注册进 `session` 的那五项
 *
 * rc.1 起官方 `ui-workspace` 把 `contextMenus` 声明为必需注入，它因此必然在场；
 * 会话行的官方操作全部由它供，不用替身就只能测到本包自己的归组项
 *
 * 形状照官方的解析结果：条目来自可订阅的源，选中按 id 交回给这次解析
 *
 * 选项两个：
 * - `run`：选中某项时执行什么，默认什么也不做
 * - `pin`：置顶项的文案与可用性，跟着该行自己的置顶状态变
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
 * @param options.items - 交出的条目，缺省按 \`pin\` 造一份官方同形的
 * @param options.pin - 置顶项的状态，缺省「未置顶且可以置顶」
 * @param options.run - 选中某项时执行什么
 * @returns 注册表面
 */
export function registryFace(options: {
  items?: readonly StubItem[] | undefined
  pin?: StubPinState | undefined
  run?: ((id: string) => void) | undefined
} = {}): MenuRegistryFace {
  return registryStub(options)() as MenuRegistryFace
}

/**
 * 造一个注册表替身
 * @param options.items - 交出的条目，缺省按 `pin` 造一份官方同形的
 * @param options.pin - 置顶项的状态，缺省「未置顶且可以置顶」
 * @param options.run - 选中某项时执行什么
 * @returns 区域 props 认识的菜单注册表入口
 */
export function registryStub(options: {
  items?: readonly StubItem[] | undefined
  pin?: StubPinState | undefined
  run?: ((id: string) => void) | undefined
} = {}): NonNullable<{ menuRegistry?: () => MenuRegistryFace | undefined }['menuRegistry']> {
  const views = options.items ?? defaultItems(options.pin ?? { pinned: false, canPin: true })
  const source = { getSnapshot: () => views, subscribe: () => () => {} }
  const face: MenuRegistryFace = {
    resolve: () => ({
      source,
      ready: Promise.resolve(),
      select: (id: string) => {
        options.run?.(id)
      },
      dispose: () => {},
    }),
  }
  return () => face
}