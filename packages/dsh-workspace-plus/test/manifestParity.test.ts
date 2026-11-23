import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
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
describe('client dependency declarations', () => {
  /** 本包的清单 */
  const manifest = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as {
    dsh?: { client?: { inject?: readonly string[] } }
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
    engines?: { dsh?: string }
  }

  it('loads the menu registry before this plugin through dsh.client.inject', () => {
    // 本包在渲染期读 ctx.get('contextMenus')，加载顺序由这一段声明，不靠 inject 数组
    expect(manifest.dsh?.client?.inject).toContain('@deepseek-ai/dsh-client-ui-context-menu')
  })

  it('keeps that package out of peerDependencies', () => {
    // 官方 70 个客户端包里 69 个只声明 cordis 一个 peer；宿主判定兼容时只看 engines.dsh，
    // 多写一条 peer 只会让每个用户装完看到一条永远不满足的 warn
    expect(manifest.peerDependencies?.['@deepseek-ai/dsh-client-ui-context-menu']).toBeUndefined()
  })

  it('declares it as a type-only development dependency', () => {
    // 类型从它来（ContextMenuTargetMap 的 workspace 声明替本包盯住 path），运行期由宿主解析
    expect(manifest.devDependencies?.['@deepseek-ai/dsh-client-ui-context-menu']).toBeDefined()
  })
})
