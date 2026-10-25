/**
 * 行与容器在 DOM 上占的那几格，以及它们的名字
 *
 * 区域键与落点单位是两套标识：前者标「这一格接什么」，后者标「框与线该套住多大一块」。
 * 同一个区域键在两种关系里可以是不同的大小——工作区标题行承接「移出分组」时只是那一行，
 * 与它谈先后时却是整块工作区，因此单位另起一套命名空间
 *
 * 这里只答「叫什么」，不答「有哪些」：谁占哪几格由行自己带着，见 `data/outline.ts` 的 `OutlineRow`
 */
import type { ContainerNode } from '../nest.ts'
import type { DropUnit } from './protocol.ts'

/** 拖拽层认的一个节点身份：真实工作区或工作区分组 */
export type NodeRef =
  | { kind: 'workspace'; id: string }
  | { kind: 'virtual'; id: string }

// ── 区域键 ──

/**
 * 一个节点整块那一格的区域键
 *
 * 每个节点与容器都有这一格，因此它恒有值——根节点那一片的整块格就是 root
 * @param node - 节点或容器
 */
export function bodyKeyOf(node: NodeRef | ContainerNode): string {
  switch (node.kind) {
    case 'workspace':
      return `workspaceBody/${node.id}`
    case 'virtual':
      return `virtualWorkspaceBody/${node.id}`
    case 'group':
      return `sessionGroup/${node.workspaceId}/${node.groupId}`
    case 'root':
      return 'root'
  }
}

/**
 * 一个节点标题行那一格的区域键
 *
 * 根节点那一片没有标题行：它罩住整片列表，指针停在它那一层的任何空白上都读作回到根节点。
 * 把它表达成 undefined 而不是让每个调用方各自断言，是为了让「哪一格一定存在」由类型承担
 * @param node - 节点或容器
 * @returns 区域键，根节点那一片没有这一格
 */
export function headKeyOf(node: { kind: 'root' }): undefined
export function headKeyOf(node: Exclude<NodeRef | ContainerNode, { kind: 'root' }>): string
export function headKeyOf(node: NodeRef | ContainerNode): string | undefined {
  switch (node.kind) {
    case 'workspace':
      // 标题那一格既是同层换位的参照行，也是「移出会话分组」的落点
      return `workspaceHead/${node.id}`
    case 'virtual':
      // 分组节点自己占标题那一格，组体那一格由渲染层挂在它的撑开体上
      return `virtualWorkspaceHead/${node.id}`
    case 'group':
      return `groupHead/${node.workspaceId}/${node.groupId}`
    case 'root':
      return undefined
  }
}

/**
 * 一个节点在界面上占的全部区域键，标题格在前
 *
 * 根节点那一片只有整块那一格，因此它交回一项
 * @param node - 节点或容器
 */
export function zoneKeysOf(node: NodeRef | ContainerNode): readonly string[] {
  const body = bodyKeyOf(node)
  if (node.kind === 'root') return [body]
  return [headKeyOf(node), body]
}

/** 一个工作区体内未归组那一段的区域键 */
export function looseZoneKeyOf(workspaceId: string): string {
  return `loose/${workspaceId}`
}

// ── 一片在界面上的三件事 ──

/**
 * 一个节点当位次参照时用的行 id
 *
 * 与区域键、单位标识都不共用命名空间：前两者说的是「这一格在哪、框套多大」，
 * 这一格说的是「排到谁前后」。一片可能占好几格，其中只有标题那一格在 DOM 上带行标记，
 * 组体与体内那几格没有——它们由这里点名，否则读出来的是一串区域键当行 id
 *
 * 根节点那一片没有位次可言，因此没有这一格
 * @param node - 节点或容器
 * @returns 参照行 id，根节点为 undefined
 */
export function rowIdOf(node: { kind: 'root' }): undefined
export function rowIdOf(node: Exclude<NodeRef | ContainerNode, { kind: 'root' }>): string
export function rowIdOf(node: NodeRef | ContainerNode): string | undefined {
  switch (node.kind) {
    case 'workspace':
      return node.id
    case 'virtual':
      return node.id
    // 会话分组的成员 id 就是分组 id：谈先后用的序列是「这个工作区里各分组」那条
    case 'group':
      return node.groupId
    case 'root':
      return undefined
  }
}

/**
 * 一片在界面上的完整形状：占哪几格、框与线套住哪一块、谈先后时排到谁前后
 *
 * 三件事各有各的用处，而且**不总是同一个元素**：工作区标题那一格带着行标记，
 * 体内那一格没有；线要跨整块画，而检测要认那几格全部。把它们一次交出来，
 * 是因为它们描述的是同一片，分成三个函数就变成三处各写一遍、彼此可以分叉
 */
