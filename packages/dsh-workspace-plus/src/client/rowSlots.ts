/**
 * 行级子插槽的占用者
 *
 * 官方 `ui-workspace` 在 `sidebar.workspaces` 之下声明了几个行级子插槽（行首指示位、悬停卡片段、行尾操作按钮）
 * 本包接替父插槽只是不再渲染官方组件，那批声明仍在 ledger 里，别的插件的注册因此照旧落得进去
 *
 * 本包不能声明它们：一个插槽只能有一个声明者，官方那条注册仍在，重复声明直接抛错（见 `test/slotDeclaration.test.ts`）
 * `renderSlot` 只授权给自己 `children` 表里声明过的键，本包这张表因此是空的
 *
 * 于是这里走与 `directoryFlow.ts` 同一条路：从 ledger 的条目表里取出占用者，按渲染器传播 props 的同一套做法自己渲染
 *
 * 四件事必须照着渲染器做，少一件占用者就崩：
 * - `hooks` 隔间里的每个可订阅源绑成 `use<Name>` 选择器（占用者按这个名字调用，传源过去就是「不是函数」）
 * - `keyedHooks` 同理，绑成按键取值的选择器
 * - 声明了 `locale` 的占用者拿到按命名空间绑出的 `t` 座位
 * - 每个占用者各包一层崩溃隔离
 *
 * 三处与真渲染器仍有差距，都只影响个别占用者：
 * - 占用者自己再调 `renderSlot` 会抛错（它没有声明权），这类占用者只能由官方组件渲染
 * - `store` 座位不装配（本包的区域自己有一个，行级占用者通常用不到）
 * - 插槽级 hook 工厂（`inject.hooks` 那一层）不装配：本包用到的四个行级子插槽都没声明它
 */
