import { describe, expect, it } from 'vitest'
import { TYPERT } from '../src/typert.ts'
import { REMOTE_CONTRIBUTION } from '../src/client/remote.ts'

/**
 * 两端清单的一致性
 *
 * 宿主清单由网关注册 endpoint，浏览器清单由 `$mount` 识别方法表
 * 两边对不上时的失败方式很难查：`$mount` 整体失败，区域退化成「没有分组」，而宿主那边一切正常
 */

/** 从任一侧的清单里取出「命名空间/方法」并连同它的形态 */
function shapeOf(descriptors: readonly { namespace: string; method: string; mode?: string }[]) {
  return descriptors
    .map((descriptor) => `${descriptor.namespace}/${descriptor.method}:${descriptor.mode ?? 'unary'}`)
    .sort()
}

describe('remote manifest parity', () => {
  it('declares the same endpoints on both halves', () => {
    const host = TYPERT.invocations as unknown as {
      namespace: string
      method: string
      mode?: string
    }[]
    const client = REMOTE_CONTRIBUTION.descriptors as unknown as {
      namespace: string
      method: string
      mode?: string
    }[]

    expect(shapeOf(client)).toEqual(shapeOf(host))
  })

  it('declares the snapshot feed as a stream on both halves', () => {
    // 形态对不上比方法缺失更隐蔽：单边声明成 stream 时网关直接拒收，浏览器看到的是一次静默失败
    type Entry = { method: string; mode?: string; cancellation?: { parameter: string } }
    const host = (TYPERT.invocations as unknown as Entry[]).find(
      (invocation) => invocation.method === 'followSnapshotChanges',
    )
    const client = (REMOTE_CONTRIBUTION.descriptors as unknown as Entry[]).find(
      (descriptor) => descriptor.method === 'followSnapshotChanges',
    )

    expect(host?.mode).toBe('stream')
    expect(client?.mode).toBe('stream')
    // 两边的取消形参都按网关约定写成 signal
    expect(host?.cancellation).toEqual({ parameter: 'signal' })
    expect(client?.cancellation).toEqual({ parameter: 'signal' })
  })
})
