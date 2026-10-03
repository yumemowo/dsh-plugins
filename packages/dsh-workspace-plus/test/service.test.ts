import { describe, expect, it } from 'vitest'
import { createWorkspaceGroupsService } from '../src/service.ts'
import { workspaceGroupsSpec, workspaceTreeSchema } from '../src/spec.ts'
import { ALL_ENTRIES, virtualAddress, workspaceAddress } from '../src/rootEntry.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Group } from '../src/spec.ts'

/**
 * 一个内存版的存储域替身
 *
 * 只实现服务实际用到的那部分契约（`open` / `table` / `effect`）
 * 这样测试聚焦分组逻辑本身，而不是存储后端的持久化细节
 */
function createFakeContext(initialGlobal?: unknown): {
  ctx: Context
  records: Map<string, { groups: Group[] }>
  /** 落盘的那份 global（未解析的原始形状），读取时按真实 schema 解析 */
  readStored: () => unknown
} {
  const records = new Map<string, { groups: Group[] }>()

  const table = {
    get: (key: string) => records.get(key),
    entries: () => records.entries(),
    put: async (key: string, value: { groups: Group[] }) => {
      records.set(key, value)
    },
    delete: async (key: string) => records.delete(key),
  }

  // 根节点那份（工作区分组 + 菜单三份记录）走域的 global 槽位，这里同样只实现
  // 服务用到的那部分
  //
  // 写入要过一遍真实的 schema，真域只在持久读边界上校验，`global.set` 的契约
  // 写明「不在这里复查」，因此写进去一份形状不对的 global 只会在下一次 open 时
  // 才炸。替身若只做赋值，这一类错误在本文件里永远看不见
  // 未给初值时按「旧宿主写的那份」起步，没有 picker 那一格，正是真实文件里的形状
  let stored: unknown = initialGlobal ?? { virtualWorkspaces: [] }
  const global = {
    get: () => workspaceTreeSchema.parse(stored),
    set: async (value: unknown) => {
      stored = JSON.parse(JSON.stringify(workspaceTreeSchema.parse(value)))
    },
  }

  const ctx = {
    storageDomain: {
      open: async (spec: unknown) => {
        expect(spec).toBe(workspaceGroupsSpec)
        return { table: () => table, global, close: async () => {} }
      },
    },
    effect: (install: () => () => void) => install(),
  } as unknown as Context

  return { ctx, records, readStored: () => stored }
}

