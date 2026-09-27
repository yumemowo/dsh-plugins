/**
 * 带会话操作菜单的会话行
 *
 * 菜单内容分两段：官方三项（重命名 / 分叉 / 归档，直接转调官方服务）与一条分隔线之后的归组项
 * 归组项只在有分组上下文的行上出现——「未分组」桶里的会话不属于任何工作区，没有分组可落，因此那些行只保留官方三项
 * 宿主未提供官方服务时官方三项整体隐藏，同样不留点不动的入口
 *
 * 新建中（空白）会话行没有会话可操作，与官方一样整条行都不挂菜单，那条行只是「准备开始一个新会话」的占位，对它重命名或归档都无从谈起
 *
 * 菜单开合状态收敛在本组件内：行组件在 map 回调里生成，把 useState 留在行内会让每行无条件多挂一组 hook 状态，独立组件则按需挂载
 * 重命名对话框也留在这里——只有真正打开过的行才付出这份状态
 */
import { memo, useState } from 'react'
import type { ReactElement } from 'react'
import { IconEllipsisOutlineRegular, Menu } from '../runtime.ts'
import { buildSessionMenuItems } from '../menus.tsx'
import { sameGroupSections } from '../data/layout.ts'
import { sameSessionStatuses } from '../data/status.ts'
import { SessionRowView } from './SessionRowView.tsx'
import { useRowContextMenu } from './components/RowContextMenu.tsx'
import { NameDialog } from './components/dialogs/NameDialog.tsx'
import { useLocale } from '../useLocale.ts'
import type { OfficialSessionActions } from '../actions.ts'
import type { SessionStatus } from '../data/status.ts'
import type { GroupSection, SessionRow } from '../data/types.ts'
import rowsStyles from './components/rows.module.css'
import menusStyles from '../menus.module.css'

/**
 * 一个会话行的归组上下文，缺省表示该行没有分组可归
 *
 * 只装数据与稳定引用的动作：行级 memo 按字段比对这个对象，把每次渲染新建的闭包放进来会让比对落空
 */
export interface SessionGroupingContext {
  /** 该会话所在的工作区，归组动作要用它定位 */
  workspaceId: string
  /** 该会话所在工作区的全部分组 */
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id，空串表示未归组 */
  currentGroupId: string
  /**
   * 归组选中项：`ungroup` 或 `group:<id>`
   *
   * 接收工作区与会话 id 而不是提前绑定：这个动作由区域组件缓存，因此对所有行是同一个引用，行自己在组件内把 id 绑上去
   */
  onSelectGroup: (workspaceId: string, sessionId: string, id: string) => void
}

export interface SessionRowMenuProps {
  row: SessionRow
  /**
   * 行上显示的标题
   *
   * 传 null 表示这是一条新建中的空白会话，标题由行组件取语言包的固定名
   */
  title: string | null
  selected: boolean
  /** 该行要显示的状态位，空闲时为 undefined */
  status?: SessionStatus | undefined
  /** 行尾相对时间文案，空白行不显示 */
  time?: string | undefined
  /** 该行悬停卡片里逐条列出的状态，缺省回退成只有 `status` 一条 */
  statuses?: readonly SessionStatus[] | undefined
  /** 悬停卡片里的相对时间文案（`5分钟前`），缺省时卡片里不显示这一行 */
  hoverTime?: string | undefined
  /** 归组上下文，缺省时菜单里没有归组项 */
  grouping?: SessionGroupingContext | undefined
  /** 官方三项会话操作，缺省时菜单里没有官方三项 */
  official?: OfficialSessionActions | undefined
  /**
   * 打开会话
   *
   * 传动作本身而不是绑好 id 的闭包：绑好的闭包每次渲染都是新引用，行级 memo 因此永远判定为变过
   */
  onOpenSession: (sessionId: string) => void
  /** 该行是否平铺列表里的行，行首没有状态位时不占那一格 */
  flat?: boolean | undefined
  /** 请求把这一行滚进可视区，只在从搜索结果打开时下发 */
  onReveal?: (() => void) | undefined
}

/**
 * 比较两次归组上下文是否表示同一件事
 *
 * 分组段每次渲染都是新数组，按引用比会让每一行都判定为变过，菜单只消费分组的 id 与名字，因此判定这些字段就够
 */
function sameGrouping(
  a: SessionGroupingContext | undefined,
  b: SessionGroupingContext | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (
    a.workspaceId !== b.workspaceId ||
    a.currentGroupId !== b.currentGroupId ||
    a.onSelectGroup !== b.onSelectGroup
  ) {
    return false
  }
  return sameGroupSections(a.sections, b.sections)
}

