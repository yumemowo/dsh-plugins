/**
 * 分组快照被写入的完成信号通道
 *
 * 宿主每次落盘之后推一帧，已打开的界面据此 reload 整份快照
 *
 * 信号取自存储域的 `domain/changed`：它在写盘确认之后才发，因此收到帧的一侧 reload 必定读到新内容
 * 这也意味着它覆盖全部写入方（另一个标签页、HTTP API、任何走网关的调用方），而不只是某一个入口
 *
 * 走本包自己的 remote 命名空间而不是官方转发事件
 * 转发事件源在 `dsh-api-gateway` 里是单例，已被 `dsh-api-remotes` 占住，插件再注册会直接抛错
 */

/**
 * 一帧写入信号
 *
 * 带的不只是「有变化」
 * 存储域给出的是「哪个域的哪张表、哪个键、什么操作」
 * 这段载荷足够让 client 根据需要按来源过滤掉自己刚写过的那一笔
 */
export interface SnapshotChange {
  /** 写入所属的存储域 */
  domain: string
  /** 表名，global 单例写时为空串 */
  table: string
  /** 记录键，global 单例写时为空串 */
  key: string
  /** 写入形态 */
  operation: 'put' | 'deleted'
}

/** 快照的写入信号通道 */
export interface SnapshotFeed {
  /** 推一帧给当前所有订阅者，没有订阅者时什么都不做 */
  publish(change: SnapshotChange): void
  /**
   * 订阅写入信号，直到传入的 signal 被中止
   *
   * 不重放历史：界面在订阅之前已经自己拉过一次快照，补发旧信号只会多一次无用的 reload 
   * @param signal - 调用方的取消信号，中止后迭代结束
   */
  follow(signal: AbortSignal): AsyncIterable<SnapshotChange>
}

/** 一个订阅者：待送的帧，以及唤醒它迭代器的出口 */
interface Subscriber {
  queue: SnapshotChange[]
  /** 迭代器此刻若在等，这就是那个 resolve */
  wake: (() => void) | undefined
}

/**
 * 建一条信号通道
 */
/*
 * 订阅者在 `follow` 被调用那一刻就在册，不等第一次迭代
 * 生成器要到首次 `next()` 才执行函数体，若把登记写在函数体里，订阅与迭代之间推来的帧会整批丢掉
 * 调用方那边是「先订阅、再读」，中间隔着一次 await
 */
export function createSnapshotFeed(): SnapshotFeed {
  const subscribers = new Set<Subscriber>()
  return {
    publish(change) {
      for (const subscriber of subscribers) {
        subscriber.queue.push(change)
        subscriber.wake?.()
      }
    },
    follow(abort) {
      const subscriber: Subscriber = { queue: [], wake: undefined }
      // signal 已经中止时连登记都省掉，迭代器会当场结束
      if (!abort.aborted) {
        subscribers.add(subscriber)
        // 消费方中途放弃迭代（没有 return()）时也要摘掉，否则这份订阅会一直留在册上
        abort.addEventListener('abort', () => subscribers.delete(subscriber), { once: true })
      }
      return {
        [Symbol.asyncIterator]: () => {
          const wakeUp = (resolve: () => void): void => {
            subscriber.wake = resolve
          }
          const ended = new Promise<void>((resolve) => {
            if (abort.aborted) resolve()
            else abort.addEventListener('abort', () => resolve(), { once: true })
          })
          return {
            async next(): Promise<IteratorResult<SnapshotChange>> {
              while (!abort.aborted) {
                const next = subscriber.queue.shift()
                if (next !== undefined) return { done: false, value: next }
                await Promise.race([new Promise<void>(wakeUp), ended])
                subscriber.wake = undefined
              }
              return { done: true, value: undefined }
            },
            async return(): Promise<IteratorResult<SnapshotChange>> {
              subscribers.delete(subscriber)
              return { done: true, value: undefined }
            },
          }
        },
      }
    },
  }
}
