/**
 * 「新建工作区分组」入口
 *
 * 与「添加工作区」并排放在区域 header 右侧那一组里，因此一眼可见：工作区分组是根节点上的容器，建它不该藏在某个工作区行的菜单里
 * 用户还没归组任何工作区时，正是最需要看到这个入口的时刻
 *
 * 与工作区行菜单里的同名项分工不同：这里建出的是一个空分组（入口与具体工作区无关，没有「当前工作区」可言）
 * 工作区行那边则把「建组 + 移入当前工作区」压成一步，供移动时发现没有合适分组、随手建一个的场合使用
 *
 * 外观照官方 section header 的图标按钮：宽栏 28px 正圆、窄栏放大成 36px
 */
import type { ReactElement } from 'react'
import { Tooltip } from '../runtime.ts'
import { IconVirtualWorkspace16 } from '../icons.tsx'

export interface VirtualWorkspaceCreateControlProps {
  /** 入口的 tooltip 与无障碍标签 */
  label: string
  /** 窄栏（rail）形态：按钮放大、色阶提亮，与官方一致 */
  narrow: boolean
  /** 点下去打开新建工作区分组的命名框 */
  onCreate: () => void
}

export function VirtualWorkspaceCreateControl({
  label,
  narrow,
  onCreate,
}: VirtualWorkspaceCreateControlProps): ReactElement {
  return (
    <Tooltip label={label} side="bottom" delayMs={500}>
      <button
        type="button"
        className={`wg-header-action${narrow ? ' wg-header-action-rail' : ''}`}
        aria-label={label}
        onClick={onCreate}
      >
        <IconVirtualWorkspace16 size={narrow ? 18 : 16} />
      </button>
    </Tooltip>
  )
}