describe('workspace groups service', () => {
  it('reports no groups before anything is written', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    expect(await service.list()).toEqual({
      byWorkspace: {},
      nesting: {},
      workspaceGroups: [],
      picker: { focused: ALL_ENTRIES, recent: [], pinned: [] },
      nested: true,
      pinnedVisibleCount: 5,
      pinnedLimit: 20,
    })
  })

  it('reports the two pinned settings from the live config', async () => {
    const { ctx } = createFakeContext()
    // 两个可调项是 volatile 引用：改动不重跑 apply，因此服务必须每次现读
    let visible = 3
    const config = {
      pinnedVisibleCount: { get: () => visible },
      pinnedLimit: { get: () => 7 },
    } as unknown as Parameters<typeof createWorkspaceGroupsService>[1]
    const service = await createWorkspaceGroupsService(ctx, config)

    expect((await service.list()).pinnedVisibleCount).toBe(3)
    expect((await service.list()).pinnedLimit).toBe(7)

    visible = 8
    expect((await service.list()).pinnedVisibleCount).toBe(8)
  })

  it('creates a group under its workspace', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    const snapshot = await service.createGroup('w1', '前端')

    expect(snapshot.byWorkspace['w1']?.map((g) => g.name)).toEqual(['前端'])
    expect(snapshot.byWorkspace['w1']?.[0]?.sessionIds).toEqual([])
  })

  it('reports two workspaces independently', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    await service.createGroup('w1', '前端')
    await service.createGroup('w2', '后端')

    const snapshot = await service.list()

    expect(Object.keys(snapshot.byWorkspace).sort()).toEqual(['w1', 'w2'])
  })

  it('assigns a session to the requested group', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const created = await service.createGroup('w1', '前端')
    const groupId = created.byWorkspace['w1']?.[0]?.id ?? ''

    const snapshot = await service.moveSession('w1', 's1', groupId)

    expect(snapshot.byWorkspace['w1']?.[0]?.sessionIds).toEqual(['s1'])
  })

  it('moves a session between groups without leaving a duplicate', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const first = await service.createGroup('w1', '第一')
    const firstId = first.byWorkspace['w1']?.[0]?.id ?? ''
    const second = await service.createGroup('w1', '第二')
    const secondId = second.byWorkspace['w1']?.[1]?.id ?? ''
    await service.moveSession('w1', 's1', firstId)

    const snapshot = await service.moveSession('w1', 's1', secondId)

    const groups = snapshot.byWorkspace['w1'] ?? []
    expect(groups[0]?.sessionIds).toEqual([])
    expect(groups[1]?.sessionIds).toEqual(['s1'])
  })

  it('returns a session to ungrouped when the group is null', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const created = await service.createGroup('w1', '前端')
    const groupId = created.byWorkspace['w1']?.[0]?.id ?? ''
    await service.moveSession('w1', 's1', groupId)

    const snapshot = await service.moveSession('w1', 's1', null)

    expect(snapshot.byWorkspace['w1']?.[0]?.sessionIds).toEqual([])
  })

  it('rejects a move into an unknown group', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    await service.createGroup('w1', '前端')

    await expect(service.moveSession('w1', 's1', 'nope')).rejects.toThrow(/unknown group/)
  })

  it('renames a group in place', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const created = await service.createGroup('w1', '旧名')
    const groupId = created.byWorkspace['w1']?.[0]?.id ?? ''

    const snapshot = await service.renameGroup('w1', groupId, '新名')

    expect(snapshot.byWorkspace['w1']?.[0]?.name).toBe('新名')
  })

  it('deletes a group while releasing its sessions back to ungrouped', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const created = await service.createGroup('w1', '前端')
    const groupId = created.byWorkspace['w1']?.[0]?.id ?? ''
    await service.moveSession('w1', 's1', groupId)

    const snapshot = await service.deleteGroup('w1', groupId)

    // 最后一个分组被删除后整条工作区记录一并消失，因此该工作区回到「没有任何分组」
    // 其会话即未分组
    const remaining = snapshot.byWorkspace['w1'] ?? []
    expect(remaining).toEqual([])
    expect(remaining.some((group) => group.sessionIds.includes('s1'))).toBe(false)
  })

  it('removes the workspace record once its last group is deleted', async () => {
    const { ctx, records } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const created = await service.createGroup('w1', '前端')
    const groupId = created.byWorkspace['w1']?.[0]?.id ?? ''

    await service.deleteGroup('w1', groupId)

    // 空记录不该留在存储里，否则未分组的工作区会不断堆积死数据
    expect(records.has('w1')).toBe(false)
  })

  it('gives each group a distinct id', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    await service.createGroup('w1', '第一')
    const snapshot = await service.createGroup('w1', '第二')

    const ids = (snapshot.byWorkspace['w1'] ?? []).map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })
})

/**
 * 根节点上的工作区分组
 *
 * 与会话分组是两个层级的概念，走域的 global 槽位而不是表
 * 这一段固化它的几条结构约束：一个工作区至多属于一个分组、删除只解散分组
 * 工作区删除后归属记录被清掉
 */
