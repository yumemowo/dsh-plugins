import { describe, expect, it } from 'vitest'
import {
  rowStatusDot,
  sameSessionStatuses,
  sessionStatuses,
} from '../src/client/data/status.ts'
import type { SessionStatusLabels } from '../src/client/labels.ts'
import type { SessionRow } from '../src/client/data/types.ts'

/** 造一行会话渲染数据，只覆盖用例关心的字段 */
function row(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: 's1',
    title: 'S1',
    blank: false,
    running: false,
    runningSubagentCount: 0,
    completed: false,
    updatedAt: 0,
    ...overrides,
  }
}

const labels: SessionStatusLabels = {
  running: '进行中',
  subagentsRunning: (n) => `${n} 个子代理运行中`,
  waitingApproval: '等待审批',
  planReview: '计划待审',
  waitingAnswer: '等待回答',
  completed: '已完成',
  idle: '空闲',
}

/**
 * 行首那个点
 *
 * 判据是「空冷不画点」，其余与卡片的第一条一致，这里按 `rowStatusDot` 逐条覆盖
 */
describe('rowStatusDot', () => {
  /** 行首那个点：从同一份状态推导里取第一条，再按「有没有要提醒的事」取舍 */
  const dot = (r: SessionRow, pendingKind?: string) =>
    rowStatusDot(r, sessionStatuses(r, pendingKind, labels))

  it('reports no status for an idle session', () => {
    // 空闲不画点，槽位留空因此标题不位移
    expect(dot(row(), undefined)).toBeUndefined()
  })

  it('reports ongoing for a running session', () => {
    expect(dot(row({ running: true }), undefined)).toEqual({
      state: 'ongoing',
      label: '进行中',
    })
  })

  it('reports done for a completed session', () => {
    expect(dot(row({ completed: true }), undefined)).toEqual({
      state: 'done',
      label: '已完成',
    })
  })

  it('reports a warning for a session awaiting approval', () => {
    expect(dot(row(), 'approval')).toEqual({
      state: 'warning',
      label: '等待审批',
    })
  })

  it('reports a warning for a session awaiting plan review', () => {
    expect(dot(row(), 'plan-review')).toEqual({
      state: 'warning',
      label: '计划待审',
    })
  })

  it('reports a warning for a session awaiting an answer', () => {
    expect(dot(row(), 'question')).toEqual({
      state: 'warning',
      label: '等待回答',
    })
  })

  it('reports only the warning while the session also runs', () => {
    // 待交互压过运行：用户要看的是「在等我」而不是「在跑」
    expect(dot(row({ running: true }), 'approval')?.state).toBe('warning')
  })

  it('reports ongoing when the session is running and completed', () => {
    // 运行压过完成提醒，避免刚跑完的行亮着绿色
    expect(dot(row({ running: true, completed: true }), undefined)?.state).toBe(
      'ongoing',
    )
  })

  it('reports ongoing with the count for a running subagent', () => {
    expect(dot(row({ runningSubagentCount: 2 }), undefined)).toEqual({
      state: 'ongoing',
      label: '2 个子代理运行中',
    })
  })

  it('reports ongoing for a completed session with a running subagent', () => {
    expect(
      dot(row({ completed: true, runningSubagentCount: 1 }), undefined)?.state,
    ).toBe('ongoing')
  })

  it('falls back to the run state for an unknown pending kind', () => {
    // 其他插件发布的交互种类不在侧边栏表意，忽略它而不是画一个没有文案的点
    expect(dot(row({ running: true }), 'some-other-kind')).toEqual({
      state: 'ongoing',
      label: '进行中',
    })
  })

  it('reports done for a completed session with an unknown pending kind', () => {
    expect(dot(row({ completed: true }), 'some-other-kind')?.state).toBe('done')
  })

  it('reports no status for an idle session with an unknown pending kind', () => {
    expect(dot(row(), 'some-other-kind')).toBeUndefined()
  })
})

/**
 * 卡片要逐条列出状态，行首只取第一条
 *
 * 两者取自同一次推导，这里固化它们的差别只有那一层取舍：行上空闲不画点，卡片里
 * 空闲仍是一条（官方 `sessionStatuses` 就是这么给的）
 */
describe('sessionStatuses', () => {
  it('lists the idle state that the row dot omits', () => {
    const statuses = sessionStatuses(row(), undefined, labels)

    expect(statuses).toEqual([{ state: 'done', label: '空闲' }])
    // 同一次推导在行上被折成「不画点」
    expect(rowStatusDot(row(), statuses)).toBeUndefined()
  })

  it('lists the pending interaction before the running subagents', () => {
    // 待交互是主状态，子代理运行数是它的补充，两者都要出现在卡片里
    const statuses = sessionStatuses(
      row({ runningSubagentCount: 2 }),
      'approval',
      labels,
    )

    expect(statuses.map((status) => status.label)).toEqual(['等待审批', '2 个子代理运行中'])
  })

  it('lists the run state together with the running subagents', () => {
    const statuses = sessionStatuses(
      row({ running: true, runningSubagentCount: 1 }),
      undefined,
      labels,
    )

    expect(statuses.map((status) => status.label)).toEqual(['进行中', '1 个子代理运行中'])
  })

  it('lists a single entry when nothing supplements the primary state', () => {
    expect(sessionStatuses(row({ running: true }), undefined, labels)).toHaveLength(1)
    expect(sessionStatuses(row({ completed: true }), undefined, labels)).toHaveLength(1)
  })

  it('keeps the row dot in step with the first listed status', () => {
    // 两条路径必须落在同一个状态上，否则卡片与行首的点会各说一套：点就是第一条
    const running = row({ running: true, completed: true })
    const statuses = sessionStatuses(running, undefined, labels)

    expect(rowStatusDot(running, statuses)).toBe(statuses[0])
  })
})

describe('sameSessionStatuses', () => {
  it('compares the lists by content rather than by reference', () => {
    const first = sessionStatuses(row({ running: true }), undefined, labels)
    const second = sessionStatuses(row({ running: true }), undefined, labels)

    // 每次推导都是新数组，行级 memo 只能按内容比
    expect(first).not.toBe(second)
    expect(sameSessionStatuses(first, second)).toBe(true)
  })

  it('reports a change when a status appears or disappears', () => {
    const idle = sessionStatuses(row(), undefined, labels)
    const running = sessionStatuses(row({ running: true }), undefined, labels)

    expect(sameSessionStatuses(idle, running)).toBe(false)
    // 条数不同也要判定为变过，不能只看共同前缀
    expect(sameSessionStatuses([], idle)).toBe(false)
  })
})
