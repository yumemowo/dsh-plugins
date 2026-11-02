/**
 * 一份扁平的行序列：界面上从上到下每占一行，这里就有一条
 *
 * 容器与行一起进序列： header 行（工作区分组、会话分组、工作区）、会话行、溢出按钮与空态都在其中
 *
 * 这一层做两件事：把元数据切成「谁在哪个分组里」，再把切出来的结果摊成界面顺序
 * 两件事必须一起做，分开就会变成两条推导，各算一遍同一件事
 *
 * 不碰 React、不碰 DOM，也不记几何：一行多高由样式表按内容决定，这一层只说顺序
 */
import { collapseSessionRows, sessionScopeKey } from './collapse.ts'
import type { SessionScopeRef } from './collapse.ts'
import type { ContainerNode } from './nest.ts'
import type { Group, VirtualWorkspace } from '../remote.ts'
import type { Nesting } from './nest.ts'
import { ALL_ENTRIES } from '../../rootEntry.ts'
import type { RootEntryAddress } from '../../rootEntry.ts'
import type { SessionRow } from './types.ts'

// ── 行 ──

/**
 * 一行的种类
 *
 * `overflow` 是那条「展开其余 n 个会话」的按钮，`empty` 是工作区体内的空态
 * 两者都占竖直高度，因此与行同样进序列
 */
export type OutlineRowKind =
  | 'virtualHead'
  | 'groupHead'
  | 'workspaceHead'
  | 'strayHead'
  | 'session'
  | 'overflow'
  | 'empty'

/** 界面上的一行 */
export interface OutlineRow {
  /**
   * 供 React 的 key 与调试日志用
   *
   * 只保证同一层的兄弟之间不重：会话 id 由宿主全局唯一，其余各类行的前缀各不相同
   */
  key: string
  kind: OutlineRowKind
  /**
   * 这一行属于哪一片
   *
   * 沿用 `nest` 的容器身份（同一次推导内同一容器恒交回同一实例），因此可以直接当 Map 的键
   */
  container: ContainerNode
  /**
   * 这一行挂在哪个 header 行之下，最外层时缺省
   *
   * 渲染按它分组即可，不必再从布局递归一遍
   */
  parent: OutlineRow | undefined
  /** 这一行挂在哪个工作区名下，根节点那一层与「未分组」桶为空串 */
  workspaceId: string
  /** 缩进层级，与 `nest` 的 `levelOf` 同值 */
  depth: number
  /** 这一行在 DOM 上占的那几格区域键 */
  zoneKeys: readonly string[]
  /** 落点单位标识，没有独立单位时为 undefined */
  regionKey: string | undefined
  /** 会话行与溢出按钮服务的那一段，别的种类为 undefined */
  scope?: SessionScopeRef | undefined
  /** 会话行的会话 id，别的种类为 undefined */
  sessionId?: string | undefined
  /**
   * 这一行是哪个分组的头
   *
   * `virtualHead` 是工作区分组，`groupHead` 是会话分组，别的种类为 undefined
   */
  groupId?: string | undefined
  /** header 行上的名字：工作区分组名或会话分组名，别的种类为 undefined */
  label?: string | undefined
  /**
   * header 行行尾那个数
   *
   * 工作区分组数名下全部工作区（含被嵌套的），会话分组数组内会话。别的种类为 undefined
   */
  count?: number | undefined
  /**
   * 这一行代言的那一段一共几条会话
   *
   * 只给会话分组的 header 行与工作区行（它代言未归组那一段）带这一格
   * 序列只交出露出来的那几条，判断「待揭示的那条是不是被收起了」要这个总数
   */
  total?: number | undefined
  /**
   * `virtualHead` 那一组名下的全部工作区 id，含被嵌套的那些
   *
   * 归属与容器不是一回事：一个工作区被放进某个会话分组后容器变了，它仍属于原来这个工作区分组
   */
  members?: readonly string[] | undefined
  /**
   * 会话行本身
   *
   * 渲染层因此不必再拿 id 回查一遍：序列里已经握着那一行，`sessionId` 只是它的键
   */
  row?: SessionRow | undefined
  /** 溢出按钮代言的条数，除 `overflow` 那一行之外都为 0 */
  hiddenCount: number
  /** 这一行所在的那一段此刻是否展开到全部，只有 `overflow` 那一行带这一格 */
  scopeExpanded: boolean
}

