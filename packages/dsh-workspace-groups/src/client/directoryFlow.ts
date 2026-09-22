/**
 * 官方 `sidebar.workspaces.directoryFlow` 洞的读数
 *
 * 官方 ui-workspace 声明了这个子洞，目录选择器插件的浏览器半边注册进它：
 * `-native` 是驱动 OS 选择器的无渲染占用者，`-browse` 是应用内浏览对话框
 * 本包以 `priority: -1` 接替父插槽只是不再渲染官方组件，官方那条注册仍留在 ledger 里
 * 因此洞的声明与占用者都还在，可以整段借用官方的 picking 交互
 *
 * 反面是：本包不能自己声明同名子插槽（一个插槽只能有一个声明者，重复声明直接抛错），所以这条路是复用官方选择交互的唯一入口
 */
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type { DirectoryFlowOccupant } from './actions.ts'

/**
 * 官方声明的洞名
 *
 * 它是 SlotMap 里的一项，不从官方包导入：官方 `ui-workspace` 只导出 `apply` / `inject`，而这里只需要字符串本身
 */
export const DIRECTORY_FLOW_SLOT = 'sidebar.workspaces.directoryFlow'

/** 占用者表里的一项；只取本模块用到的字段 */
interface OccupantEntry {
  component: unknown
  inject?: ((...args: never[]) => Record<string, unknown>) | undefined
}

/**
 * 每个占用者 inject 面的缓存
 *
 * 渲染器给插槽注册项也是这么做的：inject 的结果按注册项身份缓存整个注册生命周期
 * 这里用占用者的 inject 函数（注册时带上的稳定引用）当键，否则每次渲染都新建一份函数，占用者会平白重挂订阅
 */
const injectCache = new WeakMap<object, Record<string, unknown>>()

/**
 * 从洞的占用者表里取出可渲染的占用者
 *
 * 取渲染者（`entriesOfSlot` 的第一项）而不是全部注册项：该洞是 single 类型，同优先级重复注册会抛错
 * 因此正常情况下只有一项，走渲染者视图能同时避开已崩溃退位的注册
 * @returns 占用者；洞未声明或无人占用时为 undefined
 */
export function resolveOccupant(
  entries: readonly OccupantEntry[],
): DirectoryFlowOccupant | undefined {
  const entry = entries[0]
  if (entry === undefined) return undefined
  if (typeof entry.component !== 'function') return undefined
  const inject = entry.inject
  return {
    component: entry.component as DirectoryFlowOccupant['component'],
    // 占用者可能没有 inject 面（自给自足的实现），此时按空面渲染
    inject: () => {
      if (inject === undefined) return {}
      const cached = injectCache.get(inject)
      if (cached !== undefined) return cached
      const face = inject()
      injectCache.set(inject, face)
      return face
    },
  }
}

/**
 * 读一次洞的占用者
 *
 * 是函数因此可以在渲染期调用：渲染器会把注册项的 inject 结果缓存整个注册生命周期
 * 目录选择器插件的加载顺序又不受本包约束，只有延迟到渲染时读才拿得到真正在场的占用者
 * @returns 占用者；无人占用时为 undefined
 */
export function directoryFlowOccupant(slots: SlotRegistry): DirectoryFlowOccupant | undefined {
  return resolveOccupant(slots.entriesOfSlot(DIRECTORY_FLOW_SLOT) as readonly OccupantEntry[])
}

/**
 * 洞的占用情况源
 *
 * 交给渲染器绑成 `useDirectoryFlow` 选择器 hook：占用者晚于本包加载时，入口按钮要跟着出现
 * 因此占不占用必须是一个可订阅的事实，而不是渲染期读一次的快照
 * @returns 与官方同形的可订阅源
 */
export function directoryFlowSource(slots: SlotRegistry): {
  getSnapshot: () => boolean
  subscribe: (listener: () => void) => () => void
} {
  return {
    getSnapshot: () => slots.entriesOfSlot(DIRECTORY_FLOW_SLOT).length > 0,
    subscribe: (listener: () => void) => slots.subscribe(DIRECTORY_FLOW_SLOT, listener),
  }
}
