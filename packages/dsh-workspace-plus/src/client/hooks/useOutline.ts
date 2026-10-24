/**
 * 一整片区域的行序列
 *
 * 由容器算一次，向下交给渲染与拖拽两处：渲染按它逐层展开，拖拽按它装配查询索引
 * 因此两处认的是同一批行，不存在「计划里有、界面上没有」的位置
 *
 * 与 `useRegionLayout` 同一取舍：输入都是快照与偏好，`useMemo` 按输入列，
 * 因此流式期间的重渲染不会重算
 */
import { useMemo } from 'react'
import { buildOutline } from '../data/outline.ts'
import type { OutlineInput, OutlineRow } from '../data/outline.ts'

/** 算出来的那一份：整条序列，以及按归属切好的索引 */
export interface Outline {
  /** 从上到下的全部行 */
  rows: readonly OutlineRow[]
  /**
   * 题头行的键 → 挂在它下面的那几行，按界面顺序
   *
   * 只收直接下层：一个工作区题头下面是它的子工作区题头、会话分组题头与它体内那几段。
   * 渲染按它逐层展开，因此不必再对着布局递归一遍
   */
  owners: ReadonlyMap<string, readonly OutlineRow[]>
}

/** 空序列：缺少输入时给一个稳定引用，免得每次渲染都新建一份 */
const EMPTY: Outline = { rows: [], owners: new Map() }

/**
 * 算一次行序列
 * @param source - 见 {@link OutlineInput}
 * @returns 整条序列与按段切好的索引
 */
export function useOutline(source: OutlineInput): Outline {
  return useMemo(
    () => outlineOf(source),
    [
      source.rootLayout,
      source.workspaceLayoutOf,
      source.depthOf,
      source.containers,
      source.isScopeExpanded,
      source.alwaysVisibleSessionIds,
      source.now,
      source.stray,
      source.hideStray,
      source.compareRows,
      source.keys,
    ],
  )
}

/**
 * 算一次行序列，不做缓存
 *
 * 与 {@link useOutline} 分开是为了让它可测：测试直接调这个，不必为一个纯函数搭一套 hook 环境
 * @param source - 见 {@link OutlineInput}
 * @returns 整条序列与按段切好的索引
 */
export function outlineOf(source: OutlineInput): Outline {
  const rows = buildOutline(source)
  const owners = new Map<string, OutlineRow[]>()
  for (const row of rows) {
    const bucket = owners.get(row.ownerKey)
    if (bucket === undefined) owners.set(row.ownerKey, [row])
    else bucket.push(row)
  }
  return { rows, owners }
}

/**
 * 挂在某个题头行下面的那几行
 * @param outline - {@link useOutline} 的结果
 * @param key - 题头行的键，空串表示最外层
 * @returns 直接下层那几行，按界面顺序；没有时为空表
 */
export function rowsUnder(outline: Outline, key: string): readonly OutlineRow[] {
  return outline.owners.get(key) ?? EMPTY.rows
}
