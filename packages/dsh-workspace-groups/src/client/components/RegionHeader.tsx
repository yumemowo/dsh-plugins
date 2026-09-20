/**
 * 区域的 section header
 *
 * 几何与官方 WorkspaceBrowser 的 `.sectionHeader` 一致：36px 高、左侧标题
 * 最多占 45%、右侧一组 28px 圆形图标按钮（间距 4px）
 *
 * 「搜索 + 视图选项 + 新建工作区分组 + 添加工作区」四个入口同属右侧那一组，
 * 紧挨着排在栏的右缘。把这一组推向右缘的是搜索槽位自己的 `margin-left: auto`
 *（官方 `.searchSlot` 就是这么写的），其余入口因此紧跟其后，彼此只有 4px 间距
 *
 * 搜索展开时标题向左收拢淡出、右侧入口组整体向右收拢淡出（与官方
 * `.sectionLabelHidden` / `.headerActionsHidden` 同一取舍）——它们都整体移出，
 * 而不是留在原地把搜索框挤窄
 *
 * 右侧入口里只有视图选项仍未实现。它属于本包尚未提供的能力，按仓库
 * 「不留点不动的死按钮」的取舍渲染成 **disabled 占位**：位置与图标跟官方一致，
 * 但按钮自带 `disabled` 语义，悬停没有高亮，屏幕阅读器也读得出它不可用，
 * 而不是敲下去没反应
 *
 * 「新建工作区分组」排在「添加工作区」左侧：两者都是建造型入口，而建组是更轻
 * 的一步（不开 picking 交互、当场弹命名框），因此不占最右那个高频位置
 */
import type { ReactElement } from 'react'
import { IconPersonalizationOutline16 } from '../runtime.ts'
import { AddWorkspaceControl } from './AddWorkspaceControl.tsx'
import { VirtualWorkspaceCreateControl } from './VirtualWorkspaceCreateControl.tsx'
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
  /**
   * 「新建工作区分组」的入口文案；缺省时该入口不渲染
   *
   * 与「添加工作区」分开传：后者要有官方 directoryFlow 洞的占用者才出现，
   * 而建组只依赖本包的存储，两者在场条件不同
   */
  newVirtualWorkspace?: { label: string; onCreate: () => void } | undefined
  /** 本包命名空间的翻译座位，供错误框解析通用词 */
  t: RegionTranslate
}

export function RegionHeader({
  title,
  addWorkspace,
  search,
  viewOptionsLabel,
  newVirtualWorkspace,
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
        {newVirtualWorkspace === undefined ? null : (
          <VirtualWorkspaceCreateControl
            label={newVirtualWorkspace.label}
            narrow={false}
            onCreate={newVirtualWorkspace.onCreate}
          />
        )}
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
 * 官方 rail 下这些入口不是并排的一行：section header 里只留建造型入口
 *（36px 一个，与「新建工作区分组」并列），搜索是它们下方独立的一个 36px 块
 *（官方 rail 下那条搜索规则自带 `margin: 0 0 12px`）。标题与视图选项在窄栏
 * 都不渲染
 *
 * 搜索在这里点下去会先请求展开侧栏，等列滑动跑完再把焦点交给宽栏的输入框
 *（见 `useSearch`）。全部入口都不可用时整段不出现，不留空行
 */
export function RegionRailHeader({
  addWorkspace,
  search,
  newVirtualWorkspace,
  t,
}: {
  addWorkspace?: AddWorkspaceActions | undefined
  search?: { state: SearchState; labels: OfficialSearchLabels } | undefined
  newVirtualWorkspace?: { label: string; onCreate: () => void } | undefined
  t: RegionTranslate
}): ReactElement | null {
  if (addWorkspace === undefined && search === undefined && newVirtualWorkspace === undefined) {
    return null
  }
  const creates = addWorkspace !== undefined || newVirtualWorkspace !== undefined
  return (
    <>
      {/* header 行只在有建造型入口时出现；它为空时不留一行空高度 */}
      {!creates ? null : (
        <div className="wg-header wg-header-rail">
          {newVirtualWorkspace === undefined ? null : (
            <VirtualWorkspaceCreateControl
              label={newVirtualWorkspace.label}
              narrow
              onCreate={newVirtualWorkspace.onCreate}
            />
          )}
          {addWorkspace === undefined ? null : (
            <AddWorkspaceControl actions={addWorkspace} narrow t={t} />
          )}
        </div>
      )}
      {search === undefined ? null : (
        <SearchRailEntry search={search.state} labels={search.labels} />
      )}
    </>
  )
}
