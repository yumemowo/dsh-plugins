/**
 * 带会话操作菜单的会话行
 *
 * 菜单内容分两段：官方三项（重命名 / 分叉 / 归档，直接转调官方服务）与一条
 * 分隔线之后的归组项。归组项只在有分组上下文的行上出现——「未分组」桶里的
 * 会话不属于任何工作区，没有分组可落，因此那些行只保留官方三项。宿主未提供
 * 官方服务时官方三项整体隐藏，同样不留点不动的入口
 *
 * 新建中（空白）会话行没有会话可操作，与官方一样整条行都不挂菜单：那条行
 * 只是「准备开始一个新会话」的占位，对它重命名或归档都无从谈起
 *
 * 菜单开合状态收敛在本组件内：行组件在 map 回调里生成，把 useState 留在
 * 行内会让每行无条件多挂一组 hook 状态，独立组件则按需挂载。重命名对话框
 * 也留在这里——只有真正打开过的行才付出这份状态
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { IconEllipsisOutline16, Menu } from '../runtime.ts'
import { buildSessionMenuItems } from '../menus.tsx'
import { SessionRowView } from './SessionRowView.tsx'
import { NameDialog } from './dialogs/NameDialog.tsx'
import type { OfficialSessionActions } from '../actions.ts'
import type { RegionTranslate } from '../locales.ts'
import type { SessionStatus } from '../data/status.ts'
import type { GroupSection, SessionRow } from '../data/types.ts'

/** 一个会话行的归组上下文；缺省表示该行没有分组可归 */
export interface SessionGroupingContext {
  /** 该会话所在工作区的全部分组 */
  sections: readonly GroupSection[]
  /** 目标会话当前所属分组 id；空串表示未归组 */
  currentGroupId: string
  /** 「分组」一级项文案 */
  groupLabel: string
  /** 「取消分组」文案 */
  ungroupLabel: string
  /** 菜单选中项：`ungroup` 或 `group:<id>` */
  onSelect: (id: string) => void
}

export interface SessionRowMenuProps {
  row: SessionRow
  /** 行上显示的标题；空白会话取语言包的固定名 */
  title: string
  selected: boolean
  /** 该行要显示的状态位；空闲时为 undefined */
  status?: SessionStatus | undefined
  /** 行尾相对时间文案；空白行不显示 */
  time?: string | undefined
  /** 归组上下文；缺省时菜单里没有归组项 */
  grouping?: SessionGroupingContext | undefined
  /** 官方三项会话操作；缺省时菜单里没有官方三项 */
  official?: OfficialSessionActions | undefined
  onOpen: () => void
  /** 行尾操作按钮的无障碍标签，取会话标题 */
  actionsLabel: (name: string) => string
  /** 本包命名空间的翻译座位，供重命名对话框解析通用词 */
  t: RegionTranslate
}

export function SessionRowMenu({
  row,
  title,
  selected,
  status,
  time,
  grouping,
  official,
  onOpen,
  actionsLabel,
  t,
}: SessionRowMenuProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState<string | null>(null)

  return (
    <>
      <SessionRowView
        title={title}
        selected={selected}
        status={status}
        time={time}
        menuOpen={menuOpen}
        onOpen={onOpen}
        action={
          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            onSelect={(id: string) => {
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
              grouping?.onSelect(id)
            }}
            // portal 进 document.body：本区域的列表容器 overflow 裁剪会把
            // 就近渲染的菜单裁掉。二级面板的方向由宿主挂的 body 标记控制
            //（见 index.ts），这里不感知宿主差异
            portal
            closeOnPointerLeave
            anchor={
              <button
                type="button"
                className="wg-row-action"
                aria-label={actionsLabel(row.title)}
                onClick={(event) => {
                  event.stopPropagation()
                  setMenuOpen((open) => !open)
                }}
              >
                <IconEllipsisOutline16 />
              </button>
            }
            items={buildSessionMenuItems({ grouping, official: official?.labels })}
          />
        }
      />
      {renameDraft === null || official === undefined ? null : (
        <NameDialog
          title={official.labels.renameTitle}
          value={renameDraft}
          placeholder={official.labels.sessionNamePrompt}
          confirmLabel={official.labels.rename}
          confirmDisabled={renameDraft.trim() === ''}
          t={t}
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
