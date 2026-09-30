import { describe, expect, it } from 'vitest'
import { hostInfoSource } from '../src/client/hostInfo.ts'

/**
 * 宿主固定事实的读数
 *
 * 与官方 `ui-workspace` 的 `hostInfo` 源同形：快照直接读 `ctx.remote.$host`
 * 连接重置时通知订阅读者
 */
function fakeContext(home: string | undefined) {
  const listeners = new Set<() => void>()
  const context = {
    remote: { $host: { home, isLoopback: true } },
    on: (event: string, listener: () => void) => {
      if (event !== 'connection/reset') throw new Error(`unexpected event ${event}`)
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
  return {
    listeners,
    ctx: context as never,
  }
}

describe('hostInfoSource', () => {
  it('reads the host home from the remote face', () => {
    const { ctx } = fakeContext('/home/user')

    // 源交出的就是 $host 那份事实（本包只声明用到 home，运行期还有 isLoopback 等格）
    expect(hostInfoSource(ctx).getSnapshot().home).toBe('/home/user')
  })

  it('reports an undefined home before the first ready frame', () => {
    // 首个 ready 帧到达前 $host.home 是空的，卡片那时退回显示原始路径
    const { ctx } = fakeContext(undefined)

    expect(hostInfoSource(ctx).getSnapshot().home).toBeUndefined()
  })

  it('notifies subscribers when the connection resets', () => {
    // home 可能随重连换人，因此这条源必须可订阅而不是读一次的快照
    const { ctx, listeners } = fakeContext('/home/a')
    const source = hostInfoSource(ctx)
    let notified = 0
    const unsubscribe = source.subscribe(() => {
      notified += 1
    })

    expect(listeners.size).toBe(1)
    for (const listener of listeners) listener()
    expect(notified).toBe(1)

    unsubscribe()
    expect(listeners.size).toBe(0)
  })
})
