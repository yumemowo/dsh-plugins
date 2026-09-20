import { describe, expect, it } from 'vitest'
import { createWorkspaceGroupsService } from '../src/service.ts'
import { workspaceGroupsSpec } from '../src/spec.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Group } from '../src/spec.ts'

/**
 * 一个内存版的存储域替身
 *
 * 只实现服务实际用到的那部分契约（`open` / `table` / `effect`），
 * 这样测试聚焦分组逻辑本身，而不是存储后端的持久化细节
 */
function createFakeContext(): {
  ctx: Context
  records: Map<string, { groups: Group[] }>
  tree: { virtualWorkspaces: { id: string; name: string; workspaceIds: string[] }[] }
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

  // 根节点上的工作区分组走域的 global 槽位；这里同样只实现服务用到的那部分
  const tree = {
    virtualWorkspaces: [] as { id: string; name: string; workspaceIds: string[] }[],
  }
  const global = {
    get: () => tree,
    set: async (value: typeof tree) => {
      tree.virtualWorkspaces = value.virtualWorkspaces
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

  return { ctx, records, tree }
}

describe('workspace groups service', () => {
  it('reports no groups before anything is written', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    expect(await service.list()).toEqual({ byWorkspace: {}, workspaceGroups: [] })
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

    // 最后一个分组被删除后整条工作区记录一并消失，
    // 因此该工作区回到「没有任何分组」，其会话即未分组
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
 * 与会话分组是两个层级的概念，走域的 global 槽位而不是表；这一段固化它的
 * 几条结构约束：一个工作区至多属于一个分组、删除只解散分组、工作区删除后
 * 归属记录被清掉
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