// ── 输入 ──

/**
 * 造 outline 要的全部输入
 *
 * 分组切分在这一层做：调用方交出元数据与推导结果，这一层决定「谁在哪个分组里、按什么顺序」
 */
export interface OutlineInput {
  /** 全部工作区 id，按宿主给的顺序 */
  workspaceIds: readonly string[]
  /** 工作区分组定义，按创建顺序 */
  virtualGroups: readonly VirtualWorkspace[]
  /** 一个工作区的全部会话行 */
  rowsOf: (workspaceId: string) => readonly SessionRow[]
  /** 一个工作区名下的会话分组，按创建顺序，含空分组 */
  groupsOf: (workspaceId: string) => readonly Group[]
  /** 层级推导：容器归属、父工作区、缩进层级都从它读 */
  nesting: Nesting
  /**
   * 当前聚焦的条目，缺省表示「全部工作区」
   *
   * 聚焦只改「谁进这一屏」，不改归属：聚焦一个分组时那一片的工作区整片进序列，但不重复列出组头
   */
  focused?: RootEntryAddress | undefined
  /** 各区段是否展开到全部行 */
  isScopeExpanded: (ref: SessionScopeRef) => boolean
  /** 始终展示并占额度的会话 id */
  alwaysVisibleSessionIds: ReadonlySet<string>
  /** 折叠判据的基准时刻 */
  now: number
  /** 末尾「未分组」桶里的会话行，已按该段的比较器排好 */
  stray: readonly SessionRow[]
  /** 会话行的排序比较器，与渲染用的是同一个 */
  compareRows: (a: SessionRow, b: SessionRow) => number
  /** 区域键的写法，由调用方交出：这一层不拼键，只把键记在行上 */
  keys: {
    workspaceHead: (workspaceId: string) => string
    workspaceBody: (workspaceId: string) => string
    workspaceRegion: (workspaceId: string) => string
    sessionGroupHead: (workspaceId: string, groupId: string) => string
    sessionGroupZone: (workspaceId: string, groupId: string) => string
    sessionGroupRegion: (workspaceId: string, groupId: string) => string
    virtualHead: (groupId: string) => string
    virtualBody: (groupId: string) => string
    virtualRegion: (groupId: string) => string
    loose: (workspaceId: string) => string
  }
}

// ── 根节点这一层 ──

/**
 * 一个工作区分组，以及它名下要列出来的那些工作区
 *
 * `members` 是归属，含被嵌套的那些，`roots` 是这一层真正画出来的那些
 * 两者开启嵌套时不同：`/repo` 与 `/repo/pkg` 都归属这个分组，但只有 `/repo` 在这一层
 */
export interface RootGroup {
  id: string
  label: string
  members: readonly string[]
  roots: readonly string[]
}

/**
 * 根节点这一层长什么样：有哪些分组、每段哪些工作区、哪些没有归组
 */
export interface RootListing {
  groups: readonly RootGroup[]
  /** 没有归入任何分组的工作区，只留最外层 */
  loose: readonly string[]
  /** 每个工作区归属哪个分组，不在任何分组里时为空串 */
  groupOf: ReadonlyMap<string, string>
}

/** 造一份根节点清单要的输入 */
export interface RootListingInput {
  /** 全部工作区 id，按宿主给的顺序 */
  workspaceIds: readonly string[]
  /** 工作区分组定义，按创建顺序 */
  virtualGroups: readonly VirtualWorkspace[]
  /** 层级推导：容器归属、父工作区、缩进层级都从它读 */
  nesting: Nesting
}

