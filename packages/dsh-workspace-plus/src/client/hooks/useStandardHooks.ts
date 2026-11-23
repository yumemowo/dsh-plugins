/**
 * 把区域 props 上的全局标准 hook 收成一份交给行级子插槽占用者
 *
 * 本包替官方组件渲染那些占用者，就得把渲染器本来会给它们的那一份标准 hook 一起交过去
 * 官方的行内按钮先问 `useSessionAccess`，子插槽声明里的 hook 工厂还可能要别的
 *
 * 按命名约定整体转发，不列名单：全局标准 hook 由多个包各自 merge 进同一个 interface，且随宿主新增
 * 名单式转发漏一格就崩一条插槽，而漏掉的那一格在 tsc 里看不见
 *
 * 收出来的对象要跨渲染保持同一份：它会传进每一行，行级 memo 按引用比对
 * 每次渲染新建一份会让全表重渲染
 */
import { useRef } from 'react'

/** 一次收取的结果，跨渲染留下来比对 */
interface Collected {
  readonly names: readonly string[]
  readonly values: readonly unknown[]
  readonly hooks: Readonly<Record<string, unknown>>
}

/** 只认 `use` 开头且不是 undefined 的格子 */
function collect(props: Readonly<Record<string, unknown>>): Collected {
  const names: string[] = []
  const values: unknown[] = []
  for (const [name, value] of Object.entries(props)) {
    if (!name.startsWith('use') || value === undefined) continue
    names.push(name)
    values.push(value)
  }
  const hooks: Record<string, unknown> = {}
  for (const [at, name] of names.entries()) hooks[name] = values[at]
  return { names, values, hooks }
}

/** 两次收取是否同一份：格子名按序相同、每个值按引用相同 */
function sameCollected(prev: Collected, next: Collected): boolean {
  if (prev.names.length !== next.names.length) return false
  for (const [at, name] of next.names.entries()) {
    if (prev.names[at] !== name || !Object.is(prev.values[at], next.values[at])) return false
  }
  return true
}

/**
 * 收取区域 props 上的全局标准 hook
 *
 * 标准 hook 由渲染器按源缓存，同一份源交回同一个函数，因此按引用比对就够
 * @param props - 区域 props
 * @returns 交给行级子插槽占用者的标准 hook，内容没变时交回上次那一份
 */
export function useStandardHooks(props: object): Readonly<Record<string, unknown>> {
  const held = useRef<Collected | null>(null)
  const next = collect(props as Readonly<Record<string, unknown>>)
  const prev = held.current
  if (prev !== null && sameCollected(prev, next)) return prev.hooks
  held.current = next
  return next.hooks
}
