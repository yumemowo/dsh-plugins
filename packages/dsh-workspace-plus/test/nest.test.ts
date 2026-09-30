import { describe, expect, it } from 'vitest'
import {
  deriveNesting,
  descendantsOf,
  isAncestorPath,
  nearestAncestorForPath,
} from '../src/client/data/nest.ts'
import type { NestingBinding, NestingInput } from '../src/client/data/nest.ts'

/**
 * 子工作区嵌套的推导
 *
 * 这一层是纯函数：路径关系、虚拟工作区归属与落盘的归属一起决定每个工作区挂在哪个容器的哪个位置
 * 界面上的层级、缩进与折叠都由它交出的事实驱动，因此它的取舍在这里逐条钉住
 */

/** 造一份推导输入，只给关心的那几格，其余按空 */
function input(overrides: Partial<NestingInput> & Pick<NestingInput, 'workspaceIds'>): NestingInput {
  return {
    enabled: true,
    pathOf: () => undefined,
    virtualOf: () => '',
    bindingOf: () => undefined,
    groupIdsOf: () => new Set<string>(),
    ...overrides,
  }
}

/** 按一张路径表造 `pathOf` */
function pathsOf(table: Record<string, string>): (workspaceId: string) => string | undefined {
  return (workspaceId) => table[workspaceId]
}

describe('isAncestorPath', () => {
  it('treats a parent directory as an ancestor of its descendants', () => {
    expect(isAncestorPath('/repo', '/repo/a')).toBe(true)
    expect(isAncestorPath('/repo', '/repo/a/b')).toBe(true)
  })

  it('compares whole path segments rather than string prefixes', () => {
    // `/repo/a` 不是 `/repo/ab` 的祖先：字符串前缀会把这两个目录读成父子
    expect(isAncestorPath('/repo/a', '/repo/ab')).toBe(false)
  })

  it('does not treat a directory as its own ancestor', () => {
    expect(isAncestorPath('/repo', '/repo')).toBe(false)
    expect(isAncestorPath('/repo/', '/repo')).toBe(false)
  })

  it('handles trailing separators and windows-style paths', () => {
    expect(isAncestorPath('/repo/', '/repo/a/')).toBe(true)
    expect(isAncestorPath('C:\\repo', 'C:\\repo\\a')).toBe(true)
  })

  it('treats the filesystem root as an ancestor of everything below it', () => {
    expect(isAncestorPath('/', '/repo')).toBe(true)
    expect(isAncestorPath('/', '/repo/a')).toBe(true)
  })
})