/**
 * 按工作区分组把工作区列表收成根节点这一层
 *
 * 分组定义里的 `workspaceIds` 只当归属集合用：组内的先后由注册表序决定，与那个数组的书写序无关
 * 这样顶层成员与子工作区共用同一个顺序来源，换位写入在各层读到的都是同一份序
 *
 * 元数据里存在、而列表里已经没有的工作区静默跳过，一个工作区被两个分组同时记录时以先出现的为准
 * @param allowed - 只留这些工作区，缺省表示全部
 */
export function listRoot(input: RootListingInput, allowed?: ReadonlySet<string> | undefined): RootListing {
  const known = new Set(input.workspaceIds)
  const groupOf = new Map<string, string>()
  for (const group of input.virtualGroups) {
    for (const id of group.workspaceIds) {
      if (!known.has(id) || groupOf.has(id)) continue
      groupOf.set(id, group.id)
    }
  }

  /** 一个容器里的顶层成员，按注册表序 */
  const topsOf = (container: ContainerNode, members: readonly string[]): string[] => {
    const roots = new Set(input.nesting.rootsOf(container))
    return members.filter((id) => roots.has(id))
  }

  const membersByGroup = new Map<string, string[]>()
  const looseMembers: string[] = []
  for (const id of input.workspaceIds) {
    if (allowed !== undefined && !allowed.has(id)) continue
    const groupId = groupOf.get(id)
    if (groupId === undefined) {
      looseMembers.push(id)
      continue
    }
    const list = membersByGroup.get(groupId)
    if (list === undefined) membersByGroup.set(groupId, [id])
    else list.push(id)
  }

  const groups: RootGroup[] = []
  for (const group of input.virtualGroups) {
    // 空分组照样列：它自己也占一行，组体里还有一句占位文案
    const members = membersByGroup.get(group.id) ?? []
    groups.push({
      id: group.id,
      label: group.name,
      members,
      roots: topsOf(input.nesting.containers.virtualOf(group.id), members),
    })
  }
  return {
    groups,
    loose: topsOf(input.nesting.containers.root, looseMembers),
    groupOf,
  }
}

/**
 * 聚焦之后这一层还剩什么
 *
 * - 聚焦一个工作区分组：那一组整片进来，但不再单列组头——第二行已经写着组名，再出现一次就是同一个名字并排两次
 * - 聚焦一个工作区：只有它自己
 * 调用方交来的 `focused` 必须是已经解析过的：记录比列表活得久，指向已消失对象的地址由调用方先换成 `all`
 * @param whole - 未聚焦时这一层的样子
 * @param focused - 当前生效的聚焦地址
 */
export function focusListing(whole: RootListing, focused: RootEntryAddress): RootListing {
  if (focused.kind === 'all') return whole
  if (focused.kind === 'workspace') {
    // 子工作区可能嵌在父工作区体内，因此不能靠这一层的名单判断它还在不在：那是上游解析过的事
    return { groups: [], loose: [focused.id], groupOf: whole.groupOf }
  }
  const group = whole.groups.find((each) => each.id === focused.id)
  // 解析不到就退回整片内容：记录比列表活得久，指向已消失的对象时不能把列表切成空的一片
  if (group === undefined) return whole
  // 组内整片进来，但这一层不再列出组头：它的成员直接平铺在最外层
  return { groups: [], loose: group.roots, groupOf: whole.groupOf }
}

/**
 * 一个工作区体内的会话切分
 *
 * `groups` 里每段只收它认领、且此刻还在列表里的那些行，`loose` 是没人认领的
 * 元数据里写着、而列表里已经没有的会话静默跳过，一条会话被两个分组同时记录时只归先出现的那个
 */
export interface WorkspaceRows {
  groups: readonly { id: string; label: string; rows: readonly SessionRow[] }[]
  loose: readonly SessionRow[]
}

/**
 * 把会话行按分组元数据切成「分组段 + 未归组」
 * @param rows - 本工作区的全部会话行
 * @param groups - 本工作区的分组定义，按创建顺序
 */
