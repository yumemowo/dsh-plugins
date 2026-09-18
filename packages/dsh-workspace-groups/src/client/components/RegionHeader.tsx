/**
 * 区域的 section header
 *
 * 几何与官方 WorkspaceBrowser 的 `.sectionHeader` 一致：36px 高、左侧标题
 * 最多占 45%、右侧一组 28px 圆形图标按钮（间距 4px）
 *
 * 「搜索 + 视图选项 + 添加工作区」三个入口同属右侧那一组，紧挨着排在栏的右缘。
 * 把这一组推向右缘的是搜索槽位自己的 `margin-left: auto`（官方 `.searchSlot`
 * 就是这么写的），后两个入口因此紧跟其后，三者之间只有 4px 间距
 *
 * 搜索展开时标题向左收拢淡出、视图选项与添加工作区向右收拢淡出（与官方
 * `.sectionLabelHidden` / `.headerActionsHidden` 同一取舍）——三者都整体移出，
 * 而不是留在原地把搜索框挤窄
 *
 * 右侧三个入口里只有视图选项仍未实现。它属于本包尚未提供的能力，按仓库
 * 「不留点不动的死按钮」的取舍渲染成 **disabled 占位**：位置与图标跟官方一致，
 * 但按钮自带 `disabled` 语义，悬停没有高亮，屏幕阅读器也读得出它不可用，
 * 而不是敲下去没反应
 */
import type { ReactElement } from 'react'
import { IconPersonalizationOutline16 } from '../runtime.ts'
import { AddWorkspaceControl } from './AddWorkspaceControl.tsx'
import { SearchEntry, SearchRailEntry } from './SearchControl.tsx'
import type { SearchState } from './SearchControl.tsx'
import type { AddWorkspaceActions } from '../actions.ts'
import type { OfficialSearchLabels } from '../official.ts'
import type { RegionTranslate } from '../locales.ts'

export interface RegionHeaderProps {
  /** 区域标题；官方在工作区视图下取 section.workspaces */
  title: string
  /** 「添加工作区」的官方服务面；缺省时该入口不渲染 */
  addWorkspace?: AddWorkspaceActions | undefined
  /** 搜索的状态面与文案；缺省时搜索入口不渲染 */
  search?: { state: SearchState; labels: OfficialSearchLabels } | undefined
  /** 视图选项占位按钮的无障碍标签 */
  viewOptionsLabel: string
  /** 本包命名空间的翻译座位，供错误框解析通用词 */
  t: RegionTranslate
}

export function RegionHeader({
  title,
  addWorkspace,
  search,
  viewOptionsLabel,
  t,
}: RegionHeaderProps): ReactElement {
  const expanded = search?.state.expanded === true
  return (
    <div className="wg-header">
      <span className={`wg-header-label${expanded ? ' wg-header-label-hidden' : ''}`}>
        {title}
      </span>
      {search === undefined ? null : <SearchEntry search={search.state} labels={search.labels} />}
      <div className={`wg-header-actions${expanded ? ' wg-header-actions-hidden' : ''}`}>
        {/* 尚未实现：位置与字形对齐官方，但明说不可用 */}
        <button
          type="button"
          className="wg-header-action"
          aria-label={viewOptionsLabel}
          disabled
        >
          <IconPersonalizationOutline16 />
        </button>
        {addWorkspace === undefined ? null : (
          <AddWorkspaceControl actions={addWorkspace} narrow={false} t={t} />
        )}
      </div>
    </div>
  )
}

/**
 * 窄栏区域的入口
 *
 * 官方 rail 下这两个入口不是并排的一行：section header 里只留「添加工作区」
 * 一个 36px 入口，搜索是它下方独立的一个 36px 块（官方 rail 下那条搜索规则
 * 自带 `margin: 0 0 12px`）。标题与视图选项在窄栏都不渲染
 *
 * 搜索在这里点下去会先请求展开侧栏，等列滑动跑完再把焦点交给宽栏的输入框
 *（见 `useSearch`）。两个入口都不可用时整段不出现，不留空行
 */
export function RegionRailHeader({
  addWorkspace,
  search,
  t,
}: {
  addWorkspace?: AddWorkspaceActions | undefined
  search?: { state: SearchState; labels: OfficialSearchLabels } | undefined
  t: RegionTranslate
}): ReactElement | null {
  if (addWorkspace === undefined && search === undefined) return null
  return (
    <>
      {/* header 行只在有添加入口时出现；它为空时不留一行空高度 */}
      {addWorkspace === undefined ? null : (
        <div className="wg-header wg-header-rail">
          <AddWorkspaceControl actions={addWorkspace} narrow t={t} />
        </div>
      )}
      {search === undefined ? null : (
        <SearchRailEntry search={search.state} labels={search.labels} />
      )}
    </>
  )
}