describe('root-level workspace groups', () => {
  it('reports no workspace groups before anything is written', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    expect((await service.list()).workspaceGroups).toEqual([])
  })

  it('creates a workspace group at the root', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    const created = await service.createVirtualWorkspace('前端')

    expect(created.workspaceGroups.map((g) => g.name)).toEqual(['前端'])
    expect(created.workspaceGroups[0]?.workspaceIds).toEqual([])
  })

  it('keeps the root tree independent from the per-workspace records', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    await service.createGroup('w1', '会话分组')
    const created = await service.createVirtualWorkspace('工作区分组')

    // 两者是不同层级：建工作区分组不会碰任何工作区的会话分组记录
    expect(created.byWorkspace['w1']?.map((g) => g.name)).toEqual(['会话分组'])
    expect(created.workspaceGroups.map((g) => g.name)).toEqual(['工作区分组'])
  })

  it('moves a workspace into the requested group', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const created = await service.createVirtualWorkspace('前端')
    const groupId = created.workspaceGroups[0]?.id ?? ''

    const moved = await service.moveWorkspace('w1', groupId)

    expect(moved.workspaceGroups[0]?.workspaceIds).toEqual(['w1'])
  })

  it('leaves a workspace in one group only when moving it again', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const first = (await service.createVirtualWorkspace('第一')).workspaceGroups[0]?.id ?? ''
    // 新建的分组追加在末尾，因此第二个要从末位取——取 [0] 拿到的还是第一个
    const groups = (await service.createVirtualWorkspace('第二')).workspaceGroups
    const second = groups[groups.length - 1]?.id ?? ''
    await service.moveWorkspace('w1', first)

    const moved = await service.moveWorkspace('w1', second)

    // 移入新分组要自动从原分组摘除，否则同一个工作区会渲染两次
    expect(moved.workspaceGroups.find((g) => g.id === first)?.workspaceIds).toEqual([])
    expect(moved.workspaceGroups.find((g) => g.id === second)?.workspaceIds).toEqual(['w1'])
  })

  it('removes a workspace from every group when the target is null', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    await service.moveWorkspace('w1', groupId)

    const moved = await service.moveWorkspace('w1', null)

    expect(moved.workspaceGroups[0]?.workspaceIds).toEqual([])
  })

  it('rejects a move into an unknown workspace group', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    await expect(service.moveWorkspace('w1', 'nope')).rejects.toThrow(/unknown workspace group/)
  })

  it('renames a workspace group in place', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('旧名')).workspaceGroups[0]?.id ?? ''

    const renamed = await service.renameVirtualWorkspace(groupId, '新名')

    expect(renamed.workspaceGroups[0]?.name).toBe('新名')
  })

  it('releases the workspaces when a workspace group is deleted', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    await service.moveWorkspace('w1', groupId)

    const deleted = await service.deleteVirtualWorkspace(groupId)

    // 只解散分组：工作区本身不受影响，只是回到未归组
    expect(deleted.workspaceGroups).toEqual([])
  })

  it('forgets a workspace that no longer exists', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    await service.moveWorkspace('w1', groupId)

    const forgotten = await service.forgetWorkspace('w1')

    // 工作区没了，留下的归属记录再也不会被渲染，读到的分组因此是干净的
    expect(forgotten.workspaceGroups[0]?.workspaceIds).toEqual([])
  })

  it('keeps the group when forgetting a workspace that is not in it', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    await service.moveWorkspace('w1', groupId)

    const forgotten = await service.forgetWorkspace('w2')

    expect(forgotten.workspaceGroups[0]?.workspaceIds).toEqual(['w1'])
  })

  it('gives each workspace group a distinct id', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    await service.createVirtualWorkspace('第一')
    const snapshot = await service.createVirtualWorkspace('第二')

    const ids = snapshot.workspaceGroups.map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })
})

/**
 * 菜单的聚焦 / 最近使用 / 置顶
 *
 * 三份记录与工作区分组同处 global 槽位，这一段固化它们与既有变更操作的配合：
 * 聚焦要落盘并保持最近一次在最前，删除对象时三处一起清掉
 */
