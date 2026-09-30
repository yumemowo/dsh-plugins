/**
 * 侧边栏窄栏（rail）形态：只保留一个展开入口
 *
 * 宽窄由 shell 决定，窄栏下不渲染任何列表内容，与官方组件的 rail 行为一致
 */
import type { ReactElement } from 'react'
import { IconPanelLeftOutlineRegular } from '../runtime.ts'
import styles from './WorkspaceRail.module.css'

export interface WorkspaceRailProps {
  /** 图标按钮的无障碍标签 */
  label: string
  onExpand: () => void
}

export function WorkspaceRail({ label, onExpand }: WorkspaceRailProps): ReactElement {
  return (
    <div className={styles.rail}>
      <button
        type="button"
        className={styles.railButton}
        aria-label={label}
        onClick={onExpand}
      >
        <IconPanelLeftOutlineRegular />
      </button>
    </div>
  )
}
