import { describe, expect, it } from 'vitest'
import {
  bodyKeyOf,
  headKeyOf,
  looseZoneKeyOf,
  regionKeyOf,
  zoneKeysOf,
} from '../src/client/data/dnd/zones.ts'
import type { NodeRef } from '../src/client/data/dnd/zones.ts'

/**
 * 区域键与落点单位的写法
 *
 * 这两套标识是 DOM 标记上的字符串字面量：改一个字就与渲染层写的标记对不上
 * 而类型看不出这件事——命中层查不到键时只是「拖到这一片上没反应」
 */

/** 一个工作区节点 */
function ws(id: string): NodeRef {
  return { kind: 'workspace', id }
}

/** 一个虚拟分组节点 */
function vg(id: string): NodeRef {
  return { kind: 'virtual', id }
}

describe('zone keys', () => {
  it('names a head zone and a body zone for the node kinds that have both', () => {
    // 六族键构造器收在一处之后，形状由这一条钉住：键就是 DOM 标记上的字符串
    expect(headKeyOf(ws('ws-1'))).toBe('workspaceHead/ws-1')
    // 整块那一格是它体内那一片：指针停在体内的子工作区或会话上时，仍算落在这一个工作区上
    expect(bodyKeyOf(ws('ws-1'))).toBe('workspaceBody/ws-1')
    expect(headKeyOf(vg('vg-1'))).toBe('virtualWorkspaceHead/vg-1')
    expect(bodyKeyOf(vg('vg-1'))).toBe('virtualWorkspaceBody/vg-1')
    expect(headKeyOf({ kind: 'group', workspaceId: 'ws-1', groupId: 'g1' })).toBe('groupHead/ws-1/g1')
    expect(bodyKeyOf({ kind: 'group', workspaceId: 'ws-1', groupId: 'g1' })).toBe(
      'sessionGroup/ws-1/g1',
    )
    // 根节点那一片只有整块那一格，它是全部「移出虚拟工作区分组」的兜底
    expect(bodyKeyOf({ kind: 'root' })).toBe('root')
    expect(headKeyOf({ kind: 'root' })).toBeUndefined()
    expect(looseZoneKeyOf('ws-1')).toBe('loose/ws-1')
  })

  it('hands back every zone a node fills, head first', () => {
    // 命中层按这一份给每个节点登记格子，「哪一格一定存在」由类型承担，不必调用方断言
    expect(zoneKeysOf(ws('ws-1'))).toEqual(['workspaceHead/ws-1', 'workspaceBody/ws-1'])
    expect(zoneKeysOf({ kind: 'root' })).toEqual(['root'])
  })

  it('names the block a node occupies, and nothing for the root stretch', () => {
    // 落点单位与区域键不共用命名空间：同一个区域键在两种关系里可以是不同的大小
    expect(regionKeyOf(ws('ws-1'))).toBe('workspaceBlock/ws-1')
    expect(regionKeyOf(vg('vg-1'))).toBe('virtualBlock/vg-1')
    expect(regionKeyOf({ kind: 'group', workspaceId: 'ws-1', groupId: 'g1' })).toBe(
      'sessionGroupBlock/ws-1/g1',
    )
    expect(regionKeyOf({ kind: 'root' })).toBeUndefined()
  })
})