export interface AreaShape {
  /** 这一片占的那几格，标题格在前 */
  zones: readonly string[]
  /** 框与线套住的那一块，由渲染层写在 REGION_ATTRIBUTE 上；根节点那一片没有 */
  region: string | undefined
  /** 谈先后时排到谁前后；根节点那一片没有 */
  row: string | undefined
}

/**
 * 一处读数单位
 *
 * 形状里那两格可能没有（根节点那一片），而单位一格不缺地表达「这块在哪、排到谁前后」，
 * 因此这里把它们补齐成显式的无——少一处就是一处静默的退回
 * @param shape - 这一片的形状
 * @param seam - 这一条之后那处缝由哪一条代言
 */
export function unitOf(shape: AreaShape, seam?: string): DropUnit {
  return { region: shape.region, row: shape.row, seam }
}

/**
 * 一个节点那一片的形状
 *
 * 根节点那一片三样里缺两样（没有单位、没有位次）：它罩住整片列表，不参与排序。
 * 用可选格表达而不是另立一个形状，是因为调用方对两种情形做的是同一件事——
 * 有就用、没有就省下
 * @param node - 节点或容器
 */
export function areaShapeOf(node: NodeRef | ContainerNode): AreaShape {
  if (node.kind === 'root') return { zones: zoneKeysOf(node), region: undefined, row: undefined }
  return { zones: zoneKeysOf(node), region: regionKeyOf(node), row: rowIdOf(node) }
}

/**
 * 这一格是不是某个容器的**体内**
 *
 * 体内那一格是「装东西的地方」：分组的组体、工作区与虚拟分组的体内。它与标题格的意义不同——
 * 标题格是一个成员自己的位置，而体内那一格意味着**指针进到了它里面**。
 * 「这一片只在同一层接」那条判定要用这一条
 * @param key - 区域键
 */
export function isBodyZone(key: string): boolean {
  const shape = nodeOfZoneKey(key)
  return shape !== undefined && !shape.head && shape.node.kind !== 'root'
}

/**
 * 一个区域键属于哪个节点，以及这一格是不是标题格
 *
 * 检测层拿到的从来只是 DOM 上的两个值：区域键与行 id。要把它们换回「一片」，就得知道
 * 这个键指的是谁——键的形状由本模块一处决定，因此这条换算也放在这里，别处不许再解析一遍
 * @param key - 区域键
 * @returns 那个节点，以及这个键是不是它的标题格；认不出时 undefined
 */
export function nodeOfZoneKey(
  key: string,
): { node: NodeRef | ContainerNode; head: boolean } | undefined {
  const [head, first, second, third] = key.split('/')
  switch (head) {
    case 'workspaceHead':
      return first === undefined ? undefined : { node: { kind: 'workspace', id: first }, head: true }
    case 'workspaceBody':
      return first === undefined ? undefined : { node: { kind: 'workspace', id: first }, head: false }
    case 'virtualWorkspaceHead':
      return first === undefined ? undefined : { node: { kind: 'virtual', id: first }, head: true }
    case 'virtualWorkspaceBody':
      return first === undefined ? undefined : { node: { kind: 'virtual', id: first }, head: false }
    case 'groupHead':
      return first === undefined || second === undefined
        ? undefined
        : { node: { kind: 'group', workspaceId: first, groupId: second }, head: true }
    case 'sessionGroup':
      return first === undefined || second === undefined
        ? undefined
        : { node: { kind: 'group', workspaceId: first, groupId: second }, head: false }
    case 'loose':
      return first === undefined ? undefined : { node: { kind: 'workspace', id: first }, head: false }
    case 'root':
      return { node: { kind: 'root' }, head: false }
    default:
      // 置顶区与其它自制键：它们不是节点，由计划自己声明
      void second
      void third
      return undefined
  }
}

/**
 * 一个节点的落点单位标识
 *
 * 落点单位是「框与线该套住的整个范围」，它未必等于区域键：同一个区域键在两种关系里
 * 可以是不同的大小——工作区标题行承接「移出分组」时只是那一行，与它谈先后时却是整块工作区。
 * 因此单位另起一套标识，与区域键不共用命名空间。
 *
 * 没有子节点的行不在这里列：它们没有单位标记，自己就是自己的单位
 * @param node - 节点或容器
 * @returns 那一块的标识，根节点那一片没有单独的单位
 */
export function regionKeyOf(node: { kind: 'root' }): undefined
export function regionKeyOf(node: Exclude<NodeRef | ContainerNode, { kind: 'root' }>): string
export function regionKeyOf(node: NodeRef | ContainerNode): string | undefined {
  switch (node.kind) {
    case 'workspace':
      return `workspaceBlock/${node.id}`
    case 'virtual':
      return `virtualBlock/${node.id}`
    case 'group':
      return `sessionGroupBlock/${node.workspaceId}/${node.groupId}`
    case 'root':
      return undefined
  }
}