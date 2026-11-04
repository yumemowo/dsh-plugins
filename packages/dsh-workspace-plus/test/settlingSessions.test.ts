import { describe, expect, it } from 'vitest'
import { settlingSessionIds, straySessions } from '../src/client/data/sessions.ts'
import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'

/**
 * 归位中的会话
 *
 * 宿主分叉时先建会话、后把它挂进工作区，中间那段空窗里它既不属于任何工作区、又马上就会有归属
 * 若那段时间把它画进末尾的未分组桶，用户看到的就是「先出现在最下面，一跳回到源会话旁边」
 */

/** 造一份会话列表快照 */
function listState(ids: string[]): SessionListState {
  const byId: Record<string, unknown> = {}
  for (const id of ids) {
    byId[id] = {
      id,
      displayTitle: id,
      running: false,
      blank: false,
      agentAvailable: false,
      updatedAt: 1000,
    }
  }
  return { ids: [...ids], byId, phase: 'ready', projectionsBySession: {} } as unknown as SessionListState
}

/** 造一个工作区，成员表由调用方给定 */
function workspace(id: string, sessionIds: string[]): WorkspaceView {
  return {
    workspaceId: id,
    path: `/tmp/${id}`,
    title: id,
    sessionIds,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as unknown as WorkspaceView
}

describe('settlingSessionIds', () => {
  it('reports a session its group records but no workspace accounts for', () => {
    // 分叉刚建好会话、还没挂进工作区的那一刻就是这种形状
    const sessions = listState(['s-source', 's-child'])
    const settling = settlingSessionIds(new Set(['s-child']), [workspace('w1', ['s-source'])], sessions)

    expect([...settling]).toEqual(['s-child'])
  })

  it('reports nothing once the workspace accounts for it', () => {
    // 挂载完成之后这条会话就有归属了，不该再被当成归位中
    const sessions = listState(['s-source', 's-child'])
    const settling = settlingSessionIds(
      new Set(['s-child']),
      [workspace('w1', ['s-source', 's-child'])],
      sessions,
    )

    expect([...settling]).toEqual([])
  })

  it('ignores a record whose session is not in the list', () => {
    // 元数据比列表活得久，挂着一个列表里没有的 id 时无从渲染，谈不上归位
    const sessions = listState(['s-source'])
    const settling = settlingSessionIds(new Set(['s-gone']), [workspace('w1', ['s-source'])], sessions)

    expect([...settling]).toEqual([])
  })
})

describe('straySessions with settling sessions', () => {
  it('hides a session that is still settling', () => {
    // 画进未分组桶就是一闪：它马上要落进某个分组
    const sessions = listState(['s-source', 's-child'])
    const rows = straySessions(sessions, [workspace('w1', ['s-source'])], [], new Map(), new Set(['s-child']))

    expect(rows.map((row) => row.id)).toEqual([])
  })

  it('still reports a session no group records and no workspace accounts for', () => {
    // 工作区被删除后留下的会话必须照旧出现在末尾桶里，这一格不能因为归位判据一起被藏掉
    const sessions = listState(['s-orphan'])
    const rows = straySessions(sessions, [], [], new Map(), new Set())

    expect(rows.map((row) => row.id)).toEqual(['s-orphan'])
  })
})
