import { describe, expect, it } from 'vitest'
import { createWorkspaceGroupsService } from '../src/service.ts'
import { workspaceGroupsSpec } from '../src/spec.ts'
import type { Context } from '@deepseek-ai/cordis'
import type { Group } from '../src/spec.ts'

/**
 * 一个内存版的存储域替身。
 *
 * 只实现服务实际用到的那部分契约（`open` / `table` / `effect`），
 * 这样测试聚焦分组逻辑本身，而不是存储后端的持久化细节。
 */
function createFakeContext(): { ctx: Context; records: Map<string, { groups: Group[] }> } {
  const records = new Map<string, { groups: Group[] }>()

  const table = {
    get: (key: string) => records.get(key),
    entries: () => records.entries(),
    put: async (key: string, value: { groups: Group[] }) => {
      records.set(key, value)
    },
    delete: async (key: string) => records.delete(key),
  }

  const ctx = {
    storageDomain: {
      open: async (spec: unknown) => {
        expect(spec).toBe(workspaceGroupsSpec)
        return { table: () => table, close: async () => {} }
      },
    },
    effect: (install: () => () => void) => install(),
  } as unknown as Context

  return { ctx, records }
}

describe('workspace groups service', () => {
  it('reports no groups before anything is written', async () => {
    const { ctx } = createFakeContext()
    const service = await createWorkspaceGroupsService(ctx)

    expect(await service.list()).toEqual({ byWorkspace: {} })
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
    // 因此该工作区回到「没有任何分组」，其会话即未分组。
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

    // 空记录不该留在存储里，否则未分组的工作区会不断堆积死数据。
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