describe('picker state', () => {
  it('starts empty', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    expect((await service.list()).picker).toEqual({ focused: ALL_ENTRIES, recent: [], pinned: [] })
  })

  it('records a focus with the newest first', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    await service.focusEntry(workspaceAddress('w1'))
    const focused = await service.focusEntry(virtualAddress('vg1'))

    expect(focused.picker.focused).toEqual(virtualAddress('vg1'))
    expect(focused.picker.recent).toEqual([virtualAddress('vg1'), workspaceAddress('w1')])
  })

  it('accepts the all address as a focus back to everything', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    await service.focusEntry(workspaceAddress('w1'))

    const cleared = await service.focusEntry(ALL_ENTRIES)

    expect(cleared.picker.focused).toEqual(ALL_ENTRIES)
    // 「全部」只改聚焦，不进历史：它不对应任何条目，记进来只会白挤掉一条真实历史
    expect(cleared.picker.recent).toEqual([workspaceAddress('w1')])
  })

  it('toggles a pin on and off', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    const on = await service.togglePinned(workspaceAddress('w1'))
    expect(on.picker.pinned).toEqual([workspaceAddress('w1')])

    const off = await service.togglePinned(workspaceAddress('w1'))
    expect(off.picker.pinned).toEqual([])
  })

  it('keeps the picker state when a workspace group is renamed', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('旧名')).workspaceGroups[0]?.id ?? ''
    await service.focusEntry(virtualAddress(groupId))
    await service.togglePinned(virtualAddress(groupId))

    const renamed = await service.renameVirtualWorkspace(groupId, '新名')

    // 改名不动 id，聚焦与置顶因此仍然指着同一个对象
    expect(renamed.picker.focused).toEqual(virtualAddress(groupId))
    expect(renamed.picker.pinned).toEqual([virtualAddress(groupId)])
  })

  it('clears a deleted group from all three records', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    const key = virtualAddress(groupId)
    await service.focusEntry(key)
    await service.togglePinned(key)

    const deleted = await service.deleteVirtualWorkspace(groupId)

    // 分组没了，聚焦若还指着它，列表会整片空掉而第二行写着一个不存在的名字
    expect(deleted.picker).toEqual({ focused: ALL_ENTRIES, recent: [], pinned: [] })
  })

  it('clears a forgotten workspace from all three records', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const key = workspaceAddress('w1')
    await service.focusEntry(key)
    await service.togglePinned(key)

    const forgotten = await service.forgetWorkspace('w1')

    expect(forgotten.picker).toEqual({ focused: ALL_ENTRIES, recent: [], pinned: [] })
  })

  it('keeps the picker state of other entries when one is deleted', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    await service.focusEntry(workspaceAddress('w2'))
    await service.focusEntry(workspaceAddress('w1'))
    await service.togglePinned(workspaceAddress('w2'))

    const forgotten = await service.forgetWorkspace('w1')

    expect(forgotten.picker).toEqual({
      focused: ALL_ENTRIES,
      recent: [workspaceAddress('w2')],
      pinned: [workspaceAddress('w2')],
    })
  })

  it('records a child workspace in its own record when it joins a parent group', async () => {
    // 归属记在子工作区自己那份记录上，一个子工作区因此天然只能有一个归属，也不跨工作区移动
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]

    const snapshot = await service.nestWorkspaces(['w2'], 'w1', group?.id ?? '')

    expect(snapshot.nesting['w2']).toEqual({ workspaceId: 'w1', groupId: group?.id })
    // 父分组里不追加成员，归属只有这一份
    expect(snapshot.byWorkspace['w1']?.[0]?.sessionIds).toEqual([])
  })

  it('moves a child to its new group instead of keeping two records', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const first = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    const second = (await service.createGroup('w1', '后端')).byWorkspace['w1']?.[1]
    await service.nestWorkspaces(['w2'], 'w1', first?.id ?? '')

    const snapshot = await service.nestWorkspaces(['w2'], 'w1', second?.id ?? '')

    expect(snapshot.nesting['w2']?.groupId).toBe(second?.id)
  })

  it('rejects a nest into a group that does not exist', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    await expect(service.nestWorkspaces(['w2'], 'w1', 'gone')).rejects.toThrow(
      /unknown group "gone"/,
    )
  })

  it('releases the nesting when the child is ungrouped', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    await service.nestWorkspaces(['w2'], 'w1', group?.id ?? '')

    const snapshot = await service.unnestWorkspaces(['w2'])

    expect(snapshot.nesting['w2']).toBeUndefined()
  })

  it('releases the children when their group is deleted', async () => {
    // 分组没了，指向它的归属就是一条悬空引用，留着只会让元数据与界面长期偏离
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    await service.nestWorkspaces(['w2', 'w3'], 'w1', group?.id ?? '')

    const snapshot = await service.deleteGroup('w1', group?.id ?? '')

    expect(snapshot.nesting).toEqual({})
  })

  it('releases the children when their parent workspace is forgotten', async () => {
    // 父没了，子工作区再也不会被渲染在它下面，归属留着就是死数据
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    await service.nestWorkspaces(['w2'], 'w1', group?.id ?? '')

    const snapshot = await service.forgetWorkspace('w1')

    expect(snapshot.nesting['w2']).toBeUndefined()
  })

  it('drops the nesting record together with the last group of a child', async () => {
    // 一份记录同时装会话分组与嵌套归属，两者都空时才删整条，不留一条空壳
    const { ctx, records } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    await service.nestWorkspaces(['w2'], 'w1', group?.id ?? '')

    await service.unnestWorkspaces(['w2'])

    expect(records.has('w2')).toBe(false)
  })

  it('clears every recorded nesting when nesting is turned off', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    await service.nestWorkspaces(['w2', 'w3'], 'w1', group?.id ?? '')

    const snapshot = await service.setNested(false)

    expect(snapshot.nested).toBe(false)
    // 关掉时归属整格为空，渲染侧因此只要读这一格，不必再自行判断开关
    expect(snapshot.nesting).toEqual({})
  })

  it('does not bring a cleared placement back when nesting is turned on again', async () => {
    // 关闭时归属已被清空，重新打开只恢复由 cwd 路径推导出的层级，不恢复那一次放入分组
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const group = (await service.createGroup('w1', '前端')).byWorkspace['w1']?.[0]
    await service.nestWorkspaces(['w2'], 'w1', group?.id ?? '')
    await service.setNested(false)

    const snapshot = await service.setNested(true)

    expect(snapshot.nested).toBe(true)
    expect(snapshot.nesting).toEqual({})
  })

  it('reads nesting as off from a global that says so', async () => {
    const { ctx } = createFakeContext({ virtualWorkspaces: [], nested: false })
    const service = await createWorkspaceGroupsService(ctx)

    expect((await service.list()).nested).toBe(false)
  })

  it('defaults nesting to on for a global written before the switch existed', async () => {
    const { ctx } = createFakeContext({ virtualWorkspaces: [] })
    const service = await createWorkspaceGroupsService(ctx)

    expect((await service.list()).nested).toBe(true)
  })

  it('reads back a global record written without the picker fields', async () => {
    // 旧宿主写的 global 没有这一格（真实文件里就是这个形状）
    // schema 的默认值要把它补成空状态，否则读一条旧文件就会整片区域打挂
    const { ctx } = createFakeContext({ virtualWorkspaces: [] })
    const service = await createWorkspaceGroupsService(ctx)

    expect((await service.list()).picker).toEqual({ focused: ALL_ENTRIES, recent: [], pinned: [] })
  })

  it('stores the picker records as tagged addresses rather than prefixed strings', async () => {
    // 落盘形状是持久化身份：工作区与工作区分组的 id 可能撞值，只存 id 会让一条记录在两种含义之间摇摆
    const { ctx, readStored } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    await service.focusEntry(virtualAddress(groupId))

    const stored = readStored() as { picker: { focused: unknown } }
    expect(stored.picker.focused).toEqual({ kind: 'virtual', id: groupId })
  })

  it('rejects a global whose picker holds a shape the schema does not know', async () => {
    // global 的校验在域打开时就跑，形状不认识就整份打不开，不会退化成空记录
    // 这是刻意的：静默把不认识的记录当空读会丢掉用户已有的聚焦与置顶
    const { ctx } = createFakeContext({
      virtualWorkspaces: [],
      picker: { focused: 'vw:wg1', recent: ['vw:wg1', '', 'ws:w1'], pinned: ['ws:w1'] },
    })

    const service = await createWorkspaceGroupsService(ctx)

    await expect(service.list()).rejects.toThrow()
  })

  it('writes a global that still parses on the next open', async () => {
    // 真域只在持久读边界上校验，因此「写进去的形状对不对」只有下次 open 才知道
    // 每个变更方法写回的 global 都必须带上三个字段，缺一个就等于把文件写坏
    const { ctx, readStored } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)
    const groupId = (await service.createVirtualWorkspace('前端')).workspaceGroups[0]?.id ?? ''
    await service.focusEntry(virtualAddress(groupId))
    await service.togglePinned(workspaceAddress('w1'))
    await service.moveWorkspace('w1', groupId)

    const stored = readStored() as { virtualWorkspaces: unknown[]; picker: unknown }
    expect(Object.keys(stored).sort()).toEqual(['nested', 'picker', 'virtualWorkspaces'])
    expect(stored.virtualWorkspaces).toHaveLength(1)
    expect(workspaceTreeSchema.safeParse(stored).success).toBe(true)
  })
})
