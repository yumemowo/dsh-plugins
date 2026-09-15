/**
 * 界面文案的契约与投影
 *
 * 字典本体在 `locales.ts`（只含本包自有文案），本模块把两个命名空间的翻译
 * 函数投影成组件消费的语义化文案表，让组件只认字段名，不认键名：
 *
 * - 官方 `workspace` 已有的文案（区域标题、工作区改名/删除、会话行标签、
 *   状态点、空态）直接用官方键，不复制官方译文——官方改措辞时本包自动跟随，
 *   两处同屏也不会出现两套说法；
 * - 官方没有对应词的自有文案（建组、分组管理、实验特性说明）取本包命名空间。
 *
 * 通用词（`ok` / `cancel` / `close`）两个命名空间都能解析：查找链在命名空间
 * 未命中后回退到官方 `common`
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import type { WorkspaceTranslate } from './official.ts'

/** 会话状态位的无障碍文案 */
export interface SessionStatusLabels {
  /** 本会话正在运行 */
  running: string
  /** 有 n 个运行中的子代理；中英文的复数形态一致 */
  subagentsRunning: (n: number) => string
  /** 等待用户审批工具调用 */
  waitingApproval: string
  /** 等待用户审阅计划 */
  planReview: string
  /** 等待用户回答问题 */
  waitingAnswer: string
  /** 本轮已完成、尚未打开（绿色提醒点） */
  completed: string
}

/** 区域组件消费的文案表 */
export interface RegionLabels {
  /** 区域标题，同时是窄栏展开按钮的无障碍标签 */
  title: string
  /** 菜单里的「新建分组」项，也是新建分组对话框的标题 */
  newGroup: string
  /** 新建会话按钮的无障碍标签；工作区名由调用方传入 */
  newSessionIn: (name: string) => string
  /** 工作区「更多操作」按钮的无障碍标签；工作区名由调用方传入 */
  workspaceActions: (name: string) => string
  /** 「重命名工作区」菜单项与对话框标题 */
  renameWorkspace: string
  /** 「删除工作区」菜单项、对话框标题与确认按钮 */
  deleteWorkspace: string
  /** 删除工作区的说明文案；工作区名由调用方传入 */
  confirmDeleteWorkspace: (name: string) => string
  /** 工作区名输入框的占位与无障碍标签 */
  workspaceNamePrompt: string
  /** 与既有工作区重名时的提示；名称由调用方传入 */
  workspaceConflict: (name: string) => string
  /** 无工作区归属的会话区段标题 */
  ungrouped: string
  /** 分组名输入框的占位与无障碍标签 */
  groupNamePrompt: string
  /** 分组名对话框的标题（重命名时用） */
  renameGroup: string
  /** 「删除分组」按钮与对话框标题 */
  deleteGroup: string
  /** 分组行「更多操作」按钮的无障碍标签；分组名由调用方传入 */
  groupActions: (name: string) => string
  /** 在分组内新建会话的无障碍标签；分组名由调用方传入 */
  newSessionInGroup: (name: string) => string
  /** 删除分组的说明文案；分组名由调用方传入 */
  confirmDeleteGroup: (name: string) => string
  /** 会话行尾操作位的无障碍标签；会话标题由调用方传入 */
  sessionActions: (name: string) => string
  /** 「分组」一级菜单项文案 */
  moveToGroup: string
  /** 「取消分组」一级菜单项文案 */
  ungroup: string
  /** 会话状态位的无障碍文案 */
  status: SessionStatusLabels
  /** 对照 tab 在 better-sidebar 里的一行说明 */
  compareTabDescription: string
  /** 工作区内没有任何会话时的占位文案 */
  empty: string
  /** 列表底部的一行说明：本区域暂未提供的能力 */
  unimplemented: string
}

/**
 * 把两个命名空间的翻译函数投影成组件需要的文案表
 * @param t - 本包命名空间的翻译函数（自有文案，并回退 `common` 通用词）
 * @param tw - 官方 `workspace` 命名空间的翻译函数（官方已有文案）
 * @returns 语义化字段的文案表
 */
export function regionLabels(
  t: TranslateNS<typeof NS>,
  tw: WorkspaceTranslate,
): RegionLabels {
  return {
    title: tw('section.workspaces'),
    newGroup: t('newGroup'),
    newSessionIn: (name: string) => tw('actions.newSession.aria', { name }),
    workspaceActions: (name: string) => tw('actions.workspace.aria', { name }),
    renameWorkspace: tw('rename.workspace.title'),
    deleteWorkspace: tw('delete.workspace'),
    confirmDeleteWorkspace: (name: string) => tw('delete.desc', { name }),
    workspaceNamePrompt: tw('field.workspaceName'),
    workspaceConflict: (name: string) => tw('conflict.named', { name }),
    ungrouped: tw('group.ungrouped'),
    groupNamePrompt: t('groupNamePrompt'),
    renameGroup: t('renameGroup'),
    deleteGroup: t('deleteGroup'),
    confirmDeleteGroup: (name: string) => t('delete.desc.group', { name }),
    groupActions: (name: string) => t('actions.group.aria', { name }),
    newSessionInGroup: (name: string) => tw('actions.newSession.aria', { name }),
    sessionActions: (name: string) => tw('actions.session.aria', { name }),
    moveToGroup: t('moveToGroup'),
    ungroup: t('ungroup'),
    status: {
      running: tw('status.running'),
      // 官方对单复数各有一条文案；中文两份相同，这里按 n 选键保持同一契约。
      subagentsRunning: (n: number) =>
        n === 1
          ? tw('status.subagentsRunning.one', { n })
          : tw('status.subagentsRunning.other', { n }),
      waitingApproval: tw('status.waitingApproval'),
      planReview: tw('status.planReview'),
      waitingAnswer: tw('status.waitingAnswer'),
      completed: tw('status.completed'),
    },
    compareTabDescription: t('compareTabDescription'),
    empty: tw('empty.none'),
    unimplemented: t('unimplemented'),
  }
}
