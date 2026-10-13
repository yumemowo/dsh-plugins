/**
 * 会话段顺序位的段键
 *
 * 顺序位是「段有手动顺序」这件事的落盘形态，存在存储域 global 槽位的 `orderSlots` 里
 * 键只有下面这几种，取值是该段成员 id 的手动顺序，某一格缺省表示这一段按时间序渲染
 *
 * 两个半边共用这几个构造函数：浏览器半边不得引用宿主半边的模块，但形状要由一处钉住
 * 与 `pickerState.ts` 同一取舍——那一个也是两侧共用的纯形状
 */

/**
 * 一个会话分组段的顺序位键
 *
 * 与会话分组在 DOM 上的区域键无关：那一格是命中层用的，这一格是存储键
 * @param workspaceId - 分组所在的工作区
 * @param groupId - 分组 id
 */
export function groupSlotKey(workspaceId: string, groupId: string): string {
  return `group/${workspaceId}/${groupId}`
}

/**
 * 未归组段的顺序位键
 *
 * 宿主没有「未归组会话」这份名单，顺序因此只存在这一格里
 * @param workspaceId - 该段所属的工作区
 */
export function looseSlotKey(workspaceId: string): string {
  return `loose/${workspaceId}`
}

/**
 * 置顶段的顺序位键
 *
 * 跨工作区共用一格：置顶集合本身就是注册表全局的，不按工作区切分
 * 置顶区按它渲染，分组内就地置顶的名次也从同一份顺序取，两个表面因此永不打架
 */
export const PINNED_SLOT_KEY = 'pinned'
