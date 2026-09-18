import { describe, expect, it } from 'vitest'
import { sessionStatus } from '../src/client/data/status.ts'
import type { SessionStatusLabels } from '../src/client/labels.ts'
import type { SessionRow } from '../src/client/data/types.ts'

/** 造一行会话渲染数据；只覆盖用例关心的字段 */
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
}

describe('sessionStatus', () => {
  it('reports no status for an idle session', () => {
    // 空闲不画点，槽位留空因此标题不位移。
    expect(sessionStatus(row(), undefined, labels)).toBeUndefined()
  })

  it('reports ongoing for a running session', () => {
    expect(sessionStatus(row({ running: true }), undefined, labels)).toEqual({
      state: 'ongoing',
      label: '进行中',
    })
  })

  it('reports done for a completed session', () => {
    expect(sessionStatus(row({ completed: true }), undefined, labels)).toEqual({
      state: 'done',
      label: '已完成',
    })
  })

  it('reports a warning for a session awaiting approval', () => {
    expect(sessionStatus(row(), 'approval', labels)).toEqual({
      state: 'warning',
      label: '等待审批',
    })
  })

  it('reports a warning for a session awaiting plan review', () => {
    expect(sessionStatus(row(), 'plan-review', labels)).toEqual({
      state: 'warning',
      label: '计划待审',
    })
  })

  it('reports a warning for a session awaiting an answer', () => {
    expect(sessionStatus(row(), 'question', labels)).toEqual({
      state: 'warning',
      label: '等待回答',
    })
  })

  it('reports only the warning while the session also runs', () => {
    // 待交互压过运行：用户要看的是「在等我」而不是「在跑」。
    expect(sessionStatus(row({ running: true }), 'approval', labels)?.state).toBe('warning')
  })

  it('reports ongoing when the session is running and completed', () => {
    // 运行压过完成提醒，避免刚跑完的行亮着绿色。
    expect(sessionStatus(row({ running: true, completed: true }), undefined, labels)?.state).toBe(
      'ongoing',
    )
  })

  it('reports ongoing with the count for a running subagent', () => {
    expect(sessionStatus(row({ runningSubagentCount: 2 }), undefined, labels)).toEqual({
      state: 'ongoing',
      label: '2 个子代理运行中',
    })
  })

  it('reports ongoing for a completed session with a running subagent', () => {
    expect(
      sessionStatus(row({ completed: true, runningSubagentCount: 1 }), undefined, labels)?.state,
    ).toBe('ongoing')
  })

  it('falls back to the run state for an unknown pending kind', () => {
    // 其他插件发布的交互种类不在侧边栏表意，忽略它而不是画一个没有文案的点。
    expect(sessionStatus(row({ running: true }), 'some-other-kind', labels)).toEqual({
      state: 'ongoing',
      label: '进行中',
    })
  })

  it('reports done for a completed session with an unknown pending kind', () => {
    expect(sessionStatus(row({ completed: true }), 'some-other-kind', labels)?.state).toBe('done')
  })

  it('reports no status for an idle session with an unknown pending kind', () => {
    expect(sessionStatus(row(), 'some-other-kind', labels)).toBeUndefined()
  })
})