export function layoutWorkspaceRows(
  rows: readonly SessionRow[],
  groups: readonly Group[],
): WorkspaceRows {
  const byId = new Map(rows.map((row) => [row.id, row]))
  const claimed = new Set<string>()
  const sections: { id: string; label: string; rows: readonly SessionRow[] }[] = []
  for (const group of groups) {
    const owned: SessionRow[] = []
    for (const sessionId of group.sessionIds) {
      const row = byId.get(sessionId)
      if (row === undefined || claimed.has(sessionId)) continue
      claimed.add(sessionId)
      owned.push(row)
    }
    // 空分组照样列：它自己也占一行，组体里还有一句占位文案
    sections.push({ id: group.id, label: group.name, rows: owned })
  }
  return { groups: sections, loose: rows.filter((row) => !claimed.has(row.id)) }
}

// ── 构造 ──

/**
 * 把元数据与推导摊成一条扁平的行序列，顺序即界面上的顺序
 *
 * 根节点的分组段在前，其后是未归组的工作区，末尾「未分组」桶排在全部工作区之后
 * 一个工作区体内先是子工作区（先未归组那一段、再各会话分组），最后是未归组会话
 * @param input - 见 {@link OutlineInput}
 * @returns 从上到下的全部行
 */
export function buildOutline(input: OutlineInput): OutlineRow[] {
  const rows: OutlineRow[] = []
  const { nesting } = input
  const containers = nesting.containers
  const listing = focusListing(
    listRoot(input),
    input.focused ?? ALL_ENTRIES,
  )

  /**
   * 记下一行，并把那一行交回去
   *
   * @returns 刚记下的那一行本身，不是副本
   */
  const push = (
    row: Omit<OutlineRow, 'hiddenCount' | 'scopeExpanded' | 'parent'> & {
      hiddenCount?: number
      scopeExpanded?: boolean
    },
  ): OutlineRow => {
    const created: OutlineRow = {
      ...row,
      parent: owner,
      hiddenCount: row.hiddenCount ?? 0,
      scopeExpanded: row.scopeExpanded ?? false,
    }
    rows.push(created)
    return created
  }

  /** 下一个 header 行的归属：子树里的行都记它，缺省表示最外层 */
  let owner: OutlineRow | undefined

  /** 一个工作区区块 */
  const addWorkspace = (workspaceId: string, container: ContainerNode): void => {
    const rowsOfWorkspace = input.rowsOf(workspaceId)
    const split = layoutWorkspaceRows(rowsOfWorkspace, input.groupsOf(workspaceId))
    const looseChildren = nesting.looseChildIdsOf(workspaceId)
    const depth = nesting.levelOf(workspaceId)
    const headKey = 'workspace/' + workspaceId
    const outer: OutlineRow | undefined = owner
    let hasBody = false

    owner = push({
      key: headKey,
      kind: 'workspaceHead',
      container,
      workspaceId,
      depth,
      zoneKeys: [input.keys.workspaceHead(workspaceId), input.keys.workspaceBody(workspaceId)],
      regionKey: input.keys.workspaceRegion(workspaceId),
      total: split.loose.length,
    })

    // 子工作区排在会话分组之前，与分组内部同一顺序
    for (const childId of looseChildren) {
      hasBody = true
      addWorkspace(childId, container)
    }

    for (const group of split.groups) {
      const groupHeadKey = 'group/' + workspaceId + '/' + group.id
      const groupContainer = containers.groupOf(workspaceId, group.id)
      const inGroup = nesting.groupedChildIdsOf(workspaceId, group.id)
      const inner: OutlineRow | undefined = owner
      hasBody = true
      owner = push({
        key: groupHeadKey,
        kind: 'groupHead',
        container: groupContainer,
        workspaceId,
        depth,
        zoneKeys: [
          input.keys.sessionGroupHead(workspaceId, group.id),
          input.keys.sessionGroupZone(workspaceId, group.id),
        ],
        regionKey: input.keys.sessionGroupRegion(workspaceId, group.id),
        groupId: group.id,
        label: group.label,
        count: group.rows.length,
      })
      // 被放进这个分组的子工作区排在该组的会话之前，与组内的绘制顺序一致
      for (const childId of inGroup) addWorkspace(childId, groupContainer)
      addSessions({ kind: 'group', workspaceId, groupId: group.id }, group.rows, groupContainer, workspaceId, depth)
      owner = inner
    }

    if (split.loose.length > 0) hasBody = true
    addSessions(
      { kind: 'loose', workspaceId },
      split.loose,
      container,
      workspaceId,
      depth,
      input.keys.loose(workspaceId),
    )

    if (!hasBody) {
      push({
        key: 'empty/' + workspaceId,
        kind: 'empty',
        container,
        workspaceId,
        depth,
        zoneKeys: [],
        regionKey: undefined,
      })
    }
    owner = outer
  }

  /**
   * 一段会话行：折叠后的那些，再加一条溢出按钮
   *
   * @param presorted - 传进来的已经就是最终顺序，不必再排
   *   末尾「未分组」桶是这一档：容器交给它的是「置顶提前、其余维持列表原序」之后的结果
   *   再套一遍工作区那个按时间排的比较器会把置顶提前抹掉
   */
  function addSessions(
    scope: SessionScopeRef,
    all: readonly SessionRow[],
    container: ContainerNode,
    workspaceId: string,
    depth: number,
    zoneKey?: string,
    presorted = false,
  ): void {
    const sorted = presorted ? [...all] : [...all].sort(input.compareRows)
    const collapsed = collapseSessionRows(sorted, input.alwaysVisibleSessionIds, input.now)
    const expanded = input.isScopeExpanded(scope)
    const shown = expanded && collapsed.hiddenCount > 0 ? sorted : collapsed.rows
    for (const row of shown) {
      push({
        key: row.id,
        kind: 'session',
        container,
        workspaceId,
        depth,
        zoneKeys: zoneKey === undefined ? [] : [zoneKey],
        regionKey: undefined,
        scope,
        sessionId: row.id,
        row,
      })
    }
    if (collapsed.hiddenCount > 0) {
      push({
        key: 'overflow/' + sessionScopeKey(scope),
        kind: 'overflow',
        container,
        workspaceId,
        depth,
        zoneKeys: [],
        regionKey: undefined,
        scope,
        hiddenCount: collapsed.hiddenCount,
        scopeExpanded: expanded,
      })
    }
  }

  // 根节点：先各工作区分组段，再平铺的那些
  for (const section of listing.groups) {
    const virtualHeadKey = 'virtual/' + section.id
    owner = push({
      key: virtualHeadKey,
      kind: 'virtualHead',
      container: containers.root,
      workspaceId: '',
      depth: 0,
      zoneKeys: [input.keys.virtualHead(section.id), input.keys.virtualBody(section.id)],
      regionKey: input.keys.virtualRegion(section.id),
      groupId: section.id,
      label: section.label,
      count: section.members.length,
      members: section.members,
    })
    for (const workspaceId of section.roots) {
      addWorkspace(workspaceId, containers.virtualOf(section.id))
    }
    owner = undefined
  }
  for (const workspaceId of listing.loose) {
    addWorkspace(workspaceId, containers.root)
  }

  // 「未分组」桶不属于任何一片，聚焦到某一处时它整段不进序列
  if (input.stray.length > 0 && (input.focused ?? ALL_ENTRIES).kind === 'all') {
    owner = push({
      key: 'stray/head',
      kind: 'strayHead',
      container: containers.root,
      workspaceId: '',
      depth: 0,
      zoneKeys: [],
      regionKey: undefined,
      total: input.stray.length,
    })
    // 「未分组」桶的次序在容器那一层已经定好（置顶提前、其余维持列表原序），这里不再重排
    addSessions({ kind: 'stray' }, input.stray, containers.root, '', 0, undefined, true)
    owner = undefined
  }

  return rows
}
