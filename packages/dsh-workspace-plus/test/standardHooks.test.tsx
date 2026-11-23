// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useStandardHooks } from '../src/client/hooks/useStandardHooks.ts'

/**
 * 交给行级子插槽占用者的标准 hook 要保持同一份
 *
 * 收出来的对象会逐行透传，行级组件按引用比对 props
 * 每次渲染新建一份时，整片列表会跟着容器的每次渲染重渲染，而界面上看不出任何差别
 */

const h = React.createElement

let rowRenders = 0

/** 被 memo 包住的行，与 `SessionRowItem` 的比对方式一致 */
const Row = React.memo(function Row({ hooks }: { hooks: Readonly<Record<string, unknown>> }): React.ReactElement {
  rowRenders += 1
  return h('span', { 'data-keys': Object.keys(hooks).join(',') })
})

/** 把父组件的重渲染入口交给用例 */
const rerender: { current: (() => void) | null } = { current: null }

function Parent(props: Record<string, unknown>): React.ReactElement {
  const [, setN] = React.useState(0)
  rerender.current = () => setN((n) => n + 1)
  const hooks = useStandardHooks(props)
  return h(Row, { hooks })
}

/** 挂上树，驱动两次父组件重渲染，返回期间那一行重渲染了几次 */
function countRerenders(props: Record<string, unknown>): number {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(h(Parent, props))
  })
  rowRenders = 0
  act(() => rerender.current?.())
  act(() => rerender.current?.())
  const rendered = rowRenders
  act(() => root.unmount())
  return rendered
}

describe('useStandardHooks', () => {
  afterEach(() => {
    rowRenders = 0
    document.body.replaceChildren()
  })

  it('keeps one identity across parent renders so memoized rows stay put', () => {
    const useSessions = () => undefined
    expect(countRerenders({ useSessions, t: 'x' })).toBe(0)
  })

  it('hands over a new object when a standard hook is swapped', () => {
    // 渲染器按源缓存标准 hook，换了一份源就是真的变了，行必须重渲染
    const first = () => undefined
    const second = () => undefined
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(h(Parent, { useSessions: first }))
    })
    rowRenders = 0
    act(() => {
      root.render(h(Parent, { useSessions: second }))
    })
    expect(rowRenders).toBe(1)
    act(() => root.unmount())
  })

  it('collects every use* prop and drops the rest', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    act(() => {
      root.render(h(Parent, { useA: () => 1, useB: () => 2, useC: undefined, openSession: () => {} }))
    })
    expect(container.querySelector('[data-keys]')?.getAttribute('data-keys')).toBe('useA,useB')
    act(() => root.unmount())
  })
})
