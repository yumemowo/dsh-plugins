import { NS, zh } from '../src/client/locales.ts'
import type { RegionTranslate } from '../src/client/locales.ts'
import type { SidebarTranslate, WorkspaceTranslate } from '../src/client/official.ts'

/**
 * 测试用的语言包替身
 *
 * 本包自己的字典直接取 `locales.ts` 的真实 `zh`，因此键写错时测试会以
 * 「显示成原始键名」暴露，而不是静默通过；官方 `workspace` 字典在 node
 * 环境取不到（它只存在于客户端的 bundle 里），这里按官方键名手写一份
 */

/** 官方 `workspace` 命名空间的键与中文文案（测试替身） */
export const OFFICIAL_WORKSPACE_ZH: Record<string, string> = {
  'section.workspaces': '工作区',
  'section.sessions': '会话',
  'session.new': '新会话',
  'group.ungrouped': '未分组',
  'empty.none': '暂无会话',
  'workspace.add': '添加工作区',
  'menu.addWorkspace': '添加工作区…',
  'folderError.title': '无法打开文件夹',
  'folderError.retry': '重新选择',
  'search.sessions.aria': '搜索会话',
  'search.placeholder': '搜索会话…',
  'search.clear': '清除搜索',
  'search.results.aria': '搜索结果',
  'search.noMatches': '无匹配会话',
  'search.hasMore': '仅显示前 {n} 条结果，请缩小搜索范围。',
  'viewOptions.label': '视图选项',
  'actions.workspace.aria': '工作区“{name}”的操作',
  'actions.session.aria': '会话“{name}”的操作',
  'actions.newSession.aria': '在“{name}”中新建会话',
  rename: '重命名',
  'rename.workspace.title': '重命名工作区',
  'rename.session.title': '重命名会话',
  'delete.workspace': '删除工作区',
  'delete.desc':
    '将把“{name}”从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在“未分组”下。',
  'field.workspaceName': '工作区名称',
  'field.sessionName': '会话名称',
  'conflict.named': '已存在名为“{name}”的工作区。',
  'menu.fork': '分叉会话',
  'menu.archiveSession': '归档会话',
  'status.running': '进行中',
  'status.subagentsRunning.one': '{n} 个子代理运行中',
  'status.subagentsRunning.other': '{n} 个子代理运行中',
  'status.waitingApproval': '等待审批',
  'status.planReview': '计划待审',
  'status.waitingAnswer': '等待回答',
  'status.completed': '已完成',
  'status.idle': '空闲',
  'hover.created': '创建于 {time}',
  'hover.copied': '已复制',
  'date.ymd': '{y}年{m}月{d}日',
  'time.now': '刚刚',
  'time.minutes': '{n}分钟',
  'time.hours': '{n}小时',
  'time.days': '{n}天',
  'time.months': '{n}个月',
  'time.years': '{n}年',
  'time.ago': '{t}前',
}

/** 官方 `common` 命名空间里的通用词，本包与官方共用 */
const COMMON_ZH: Record<string, string> = {
  ok: '确定',
  cancel: '取消',
  close: '关闭',
  search: '搜索',
  copy: '复制',
}

/**
 * 官方 `sidebar` 命名空间的键与中文文案（测试替身）
 *
 * 本包只取其中的「新建会话」——外壳新建按钮的动词短语，行右键菜单复用它
 */
export const OFFICIAL_SIDEBAR_ZH: Record<string, string> = {
  'session.new': '新会话',
  'session.new.label': '新建会话',
}

/** 用一个键表造翻译函数；未命中的键原样返回，便于断言暴露缺键 */
export function translateWith(dict: Record<string, string>): (key: string, params?: Record<string, unknown>) => string {
  return (key, params) => {
    const template = dict[key] ?? key
    if (params === undefined) return template
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    )
  }
}

/** 本包命名空间的翻译函数替身：真实字典 + 官方 `common` 回退词 */
export function regionTranslate(): RegionTranslate {
  return translateWith({ ...COMMON_ZH, ...zh }) as RegionTranslate
}

/** 官方 `workspace` 命名空间的翻译函数替身 */
export function workspaceTranslate(): WorkspaceTranslate {
  return translateWith({ ...COMMON_ZH, ...OFFICIAL_WORKSPACE_ZH }) as WorkspaceTranslate
}

/** 官方 `sidebar` 命名空间的翻译函数替身 */
export function sidebarTranslate(): SidebarTranslate {
  return translateWith({ ...COMMON_ZH, ...OFFICIAL_SIDEBAR_ZH }) as SidebarTranslate
}

/**
 * 按命名空间取翻译函数替身，与 `LocaleRuntime.bind` 同形
 *
 * 本包命名空间用真实字典，两个官方命名空间各用官方键名的替身——三边都只提供
 * 各自拥有的键，因此「本包多余地复制官方文案」这类问题会在这里暴露
 */
export function translateFor(ns: string): RegionTranslate {
  if (ns === NS) return regionTranslate()
  return (ns === 'workspace' ? workspaceTranslate() : sidebarTranslate()) as RegionTranslate
}
