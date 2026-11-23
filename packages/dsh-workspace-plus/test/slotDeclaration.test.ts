/**
 * 接替者能否自己声明官方已声明的那些子插槽
 *
 * 官方 `ui-workspace` 以优先级 0 注册 `sidebar.workspaces`，注册时一并声明它自己的子插槽（含行级那几格）
 * 本包以优先级 -1 接替父插槽但不再渲染官方组件——官方那条注册仍在 ledger 里，子插槽因此已经有了声明者
 * `renderSlot` 只授权给自己 `children` 表里声明过的键，本包这张表是空的，所以拿不到渲染权
 * 这个探针确认「换个优先级再声明一次」是不是一条出路
 */
import { describe, expect, it } from 'vitest'
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots'

/** 一条子插槽的声明 */
type ChildDecl = Record<string, { kind: 'single' | 'list'; scope: 'root'; inline?: boolean }>

/** 往 ledger 里注册一条，只带本探针关心的几格 */
function register(
  core: SlotCore,
  name: string,
  options: { priority?: number; children?: ChildDecl; id?: string } = {},
): () => void {
  return (core as unknown as {
    register: (input: unknown, component: unknown) => () => void
  }).register(
    {
      name,
      ...(options.id === undefined ? {} : { id: options.id }),
      ...(options.priority === undefined ? {} : { priority: options.priority }),
      ...(options.children === undefined ? {} : { children: options.children }),
    },
    () => null,
  )
}

/** 与真实 shell 同形的三层：root → sidebar → sidebar.workspaces */
function composed(): SlotCore {
  const core = new SlotCore()
  register(core, 'root', { children: { sidebar: { kind: 'single', scope: 'root' } } })
  register(core, 'sidebar', { children: { 'sidebar.workspaces': { kind: 'single', scope: 'root' } } })
  return core
}

/** 行起始位那条子插槽 */
const LEADING: ChildDecl = {
  'sidebar.session.row.leading': { kind: 'list', scope: 'root', inline: true },
}

describe('declaring a child slot another registration already declared', () => {
  it('refuses the second declaration even when the parent cell is a different priority', () => {
    const core = composed()
    // 官方：默认优先级 0，声明子插槽
    register(core, 'sidebar.workspaces', { children: LEADING })
    // 本包：优先级 -1 接替父插槽，同时想声明同一批子插槽
    expect(() => register(core, 'sidebar.workspaces', { priority: -1, children: LEADING }))
      .toThrow(/already declared/)
  })

  it('accepts the declaration once the official registration withdrew', () => {
    const core = composed()
    const disposeOfficial = register(core, 'sidebar.workspaces', { children: LEADING })
    disposeOfficial()

    // 官方那条退场时子插槽的声明一并收起，此时本包声明得下来
    expect(() => register(core, 'sidebar.workspaces', { priority: -1, children: LEADING }))
      .not.toThrow()
    expect(core.specDynamic('sidebar.session.row.leading')).toBeDefined()
  })
})
