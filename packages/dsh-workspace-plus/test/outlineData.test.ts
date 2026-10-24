import { describe, expect, it } from 'vitest'
import { deriveNesting } from '../src/client/data/nest.ts'
import { layoutWorkspaceRows, listRoot } from '../src/client/data/outline.ts'
import { groupIdOfSession } from '../src/client/data/sessions.ts'
import { sameMenuGroups } from '../src/client/menus.tsx'
import type { SessionRow } from '../src/client/data/types.ts'

/** 一条会话行 */
function row(id: string): SessionRow {
  return { id, title: id, blank: false, running: false, runningSubagentCount: 0, completed: false, updatedAt: 0 }
}

/** 造一个分组定义 */
function group(id: string, name: string, sessionIds: string[]) {
  return { id, name, sessionIds }
}

/** 造一个工作区分组定义 */
function wgroup(id: string, name: string, workspaceIds: string[]) {
  return { id, name, workspaceIds }
}

/** 不启用嵌套时的推导：每个工作区都落成自己容器里的顶层 */
function noNesting(workspaceIds: readonly string[]) {
  return deriveNesting({
    enabled: false,
    workspaceIds,
    pathOf: () => undefined,
    virtualOf: () => '',
    bindingOf: () => undefined,
    groupIdsOf: () => new Set<string>(),
  })
}

/** 一个工作区体内的切分 */
function rowsOf(rows: readonly SessionRow[], groups: readonly ReturnType<typeof group>[]) {
  return layoutWorkspaceRows(rows, groups)
}

/** 根节点这一层的清单 */
function listOf(
  workspaceIds: readonly string[],
  groups: readonly ReturnType<typeof wgroup>[],
  nesting = noNesting(workspaceIds),
) {
  return listRoot({ workspaceIds, virtualGroups: groups, nesting })
}

describe('buildLayout', () => {
  it('keeps sessions inside their group in metadata order', () => {
    const layout = rowsOf([row('a'), row('b'), row('c')], [group('g1', '前端', ['c', 'a'])])

    expect(layout.groups.map((section) => section.label)).toEqual(['前端'])
    expect(layout.groups[0]?.rows.map((each) => each.id)).toEqual(['c', 'a'])
    expect(layout.loose.map((s) => s.id)).toEqual(['b'])
  })

  it('creates no group at all when the user has created none', () => {
    const layout = rowsOf([row('a'), row('b')], [])

    // 没有用户分组时不应凭空出现分组结构，会话直接平铺
    expect(layout.groups).toEqual([])
    expect(layout.loose.map((s) => s.id)).toEqual(['a', 'b'])
  })

  it('leaves ungrouped sessions loose rather than inventing a bucket group', () => {
    const layout = rowsOf([row('a'), row('b')], [group('g1', '前端', ['a'])])

    expect(layout.groups.map((section) => section.id)).toEqual(['g1'])
    expect(layout.loose.map((s) => s.id)).toEqual(['b'])
  })

  it('reports no loose rows when every session is grouped', () => {
    const layout = rowsOf([row('a')], [group('g1', '前端', ['a'])])

    expect(layout.loose).toEqual([])
  })

  it('skips metadata entries whose session is no longer listed', () => {
    const layout = rowsOf([row('a')], [group('g1', '前端', ['a', 'gone'])])

    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.rows.map((each) => each.id)).toEqual(['a'])
  })

  it('treats a session listed in two groups as belonging to the first only', () => {
    const layout = rowsOf(
      [row('a')],
      [group('g1', '第一', ['a']), group('g2', '第二', ['a'])],
    )

    expect(layout.groups[0]?.rows.map((each) => each.id)).toEqual(['a'])
    expect(layout.groups[1]?.rows).toEqual([])
    // 被分组认领过的会话不会再出现在平铺区，避免重复渲染
    expect(layout.loose).toEqual([])
  })

  it('renders an empty group rather than dropping it', () => {
    const layout = rowsOf([], [group('g1', '空组', [])])

    expect(layout.groups).toHaveLength(1)
    expect(layout.groups[0]?.rows).toEqual([])
  })

  it('keeps group identity stable across rebuilds', () => {
    const groups = [group('g1', '前端', ['a']), group('g2', '后端', [])]
    const first = rowsOf([row('a')], groups)
    const second = rowsOf([row('a')], groups)

    // 分组 id 必须逐次一致，否则展开折叠状态会每次都重置
    expect(first.groups.map((s) => s.id)).toEqual(second.groups.map((s) => s.id))
  })
})

