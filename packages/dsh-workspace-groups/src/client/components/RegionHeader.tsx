/**
 * 区域的 section header
 *
 * 几何与官方 WorkspaceBrowser 的 `.sectionHeader` 一致：36px 高、左侧标题
 * 最多占 45%、右侧一组 28px 圆形图标按钮（间距 4px）
 *
 * 右侧三个入口里只有「添加工作区」有实现。搜索与视图选项属于本包尚未提供的
 * 能力，按仓库「不留点不动的死按钮」的取舍渲染成 **disabled 占位**：位置与
 * 图标跟官方一致，但按钮自带 `disabled` 语义，悬停没有高亮，屏幕阅读器也读
 * 得出它不可用，而不是敲下去没反应
 */
import type { ReactElement } from 'react'
import { IconPersonalizationOutline16, IconSearchOutline16 } from '../runtime.ts'
import { AddWorkspaceControl } from './AddWorkspaceControl.tsx'
import type { AddWorkspaceActions } from '../actions.ts'
import type { RegionTranslate } from '../locales.ts'

export interface RegionHeaderProps {
  /** 区域标题；官方在工作区视图下取 section.workspaces */
  title: string
  /** 「添加工作区」的官方服务面；缺省时该入口不渲染 */
  addWorkspace?: AddWorkspaceActions | undefined
  /** 搜索占位按钮的无障碍标签 */
  searchLabel: string
  /** 视图选项占位按钮的无障碍标签 */
  viewOptionsLabel: string
  /** 本包命名空间的翻译座位，供错误框解析通用词 */
  t: RegionTranslate
}

export function RegionHeader({
  title,
  addWorkspace,
  searchLabel,
  viewOptionsLabel,
  t,
}: RegionHeaderProps): ReactElement {
  return (
    <div className="wg-header">
      <span className="wg-header-label">{title}</span>
      <div className="wg-header-actions">
        {/* 尚未实现：位置与字形对齐官方，但明说不可用 */}
        <button type="button" className="wg-header-action" aria-label={searchLabel} disabled>
          <IconSearchOutline16 size={14} />
        </button>
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
 * 官方 rail 下 header 只留一个「添加工作区」按钮（36px、`label-primary`），
 * 标题与搜索入口都不渲染。没有可渲染的入口时整行不出现，不留空行
 */
export function RegionRailHeader({
  addWorkspace,
  t,
}: {
  addWorkspace?: AddWorkspaceActions | undefined
  t: RegionTranslate
}): ReactElement | null {
  if (addWorkspace === undefined) return null
  return (
    <div className="wg-header wg-header-rail">
      <AddWorkspaceControl actions={addWorkspace} narrow t={t} />
    </div>
  )
}
