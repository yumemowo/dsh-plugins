/**
 * 侧边栏窄栏（rail）形态：只保留一个展开入口
 *
 * 宽窄由 shell 决定；窄栏下不渲染任何列表内容，与官方组件的 rail 行为一致
 */
import type { ReactElement } from 'react'
import { IconPanelLeftOutline16 } from '../runtime.ts'

export interface WorkspaceRailProps {
  /** 图标按钮的无障碍标签 */
  label: string
  onExpand: () => void
}

export function WorkspaceRail({ label, onExpand }: WorkspaceRailProps): ReactElement {
  return (
    <div className="wg-rail">
      <button
        type="button"
        className="wg-rail-button"
        aria-label={label}
        onClick={onExpand}
      >
        <IconPanelLeftOutline16 />
      </button>
    </div>
  )
}