import { Component, createElement, useRef, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'

/** 行级子插槽的四个键，与官方声明的那几条同名 */
export const ROW_SLOTS = {
  /** 行首状态位，只在行自身的主状态是空闲时挂 */
  leading: 'sidebar.session.row.leading',
  /** 行尾时间与图钉之间的图标位 */
  trailing: 'sidebar.session.row.trailing',
  /** 悬停卡片里时间与状态之间的那一段 */
  hover: 'sidebar.session.row.hover',
  /** 行尾 `...` 之后的悬停操作按钮 */
  action: 'sidebar.workspaces.session.row.action',
} as const

/**
 * 官方注册进行尾按钮位的置顶按钮 id
 *
 * 官方那枚只按自己的置顶集合与对端权限判断，没有本包的置顶上限这回事
 * 本包的行尾已经有同一枚按钮，两枚并排时一枚守住上限、另一枚绕过它，因此由本包的那枚接替这一格
 * 它注册在同一个插槽上、用的是这个 id，排掉时按 id 匹配
 */
export const OFFICIAL_PIN_SLOT_ID = 'pin'

// ── 可订阅源到选择器 hook ──

/** 一个可订阅源，与渲染器认的形状一致 */
export interface HostObservable<T> {
  getSnapshot: () => T
  subscribe: (listener: () => void) => () => void
}

/** 没有源的格子读成 undefined，与有源走同一条 hook 路径 */
function sourceOrAbsent(source: HostObservable<unknown> | undefined): HostObservable<unknown> {
  return source ?? ABSENT
}

/** 选择器 hook，与渲染器绑出来的同形 */
export type SelectorHook = <S>(
  selector?: (snapshot: never) => S,
  equal?: (left: S, right: S) => boolean,
) => S

/** 一次选择的结果，跨渲染留下来判断要不要换引用 */
interface Selection {
  readonly select: (snapshot: never) => unknown
  readonly equal: ((left: unknown, right: unknown) => boolean) | undefined
  readonly snapshot: unknown
  readonly value: unknown
}

/** 永远交回 undefined 的源，用来让「这一格没有数据」与「有数据」走同一条 hook 路径 */
const ABSENT: HostObservable<undefined> = {
  getSnapshot: () => undefined,
  subscribe: () => () => {},
}

/** 每个源一份选择器 hook，键是源本身：同一份源在两次渲染之间必须交回同一个函数 */
const hookCache = new WeakMap<object, unknown>()

/** 恒等于自身的取值器，选择器缺席时用 */
function identity<T>(value: T): T {
  return value
}

/**
 * 把一个可订阅源绑成选择器 hook
 *
 * 组件每次渲染都会调用这个 hook，因此同一份源必须交回同一个函数，否则每次渲染都是新 hook
 * 选择结果按「源快照 + 选择器身份」留在 ref 里：源没变就不重算，判等函数说没变就继续用旧值
 * 消费它的组件因此不会因为选择器每次交出新对象而重渲染
 * @param source - 可订阅源
 * @returns 选择器 hook
 */
export function bindSourceHook<T>(source: HostObservable<T>): SelectorHook {
  const cached = hookCache.get(source)
  if (cached !== undefined) return cached as SelectorHook
  const subscribe = (listener: () => void): (() => void) => source.subscribe(listener)
  const hook = ((
    selector?: (snapshot: never) => unknown,
    equal?: (left: unknown, right: unknown) => boolean,
  ): unknown => {
    const select = selector ?? identity
    const memo = useRef<Selection | null>(null)
    const read = (): unknown => {
      const snapshot = source.getSnapshot()
      const last = memo.current
      // 源与选择器都没换时直接交回上次那份：选择器常写成内联箭头，但源快照不变时结果也不该变
      if (last !== null && last.select === select && Object.is(last.snapshot, snapshot)) return last.value
      const value = select(snapshot as never)
      // 判等说没变时值继续用旧的，引用因此稳定，消费方不会因为选择器交出等价新对象而重渲染
      const stable = last !== null && equal !== undefined && equal(last.value, value) ? last.value : value
      memo.current = { select, equal, snapshot, value: stable }
      return stable
    }
    return useSyncExternalStore(subscribe, read)
  }) as SelectorHook
  hookCache.set(source, hook)
  return hook
}

// ── 按键取值的选择器 ──

/** 一个按键取源的选择器 hook，`keyedHooks` 隔间用 */
export type KeyedSelectorHook = (
  keyOrSelector: string | ((value: never) => unknown),
  second?: string | ((value: never) => unknown) | ((left: unknown, right: unknown) => boolean),
  equal?: (left: unknown, right: unknown) => boolean,
) => unknown

/** 一个 keyed hook 调用的三个参数各自是什么 */
interface KeyedCall {
  readonly key: string | undefined
  readonly member: string | undefined
  readonly selector: ((value: never) => unknown) | undefined
  readonly equal: ((left: unknown, right: unknown) => boolean) | undefined
}

/**
 * 把一次 keyed hook 调用的参数分开
 *
 * 三种形态照渲染器：`(selector)`、`(key, selector)`、`(key, member, equal)`
 * 首个参数不是字符串时它自己就是选择器，键取声明给出的缺省键（本包的四个行级子插槽都没有）
 * @param keyOrSelector - 首个参数
 * @param second - 第二个参数
 * @param equal - 第三个参数
 * @returns 这次调用落在哪个键上、用哪个选择器
 */
function keyedCall(
  keyOrSelector: string | ((value: never) => unknown),
  second: Parameters<KeyedSelectorHook>[1],
  equal: ((left: unknown, right: unknown) => boolean) | undefined,
): KeyedCall {
  if (typeof keyOrSelector !== 'string') {
    return {
      key: undefined,
      member: undefined,
      selector: keyOrSelector,
      equal: second as ((left: unknown, right: unknown) => boolean) | undefined,
    }
  }
  if (typeof second === 'string') {
    return { key: keyOrSelector, member: second, selector: undefined, equal: undefined }
  }
  return {
    key: keyOrSelector,
    member: undefined,
    selector: second as ((value: never) => unknown) | undefined,
    equal,
  }
}

/** 按键取源的工厂，`keyedHooks` 隔间里的一项 */
type KeyedSource = (key: string, member?: string) => HostObservable<unknown> | undefined

/**
 * 把一个按键取源的工厂绑成 keyed 选择器 hook
 *
 * 本包的四个行级子插槽都没声明 keyed hook，这条路径是为第三方占用者准备的
 * @param factory - 按键取源
 * @returns keyed 选择器 hook
 */
function bindKeyedHook(factory: KeyedSource): KeyedSelectorHook {
  return (keyOrSelector, second, equal) => {
    const call = keyedCall(keyOrSelector, second, equal)
    const source = call.key === undefined ? ABSENT : factory(call.key, call.member) ?? ABSENT
    return bindSourceHook(source)((call.selector ?? identity) as (snapshot: never) => unknown, call.equal)
  }
}

// ── 占用者的 props ──

/** 占用者表里的一项，只取本模块用到的字段 */
interface OccupantEntry {
  component: unknown
  inject?: ((...args: never[]) => Record<string, unknown>) | undefined
  options?: { readonly id?: string | undefined; readonly key?: string | undefined } | undefined
  locale?: string | undefined
}

/** 每个占用者 inject 面的缓存，键是注册时带上的那个稳定函数 */
const injectCache = new WeakMap<object, Record<string, unknown>>()

/** 按命名空间绑出的翻译座位缓存 */
const localeCache = new WeakMap<LocaleRuntime, Map<string, unknown>>()

/**
 * 源名到它的 hook prop 名
 *
 * 与渲染器同一条推导：首字母大写后加 `use` 前缀，因此 `catalog` 变成 `useCatalog`
 * 不直接 import 官方那个同名函数：`@deepseek-ai/dsh-client-ui-slots` 不在产物基线表里
 * 为了一行推导把它的核心打第二份进产物不值得
 * @param name - 注册时写的源名
 * @returns 组件上那一格 prop 的名字
 */
function hookPropName(name: string): string {
  return `use${name.charAt(0).toUpperCase()}${name.slice(1)}`
}

/**
 * 把占用者的 inject 面按渲染器的规则摊成 props
 *
 * `hooks` 与 `keyedHooks` 两个隔间不原样外传：它们的内容是源与工厂，占用者按 `use<Name>` 当函数调用
 * @param face - 占用者 inject 交回的面
 * @returns 可以直接铺到组件上的 props
 */
function bindInjectFace(face: Record<string, unknown>): Record<string, unknown> {
  const sources = face['hooks'] as Record<string, HostObservable<unknown> | undefined> | undefined
  const keyed = face['keyedHooks'] as Record<string, KeyedSource | undefined> | undefined
  if (sources === undefined && keyed === undefined) return face
  const { hooks: _hooks, keyedHooks: _keyed, ...rest } = face
  const bound: Record<string, unknown> = { ...rest }
  for (const [name, source] of Object.entries(sources ?? {})) {
    bound[hookPropName(name)] = bindSourceHook(sourceOrAbsent(source))
  }
  for (const [name, factory] of Object.entries(keyed ?? {})) {
    bound[hookPropName(name)] = bindKeyedHook(factory ?? (() => undefined))
  }
  return bound
}

/**
 * 渲染器给每个注册项的那一份全局标准 hook
 *
 * 官方那批 hook 由多个包各自 merge 进同一个 interface，且随宿主新增
 * 因此不在这里列名单：区域把 props 上所有 `use*` 整体转过来，占用者要哪一个直接拿
 */
export type StandardHooks = Readonly<Record<string, unknown>>

// ── 崩溃隔离 ──

/**
 * 一个占用者的崩溃隔离
 *
 * 渲染器给每个注册项都包一层：占用者抛错时只把它自己那一格换成空占位，不带走整条行
 * 没有这一层时异常顺着 React 树往上冒，落到最近一层官方插槽的边界上，整片区域跟着消失
 * 日志格式与官方那条同形，排查时两处输出一致
 */
class OccupantBoundary extends Component<{ slotKey: string; children?: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown): void {
    console.error(`slot entry crashed in '${this.props.slotKey}':`, error)
  }

  override render(): ReactNode {
    // 崩溃那一格留成空占位：仍带标记，样式与排查都还找得到它
    if (this.state.failed) return createElement('span', { 'data-slot-error': this.props.slotKey })
    return this.props.children
  }
}

