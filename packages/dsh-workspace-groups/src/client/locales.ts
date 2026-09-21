/**
 * 本包占用的语言包命名空间与自有文案
 *
 * 只有官方 `workspace` 命名空间没有对应词的自有文案才在这里另起键名；
 * 官方已有的文案（区域标题、工作区改名/删除、状态点、相对时间等）不复制
 * 一份，直接读官方命名空间——见 `labels.ts` 的投影与 `official.ts`
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** 本包的命名空间：按官方惯例取短名，不带包前缀 */
export const NS = 'workspaceGroups'

/**
 * 简体中文字典，同时是键集的事实来源
 *
 * 只有官方 `workspace` 命名空间没有对应词的自有文案才在这里另起键名
 */
export const zh = {
  'actions.group.aria': '分组“{name}”的操作',
  'newGroup': '新建分组',
  'renameGroup': '重命名分组',
  'deleteGroup': '删除分组',
  'groupNamePrompt': '分组名称',
  'delete.desc.group': '删除分组“{name}”？组内会话会移出分组，会话本身不受影响。',
  'moveToGroup': '移动到…',
  'ungroup': '取消分组',
  'actions.virtualWorkspace.aria': '工作区分组“{name}”的操作',
  'newVirtualWorkspace': '新建工作区分组',
  'menu.newVirtualWorkspace': '新建工作区分组…',
  'renameVirtualWorkspace': '重命名工作区分组',
  'deleteVirtualWorkspace': '删除工作区分组',
  'virtualWorkspaceNamePrompt': '工作区分组名称',
  'delete.desc.virtualWorkspace':
    '删除工作区分组“{name}”？组内工作区会移出分组，工作区本身不受影响。',
  'moveToVirtualWorkspace': '移动到…',
  'ungroupWorkspace': '移出工作区分组',
  'virtualWorkspaceEmpty': '这个工作区分组里还没有工作区',
  'compareTabDescription': '分组区域的对照视图（左侧为官方工作区列表）',
  'unimplemented': '分组为实验特性：归档、拖拽暂未提供。',
  'picker.entry': '选择工作区',
  'picker.change': '切换工作区：{name}',
  'picker.all': '全部工作区',
  'picker.recent': '最近使用',
  'picker.pinned': '置顶',
  'picker.pin': '置顶“{name}”',
  'picker.unpin': '取消置顶“{name}”',
  'picker.rename': '重命名“{name}”',
  'picker.remove': '删除“{name}”',
  'picker.followFocus': '切换到新工作区',
}

/** 英文字典，键集与 {@link zh} 完全一致 */
export const en = {
  'actions.group.aria': 'Group actions for {name}',
  'newGroup': 'New group',
  'renameGroup': 'Rename group',
  'deleteGroup': 'Delete group',
  'groupNamePrompt': 'Group name',
  'delete.desc.group':
    'Delete group “{name}”? Its sessions leave the group; the sessions themselves are unaffected.',
  'moveToGroup': 'Move to…',
  'ungroup': 'Ungroup',
  'actions.virtualWorkspace.aria': 'Workspace group actions for {name}',
  'newVirtualWorkspace': 'New workspace group',
  'menu.newVirtualWorkspace': 'New workspace group…',
  'renameVirtualWorkspace': 'Rename workspace group',
  'deleteVirtualWorkspace': 'Delete workspace group',
  'virtualWorkspaceNamePrompt': 'Workspace group name',
  'delete.desc.virtualWorkspace':
    'Delete workspace group “{name}”? Its workspaces leave the group; the workspaces themselves are unaffected.',
  'moveToVirtualWorkspace': 'Move to…',
  'ungroupWorkspace': 'Remove from workspace group',
  'virtualWorkspaceEmpty': 'No workspace in this workspace group yet',
  'compareTabDescription': 'Grouping region for side-by-side comparison with the official list',
  'unimplemented': 'Groups are experimental: archive and drag are not available yet.',
  'picker.entry': 'Select a workspace',
  'picker.change': 'Switch workspace: {name}',
  'picker.all': 'All workspaces',
  'picker.recent': 'Recent',
  'picker.pinned': 'Pinned',
  'picker.pin': 'Pin {name}',
  'picker.unpin': 'Unpin {name}',
  'picker.rename': 'Rename {name}',
  'picker.remove': 'Delete {name}',
  'picker.followFocus': 'Switch to the new workspace',
} as const

/** 本命名空间的键域，同时是 {@link zh} 的键集 */
export type RegionKey = keyof typeof zh

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** 分组区域自有的界面文案 */
    workspaceGroups: RegionKey
  }
}

/** 本命名空间的翻译函数 */
export type RegionTranslate = TranslateNS<typeof NS>
