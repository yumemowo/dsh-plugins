/**
 * 界面文案与文案契约。
 *
 * 语言包按命名空间注册；本模块同时导出把翻译函数绑定成组件所需文案表的
 * `regionLabels`，让文案键名集中在一处，组件只认语义化的字段名。
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** 语言包命名空间。 */
export const LOCALE_NAMESPACE = 'workspace-groups'

/** 界面文案，中英各一份。 */
export const DICTIONARIES = {
  zh: {
    title: '工作区',
    newGroup: '新建分组',
    newSessionIn: '在「{name}」中新建会话',
    workspaceActions: '工作区「{name}」的操作',
    renameWorkspace: '重命名工作区',
    deleteWorkspace: '删除工作区',
    confirmDeleteWorkspace: '删除工作区「{name}」？文件夹与会话记录会保留，其会话将移入「未分组」。',
    workspaceNamePrompt: '工作区名称',
    workspaceConflict: '已存在名为「{name}」的工作区。',
    ungrouped: '未分组',
    groupNamePrompt: '分组名称',
    renameGroup: '重命名分组',
    deleteGroup: '删除分组',
    confirmDeleteGroup: '删除分组「{name}」？组内会话会移出分组，会话本身不受影响。',
    confirmLabel: '确定',
    cancelLabel: '取消',
    closeLabel: '关闭',
    sessionActions: '会话操作',
    moveToGroup: '分组',
    ungroup: '取消分组',
    statusRunning: '进行中',
    statusSubagentsRunningOne: '{n} 个子代理运行中',
    statusSubagentsRunningOther: '{n} 个子代理运行中',
    statusWaitingApproval: '等待审批',
    statusPlanReview: '计划待审',
    statusWaitingAnswer: '等待回答',
    statusCompleted: '已完成',
    compareTabDescription: '分组区域的对照视图（左侧为官方工作区列表）',
    empty: '暂无会话',
    unimplemented: '分组为实验特性：搜索、归档、拖拽暂未提供。',
  },
  en: {
    title: 'Workspaces',
    newGroup: 'New group',
    newSessionIn: 'New session in {name}',
    workspaceActions: 'Workspace actions for {name}',
    renameWorkspace: 'Rename workspace',
    deleteWorkspace: 'Delete workspace',
    confirmDeleteWorkspace:
      'Delete workspace "{name}"? The folder and session logs are kept; its sessions move to Ungrouped.',
    workspaceNamePrompt: 'Workspace name',
    workspaceConflict: 'A workspace named "{name}" already exists.',
    ungrouped: 'Ungrouped',
    groupNamePrompt: 'Group name',
    renameGroup: 'Rename group',
    deleteGroup: 'Delete group',
    confirmDeleteGroup:
      'Delete group "{name}"? Its sessions leave the group; the sessions themselves are unaffected.',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    closeLabel: 'Close',
    sessionActions: 'Session actions',
    moveToGroup: 'Group',
    ungroup: 'Ungroup',
    statusRunning: 'Running',
    statusSubagentsRunningOne: '{n} subagent running',
    statusSubagentsRunningOther: '{n} subagents running',
    statusWaitingApproval: 'Waiting for approval',
    statusPlanReview: 'Plan awaiting review',
    statusWaitingAnswer: 'Waiting for answer',
    statusCompleted: 'Completed',
    compareTabDescription: 'Grouping region for side-by-side comparison with the official list',
    empty: 'No sessions',
    unimplemented: 'Groups are experimental: search, archive and drag are not available yet.',
  },
} as const

/**
 * 声明本包占用的语言包键域。
 *
 * 这份合并只在本模块被引入后生效；`locale.register` 的双参重载要求命名空间
 * 出现在 {@link LocaleNamespaceMap} 里，否则只剩三参的动态形式可用。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'workspace-groups': keyof (typeof DICTIONARIES)['zh']
  }
}

/** 会话状态位的无障碍文案。 */
export interface SessionStatusLabels {
  /** 本会话正在运行。 */
  running: string
  /** 有 n 个运行中的子代理；中英文的复数形态一致。 */
  subagentsRunning: (n: number) => string
  /** 等待用户审批工具调用。 */
  waitingApproval: string
  /** 等待用户审阅计划。 */
  planReview: string
  /** 等待用户回答问题。 */
  waitingAnswer: string
  /** 本轮已完成、尚未打开（绿色提醒点）。 */
  completed: string
}