describe('deriveNesting', () => {
  const tree = {
    w1: '/repo',
    w2: '/repo/a',
    w3: '/repo/a/b',
    w4: '/other',
  }

  it('nests each workspace under its nearest ancestor by path', () => {
    const nesting = deriveNesting(
      input({ workspaceIds: ['w1', 'w2', 'w3', 'w4'], pathOf: pathsOf(tree) }),
    )

    // 没有自己归属的后代落在父所在的那一段，它们自己再逐层向下带出后代
    expect(nesting.containerOf('w1')).toEqual({ kind: 'root' })
    expect(nesting.containerOf('w2')).toEqual({ kind: 'root' })
    expect(nesting.containerOf('w3')).toEqual({ kind: 'root' })
    expect(nesting.rootsOf(nesting.containers.root)).toEqual(['w1', 'w4'])
    // 段内层级与「整棵子树」都由这一份索引给出，父带出子，子再带出孙
    expect(nesting.childIdsOf('w1')).toEqual(['w2'])
    expect(nesting.childIdsOf('w2')).toEqual(['w3'])
    expect(nesting.ancestorsOf('w1')).toEqual([])
    expect(nesting.ancestorsOf('w3')).toEqual(['w2', 'w1'])
  })

  it('skips a missing intermediate workspace and attaches to the farther ancestor', () => {
    // 中间层没登记为工作区时层级不该整段断开：/repo/a/b 直接挂到 /repo
    const nesting = deriveNesting(
      input({ workspaceIds: ['w1', 'w3'], pathOf: pathsOf(tree) }),
    )

    expect(nesting.containerOf('w3')).toEqual({ kind: 'root' })
    expect(nesting.childIdsOf('w1')).toEqual(['w3'])
  })

  it('keeps the cwd hierarchy between workspaces of the same virtual workspace', () => {
    // 真实场景：一个项目下的工作区被收进同一个虚拟分组，收进去之后层级仍要保留
    // 否则它们会散成平铺的一排，读不出谁在谁下面
    const nesting = deriveNesting(
      input({
        workspaceIds: ['repo', 'pkg'],
        pathOf: pathsOf({
          repo: '/src/dsh_plugins',
          pkg: '/src/dsh_plugins/packages/dsh-workspace-plus',
        }),
        virtualOf: () => 'vg1',
      }),
    )

    expect(nesting.childIdsOf('repo')).toEqual(['pkg'])
    expect(nesting.ancestorsOf('pkg')).toEqual(['repo'])
    expect(nesting.rootsOf(nesting.containers.virtualOf('vg1'))).toEqual(['repo'])
  })

  it('leaves workspaces in different virtual workspaces unlinked', () => {
    // 两个虚拟分组里的工作区在列表上视为没有连接关系，即便路径上确实是父子
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w1', 'w2'],
        pathOf: pathsOf(tree),
        virtualOf: (id) => (id === 'w1' ? 'vg1' : 'vg2'),
      }),
    )

    expect(nesting.containerOf('w1')).toBe(nesting.containers.virtualOf('vg1'))
    expect(nesting.containerOf('w2')).toBe(nesting.containers.virtualOf('vg2'))
    expect(nesting.ancestorsOf('w2')).toEqual([])
  })

  it('places a grouped child inside that group of its parent', () => {
    const binding: Record<string, NestingBinding> = {
      w2: { workspaceId: 'w1', groupId: 'g1' },
    }
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w1', 'w2', 'w3'],
        pathOf: pathsOf(tree),
        bindingOf: (id) => binding[id],
        groupIdsOf: (id) => new Set(id === 'w1' ? ['g1'] : []),
      }),
    )

    // 放进分组的那个落在父体内的分组里，它名下的后代跟着它落在同一段
    expect(nesting.containerOf('w2')).toBe(nesting.containers.groupOf('w1', 'g1'))
    expect(nesting.containerOf('w3')).toBe(nesting.containers.groupOf('w1', 'g1'))
    expect(nesting.rootsOf(nesting.containers.groupOf('w1', 'g1'))).toEqual(['w2'])
    expect(nesting.groupedChildIdsOf('w1', 'g1')).toEqual(['w2'])
    expect(nesting.looseChildIdsOf('w1')).toEqual([])
  })

  it('ignores a binding whose group no longer exists', () => {
    // 分组被删除后归属成了一条悬空引用，退回按路径推导的位置，而不是整条丢掉这个工作区
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w1', 'w2'],
        pathOf: pathsOf(tree),
        bindingOf: () => ({ workspaceId: 'w1', groupId: 'gone' }),
        groupIdsOf: () => new Set<string>(),
      }),
    )

    expect(nesting.bindingOf('w2')).toBeUndefined()
    expect(nesting.containerOf('w2')).toEqual({ kind: 'root' })
    expect(nesting.looseChildIdsOf('w1')).toEqual(['w2'])
  })

  it('ignores a binding that crosses virtual workspaces', () => {
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w1', 'w2'],
        pathOf: pathsOf(tree),
        virtualOf: (id) => (id === 'w1' ? 'vg1' : 'vg2'),
        bindingOf: () => ({ workspaceId: 'w1', groupId: 'g1' }),
        groupIdsOf: () => new Set(['g1']),
      }),
    )

    expect(nesting.bindingOf('w2')).toBeUndefined()
  })

  it('ignores a binding whose parent is not a real ancestor', () => {
    // 归属记的是父，但路径上并不是父子，这种元数据不能生效，否则树会自相矛盾
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w1', 'w4'],
        pathOf: pathsOf(tree),
        bindingOf: () => ({ workspaceId: 'w1', groupId: 'g1' }),
        groupIdsOf: () => new Set(['g1']),
      }),
    )

    expect(nesting.bindingOf('w4')).toBeUndefined()
  })

  it('flattens every workspace when nesting is off', () => {
    const nesting = deriveNesting(
      input({
        enabled: false,
        workspaceIds: ['w1', 'w2', 'w3'],
        pathOf: pathsOf(tree),
        bindingOf: () => ({ workspaceId: 'w1', groupId: 'g1' }),
        groupIdsOf: () => new Set(['g1']),
      }),
    )

    // 关掉时每个工作区都退回自己那个容器的顶层，界面因此与没有这个特性时一致
    expect(nesting.rootsOf(nesting.containers.root)).toEqual(['w1', 'w2', 'w3'])
    expect(nesting.ancestorsOf('w2')).toEqual([])
    expect(nesting.ancestorsOf('w3')).toEqual([])
  })

  it('reports the ancestor chain from near to far', () => {
    const nesting = deriveNesting(
      input({ workspaceIds: ['w1', 'w2', 'w3'], pathOf: pathsOf(tree) }),
    )

    expect(nesting.ancestorsOf('w3')).toEqual(['w2', 'w1'])
  })

  it('treats a workspace without a path as a root of its own container', () => {
    const nesting = deriveNesting(
      input({ workspaceIds: ['w1', 'w9'], pathOf: pathsOf({ w1: '/repo' }) }),
    )

    expect(nesting.containerOf('w9')).toEqual({ kind: 'root' })
    expect(nesting.ancestorsOf('w9')).toEqual([])
  })

  it('keeps a workspace whose parent vanished at the root', () => {
    // 父工作区被删掉后，子工作区不能继续挂在它名下（那个 id 已经没有对应的行可渲染）
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w2'],
        pathOf: pathsOf(tree),
        bindingOf: () => ({ workspaceId: 'gone', groupId: 'g1' }),
        groupIdsOf: () => new Set(['g1']),
      }),
    )

    expect(nesting.containerOf('w2')).toEqual({ kind: 'root' })
  })
})