describe('groupIdOfSession', () => {
  it('reports the group that holds the session', () => {
    expect(groupIdOfSession([group('g1', '前端', ['a'])], 'a')).toBe('g1')
  })

  it('reports an empty id for a session outside every group', () => {
    // 空串对应选择器里的「未分组」选项
    expect(groupIdOfSession([group('g1', '前端', ['a'])], 'b')).toBe('')
  })

  it('reports an empty id for an unknown session', () => {
    expect(groupIdOfSession([group('g1', '前端', ['a'])], 'ghost')).toBe('')
  })

  it('reports an empty id when no groups exist', () => {
    expect(groupIdOfSession([], 'a')).toBe('')
  })
})

describe('listRoot', () => {
  /** 造一个工作区分组定义 */
  function wgroup(id: string, name: string, workspaceIds: string[]) {
    return { id, name, workspaceIds }
  }

  it('orders group members by registry order rather than metadata array order', () => {
    const listing = listOf(
      ['w1', 'w2', 'w3'],
      [wgroup('g1', '前端', ['w3', 'w1'])],
    )

    expect(listing.groups.map((section) => section.label)).toEqual(['前端'])
    // 成员数组只当归属集合用，顺序按传入的注册表序
    expect(listing.groups[0]?.members).toEqual(['w1', 'w3'])
    expect(listing.loose).toEqual(['w2'])
  })

  it('leaves every workspace loose when the user has created no group', () => {
    const listing = listOf(['w1', 'w2'], [])

    // 没有用户分组时这一层不改变任何行的位置：界面与没有这个功能时一致
    expect(listing.groups).toEqual([])
    expect(listing.loose).toEqual(['w1', 'w2'])
  })

  it('invents no ungrouped bucket of its own', () => {
    const listing = listOf(['w1', 'w2'], [wgroup('g1', '前端', ['w1'])])

    // 未归组的工作区平铺在分组之后，不占一个显式的区段
    expect(listing.groups.map((section) => section.id)).toEqual(['g1'])
    expect(listing.loose).toEqual(['w2'])
  })

  it('skips metadata entries whose workspace no longer exists', () => {
    const listing = listOf(['w1'], [wgroup('g1', '前端', ['w1', 'gone'])])

    expect(listing.groups[0]?.members).toEqual(['w1'])
  })

  it('treats a workspace listed in two groups as belonging to the first only', () => {
    const listing = listOf(
      ['w1'],
      [wgroup('g1', '第一', ['w1']), wgroup('g2', '第二', ['w1'])],
    )

    expect(listing.groups[0]?.members).toEqual(['w1'])
    expect(listing.groups[1]?.members).toEqual([])
    // 被分组认领过的工作区不会再出现在平铺区，避免重复渲染
    expect(listing.loose).toEqual([])
  })

  it('renders an empty group rather than dropping it', () => {
    const listing = listOf([], [wgroup('g1', '空组', [])])

    // 空分组是「刚建完还没移入工作区」的通常状态，不能悄悄消失
    expect(listing.groups).toHaveLength(1)
    expect(listing.groups[0]?.members).toEqual([])
  })

  it('keeps a nested workspace in its group membership while rendering only the top', () => {
    // 一个项目下的工作区收进同一个虚拟分组之后，它们之间的层级照样渲染
    // 归组这件事不因内嵌而消失，菜单据此判断「它已经在这个分组里了」，不给它再列一次
    const paths: Record<string, string> = {
      repo: '/src/dsh_plugins',
      pkg: '/src/dsh_plugins/packages/dsh-workspace-plus',
    }
    const nesting = deriveNesting({
      enabled: true,
      workspaceIds: ['repo', 'pkg'],
      pathOf: (id) => paths[id],
      virtualOf: () => 'vg1',
      bindingOf: () => undefined,
      groupIdsOf: () => new Set<string>(),
    })
    const listing = listOf(
      ['repo', 'pkg'],
      [wgroup('vg1', 'dsh plugins', ['repo', 'pkg'])],
      nesting,
    )

    // 归属保住全量，渲染只列这一层的顶层
    expect(listing.groups[0]?.members).toEqual(['repo', 'pkg'])
    expect(listing.groups[0]?.roots).toEqual(['repo'])
    // 归属查询读得到，菜单因此不会再列出它自己所在的那个分组
    expect(listing.groups[0]?.members).toContain('pkg')
  })

  it('keeps group identity stable across rebuilds', () => {
    const groups = [wgroup('g1', '前端', ['w1']), wgroup('g2', '后端', [])]
    const first = listOf(['w1'], groups)
    const second = listOf(['w1'], groups)

    // 分组 id 必须逐次一致，否则展开折叠状态会每次都重置
    expect(first.groups.map((s) => s.id)).toEqual(second.groups.map((s) => s.id))
  })
})

