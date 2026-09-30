/**
 * 根节点条目地址
 *
 * 列表最外层有两类条目：真实工作区与工作区分组
 * 「聚焦 / 最近使用 / 置顶」三份记录都按它存，因此它自带类别
 * 两类的 id 由不同生成器产出，但仍可能撞值，只存 id 会让一条记录在两种含义之间摇摆
 *
 * 「全部」是第三种取值：它不指向任何条目，而是「不聚焦」这件事本身
 * 因此它与另两类并列建模，而不是拿空串这类哨兵值冒充一个 id
 *
 * 这些取值会落盘（宿主存储域的 `picker` 三格），形状与字段名都是持久化身份
 * 宿主与浏览器半边共用这一层：宿主在删除工作区或分组时修剪记录，客户端据此把地址还原成菜单里的条目
 */

/** 指向某个真实条目的地址 */
export type EntryAddress =
  | { kind: 'workspace'; id: string }
  | { kind: 'virtual'; id: string }

/** 根节点条目地址，或「全部」 */
export type RootEntryAddress = EntryAddress | { kind: 'all' }

/** 「全部」：没有聚焦任何条目 */
export const ALL_ENTRIES: RootEntryAddress = { kind: 'all' }

/** 真实工作区的地址 */
export function workspaceAddress(workspaceId: string): EntryAddress {
  return { kind: 'workspace', id: workspaceId }
}

/** 工作区分组的地址 */
export function virtualAddress(groupId: string): EntryAddress {
  return { kind: 'virtual', id: groupId }
}

/**
 * 两个地址是否指向同一个条目
 *
 * 地址来自持久化记录、也来自当前列表，两处各自造对象，因此只能按值比较
 */
export function sameAddress(a: RootEntryAddress, b: RootEntryAddress): boolean {
  if (a.kind === 'all' || b.kind === 'all') return a.kind === b.kind
  return a.kind === b.kind && a.id === b.id
}

/**
 * 地址的稳定字符串形式
 *
 * 只供 React 的 `key` 这类需要「一个可比的字符串」的场合，不是持久化身份——持久化的是地址对象本身
 * 这里的 `ws:` / `vw:` 与 `client/menus.tsx` 的菜单项 id 前缀字面相同但用途无关：那些 id 是本次菜单渲染内的一次性选择标识，随便改不影响这里
 */
export function addressKey(address: RootEntryAddress): string {
  switch (address.kind) {
    case 'all':
      return 'all'
    case 'workspace':
      return `ws:${address.id}`
    case 'virtual':
      return `vw:${address.id}`
  }
}

/**
 * 把一份来路不明的值收成地址
 *
 * 记录来自持久化文件，也可能来自旧版本的宿主：形状不对时返回 undefined 而不是抛错，界面必须能在读到一条来路不明的记录时继续渲染
 * @returns 认得出来的地址，形状不对时为 undefined
 */
export function normalizeEntryAddress(value: unknown): RootEntryAddress | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const raw = value as { kind?: unknown; id?: unknown }
  if (raw.kind === 'all') return ALL_ENTRIES
  if (raw.kind !== 'workspace' && raw.kind !== 'virtual') return undefined
  if (typeof raw.id !== 'string') return undefined
  return { kind: raw.kind, id: raw.id }
}
