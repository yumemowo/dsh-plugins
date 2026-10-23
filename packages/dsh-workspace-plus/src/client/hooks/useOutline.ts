/**
 * 一整片区域的行序列
 *
 * 由容器算一次，向下交给渲染与拖拽两处：它们原本各算各的（渲染靠 `map` 套 `map` 现场展开、
 * 拖拽靠树按节点现算），同一件事算两遍，谁也不知道自己在整条序列里排第几
 *
 * 与 `useRegionLayout` 同一取舍：输入都是快照与偏好，`useMemo` 按输入列，
 * 因此流式期间的重渲染不会重算
 */
import { useMemo } from 'react'
import { buildOutline } from '../data/outline.ts'
import type { OutlineInput, OutlineRow } from '../data/outline.ts'
import { sessionScopeKey } from '../data/collapse.ts'
import type { SessionScopeRef } from '../data/collapse.ts'

/** 算出来的那一份：整条序列，以及按展示范围切好的索引 */
export interface Outline {
  /** 从上到下的全部行 */
  rows: readonly OutlineRow[]
  /**
   * 展示范围键 → 该段的那几行，按界面顺序
   *
   * 渲染逐个段取自己那几条时用它。索引在算序列的同一次遍历里建好，
   * 各消费方因此不必各自再滤一遍整条序列
   */
  scopes: ReadonlyMap<string, readonly OutlineRow[]>
}

/** 空序列：缺少输入时给一个稳定引用，免得每次渲染都新建一份 */
const EMPTY: Outline = { rows: [], scopes: new Map() }

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
    source.expansion,
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
  const scopes = new Map<string, OutlineRow[]>()
  for (const row of rows) {
    if (row.scope === undefined) continue
    const key = sessionScopeKey(row.scope)
    const bucket = scopes.get(key)
    if (bucket === undefined) scopes.set(key, [row])
    else bucket.push(row)
  }
  return { rows, scopes }
}

/**
 * 一段会话区段在序列里的那几行
 * @param outline - {@link useOutline} 的结果
 * @param ref - 哪一段
 * @returns 该段的行，按界面顺序；没有这一段时为空表
 */
export function rowsOfScope(outline: Outline, ref: SessionScopeRef): readonly OutlineRow[] {
  return outline.scopes.get(sessionScopeKey(ref)) ?? EMPTY.rows
}
