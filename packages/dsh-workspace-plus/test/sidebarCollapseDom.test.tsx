// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import * as React from 'react'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { WorkspaceGroupsRegion } from '../src/client/views/WorkspaceGroupsRegion.tsx'
import { regionProps } from './support/dndDom.ts'

/**
 * 宽窄两态之间来回切换
 *
 * 区域的两种形态是两个渲染分支，而 shell 的折叠态每切换一次就把组件重新渲染一遍
 * 两个分支调用的 hook 数量不同，只要其中一支落在 hook 之前，宽窄一换就会抛
 * 「Rendered fewer hooks than expected」，插槽随即把这条注册判成崩溃并从渲染者里摘掉
 * 后果是左侧区域换回官方组件，分组、置顶、嵌套整片功能一起消失，且刷新前不会自己回来
 *
 * 因此断言的不是某一态长什么样，而是来回切换之后两态都还在
 */

afterEach(() => {
  document.body.replaceChildren()
})

/** 挂载区域并按宽度重渲染一次 */
async function renderWide(root: ReturnType<typeof createRoot>, wide: boolean): Promise<void> {
  await act(async () => {
    root.render(React.createElement(WorkspaceGroupsRegion, regionProps({ wide })))
  })
}

describe('shell collapse', () => {
  it('keeps rendering the region after collapsing and expanding again', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await renderWide(root, true)
    expect(container.querySelector('.root')).not.toBeNull()

    await renderWide(root, false)
    expect(container.querySelector('.rail')).not.toBeNull()

    await renderWide(root, true)
    expect(container.querySelector('.root')).not.toBeNull()
  })
})
