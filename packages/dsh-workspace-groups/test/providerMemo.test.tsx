// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { LocalViewOptionsProvider, useLocalViewOptions } from '../src/client/useLocalViewOptions.ts'
import type { LocalViewOptions } from '../src/client/useLocalViewOptions.ts'

/**
 * provider value 的身份对行级缓存的影响
 *
 * 被 `memo` 包住的组件默认按引用比对 props，但 context 的变化**穿透** `memo`
 * 因此 provider 每次渲染新建 value 时，消费它的 memo 行会跟着父组件一遍遍重渲染
 *
 * 这里用真 `react-dom` 把那条机制量出来：`SessionRowView` 与它的关系是同一个机制的一个实例
 */

const h = React.createElement

let rowRenders = 0

/** 被 memo 包住、又消费 context 的行，与 `SessionRowView` 的形状一致 */
const Row = React.memo(function Row() {
  const { indicator } = useLocalViewOptions()
  rowRenders += 1
  return h('span', null, indicator)
})

/** 把父组件的重渲染入口交给用例 */
const rerender: { current: (() => void) | null } = { current: null }

function Parent({ build }: { build: () => LocalViewOptions }): React.ReactElement {
  const [, setN] = React.useState(0)
  rerender.current = () => setN((n) => n + 1)
  return h(LocalViewOptionsProvider, { value: build(), children: h(Row) })
}

const STABLE: LocalViewOptions = {
  mode: 'workspace',
  indicator: 'icon',
  setMode: () => {},
  setIndicator: () => {},
}

/** 每次调用都交出一份新对象，模拟没写 `useMemo` 的容器 */
function rebuilt(): LocalViewOptions {
  return { mode: 'workspace', indicator: 'icon', setMode: () => {}, setIndicator: () => {} }
}

/** 挂上树并返回卸载入口 */
function mount(build: () => LocalViewOptions): { unmount: () => void } {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(h(Parent, { build }))
  })
  return {
    unmount: () => {
      act(() => {
        root.unmount()
      })
    },
  }
}

/** 驱动两次父组件重渲染，返回期间被 memo 包住的那行重渲染了几次 */
function countRerenders(build: () => LocalViewOptions): number {
  const tree = mount(build)
  rowRenders = 0
  act(() => rerender.current?.())
  act(() => rerender.current?.())
  tree.unmount()
  return rowRenders
}

describe('provider value 的身份', () => {
  afterEach(() => {
    rowRenders = 0
    document.body.replaceChildren()
  })

  it('leaves a memoized consumer untouched when the provider value keeps one identity', () => {
    expect(countRerenders(() => STABLE)).toBe(0)
  })

  it('re-renders a memoized consumer once per parent render when the value is rebuilt', () => {
    expect(countRerenders(rebuilt)).toBe(2)
  })
})
