/**
 * 会话行条目：一整行加上它的两个面板与悬停卡片
 *
 * 行本身就是 `SessionRowView`，本组件补的是「这一行能做什么」：
 *   - 行尾 `...` 菜单与行右键菜单，两者共用同一批条目与同一段分派，因此同一个 id 在两个入口下落到同一件事
 *   - 悬停卡片，整卡可点即复制标题
 * 菜单内容分两段：官方操作块（置顶 / 重命名 / 分叉 / 归档，转调官方控制器与官方服务）与一条分隔线之后的归组项
 * 归组项只在有分组上下文的行上出现——「未分组」桶里的会话不属于任何工作区，没有分组可落，因此那些行只保留官方操作块
 * 宿主未提供官方服务时官方操作块整体隐藏，同样不留点不动的入口
 *
 * 新建中（空白）会话行没有会话可操作，与官方一样整条行都不挂菜单，那条行只是「准备开始一个新会话」的占位，对它重命名或归档都无从谈起
 *
 * 置顶区里的行也走这一个组件：那些行只给官方操作块，也不给卡片
 *
 * 菜单开合状态收敛在本组件内：行组件在 map 回调里生成，把 useState 留在行内会让每行无条件多挂一组 hook 状态，独立组件则按需挂载
 * 重命名对话框也留在这里——只有真正打开过的行才付出这份状态
 */
import { memo, useState } from 'react'
import type { ReactElement } from 'react'
import { HoverCard, IconEllipsisOutlineRegular, Menu } from '../runtime.ts'
import { buildSessionMenuItems } from '../menus.tsx'
import type { SessionPinMenuInput } from '../menus.tsx'
import { sameGroupSections } from '../data/layout.ts'
import { sameSessionStatus, sameSessionStatuses } from '../data/status.ts'
import { SessionRowView } from './SessionRowView.tsx'
import type { SessionRowViewProps } from './SessionRowView.tsx'
import { useRowContextMenu } from './components/RowContextMenu.tsx'
import { SessionHoverContent } from './components/HoverCards.tsx'
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

/**
 * 本组件自己算、因此不收的几格
 *
 * `sessionId` 由 `row` 派生；`action` 与 `onContextMenu` 就是下面那两个面板本身，调用方给不了
 * `panelOpen` 同理：它由这两个面板的开合状态算出来，收下来既会被覆盖、又让调用方以为它说了算
 */
type ComputedHere = 'sessionId' | 'action' | 'onContextMenu' | 'panelOpen'

/**
 * 悬停卡片的输入
 *
 * 不给整格表示这一行不挂卡片（置顶区里的行如此）
 * 卡片由本组件挂而不是行组件，它要在行内 `...` 菜单或右键菜单开着时让位，而那两个状态都在本组件里
 */
export interface SessionRowCardInput {
  /** 相对时间文案（`5分钟前`），缺省时卡片里不显示这一行 */
  time?: string | undefined
  /**
   * 卡片里逐条列出的状态，缺省回退成只有行上那一条
   *
   * 与行首那枚指示器分开传：行上空闲不画指示器，卡片里却要像官方一样把「空闲」也列出来
   */
  statuses?: readonly SessionStatus[] | undefined
  /** 可复制的内容，取会话标题；缺省表示卡片只读（新建中的空白行） */
  copy?: string | undefined
}

export interface SessionRowItemProps extends Omit<SessionRowViewProps, ComputedHere> {
  row: SessionRow
  /** 归组上下文，缺省时菜单里没有归组项 */
  grouping?: SessionGroupingContext | undefined
  /** 官方会话操作，缺省时菜单里没有官方操作块 */
  official?: OfficialSessionActions | undefined
  /** 悬停卡片，缺省表示这一行不挂卡片 */
  card?: SessionRowCardInput | undefined
}

/**
 * 菜单里置顶那一项的输入
 *
 * 三个字段都到齐才给：缺了切换动作就只是一个点不动的入口
 * @returns 置顶项的输入，该行不提供置顶入口时为 undefined
 */
