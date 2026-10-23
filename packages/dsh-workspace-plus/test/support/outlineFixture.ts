import { buildLayout, buildRootLayout } from '../../src/client/data/layout.ts'
import { deriveNesting } from '../../src/client/data/nest.ts'
import type { NestingBinding } from '../../src/client/data/nest.ts'
import { buildOutline, indexOutline } from '../../src/client/data/outline.ts'
import type { OutlineIndex, OutlineRow } from '../../src/client/data/outline.ts'
import { focusedLayout, rootPickerEntries } from '../../src/client/data/picker.ts'
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
} from '../../src/client/data/protocol.ts'

/**
 * 按生产那条链装配一份索引
 *
 * 索引本身只吃行序列，因此夹具也照渲染那条链走一遍：嵌套推导 → 根节点布局与各工作区布局 → 行序列 → 索引
 * 直接手搓一份 rows 会让夹具与真实形状脱节，那正是这一层要避免的事
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
 * 与 {@link indexFrom} 分开是为了让它可测：用例要拿「索引里有什么」与「行序列里有什么」对一遍，
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

  // 分组名与索引的判定无关，夹具按 id 兼作名字
  const sections = virtualGroups.map((group) => ({
    id: group.id,
    name: group.id,
    workspaceIds: [...group.workspaceIds],
  }))
  const built = buildRootLayout(workspaceIds, sections, nesting)
  const entries = rootPickerEntries(
    built,
    new Map(
      workspaceIds.map((id) => [id, { workspaceId: id, path: paths[id], title: id, createdAt: '' }]),
    ) as never,
    nesting,
  )
  const layouts = new Map<string, ReturnType<typeof buildLayout>>()
  const layoutOf = (workspaceId: string): ReturnType<typeof buildLayout> => {
    const cached = layouts.get(workspaceId)
    if (cached !== undefined) return cached
    const built = buildLayout(
      [],
      (groupIds[workspaceId] ?? []).map((id) => ({ id, name: id, sessionIds: [] })),
      (groupId) => nesting.groupedChildIdsOf(workspaceId, groupId),
      nesting.looseChildIdsOf(workspaceId),
    )
    layouts.set(workspaceId, built)
    return built
  }

  return buildOutline({
    rootLayout: focusedLayout(built, entries, focused),
    workspaceLayoutOf: layoutOf,
    depthOf: (workspaceId) => nesting.levelOf(workspaceId),
    containers: {
      root: nesting.containers.root,
      virtualOf: nesting.containers.virtualOf,
      groupOf: nesting.containers.groupOf,
    },
    // 夹具一律全展开：索引只关心节点与容器，露面与否是渲染那一层的事
    expansion: {
      isWorkspaceExpanded: () => true,
      isVirtualWorkspaceExpanded: () => true,
      isGroupExpanded: () => true,
    },
    isScopeExpanded: () => false,
    alwaysVisibleSessionIds: new Set<string>(),
    now: 0,
    stray: [],
    hideStray: false,
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
