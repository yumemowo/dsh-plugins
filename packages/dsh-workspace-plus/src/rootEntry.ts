/**
 * 根节点条目的键
 *
 * 列表最外层只有两类条目：真实工作区与工作区分组
 * 「聚焦 / 最近使用 / 置顶」三份记录都按这个键存，因此键自带类别前缀
 * 两类的 id 由不同生成器产出，但仍可能撞值，只存 id 会让一条记录在两种含义之间摇摆
 *
 * 宿主与浏览器半边共用这一层：宿主在删除工作区或分组时修剪记录，客户端据此把键还原成菜单里的条目
 */

/** 真实工作区的键前缀 */
export const ROOT_WORKSPACE_PREFIX = 'ws:'

/** 工作区分组的键前缀 */
export const ROOT_VIRTUAL_PREFIX = 'vw:'

/** 真实工作区的条目键 */
export function rootWorkspaceKey(workspaceId: string): string {
  return ROOT_WORKSPACE_PREFIX + workspaceId
}

/** 工作区分组的条目键 */
export function rootVirtualKey(groupId: string): string {
  return ROOT_VIRTUAL_PREFIX + groupId
}

/**
 * 解析一个条目键
 *
 * 前缀不认识时返回 undefined 而不是抛错：键来自持久化记录，界面必须能在读到一条来路不明的记录时继续渲染
 * @param key - 形如 `<前缀><id>` 的条目键（见本模块顶部）
 * @returns 键指向的对象，前缀不认识时为 undefined
 */
export function parseRootEntryKey(
  key: string,
): { kind: 'workspace' | 'virtual'; id: string } | undefined {
  if (key.startsWith(ROOT_WORKSPACE_PREFIX)) {
    return { kind: 'workspace', id: key.slice(ROOT_WORKSPACE_PREFIX.length) }
  }
  if (key.startsWith(ROOT_VIRTUAL_PREFIX)) {
    return { kind: 'virtual', id: key.slice(ROOT_VIRTUAL_PREFIX.length) }
  }
  return undefined
}
