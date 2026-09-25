// @vitest-environment jsdom
/**
 * 构建产物的装载冒烟
 *
 * 单测直接 import 源码，产物里的问题（externals 解析、包装契约、图标名与新版 primitives 是否对得上）
 * 一律看不见。这里按宿主的方式把 `lib/client.js` 装一遍
 * 造一个 `window.__ModuleLoader__.load`，用假的 `require` 交出基线模块，再断言工厂能挂出插件
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/** 产物里的 require 请求，宿主从基线模块表解析 */
const BASELINE = new Set([
  'react',
  'react-dom',
  'react/jsx-runtime',
  'react-dom/client',
  '@deepseek-ai/dsh-client-ui-primitives',
])

/** 基线模块替身：图标是一个可断言的空组件 */
function baselineModule(name: string): unknown {
  if (name === '@deepseek-ai/dsh-client-ui-primitives') {
    const icon = (label: string) => () => label
    const nullComponent = () => null
    return {
      Menu: nullComponent,
      Button: nullComponent,
      Modal: nullComponent,
      Input: nullComponent,
      StateDot: nullComponent,
      Switch: nullComponent,
      Tooltip: ({ children }: { children: unknown }) => children,
      HoverCard: nullComponent,
      relativeTime: () => ({ unit: 'now', n: 0 }),
      IconFolderCloseRegular: icon('folder-close'),
      IconFolderOpenRegular: icon('folder-open'),
      IconTriangleRightFillRegular: icon('triangle'),
      IconEllipsisOutlineRegular: icon('ellipsis'),
      IconPlusOutlineRegular: icon('plus'),
      IconNewChatOutlineRegular: icon('new-chat'),
      IconEditOutlineRegular: icon('edit'),
      IconTrashOutlineRegular: icon('trash'),
      IconPanelLeftOutlineRegular: icon('panel-left'),
      IconBranchOutlineRegular: icon('branch'),
      IconArchiveOutlineRegular: icon('archive'),
      IconUnarchiveOutlineRegular: icon('unarchive'),
      IconChevronRightOutlineRegular: icon('chevron-right'),
      IconChevronDownOutlineRegular: icon('chevron-down'),
      IconCheckOutlineRegular: icon('check'),
      IconPinOutlineRegular: icon('pin'),
      IconPinFillRegular: icon('pin-fill'),
      IconWorkspaceTreeOutlineRegular: icon('workspace-tree'),
      IconProjectAddOutlineRegular: icon('project-add'),
      IconSearchOutlineRegular: icon('search'),
      IconSlidersTwoOutlineRegular: icon('sliders'),
      IconCloseFillRegular: icon('close'),
    }
  }
  if (name === 'react') return require('react')
  if (name === 'react-dom') return require('react-dom')
  if (name === 'react/jsx-runtime') return require('react/jsx-runtime')
  if (name === 'react-dom/client') return require('react-dom/client')
  throw new Error(`unexpected require: ${name}`)
}

describe('lib/client.js bundle', () => {
  /** 按宿主契约装载产物，返回工厂导出的模块 */
  function loadBundle(): Record<string, unknown> {
    const file = resolve(import.meta.dirname, '../lib/client.js')
    const source = readFileSync(file, 'utf8')

    let loaded: { id: string; exports: Record<string, unknown> } | undefined
    const loader = {
      load: (entry: { id: string; factory: (require: (name: string) => unknown) => unknown }) => {
        const exports = entry.factory((name: string) => {
          if (!BASELINE.has(name)) throw new Error(`bundle requires a non-baseline module: ${name}`)
          return baselineModule(name)
        })
        loaded = { id: entry.id, exports: exports as Record<string, unknown> }
      },
    }
    // 产物是给浏览器写的脚本，靠 window.__ModuleLoader__ 自注册
    ;(globalThis as { window?: unknown }).window = globalThis
    ;(globalThis as { __ModuleLoader__?: unknown }).__ModuleLoader__ = loader
    // eslint-disable-next-line no-new-func
    new Function(source)()
    if (loaded === undefined) throw new Error('bundle did not register itself')
    return { id: loaded.id, ...(loaded.exports as object) }
  }

  it('registers itself under the package name the client module table expects', () => {
    const mod = loadBundle() as { id?: string }

    expect(mod.id).toBe('@your-scope/dsh-workspace-groups')
  })

  it('exports the apply hook the client loader calls', () => {
    const mod = loadBundle() as { apply?: unknown }

    expect(typeof mod.apply).toBe('function')
  })

  it('produces a bundle whose only requires are baseline modules', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
    const requires = [...source.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1])
    const foreign = [...new Set(requires)].filter((name) => !BASELINE.has(name ?? ''))

    // 多出来的 require 会被宿主的模块表拒绝，表现为插件整体加载失败
    expect(foreign).toEqual([])
  })

  it('carries none of the icon names the 0.1.7-rc.1 primitives no longer export', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')
    const retired = [
      'IconFolderClose16',
      'IconFolderOpen16',
      'IconNewChatOutline16',
      'IconPlusOutline16',
      'IconEllipsisOutline16',
      'IconEditOutline16',
      'IconTrashOutline16',
      'IconPanelLeftOutline16',
      'IconBranchOutline16',
      'IconArchiveOutline20',
      'IconChevronRightOutline14',
      'IconChevronDownOutline14',
      'IconCheckOutline14',
      'IconCloseFill14',
      'IconTriangleRightFill14',
      'IconProjectAddOutline16',
      'IconSearchOutline16',
      'IconPersonalizationOutline16',
    ]

    // 这些名字已不在官方导出表里，产物里留一个就会在运行期解析成 undefined 并让整棵挂载失败
    expect(retired.filter((name) => source.includes(name))).toEqual([])
  })

  it('no longer references the third-party better-sidebar service', () => {
    const source = readFileSync(resolve(import.meta.dirname, '../lib/client.js'), 'utf8')

    expect(source).not.toContain('betterSidebar')
  })
})

describe('typert codec contract', () => {
  it('gives every codec a create() factory rather than a bare schema', async () => {
    const mod = await import('../src/typert.ts')
    const manifest = (mod as { default?: unknown }).default as {
      package: string
      face: string
      invocations: {
        id: string
        parameters?: { codec: Record<string, unknown> }[]
        result: Record<string, unknown>
      }[]
    }

    // 注册表只认 create()，给 schema 字段时清单会被校验器拒绝
    // 网关因此不注册 RPC endpoint，浏览器拿到 404，区域静默退化成「没有分组」
    expect(manifest.face).toBe('host')
    for (const invocation of manifest.invocations) {
      const codecs = [invocation.result, ...(invocation.parameters ?? []).map((p) => p.codec)]
      for (const codec of codecs) {
        expect(codec['mode']).toBe('strict')
        expect(typeof codec['typeSymbol']).toBe('string')
        expect(typeof codec['create']).toBe('function')
        // schema 字段与 create() 不能并存，它已不被读取，留着只会让人以为契约没变
        expect(codec).not.toHaveProperty('schema')
      }
    }
  })

  it('materializes each codec once and yields a usable zod schema', async () => {
    const mod = await import('../src/typert.ts')
    const manifest = (mod as { default?: unknown }).default as {
      invocations: { result: { create: () => unknown } }[]
    }
    const codec = manifest.invocations[0]?.result
    if (codec === undefined) throw new Error('manifest has no invocations')

    const first = codec.create()
    // 注册表会缓存首次物化结果，重复调用必须返回同一个实例
    expect(codec.create()).toBe(first)
    expect(typeof (first as { safeParse?: unknown }).safeParse).toBe('function')
  })
})
