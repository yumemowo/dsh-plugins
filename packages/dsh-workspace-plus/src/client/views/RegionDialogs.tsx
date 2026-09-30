/**
 * 区域对话框：四个草稿框、四个确认框与一次「放进父工作区分组」的追问
 *
 * 这八个浮层互斥，任意时刻至多开一个。这条不变式由 `RegionOverlay` 这个可辨识联合承担，
 * 而不是靠「Modal 挡住了第二个入口」——将来加入非 Modal 的浮层也不会同时开出两个
 *
 * 每一项都从草稿里取值提交，写盘前先收起对话框，再让宿主回的整份快照接管界面
 */
import type { ReactElement } from 'react'
import type { WorkspaceView } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { OfficialSessionActions } from '../actions.ts'
import type { GroupNameDraft, VirtualWorkspaceNameDraft, WorkspaceNameDraft } from '../data/types.ts'
import { useLocale } from '../useLocale.ts'
import { DeleteDialog } from './components/dialogs/DeleteDialog.tsx'
import { ListDialog } from './components/dialogs/ListDialog.tsx'
import { NameDialog } from './components/dialogs/NameDialog.tsx'

/**
 * 一次待确认的「把新增的子工作区放进父工作区所在的分组」
 *
 * 只有新增工作区这一条路径用它，新工作区落在某个工作区之下，而那个父工作区恰好只在一个分组里时
 * 问一句要不要顺手放进去。父工作区有多个分组时不问——该选哪个不是这里能替用户定的
 */
export interface MergeDraft {
  /** 目标分组所属的父工作区 */
  parentId: string
  /** 目标分组 */
  groupId: string
  /** 父工作区名，用于文案 */
  parentLabel: string
  /** 分组名，用于文案 */
  groupLabel: string
  /** 新增工作区的名字，用于文案 */
  childLabel: string
  /** 要放进该分组的工作区 */
  workspaceIds: string[]
}

/** 一个待删除的会话分组 */
export interface GroupDeleteTarget {
  workspaceId: string
  groupId: string
  label: string
}

/** 一个待删除的工作区 */
export interface WorkspaceDeleteTarget {
  workspaceId: string
  label: string
}

/** 一个待删除的工作区分组 */
export interface VirtualWorkspaceDeleteTarget {
  groupId: string
  label: string
}

/**
 * 任意时刻至多开一个的区域浮层
 *
 * `kind` 既承担分派，也承担「这一格存在时其余格必然不存在」的类型保证
 * 三个草稿类型与 `data/types.ts` 同形但不同层级，加一个 `kind` 就能合进同一个状态槽
 */
export type RegionOverlay =
  | ({ kind: 'group-name' } & GroupNameDraft)
  | ({ kind: 'group-delete' } & GroupDeleteTarget)
  | ({ kind: 'virtual-workspace-name' } & VirtualWorkspaceNameDraft)
  | ({ kind: 'virtual-workspace-delete' } & VirtualWorkspaceDeleteTarget)
  | ({ kind: 'workspace-rename' } & WorkspaceNameDraft)
  | ({ kind: 'workspace-delete' } & WorkspaceDeleteTarget)
  | ({ kind: 'nested-off' })
  | ({ kind: 'merge' } & MergeDraft)

/** 对话框区消费的派生布局 */
export interface RegionDialogLayout {
  /** 真的聚焦在某一片内容上时，新建工作区分组没有可切的目的地，那个勾选项因此不渲染 */
  focused: boolean
  /** 关闭嵌套时会被解除嵌套的工作区名单 */
  groupedChildLabels: readonly string[]
  /** 按 id 取回工作区视图，「放进父工作区分组」那一步按它列出名单 */
  workspaceById: ReadonlyMap<string, WorkspaceView>
}

/** 对话框区的提交入口，每个都按自己的浮层类型从草稿里取值 */
export interface RegionDialogActions {
  commitGroupNameDraft: () => void
  commitGroupDelete: () => void
  commitVirtualWorkspaceNameDraft: () => void
  commitVirtualWorkspaceDelete: () => void
  commitWorkspaceRename: () => void
  commitWorkspaceDelete: () => void
  commitNestedOff: () => void
  /** 提交一次「放进父工作区所在的分组」，为假表示这次不放 */
  commitMerge: (merge: boolean) => void
}

interface RegionDialogsProps {
  overlay: RegionOverlay | null
  setOverlay: (next: RegionOverlay | null) => void
  layout: RegionDialogLayout
  /** 全部工作区视图，工作区改名要按它判断重名与「名字没变」 */
  workspaces: readonly WorkspaceView[]
  official: OfficialSessionActions | undefined
  actions: RegionDialogActions
}