/**
 * 行级 memo 的比较器
 *
 * 传进来的都是原语或稳定引用，因此逐格比即可，状态位与归组上下文按内容比
 */
function sameRowMenuProps(prev: SessionRowMenuProps, next: SessionRowMenuProps): boolean {
  const prevStatuses = prev.statuses ?? (prev.status === undefined ? [] : [prev.status])
  const nextStatuses = next.statuses ?? (next.status === undefined ? [] : [next.status])
  return (
    prev.row === next.row &&
    prev.title === next.title &&
    prev.selected === next.selected &&
    prev.time === next.time &&
    prev.hoverTime === next.hoverTime &&
    sameSessionStatuses(prevStatuses, nextStatuses) &&
    prev.official === next.official &&
    prev.onOpenSession === next.onOpenSession &&
    prev.flat === next.flat &&
    prev.onReveal === next.onReveal &&
    sameGrouping(prev.grouping, next.grouping)
  )
}

function SessionRowMenuView({
  row,
  title,
  selected,
  status,
  time,
  statuses,
  hoverTime,
  grouping,
  official,
  onOpenSession,
  flat = false,
  onReveal,
}: SessionRowMenuProps): ReactElement {
  const { labels } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  const items = buildSessionMenuItems({
    grouping:
      grouping === undefined
        ? undefined
        : {
            ...grouping,
            groupLabel: labels.moveToGroup,
            ungroupLabel: labels.ungroup,
          },
    official: official?.labels,
  })

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它：右键是行尾操作位的捷径，同一个 id 必须落到同一件事上
   * 会话行没有行内新建入口，因此两份条目的集合相同
   */
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === 'rename') {
      setRenameDraft(row.title)
      return
    }
    if (id === 'fork') {
      official?.forkSession(row.id)
      return
    }
    if (id === 'archive') {
      // 归档会改写会话列表快照，本区域订阅着它，因此不需要手动刷新
      void official?.archiveSession(row.id)
      return
    }
    if (grouping !== undefined) grouping.onSelectGroup(grouping.workspaceId, row.id, id)
  }

  const contextMenu = useRowContextMenu({ items, onSelect: select })

  return (
    <>
      <SessionRowView
        sessionId={row.id}
        title={title}
        selected={selected}
        status={status}
        time={time}
        statuses={statuses}
        hoverTime={hoverTime}
        // 空白行由调用方整段不渲染，因此走到这里的标题一定是会话内容，可复制
        hoverCopy={title ?? undefined}
        // 宿主没加载官方 ui-workspace 时官方文案整体拿不到，浮出一个空壳不如不浮
        hover={official !== undefined}
        menuOpen={menuOpen}
        // 卡片要在两种面板开着时都让位：行内 `...` 菜单与行右键菜单
        hoverDisabled={menuOpen || contextMenu.open}
        flat={flat}
        onOpenSession={onOpenSession}
        onReveal={onReveal}
        onContextMenu={contextMenu.onContextMenu}
        action={
          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onSelect={select}
            // portal 进 document.body：本区域的列表容器 overflow 裁剪会把就近渲染的菜单裁掉
            // 二级面板的方向由区域挂在 body 上的翻转标记控制（见 useFlipMarker），这里不感知宿主差异
            portal
            closeOnPointerLeave
            // 面板被 portal 出去后不在本包的 DOM 子树里，官方为此留了这一个样式钩子
            // 本包借它修二级面板的底色（见 `menus.module.css` 的 `.menuList`）
            listClassName={menusStyles.menuList}
            anchor={
              <button
                type="button"
                className={rowsStyles.rowAction}
                aria-label={labels.sessionActions(row.title)}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen((open) => !open)
                }}
              >
                <IconEllipsisOutlineRegular />
              </button>
            }
            items={items}
          />
        }
      />
      {contextMenu.menu}
      {renameDraft === null || official === undefined ? null : (
        <NameDialog
          title={official.labels.renameTitle}
          value={renameDraft}
          placeholder={official.labels.sessionNamePrompt}
          confirmLabel={official.labels.rename}
          confirmDisabled={renameDraft.trim() === ''}
          onValueChange={setRenameDraft}
          onConfirm={() => {
            const title = renameDraft.trim()
            if (title === '') return
            setRenameDraft(null)
            void official.renameSession(row.id, title)
          }}
          onClose={() => setRenameDraft(null)}
        />
      )}
    </>
  )
}

/**
 * 裹上 memo 的会话行
 *
 * 流式期间每次活动都会重渲染整片区域，未变的行若跟着重算，长列表就会在每次活动时付出与行数成正比的代价，主线程因此被整段占住
 */
export const SessionRowMenu = memo(SessionRowMenuView, sameRowMenuProps)
