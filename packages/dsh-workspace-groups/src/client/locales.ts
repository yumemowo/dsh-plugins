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

/** 简体中文字典，同时是键集的事实来源 */
export const zh = {
  'newGroup': '新建分组',
  'renameGroup': '重命名分组',
  'deleteGroup': '删除分组',
  'groupNamePrompt': '分组名称',
  'delete.desc.group': '删除分组“{name}”？组内会话会移出分组，会话本身不受影响。',
  'moveToGroup': '分组',
  'ungroup': '取消分组',
  'compareTabDescription': '分组区域的对照视图（左侧为官方工作区列表）',
  'unimplemented': '分组为实验特性：搜索、归档、拖拽暂未提供。',
}

/** 英文字典，键集与 {@link zh} 完全一致 */
export const en = {
  'newGroup': 'New group',
  'renameGroup': 'Rename group',
  'deleteGroup': 'Delete group',
  'groupNamePrompt': 'Group name',
  'delete.desc.group':
    'Delete group “{name}”? Its sessions leave the group; the sessions themselves are unaffected.',
  'moveToGroup': 'Group',
  'ungroup': 'Ungroup',
  'compareTabDescription': 'Grouping region for side-by-side comparison with the official list',
  'unimplemented': 'Groups are experimental: search, archive and drag are not available yet.',
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