describe('归属反查', () => {
  it('reports the group that holds the workspace', () => {
    const sections = listOf(['w1', 'w2'], [wgroup('g1', '前端', ['w1'])]).groups

    expect(sections.find((each) => each.members.includes('w1'))?.id ?? '').toBe('g1')
  })

  it('reports an empty id for a workspace outside every group', () => {
    const sections = listOf(['w1', 'w2'], [wgroup('g1', '前端', ['w1'])]).groups

    // 空串对应菜单里的「不在任何工作区分组」这一事实
    expect(sections.find((each) => each.members.includes('w2'))?.id ?? '').toBe('')
  })

  it('reports an empty id when no group exists', () => {
    const sections: readonly { id: string; members: readonly string[] }[] = []
    expect(sections.find((each) => each.members.includes('w1'))?.id ?? '').toBe('')
  })
})

describe('sameMenuGroups', () => {
  it('treats rebuilt sections with the same ids and names as equal', () => {
    const a = [{ id: 'g1', label: '前端', }]
    const b = [{ id: 'g1', label: '前端', }]

    expect(sameMenuGroups(a, b)).toBe(true)
  })

  it('reports a renamed group as changed', () => {
    expect(
      sameMenuGroups(
        [{ id: 'g1', label: '前端', }],
        [{ id: 'g1', label: '后端', }],
      ),
    ).toBe(false)
  })

  it('reports an added group as changed', () => {
    expect(
      sameMenuGroups([{ id: 'g1', label: '前端', }], [
        { id: 'g1', label: '前端', },
        { id: 'g2', label: '后端', },
      ]),
    ).toBe(false)
  })

  it('treats a missing grouping as different from any list', () => {
    expect(sameMenuGroups(undefined, [])).toBe(false)
    expect(sameMenuGroups(undefined, undefined)).toBe(true)
  })
})

describe('listRoot with a pre-upgrade snapshot', () => {
  it('treats a missing grouping field as no workspace group', () => {
    // 旧宿主半边回的只有 byWorkspace 那一格
    const listing = listRoot({ workspaceIds: ['w1', 'w2'], virtualGroups: [], nesting: noNesting(['w1', 'w2']) })

    expect(listing.groups).toEqual([])
    expect(listing.loose).toEqual(['w1', 'w2'])
  })

  it('keeps every workspace loose rather than throwing', () => {
    expect(() =>
      listRoot({ workspaceIds: ['w1'], virtualGroups: [], nesting: noNesting(['w1']) }),
    ).not.toThrow()
  })
})