describe('nearestAncestorForPath', () => {
  const tree = { w1: '/repo', w2: '/repo/a', w3: '/repo/a/b' }

  it('finds the closest existing ancestor for a path that is not listed yet', () => {
    // 新增工作区时它还没进列表，因此要按路径而不是按 id 找父
    const parent = nearestAncestorForPath(
      ['w1', 'w2', 'w3'],
      pathsOf(tree),
      () => '',
      '/repo/a/c',
      '',
    )

    expect(parent).toBe('w2')
  })

  it('reports nothing when no listed workspace is above the path', () => {
    expect(
      nearestAncestorForPath(['w1'], pathsOf(tree), () => '', '/elsewhere', ''),
    ).toBeUndefined()
  })

  it('finds the ancestor among workspaces of the same virtual workspace', () => {
    // 目标也归属某个虚拟分组时，查询范围就是那个分组
    // 同一个项目下的工作区收进去之后，它们之间的 cwd 层级仍要保留
    const parent = nearestAncestorForPath(
      ['w1', 'w2', 'w3'],
      pathsOf(tree),
      (id) => (id === 'w3' ? '' : 'vg1'),
      '/repo/a/c',
      'vg1',
    )

    expect(parent).toBe('w2')
  })

  it('reports nothing when only another virtual workspace has an ancestor', () => {
    // 唯一在路径之上的工作区属于另一个虚拟分组：分属两个分组的工作区不相连
    // 与上一个用例的区别在于，这里是「真正的祖先不在作用范围内」，而不是目标自己不在
    expect(
      nearestAncestorForPath(
        ['w1', 'w2'],
        pathsOf({ w1: '/repo', w2: '/elsewhere' }),
        (id) => (id === 'w1' ? 'vg1' : 'vg2'),
        '/repo/a/c',
        'vg2',
      ),
    ).toBeUndefined()
  })
})

describe('descendantsOf', () => {
  const tree = { w1: '/repo', w2: '/repo/a', w3: '/repo/a/b', w4: '/other' }

  it('collects every descendant from near to far', () => {
    const descendants = descendantsOf(['w1', 'w2', 'w3', 'w4'], pathsOf(tree), () => '', 'w1')

    expect(descendants).toEqual(['w2', 'w3'])
  })

  it('collects descendants inside the same virtual workspace', () => {
    // 同一个虚拟分组里的父子照样算后代：收进分组不该把层级抹平
    const descendants = descendantsOf(
      ['w1', 'w2', 'w3'],
      pathsOf(tree),
      () => 'vg1',
      'w1',
    )

    expect(descendants).toEqual(['w2', 'w3'])
  })

  it('leaves out workspaces of another virtual workspace', () => {
    const descendants = descendantsOf(
      ['w1', 'w2', 'w3'],
      pathsOf(tree),
      (id) => (id === 'w2' ? 'vg1' : 'vg2'),
      'w1',
    )

    expect(descendants).toEqual(['w3'])
  })

  it('reports nothing for a workspace without a path', () => {
    expect(descendantsOf(['w1'], pathsOf({}), () => '', 'w1')).toEqual([])
  })

  it('hands out the same container instance for the same container', () => {
    // 容器在推导内部按身份寻址，查 rootsOf 必须交回发牌器交出的那个实例
    // 现造一个内容相同的节点查不到任何东西，表现是所有工作区都被当作非顶层而静默塌层
    const nesting = deriveNesting(
      input({
        workspaceIds: ['w1', 'w2', 'w3'],
        pathOf: pathsOf(tree),
        virtualOf: (id) => (id === 'w3' ? 'vg1' : ''),
        bindingOf: () => ({ workspaceId: 'w1', groupId: 'g1' }),
        groupIdsOf: () => new Set(['g1']),
      }),
    )

    expect(nesting.containers.virtualOf('vg1')).toBe(nesting.containers.virtualOf('vg1'))
    expect(nesting.containers.groupOf('w1', 'g1')).toBe(nesting.containers.groupOf('w1', 'g1'))
    expect(nesting.containers.root).toBe(nesting.containers.root)
    // 推导自己用的实例就是发牌器交出的那一个：w2 被放进 w1 的分组，w3 落在虚拟分组里
    expect(nesting.containerOf('w2')).toBe(nesting.containers.groupOf('w1', 'g1'))
    expect(nesting.containerOf('w3')).toBe(nesting.containers.virtualOf('vg1'))
    expect(nesting.rootsOf(nesting.containers.groupOf('w1', 'g1'))).toEqual(['w2'])
  })

  it('hands out a container for a virtual workspace with no members', () => {
    // 快照里可能有还没有任何成员的虚拟分组，它照样要能取到那一段的节点
    // 否则渲染空分组时查表落空，空态占位那一行跟着消失
    const nesting = deriveNesting(input({ workspaceIds: [] }))

    expect(nesting.containers.virtualOf('wg-empty')).toEqual({
      kind: 'virtual',
      groupId: 'wg-empty',
    })
    expect(nesting.rootsOf(nesting.containers.virtualOf('wg-empty'))).toEqual([])
    expect(nesting.rootsOf(nesting.containers.root)).toEqual([])
  })
})
