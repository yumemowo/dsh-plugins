import { describe, expect, it } from 'vitest'
import {
  adoptWrite,
  initialBookkeeping,
  requestReload,
  settleReload,
} from '../src/client/data/snapshotState.ts'

/**
 * 快照迁入的调度记账
 *
 * 三个来源并发到达，而「谁可以覆盖谁」只能是一条显式规则
 * 判错的后果不是报错，而是界面停在旧位置或来回跳，因此每一条都要单独钉住
 */

describe('snapshot bookkeeping', () => {
  it('issues the first reload immediately', () => {
    const requested = requestReload(initialBookkeeping())

    expect(requested.issue).toBe(1)
    expect(requested.state.inFlight).toBe(true)
  })

  it('queues a second request instead of issuing it while one is in flight', () => {
    // 并发发出去的两次 reload 之间没有先后，谁先回来取决于网络
    // 因此第二次只记「落地后再来一次」，不真的发出去
    const first = requestReload(initialBookkeeping())
    const second = requestReload(first.state)

    expect(second.issue).toBeUndefined()
    expect(second.state.dirty).toBe(true)
    expect(second.state.inFlight).toBe(true)
  })

  it('adopts the response of the request it issued', () => {
    const first = requestReload(initialBookkeeping())
    const settled = settleReload(first.state, first.issue ?? 0)

    expect(settled.adopt).toBe(true)
    expect(settled.followUp).toBe(false)
    expect(settled.state.accepted).toBe(1)
  })

  it('asks for a follow-up when a request arrived while one was in flight', () => {
    // 一次操作会推出多帧，落在同一窗口里的那些被并成一次补拉
    const first = requestReload(initialBookkeeping())
    const queued = requestReload(first.state)

    const settled = settleReload(queued.state, first.issue ?? 0)

    expect(settled.adopt).toBe(true)
    expect(settled.followUp).toBe(true)
  })

  it('drops a response older than the latest issued request', () => {
    // 迟到的旧响应会把已经画好的新内容盖回去，这正是「位置忽然跳回未归组区」的成因
    const first = requestReload(initialBookkeeping())
    const write = adoptWrite(first.state)

    const settled = settleReload(write, first.issue ?? 0)

    expect(settled.adopt).toBe(false)
  })

  it('lets a write invalidate every reload already in flight', () => {
    // 写入的返回值比任何在途 reload 都新
    const first = requestReload(initialBookkeeping())
    const write = adoptWrite(first.state)

    expect(write.accepted).toBeGreaterThan(first.issue ?? 0)
    expect(write.dirty).toBe(false)
  })

  it('issues the next reload after a settled one', () => {
    // 结账之后必须能再发：卡在「在途」会让之后的推送再也触发不了 reload 
    const first = requestReload(initialBookkeeping())
    const settled = settleReload(first.state, first.issue ?? 0)
    const second = requestReload(settled.state)

    expect(second.issue).toBe(2)
  })

  it('clears the in-flight mark even when a response is dropped', () => {
    // 失败与过期都走同一条结账路径，漏掉这一格会让之后的 reload 永远发不出去
    const first = requestReload(initialBookkeeping())
    const write = adoptWrite(first.state)
    const settled = settleReload(write, first.issue ?? 0)

    expect(settled.state.inFlight).toBe(false)
  })
})