export function RegionDialogs(props: RegionDialogsProps): ReactElement {
  const { labels, t } = useLocale()
  const { official, overlay, setOverlay, actions } = props
  const officialRename = official?.labels.rename ?? t('ok')

  if (overlay === null) return <></>

  switch (overlay.kind) {
    case 'group-name': {
      return (
        <NameDialog
          title={overlay.groupId === '' ? labels.newGroup : labels.renameGroup}
          value={overlay.value}
          placeholder={labels.groupNamePrompt}
          // 新建走通用词的「确定」，改名用官方 workspace 语言包的短动词，与官方改名对话框同词
          confirmLabel={overlay.groupId === '' ? t('ok') : officialRename}
          confirmDisabled={overlay.value.trim() === ''}
          onValueChange={(value) => setOverlay({ ...overlay, value })}
          onConfirm={actions.commitGroupNameDraft}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'virtual-workspace-name': {
      return (
        <NameDialog
          title={overlay.groupId === '' ? labels.newVirtualWorkspace : labels.renameVirtualWorkspace}
          value={overlay.value}
          placeholder={labels.virtualWorkspaceNamePrompt}
          confirmLabel={overlay.groupId === '' ? t('ok') : officialRename}
          confirmDisabled={overlay.value.trim() === ''}
          // 「切换到新工作区」只在当前不是「显示全部工作区」时才给：
          // 已经看着全部内容时没有可切的目的地，勾了也无事可做。改名时不出现（它不新建东西）
          check={
            overlay.groupId !== '' || !props.layout.focused
              ? undefined
              : {
                  label: labels.picker.followFocus,
                  checked: overlay.followFocus === true,
                  onChange: (followFocus) => setOverlay({ ...overlay, followFocus }),
                }
          }
          onValueChange={(value) => setOverlay({ ...overlay, value })}
          onConfirm={actions.commitVirtualWorkspaceNameDraft}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'virtual-workspace-delete': {
      return (
        <DeleteDialog
          title={labels.deleteVirtualWorkspace}
          description={labels.confirmDeleteVirtualWorkspace(overlay.label)}
          confirmLabel={labels.deleteVirtualWorkspace}
          onConfirm={actions.commitVirtualWorkspaceDelete}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'workspace-rename': {
      const name = overlay.value.trim()
      // 待改的工作区名是否与另一个工作区撞名
      const conflict = props.workspaces.find(
        (item) => String(item.workspaceId) !== overlay.workspaceId && item.title === name,
      )?.title
      /** 工作区当前的名字，用于判断改名是否真的改变了内容 */
      const current =
        props.workspaces.find((item) => String(item.workspaceId) === overlay.workspaceId)?.title ?? ''
      return (
        <NameDialog
          title={labels.renameWorkspace}
          value={overlay.value}
          placeholder={labels.workspaceNamePrompt}
          confirmLabel={officialRename}
          confirmDisabled={name === '' || name === current || conflict !== undefined}
          error={conflict === undefined ? null : labels.workspaceConflict(conflict)}
          onValueChange={(value) => setOverlay({ ...overlay, value })}
          onConfirm={actions.commitWorkspaceRename}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'group-delete': {
      return (
        <DeleteDialog
          title={labels.deleteGroup}
          description={labels.confirmDeleteGroup(overlay.label)}
          confirmLabel={labels.deleteGroup}
          onConfirm={actions.commitGroupDelete}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'workspace-delete': {
      return (
        <DeleteDialog
          title={labels.deleteWorkspace}
          description={labels.confirmDeleteWorkspace(overlay.label)}
          confirmLabel={labels.deleteWorkspace}
          onConfirm={actions.commitWorkspaceDelete}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'nested-off': {
      return (
        <ListDialog
          title={labels.nested.disableTitle}
          description={labels.nested.disableDesc}
          items={props.layout.groupedChildLabels}
          confirmLabel={labels.nested.disable}
          danger
          onConfirm={actions.commitNestedOff}
          onClose={() => setOverlay(null)}
        />
      )
    }

    case 'merge': {
      return (
        <ListDialog
          title={labels.nested.addTitle}
          description={labels.nested.addDesc(overlay.childLabel, overlay.parentLabel, overlay.groupLabel)}
          items={overlay.workspaceIds.map((id) => props.layout.workspaceById.get(id)?.title ?? id)}
          confirmLabel={labels.nested.mergeConfirm}
          alt={{ label: labels.nested.mergeSkip, onSelect: () => actions.commitMerge(false) }}
          onConfirm={() => actions.commitMerge(true)}
          onClose={() => actions.commitMerge(false)}
        />
      )
    }
  }
}
