/**
 * 行级子插槽的占用者
 *
 * 官方 `ui-workspace` 声明了四个行级子插槽（行首指示位、行尾图标位、悬停卡片段、行尾操作按钮）
 * 本包接替父插槽只是不再渲染官方组件，那批声明仍在 ledger 里，别的插件的注册因此照旧落得进去
 *
 * **本包不能声明它们**：一个插槽只能有一个声明者，官方那条注册仍在，重复声明直接抛错（见 `test/slotDeclaration.test.ts`）
 * 而 `renderSlot` 只授权给自己 `children` 表里声明过的键，本包这张表因此是空的
 *
 * 于是这里走与 `directoryFlow.ts` 同一条路：从 ledger 的条目表里取出占用者，按渲染器传播 props 的同一套做法自己渲染
 * 与真渲染器相比少了三件事，且都只影响个别占用者：
 * - 占用者自己再调 `renderSlot` 会抛错（它没有声明权），这类占用者只能由官方组件渲染
 * - `store` 座位不装配（本包的区域自己有一个，行级占用者通常用不到）
 * - 标准 hook（`useSessions` 等）不注入，占用者的 inject 面里拿到什么就是什么
 */
import { createElement } from 'react'
import type { ReactNode } from 'react'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

/** 行级子插槽的四个键，与官方声明的那几条同名 */
export const ROW_SLOTS = {
  /** 行首状态位；只在行自身的主状态是空闲时挂 */
  leading: 'sidebar.session.row.leading',
  /** 行尾时间与图钉之间的图标位 */
  trailing: 'sidebar.session.row.trailing',
  /** 悬停卡片里时间与状态之间的那一段 */
  hover: 'sidebar.session.row.hover',
  /** 行尾 `...` 之后的悬停操作按钮 */
  action: 'sidebar.workspaces.session.row.action',
} as const

/** 占用者表里的一项，只取本模块用到的字段 */
interface OccupantEntry {
  component: unknown
  inject?: ((...args: never[]) => Record<string, unknown>) | undefined
  options?: { readonly id?: string | undefined; readonly key?: string | undefined } | undefined
  locale?: string | undefined
}

/** 每个占用者 inject 面的缓存，键是注册时带上的那个稳定函数 */
const injectCache = new WeakMap<object, Record<string, unknown>>()

/** 按命名空间绑出的翻译座位缓存，键是命名空间名 */
const localeCache = new WeakMap<LocaleRuntime, Map<string, unknown>>()

/**
 * 一个子插槽上渲染出来的内容
 * @param slots - 客户端插槽注册表
 * @param locale - 语言服务，占用者声明了命名空间时用来造 `t` 座位
 * @param key - 四个行级子插槽之一
 * @param owner - 这一格的主人数据，如 `{ sessionId }`
 * @returns 渲染好的节点；没有占用者时为 null
 */
export function renderRowSlot(
  slots: SlotRegistry,
  locale: LocaleRuntime | undefined,
  key: string,
  owner: Record<string, unknown>,
): ReactNode {
  const entries = slots.entriesOfSlot(key as never) as readonly OccupantEntry[]
  if (entries.length === 0) return null
  const rendered: ReactNode[] = []
  for (const entry of entries) {
    if (typeof entry.component !== 'function') continue
    const inject = entry.inject
    let face: Record<string, unknown> = {}
    if (inject !== undefined) {
      const cached = injectCache.get(inject)
      if (cached !== undefined) face = cached
      else {
        face = inject()
        injectCache.set(inject, face)
      }
    }
    const seat = entry.locale === undefined ? undefined : localeSeat(locale, entry.locale)
    const id = entry.options?.id ?? entry.options?.key ?? String(rendered.length)
    rendered.push(createElement(entry.component as (props: Record<string, unknown>) => ReactNode, {
      ...face,
      ...(seat === undefined ? {} : { t: seat }),
      ...owner,
      key: id,
    }))
  }
  return rendered.length === 0 ? null : createElement('span', { 'data-wg-slot': key }, ...rendered)
}

/**
 * 某个子插槽上有没有占用者
 *
 * 行尾那段空间要按有没有内容决定让不让出来，因此这是一个可订阅的事实
 * @param slots - 客户端插槽注册表
 * @param key - 四个行级子插槽之一
 * @returns 是否至少有一个占用者
 */
export function rowSlotOccupied(slots: SlotRegistry, key: string): boolean {
  return slots.entriesOfSlot(key as never).length > 0
}

/**
 * 按命名空间造一个翻译座位
 *
 * 绑出来的函数在调用时才读当前语言，因此同一份可以跨语言切换复用
 * @param locale - 语言服务
 * @param namespace - 占用者声明的命名空间
 * @returns 翻译函数，语言服务缺失时为 undefined
 */
function localeSeat(locale: LocaleRuntime | undefined, namespace: string): unknown {
  if (locale === undefined) return undefined
  let byNamespace = localeCache.get(locale)
  if (byNamespace === undefined) {
    byNamespace = new Map()
    localeCache.set(locale, byNamespace)
  }
  let seat = byNamespace.get(namespace)
  if (seat === undefined) {
    seat = locale.bind(namespace as never)
    byNamespace.set(namespace, seat)
  }
  return seat
}
/** 一条行的会话身份，四个行级子插槽都只收这一格 */
export interface RowSlotOwner {
  readonly sessionId: string
}

/** 区域消费的行级插槽面，由插件入口在渲染期闭合 */
export interface RowSlotFace {
  /**
   * 渲染一个子插槽
   * @param key - 四个行级子插槽之一，见 {@link ROW_SLOTS}
   * @param owner - 这一格的主人数据
   * @returns 渲染好的节点，没有占用者时为 null
   */
  render: (key: string, owner: RowSlotOwner) => ReactNode
  /**
   * 这一格上有没有占用者
   * @param key - 四个行级子插槽之一
   * @returns 是否至少有一个占用者
   */
  occupied: (key: string) => boolean
}
