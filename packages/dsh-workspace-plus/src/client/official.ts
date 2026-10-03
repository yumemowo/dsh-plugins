/**
 * 官方 `workspace` 命名空间的复用面
 *
 * 会话的「重命名 / 分叉 / 归档」与行尾相对时间都取官方 `ui-workspace` 的既有实现
 * 文案绑它的 `workspace` 语言包（`TranslateNS<'workspace'>` 还含 `common` 回退键）
 * 因此 `close` / `cancel` 这类通用词同样可解析
 * 动作调它的 `ctx.uiWorkspace` 服务与 `ctx.sessions` 绑定
 * 这样官方改文案或行为后本包自动跟随，不需要逐条重新对齐
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { relativeTime } from './runtime.ts'

/** 官方 `workspace` 命名空间的翻译函数 */
export type WorkspaceTranslate = TranslateNS<'workspace'>

/**
 * 官方 `sidebar` 命名空间的翻译函数
 *
 * 外壳的全局控件文案在这里（如新建会话按钮）
 * 本包的行右键菜单要复用官方那个按钮的动词短语，因此需要多绑一个命名空间——两个命名空间的键都只被投影一次，语言切换后仍跟着走
 */
export type SidebarTranslate = TranslateNS<'sidebar'>

/** 官方那四项会话操作与相关对话框的文案 */
export interface OfficialSessionLabels {
  /** 菜单里的「置顶会话」项，未置顶的行用它 */
  pin: string
  /** 菜单里的「取消置顶」项，已置顶的行用它 */
  unpin: string
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
  /** 结果被条数上限截断时的提示，上限由调用方传入 */
  truncated: (n: number) => string
}

/**
 * 把官方语言包绑成 header 与添加工作区流程的文案表
 *
 * 入口文案官方分两个键：header 按钮用 `workspace.add`（「添加工作区」）
 * 工作区选择菜单里的那一项才是 `menu.addWorkspace`（「添加工作区…」）
 * 本包只有 header 入口这一种形态，因此取前者
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
 * 入口的 tooltip 与无障碍标签官方分两个键：tooltip 用通用的「搜索」（`search`，落在 `common` 命名空间、由查找链兜住）
 * 无障碍标签才点明对象（`search.sessions.aria`）。本包照官方的分工逐键取用
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

/** 官方悬停卡片（工作区与会话共用）的文案与格式 */
export interface OfficialHoverLabels {
  /**
   * 卡片的复制提示，取官方 `common` 命名空间的通用词
   *
   * 卡片整体可点即复制，文案同时充当它的无障碍标签（官方 `HoverCard` 的 `copyLabel`）
   * 因此要用通用词而不是点明对象的说法
   */
  copy: string
  /** 复制成功后的反馈文案，由原语在卡片内原地替换显示 */
  copied: string
  /**
   * 绝对创建时刻（`创建于 2026年9月14日 03:31`）
   *
   * 年月日走官方 `date.ymd` 模板，时钟部分补零，不调 `toLocaleString`——那会跟着
   * 浏览器语言走，与界面语言不一致时同一张卡片里会出现两种语言
   */
  created: (createdAt: number) => string
  /** 悬停卡片形态的相对时间（`5分钟前`），`刚刚` 那一档不加后缀 */
  timeAgo: (updatedAt: number, now: number) => string
}

/**
 * 把官方语言包绑成会话菜单的文案表
 *
 * 对话框的「取消 / 关闭」不在这里：它们走官方 `common` 命名空间，由拿到
 * `t` 座位的对话框组件直接解析
 * @returns 语义化字段的文案表
 */
export function officialSessionLabels(t: WorkspaceTranslate): OfficialSessionLabels {
  return {
    pin: t('menu.pinSession'),
    unpin: t('menu.unpinSession'),
    rename: t('rename'),
    renameTitle: t('rename.session.title'),
    sessionNamePrompt: t('field.sessionName'),
    fork: t('menu.fork'),
    archive: t('menu.archiveSession'),
  }
}

/**
 * 把官方语言包绑成悬停卡片的文案与格式
 *
 * 逐键取用官方 `ui-workspace` 的 `WorkspaceHoverContent` / `SessionHoverContent`
 * 也就是 `hover.created` / `hover.copied` / `date.ymd` / `time.ago` 这一批键
 * 因此官方改措辞或改日期形态时本包自动跟随
 * @returns 卡片文案与两个格式化函数
 */
export function officialHoverLabels(t: WorkspaceTranslate): OfficialHoverLabels {
  return {
    // 「复制」是跨功能通用词，落在官方 common 命名空间，由查找链兜住
    copy: t('copy'),
    copied: t('hover.copied'),
    created: (createdAt: number) => createdLabel(createdAt, t),
    timeAgo: (updatedAt: number, now: number) => hoverTimeLabel(updatedAt, now, t),
  }
}

/** 补零到两位，时钟部分用 */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * 绝对创建时刻
 * @returns `创建于 2026年9月14日 03:31` 形态的文案
 */
function createdLabel(createdAt: number, t: WorkspaceTranslate): string {
  const d = new Date(createdAt)
  const ymd = t('date.ymd', { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() })
  return t('hover.created', { time: `${ymd} ${pad2(d.getHours())}:${pad2(d.getMinutes())}` })
}

/**
 * 悬停卡片形态的相对时间
 *
 * 与行尾那份的区别只有一层：距离套上官方 `time.ago` 的模板（`{t}前`），而 `刚刚` 那一档保持原样
 * 官方的注释写明了理由，「now ago」不成话
 * @returns 可直接显示的相对时间文案
 */
function hoverTimeLabel(updatedAt: number, now: number, t: WorkspaceTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t('time.ago', { t: t(`time.${unit}`, { n }) })
}

/**
 * 官方风格的紧凑相对时间（中文「刚刚 / 5分钟 / 2天」，英文 now / 5min）
 *
 * 与官方 `ui-workspace` 的 `timeLabel` 同一条规则：分桶交给 primitives 的 `relativeTime`
 * 文案交给官方语言包的 `time.*` 键
 * @returns 可直接显示的相对时间文案
 */
export function timeLabel(updatedAt: number, now: number, t: WorkspaceTranslate): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}
