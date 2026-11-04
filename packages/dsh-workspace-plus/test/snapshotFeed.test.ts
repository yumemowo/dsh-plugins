import { describe, expect, it } from 'vitest'
import { createSnapshotFeed } from '../src/snapshotFeed.ts'
import type { SnapshotChange } from '../src/snapshotFeed.ts'

/**
 * 快照写入信号通道
 *
 * 它是「宿主写完了、已打开的界面据此 reload 」的唯一通路
 * 订阅方收不到或收早了都不会报错：界面只是停在旧内容上，因此每一条都得单独钉住
 */

/** 造一帧信号 */
function change(key: string): SnapshotChange {
  return { domain: 'workspace_plus', table: 'by_workspace', key, operation: 'put' }
}

/** 取迭代器的下一帧，带超时：等待不该把用例挂死 */
async function take(iterator: AsyncIterator<SnapshotChange>): Promise<unknown> {
  const timeout = new Promise((resolve) => setTimeout(() => resolve('timeout'), 50))
  return Promise.race([iterator.next(), timeout])
}

describe('snapshot feed', () => {
  it('delivers a published frame to a waiting subscriber', async () => {
    const feed = createSnapshotFeed()
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()

    const pending = take(iterator)
    feed.publish(change('ws-1'))
    const frame = await pending

    expect(frame).toEqual({ done: false, value: change('ws-1') })
    abort.abort()
  })

  it('delivers nothing before a frame is published', async () => {
    // 订阅之后不该凭空收到东西：界面拿到一帧就会 reload 一次快照
    const feed = createSnapshotFeed()
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()

    const frame = await take(iterator)

    expect(frame).toBe('timeout')
    abort.abort()
  })

  it('keeps every frame when several arrive in one subscription', async () => {
    // 连着两次写入时两帧都要到：少一帧就少一次 reload ，界面会停在只落了一笔的状态
    const feed = createSnapshotFeed()
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()

    feed.publish(change('ws-1'))
    feed.publish(change('ws-2'))

    expect(await iterator.next()).toEqual({ done: false, value: change('ws-1') })
    expect(await iterator.next()).toEqual({ done: false, value: change('ws-2') })
    abort.abort()
  })

  it('delivers one frame to every subscriber', async () => {
    // 同一份宿主服务上可能挂着好几个标签页的订阅
    const feed = createSnapshotFeed()
    const aborts = [new AbortController(), new AbortController()]
    const iterators = aborts.map((abort) => feed.follow(abort.signal)[Symbol.asyncIterator]())

    const pending = iterators.map((iterator) => take(iterator))
    feed.publish(change('ws-1'))
    const frames = await Promise.all(pending)

    for (const frame of frames) expect(frame).toEqual({ done: false, value: change('ws-1') })
    for (const abort of aborts) abort.abort()
  })

  it('carries which record the write touched', async () => {
    // 帧上的表与键今天不参与判断，但它们是后续按来源过滤的依据，丢了就补不回来
    const feed = createSnapshotFeed()
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()
    const frame: SnapshotChange = { domain: 'workspace_plus', table: '', key: '', operation: 'deleted' }

    const pending = take(iterator)
    feed.publish(frame)

    expect(await pending).toEqual({ done: false, value: frame })
    abort.abort()
  })

  it('ends the iteration when the caller aborts', async () => {
    // 界面卸载或热重载会中止订阅，迭代器必须结束，否则那条流永远挂着
    const feed = createSnapshotFeed()
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()

    abort.abort()

    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })

  it('stops delivering to a subscriber that already aborted', async () => {
    const feed = createSnapshotFeed()
    const abort = new AbortController()
    const iterator = feed.follow(abort.signal)[Symbol.asyncIterator]()
    abort.abort()

    feed.publish(change('ws-1'))

    expect(await iterator.next()).toEqual({ done: true, value: undefined })
  })
})