// ── 渲染 ──

/**
 * 一个子插槽上渲染出来的内容
 * @param slots - 客户端插槽注册表
 * @param locale - 语言服务，占用者声明了命名空间时用来造 `t` 座位
 * @param key - 四个行级子插槽之一
 * @param owner - 这一格的主人数据，如 `{ sessionId }`
 * @param standard - 全局标准 hook（如 `useSessions`），与渲染器给每个插槽注册项的那一份同形
 * @param omit - 排掉这几个 id 的占用者，见 {@link RowSlotFace.render}
 * @returns 渲染好的节点，没有占用者时为 null
 */
export function renderRowSlot(
  slots: SlotRegistry,
  locale: LocaleRuntime | undefined,
  key: string,
  owner: Record<string, unknown>,
  standard: StandardHooks = {},
  omit: readonly string[] = [],
): ReactNode {
  const entries = slots.entriesOfSlot(key as never) as readonly OccupantEntry[]
  if (entries.length === 0) return null
  const rendered: ReactNode[] = []
  for (const entry of entries) {
    if (typeof entry.component !== 'function') continue
    if (omit.length > 0 && entry.options?.id !== undefined && omit.includes(entry.options.id)) continue
    const inject = entry.inject
    let face: Record<string, unknown> = {}
    if (inject !== undefined) {
      const cached = injectCache.get(inject)
      if (cached !== undefined) face = cached
      else {
        face = bindInjectFace(inject())
        injectCache.set(inject, face)
      }
    }
    const seat = entry.locale === undefined ? undefined : localeSeat(locale, entry.locale)
    const id = entry.options?.id ?? entry.options?.key ?? String(rendered.length)
    // 铺叠顺序照渲染器：标准 hook 最弱，注册项自己的 inject 次之，主人数据最后覆盖
    const occupant = createElement(entry.component as (props: Record<string, unknown>) => ReactNode, {
      ...standard,
      ...(seat === undefined ? {} : { t: seat }),
      ...face,
      ...owner,
      key: id,
    })
    rendered.push(createElement(OccupantBoundary, { slotKey: key, key: id }, occupant))
  }
  return rendered.length === 0 ? null : createElement('span', { 'data-wg-slot': key }, ...rendered)
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
   *
   * `omit` 里的 id 不渲染：本包自己就有那枚按钮的入口时用它排掉官方同名的那个
   * 排掉整条注册而不是让本包那枚让开，是因为官方那枚不看本包的约束——置顶上限只有本包知道
   * @param key - 四个行级子插槽之一，见 {@link ROW_SLOTS}
   * @param owner - 这一格的主人数据
   * @param standard - 全局标准 hook，宿主没提供时缺省
   * @param omit - 注册时带的 id，命中的占用者不渲染
   * @returns 渲染好的节点，没有占用者时为 null
   */
  render: (
    key: string,
    owner: RowSlotOwner,
    standard?: StandardHooks,
    omit?: readonly string[],
  ) => ReactNode
}