function pinMenuInput(
  pinned: boolean | undefined,
  canPin: boolean | undefined,
  onTogglePin: ((sessionId: string) => void) | undefined,
): SessionPinMenuInput | undefined {
  if (pinned === undefined || canPin === undefined || onTogglePin === undefined) return undefined
  return { pinned, canPin }
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
 * 比较两张悬停卡片是否表示同一件事
 *
 * 卡片对象每次渲染新建，`statuses` 又是新数组，因此按内容比；不给卡片是稳定的一种状态
 */
function sameCard(
  a: SessionRowCardInput | undefined,
  b: SessionRowCardInput | undefined,
): boolean {
  if (a === b) return true
  if (a === undefined || b === undefined) return false
  if (a.time !== b.time || a.copy !== b.copy) return false
  return sameSessionStatuses(a.statuses ?? [], b.statuses ?? [])
}

/**
 * 行级 memo 的比较器
 *
 * 传进来的都是原语或稳定引用，因此逐格比即可，状态位、归组上下文与卡片按内容比
 * 逐格列出而不是从行那个比较器派生：memo 按结构比对，比较器是唯一无法整体转发的一处
 */
function sameRowItemProps(prev: SessionRowItemProps, next: SessionRowItemProps): boolean {
  return (
    prev.row === next.row &&
    prev.title === next.title &&
    prev.selected === next.selected &&
    prev.time === next.time &&
    sameSessionStatus(prev.status, next.status) &&
    prev.pinned === next.pinned &&
    prev.canPin === next.canPin &&
    prev.clipped === next.clipped &&
    prev.onTogglePin === next.onTogglePin &&
    prev.onOpenSession === next.onOpenSession &&
    prev.onReveal === next.onReveal &&
    prev.official === next.official &&
    sameCard(prev.card, next.card) &&
    sameGrouping(prev.grouping, next.grouping)
  )
}

function SessionRowItemView({
  row,
  grouping,
  official,
  card,
  ...rowProps
}: SessionRowItemProps): ReactElement {
  const { labels } = useLocale()
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  // 新建中的空白会话没有会话可操作：官方对它整条省略号都不渲染
  // 条目在这里就清空，右键路径与行尾按钮才会一起落空——只拦按钮的话右键仍会弹出一份同样的菜单
  const items = row.blank
    ? []
    : buildSessionMenuItems({
        grouping:
          grouping === undefined
            ? undefined
            : {
                ...grouping,
                groupLabel: labels.moveToGroup,
                ungroupLabel: labels.ungroup,
              },
        official: official?.labels,
        pin: pinMenuInput(rowProps.pinned, rowProps.canPin, rowProps.onTogglePin),
      })

  /**
   * 菜单选中项的分派
   *
   * 行内 `...` 菜单与右键菜单共用它：右键是行尾操作位的捷径，同一个 id 必须落到同一件事上
   * 会话行没有行内新建入口，因此两份条目的集合相同
   */
  const select = (id: string): void => {
    setMenuOpen(false)
    if (id === 'pin') {
      rowProps.onTogglePin?.(row.id)
      return
    }
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

  // 两种面板任一开着都算「行上有面板」，卡片与行尾锚点的显隐都据它让位
  const panelOpen = menuOpen || contextMenu.open

  const shownTitle = rowProps.title ?? labels.newSession
  // 条目为空时连锚点按钮一起不渲染，不留点不动的省略号
  const hasMenu = items.length > 0

  const line = (
    <SessionRowView
      {...rowProps}
      sessionId={row.id}
      // 面板开合下发给行：置顶区靠行上的标记判断浮出要不要留住（两种面板都 portal 到 body）
      panelOpen={panelOpen}
      onContextMenu={contextMenu.onContextMenu}
      action={
        hasMenu ? (
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
                // 面板开着时行要留住这一格：锚点只靠 :hover 显示，指针一旦移开按钮就会消失
                // 样式按这个属性选档，不再另给行挂一个开合标记
                aria-expanded={menuOpen}
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
        ) : undefined
      }
    />
  )

  return (
    <>
      {/* 卡片只包住行本身：右键面板与重命名对话框都是行外的浮层，包进去会多出两个子节点 */}
      {card === undefined ? (
        line
      ) : (
        <HoverCard
          anchor={line}
          content={
            <SessionHoverContent
              title={shownTitle}
              time={card.time}
              statuses={card.statuses ?? (rowProps.status === undefined ? [] : [rowProps.status])}
            />
          }
          // 行内 `...` 菜单与行右键菜单开着时都让位，否则同一处会叠两层浮层
          disabled={panelOpen}
          copyText={card.copy}
          copyLabel={labels.hover.copy}
          copiedLabel={labels.hover.copied}
        />
      )}
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
 * 裹上 memo 的会话行条目
 *
 * 流式期间每次活动都会重渲染整片区域，未变的行若跟着重算，长列表就会在每次活动时付出与行数成正比的代价，主线程因此被整段占住
 * memo 挂在这一层而不是行外壳那一层：卡片与菜单都在这一层，行外壳只是被它渲染的子树，外层挡下就够
 */
export const SessionRowItem = memo(SessionRowItemView, sameRowItemProps)
