import { deriveNesting } from '../../src/client/data/nest.ts'
import type { NestingBinding } from '../../src/client/data/nest.ts'
import { buildOutline } from '../../src/client/data/outline.ts'
import type { OutlineRow } from '../../src/client/data/outline.ts'
import { indexOutline } from '../../src/client/data/dnd/outlineIndex.ts'
import type { OutlineIndex } from '../../src/client/data/dnd/outlineIndex.ts'
import { ALL_ENTRIES } from '../../src/rootEntry.ts'
import type { RootEntryAddress } from '../../src/rootEntry.ts'
import {
  groupHeadKey,
  looseKey,
  sessionGroupRegionKey,
  sessionGroupZoneKey,
  virtualRegionKey,
  virtualWorkspaceBodyKey,
  virtualWorkspaceHeadKey,
  workspaceBodyKey,
  workspaceHeadKey,
  workspaceRegionKey,
} from '../../src/client/data/dnd/protocol.ts'

/**
 * 按生产那条链装配一份索引
 *
 * 索引只吃行序列，序列只吃元数据与推导，因此夹具也照生产那条链走一遍：嵌套推导 → 行序列 → 索引
 * 直接手搓一份 rows 会让夹具与真实形状脱节，那正是这一层要避免的
 */
export interface OutlineFixture {
  /** 全部工作区 id，按注册表顺序 */
  workspaceIds: readonly string[]
  /** 工作区分组定义，数组序即界面序 */
  virtualGroups?: readonly { id: string; workspaceIds: readonly string[] }[]
  /** workspaceId → cwd */
  paths?: Record<string, string>
  /** 子工作区 → 它被放进的那个分组 */
  bindings?: Record<string, NestingBinding>
  /** 某个工作区名下真实存在的会话分组 */
  groupIds?: Record<string, string[]>
  /** 关掉嵌套时每个工作区都落成自己那个容器里的顶层 */
  nested?: boolean
  /**
   * 聚焦的条目地址，缺省是「全部工作区」
   *
   * 与区域组件同一处裁剪：聚焦后序列只列那一片的内容，索引因此也只该有那一片的节点
   */
  focused?: RootEntryAddress
}

/**
 * 装配一份索引，与渲染那条链同序
 * @param input - 见 {@link OutlineFixture}
 */
export function indexFrom(input: OutlineFixture): OutlineIndex {
  return indexOutline(outlineRowsFrom(input), { pathOf: (id) => input.paths?.[id] })
}

/**
 * 装配一条行序列，与渲染那条链同序
 *
 * 与 {@link indexFrom} 分开是为了让它可测：用例要拿「索引里有什么」与「行序列里有什么」对一遍
 * 两者对不上就说明索引自己又推了一遍
 * @param input - 见 {@link OutlineFixture}
 */
export function outlineRowsFrom(input: OutlineFixture): OutlineRow[] {
  const {
    workspaceIds,
    virtualGroups = [],
    paths = {},
    bindings = {},
    groupIds = {},
    nested = true,
    focused = ALL_ENTRIES,
  } = input
  const pathOf = (id: string): string | undefined => paths[id]
  const virtualOf = (id: string): string =>
    virtualGroups.find((group) => group.workspaceIds.includes(id))?.id ?? ''

  const nesting = deriveNesting({
    enabled: nested,
    workspaceIds,
    pathOf,
    virtualOf,
    bindingOf: (id) => bindings[id],
    groupIdsOf: (id) => new Set(groupIds[id] ?? []),
  })

  return buildOutline({
    workspaceIds,
    // 分组名与切分的判定无关，夹具按 id 兼作名字
    virtualGroups: virtualGroups.map((group) => ({
      id: group.id,
      name: group.id,
      workspaceIds: [...group.workspaceIds],
    })),
    rowsOf: () => [],
    groupsOf: (workspaceId) =>
      (groupIds[workspaceId] ?? []).map((id) => ({ id, name: id, sessionIds: [] })),
    nesting,
    focused,
    isScopeExpanded: () => false,
    alwaysVisibleSessionIds: new Set<string>(),
    now: 0,
    stray: [],
    compareRows: () => 0,
    keys: {
      workspaceHead: workspaceHeadKey,
      workspaceBody: workspaceBodyKey,
      workspaceRegion: workspaceRegionKey,
      sessionGroupHead: groupHeadKey,
      sessionGroupZone: sessionGroupZoneKey,
      sessionGroupRegion: sessionGroupRegionKey,
      virtualHead: virtualWorkspaceHeadKey,
      virtualBody: virtualWorkspaceBodyKey,
      virtualRegion: virtualRegionKey,
      loose: looseKey,
    },
  })
}
