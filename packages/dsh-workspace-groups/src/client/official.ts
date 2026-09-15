/**
 * 官方 `workspace` 命名空间的复用面。
 *
 * 会话的「重命名 / 分叉 / 归档」与行尾相对时间都取官方 `ui-workspace` 的
 * 既有实现：文案绑它的 `workspace` 语言包（`TranslateNS<'workspace'>` 还含
 * `common` 回退键，因此 `close` / `cancel` 这类通用词同样可解析），动作调它的
 * `ctx.uiWorkspace` 服务与 `ctx.sessions` 绑定。这样官方改文案或行为后本包
 * 自动跟随，不需要逐条重新对齐。
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { relativeTime } from './runtime.ts'

/** 官方 `workspace` 命名空间的翻译函数。 */
export type WorkspaceTranslate = TranslateNS<'workspace'>

/** 官方那三项会话操作与相关对话框的文案。 */
export interface OfficialSessionLabels {
  /** 菜单里的「重命名」项，也是重命名对话框的确认按钮。 */
  rename: string
  /** 重命名会话对话框的标题。 */
  renameTitle: string
  /** 会话名输入框的占位与无障碍标签。 */
  sessionNamePrompt: string
  /** 菜单里的「分叉会话」项。 */
  fork: string
  /** 菜单里的「归档会话」项。 */
  archive: string
  /** 对话框的关闭与取消按钮（来自 `common` 回退键）。 */
  closeLabel: string
  cancelLabel: string
}

/**
 * 把官方语言包绑成三项操作的文案表。
 * @param t - 官方 `workspace` 命名空间的翻译函数。
 * @returns 语义化字段的文案表。
 */
export function officialSessionLabels(t: WorkspaceTranslate): OfficialSessionLabels {
  return {
    rename: t('rename'),
    renameTitle: t('rename.session.title'),
    sessionNamePrompt: t('field.sessionName'),
    fork: t('menu.fork'),
    archive: t('menu.archiveSession'),
    closeLabel: t('close'),
    cancelLabel: t('cancel'),
  }
}

/**
 * 官方风格的紧凑相对时间（中文「刚刚 / 5分钟 / 2天」，英文 now / 5min）。
 *
 * 与官方 `ui-workspace` 的 `timeLabel` 同一条规则：分桶交给 primitives 的
 * `relativeTime`，文案交给官方语言包。
 * @param updatedAt - 会话最近更新时间（epoch ms）。
 * @param now - 当前时刻（epoch ms）。
 * @param t - 官方 `workspace` 命名空间的翻译函数。
 * @returns 可直接显示的相对时间文案。
 */
export function relativeTimeLabel(
  updatedAt: number,
  now: number,
  t: WorkspaceTranslate,
): string {
  const { unit, n } = relativeTime(updatedAt, now)
  return unit === 'now' ? t('time.now') : t(`time.${unit}`, { n })
}
