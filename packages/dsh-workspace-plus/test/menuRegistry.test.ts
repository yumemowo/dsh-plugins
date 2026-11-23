import { describe, expect, it } from 'vitest'
import { composeSessionMenu, registryMenuItems, separatorBeforeAt, sessionTarget, workspaceTarget } from '../src/client/menuRegistry.ts'
import type { RegistryActionView } from '../src/client/menuRegistry.ts'

/**
 * 官方右键菜单注册表到本包菜单的适配
 *
 * 三件事都在纯数据层：认不认得出服务、条目怎么换形状、两段怎么接
 * 面板渲染与 pointer 交互另有 DOM 用例覆盖，这里只钉住数据形状
 */

/** 造一条注册表条目 */
function view(id: string, extra: Partial<RegistryActionView> = {}): RegistryActionView {
  return { id, label: id.toUpperCase(), ...extra }
}

describe('sessionTarget', () => {
  it('carries the row identity and its current title', () => {
    expect(sessionTarget('s1', '标题')).toEqual({
      kind: 'session',
      value: { sessionId: 's1', displayTitle: '标题' },
    })
  })
})

describe('workspaceTarget', () => {
  it('keeps every field the registry providers read', () => {
    // path 不是可省的：官方的 open-in-app 那条按它 stat 目录
    expect(workspaceTarget({ workspaceId: 'w1', path: '/tmp/w', displayTitle: '工作区' })).toEqual({
      kind: 'workspace',
      value: { workspaceId: 'w1', path: '/tmp/w', displayTitle: '工作区' },
    })
  })

  it('leaves no field for a provider to guess', () => {
    const target = workspaceTarget({ workspaceId: 'w1', path: '/tmp/w', displayTitle: '工作区' })

    expect(Object.keys(target.value).sort()).toEqual(['displayTitle', 'path', 'workspaceId'])
  })
})

describe('registryMenuItems', () => {
  it('keeps the order and every presentation field', () => {
    const items = registryMenuItems(
      [view('pin'), view('rename', { disabled: true }), view('delete', { danger: true })],
      () => null,
    )

    expect(items.map((item) => item.id)).toEqual(['pin', 'rename', 'delete'])
    expect(items[1]?.disabled).toBe(true)
    expect(items[2]?.danger).toBe(true)
  })

  it('leaves the icon off when the key has no glyph', () => {
    const items = registryMenuItems([view('unknown.icon')], () => undefined)

    // 第三方插件可能注册了本包不认识的图标键，那一项只剩文字，菜单本身照常
    expect(items[0]?.icon).toBeUndefined()
  })

  it('resolves an icon through the supplied lookup', () => {
    const items = registryMenuItems([view('workspace.pin', { icon: { key: 'workspace.pin' } })], (key) => `icon:${key}`)

    expect(items[0]?.icon).toBe('icon:workspace.pin')
  })
})

describe('separatorBeforeAt', () => {
  it('draws a line only where the registry asked for one, and never first', () => {
    const views = [view('a', { separatorBefore: true }), view('b'), view('c', { separatorBefore: true })]

    // 第一条前面没有可分隔的东西，因此不画
    expect(separatorBeforeAt(views, 0)).toBe(false)
    expect(separatorBeforeAt(views, 1)).toBe(false)
    expect(separatorBeforeAt(views, 2)).toBe(true)
  })
})

describe('composeSessionMenu', () => {
  it('puts the registry segment first and the own segment after a separator', () => {
    const views = [view('pin'), view('rename')]
    const merged = composeSessionMenu(registryMenuItems(views, () => null), [{ id: 'move', label: '移动到…' }], views)

    expect(merged.map((entry) => ('type' in entry ? entry.type : entry.id)))
      .toEqual(['pin', 'rename', 'separator', 'move'])
  })

  it('keeps every registry entry when the own segment is empty', () => {
    const views = [view('pin')]
    const merged = composeSessionMenu(registryMenuItems(views, () => null), [], views)

    // 「未分组」桶里的会话没有归组项，此时不该多出一条空的分隔线
    expect(merged).toHaveLength(1)
  })

  it('falls back to the own segment when the registry has no entry', () => {
    // 注册表在场但没有插件为 session 注册动作（例如全部被权限挡掉）：本包自有的条目照常出现
    const merged = composeSessionMenu([], [{ id: 'move', label: '移动到…' }], [])

    expect(merged.map((entry) => ('type' in entry ? entry.type : entry.id))).toEqual(['move'])
  })
})
