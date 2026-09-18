/**
 * 官方 `workspace` 命名空间的复用面
 *
 * 会话的「重命名 / 分叉 / 归档」与行尾相对时间都取官方 `ui-workspace` 的
 * 既有实现：文案绑它的 `workspace` 语言包（`TranslateNS<'workspace'>` 还含
 * `common` 回退键，因此 `close` / `cancel` 这类通用词同样可解析），动作调它的
 * `ctx.uiWorkspace` 服务与 `ctx.sessions` 绑定。这样官方改文案或行为后本包
 * 自动跟随，不需要逐条重新对齐
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { relativeTime } from './runtime.ts'

/** 官方 `workspace` 命名空间的翻译函数 */
export type WorkspaceTranslate = TranslateNS<'workspace'>

/**
 * 官方 `sidebar` 命名空间的翻译函数
 *
 * 外壳的全局控件文案在这里（如新建会话按钮）。本包的行右键菜单要复用官方
 * 那个按钮的动词短语，因此需要多绑一个命名空间——两个命名空间的键都只被
 * 投影一次，语言切换后仍跟着走
 */
export type SidebarTranslate = TranslateNS<'sidebar'>

/** 官方那三项会话操作与相关对话框的文案 */
export interface OfficialSessionLabels {
  /** 菜单里的「重命名」项，也是重命名对话框的确认按钮 */
  rename: string
  /** 重命名会话对话框的标题 */
  renameTitle: string
  /** 会话名输入框的占位与无障碍标签 */
  sessionNamePrompt: string
  /** 菜单里的「分叉会话」项 */
  fork: string
  /** 菜单里的「归档会话」项 */
  archive: string
}

/** 官方 section header 与「添加工作区」流程的文案 */
export interface OfficialAddLabels {
  /** 「添加工作区」入口的 tooltip 与无障碍标签 */
  add: string
  /** 采纳选中目录失败时错误框的标题 */
  folderErrorTitle: string
  /** 错误框里的「重新选择」按钮 */
  folderErrorRetry: string
  /** 视图选项入口的文案，同时是占位按钮的无障碍标签 */
  viewOptions: string
}

/** 官方搜索入口、输入框与结果列表的文案 */
export interface OfficialSearchLabels {
  /** 入口的 tooltip 文案，取官方通用的「搜索」 */
  hint: string
  /** 入口按钮的无障碍标签，官方在这里点明对象 */
  entry: string
  /** 输入框的占位文案 */
  placeholder: string
  /** 清除按钮的无障碍标签 */
  clear: string
  /** 结果列表的无障碍标签 */
  results: string
  /** 没有任何匹配时的空态 */
  noMatches: string
  /** 结果被条数上限截断时的提示；上限由调用方传入 */
  truncated: (n: number) => string
}

/**
 * 把官方语言包绑成 header 与添加工作区流程的文案表
 *
 * 入口文案官方分两个键：header 按钮用 `workspace.add`（「添加工作区」），
 * 工作区选择菜单里的那一项才是 `menu.addWorkspace`（「添加工作区…」）。
 * 本包只有 header 入口这一种形态，因此取前者
 * @param t - 官方 `workspace` 命名空间的翻译函数
 * @returns 语义化字段的文案表
 */
export function officialAddLabels(t: WorkspaceTranslate): OfficialAddLabels {
  return {
    add: t('workspace.add'),
    folderErrorTitle: t('folderError.title'),
    folderErrorRetry: t('folderError.retry'),
    viewOptions: t('viewOptions.label'),
  }
}

/**
 * 把官方语言包绑成搜索入口、输入框与结果列表的文案表
 *
 * 入口的 tooltip 与无障碍标签官方分两个键：tooltip 用通用的「搜索」
 *（`search`，落在 `common` 命名空间、由查找链兜住），无障碍标签才点明对象
 *（`search.sessions.aria`）。本包照官方的分工逐键取用
 * @param t - 官方 `workspace` 命名空间的翻译函数
 * @returns 语义化字段的文案表
 */
export function officialSearchLabels(t: WorkspaceTranslate): OfficialSearchLabels {
  return {
    hint: t('search'),
    entry: t('search.sessions.aria'),
    placeholder: t('search.placeholder'),
    clear: t('search.clear'),
    results: t('search.results.aria'),
    noMatches: t('search.noMatches'),
    truncated: (n: number) => t('search.hasMore', { n }),
  }
}

/**
 * 把官方语言包绑成三项操作的文案表
 *
 * 对话框的「取消 / 关闭」不在这里：它们走官方 `common` 命名空间，由拿到
 * `t` 座位的对话框组件直接解析
 * @param t - 官方 `workspace` 命名空间的翻译函数
 * @returns 语义化字段的文案表
 */
export function officialSessionLabels(t: WorkspaceTranslate): OfficialSessionLabels {
  return {
    rename: t('rename'),
    renameTitle: t('rename.session.title'),
    sessionNamePrompt: t('field.sessionName'),
    fork: t('menu.fork'),
    archive: t('menu.archiveSession'),
  }
}

/**
 * 官方风格的紧凑相对时间（中文「刚刚 / 5分钟 / 2天」，英文 now / 5min）
 *
 * 与官方 `ui-workspace` 的 `timeLabel` 同一条规则：分桶交给 primitives 的
 * `relativeTime`，文案交给官方语言包的 `time.*` 键
 * @param updatedAt - 会话最近更新时间（epoch ms）
 * @param now - 当前时刻（epoch ms）
 * @param t - 官方 `workspace` 命名空间的翻译函数
 * @returns 可直接显示的相对时间文案
 */
export function timeLabel(updatedAt: number, now: number, t: WorkspaceTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}
