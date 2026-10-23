/**
 * 行与容器在 DOM 上占的那几格，以及它们的名字
 *
 * 区域键与落点单位是两套标识：前者标「这一格接什么」，后者标「框与线该套住多大一块」。
 * 同一个区域键在两种关系里可以是不同的大小——工作区标题行承接「移出分组」时只是那一行，
 * 与它谈先后时却是整块工作区，因此单位另起一套命名空间
 *
 * 这里只答「叫什么」，不答「有哪些」：谁占哪几格由行自己带着，见 `data/outline.ts` 的 `OutlineRow`
 */
import type { ContainerNode } from './nest.ts'

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

// ── 落点单位 ──

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