/** 区域组件消费的文案表。 */
export interface RegionLabels {
  /** 区域标题，同时是窄栏展开按钮的无障碍标签。 */
  title: string
  /** 菜单里的「新建分组」项，也是新建分组对话框的标题。 */
  newGroup: string
  /** 新建会话按钮的无障碍标签；工作区名由调用方传入。 */
  newSessionIn: (name: string) => string
  /** 工作区「更多操作」按钮的无障碍标签；工作区名由调用方传入。 */
  workspaceActions: (name: string) => string
  /** 「重命名工作区」菜单项与对话框标题。 */
  renameWorkspace: string
  /** 「删除工作区」菜单项、对话框标题与确认按钮。 */
  deleteWorkspace: string
  /** 删除工作区的说明文案；工作区名由调用方传入。 */
  confirmDeleteWorkspace: (name: string) => string
  /** 工作区名输入框的占位与无障碍标签。 */
  workspaceNamePrompt: string
  /** 与既有工作区重名时的提示；名称由调用方传入。 */
  workspaceConflict: (name: string) => string
  /** 无工作区归属的会话区段标题。 */
  ungrouped: string
  /** 分组名输入框的占位与无障碍标签。 */
  groupNamePrompt: string
  /** 分组名对话框的标题（重命名时用）。 */
  renameGroup: string
  /** 「删除分组」按钮与对话框标题。 */
  deleteGroup: string
  /** 删除分组的说明文案；分组名由调用方传入。 */
  confirmDeleteGroup: (name: string) => string
  /** 对话框确认按钮。 */
  confirmLabel: string
  /** 对话框取消按钮。 */
  cancelLabel: string
  /** 对话框关闭按钮的无障碍标签。 */
  closeLabel: string
  /** 会话行尾操作位的无障碍标签。 */
  sessionActions: string
  /** 「分组」一级菜单项文案。 */
  moveToGroup: string
  /** 「取消分组」一级菜单项文案。 */
  ungroup: string
  /** 会话状态位的无障碍文案。 */
  status: SessionStatusLabels
  /** 对照 tab 在 better-sidebar 里的一行说明。 */
  compareTabDescription: string
  /** 工作区内没有任何会话时的占位文案。 */
  empty: string
  /** 列表底部的一行说明：本区域暂未提供的能力。 */
  unimplemented: string
}

/**
 * 把翻译函数绑定成组件需要的文案表。
 * @param t - 本包命名空间的翻译函数（读取当前语言）。
 * @returns 语义化字段的文案表。
 */
export function regionLabels(t: TranslateNS<typeof LOCALE_NAMESPACE>): RegionLabels {
  return {
    title: t('title'),
    newGroup: t('newGroup'),
    newSessionIn: (name: string) => t('newSessionIn', { name }),
    workspaceActions: (name: string) => t('workspaceActions', { name }),
    renameWorkspace: t('renameWorkspace'),
    deleteWorkspace: t('deleteWorkspace'),
    confirmDeleteWorkspace: (name: string) => t('confirmDeleteWorkspace', { name }),
    workspaceNamePrompt: t('workspaceNamePrompt'),
    workspaceConflict: (name: string) => t('workspaceConflict', { name }),
    ungrouped: t('ungrouped'),
    groupNamePrompt: t('groupNamePrompt'),
    renameGroup: t('renameGroup'),
    deleteGroup: t('deleteGroup'),
    confirmDeleteGroup: (name: string) => t('confirmDeleteGroup', { name }),
    confirmLabel: t('confirmLabel'),
    cancelLabel: t('cancelLabel'),
    closeLabel: t('closeLabel'),
    sessionActions: t('sessionActions'),
    moveToGroup: t('moveToGroup'),
    ungroup: t('ungroup'),
    status: {
      running: t('statusRunning'),
      // 官方对单复数各有一条文案；中文两份相同，这里按 n 选键保持同一契约。
      subagentsRunning: (n: number) =>
        n === 1 ? t('statusSubagentsRunningOne', { n }) : t('statusSubagentsRunningOther', { n }),
      waitingApproval: t('statusWaitingApproval'),
      planReview: t('statusPlanReview'),
      waitingAnswer: t('statusWaitingAnswer'),
      completed: t('statusCompleted'),
    },
    compareTabDescription: t('compareTabDescription'),
    empty: t('empty'),
    unimplemented: t('unimplemented'),
  }
}
