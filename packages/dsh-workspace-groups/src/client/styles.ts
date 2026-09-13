/**
 * 本包浏览器半边的样式。
 *
 * 取值对齐官方侧边栏组件（`dsh-client-ui-sidebar` 与 `dsh-client-ui-workspace`）
 * 的实际规则：行高 32px、圆角 8px、悬停用 `--dsw-alias-interactive-bg-hover`、
 * 文字色走 `--dsw-alias-label-primary/secondary/tertiary`，滚动条留白复用
 * shell 提供的 `--dsh-sidebar-inline-padding`。
 *
 * 通过带 `data-plugin` / `data-plugin-css` 标记的 `<style>` 标签注入：
 * 客户端模块系统按这两个属性认领样式标签并做 HMR 记账。
 */

/** 样式表内容的唯一标识；重复挂载时用它去重。 */
const STYLE_TAG_ID = '@your-scope/dsh-workspace-groups/src/client/region.css'

const CSS = `
.wg-root {
  box-sizing: border-box;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  color: var(--dsw-alias-label-primary);
  font-size: 14px;
  line-height: 20px;
}

.wg-rail { box-sizing: border-box; display: flex; flex-direction: column; }
.wg-rail-button {
  cursor: pointer;
  width: 36px;
  height: 36px;
  color: var(--dsw-alias-label-primary);
  background: 0 0;
  border: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.wg-rail-button:hover { background: var(--dsw-alias-interactive-bg-hover); }

.wg-list {
  box-sizing: border-box;
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  scrollbar-gutter: stable;
  padding-bottom: 16px;
}

.wg-workspace { position: relative; display: flex; flex-direction: column; }
.wg-workspace + .wg-workspace { margin-top: 4px; }

.wg-workspace-head,
.wg-group-head {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-tertiary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  height: 34px;
}
.wg-workspace-head:hover,
.wg-group-head:hover { background: var(--dsw-alias-interactive-bg-hover); }

.wg-workspace-title,
.wg-group-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.wg-workspace-title { color: var(--dsw-alias-label-secondary); font-weight: 500; }
.wg-group-label { color: var(--dsw-alias-label-tertiary); }

.wg-chevron {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary);
  transition: transform .15s var(--ds-ease-in-out, ease-in-out);
}
.wg-chevron-open { transform: rotate(90deg); }

.wg-sessions { display: flex; flex-direction: column; }
.wg-sessions > * + * { margin-top: 2px; }

.wg-row {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
}
.wg-row:hover,
.wg-row-selected { background: var(--dsw-alias-interactive-bg-hover); }

.wg-row-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}

/* 归组入口只在行悬停或聚焦时出现，平时保持原生列表的干净观感。 */
.wg-assign {
  flex: none;
  max-width: 96px;
  opacity: 0;
  cursor: pointer;
  color: var(--dsw-alias-label-tertiary);
  background: 0 0;
  border: none;
  font: inherit;
  font-size: 12px;
  line-height: 18px;
  padding: 0;
}
.wg-row:hover .wg-assign,
.wg-row-selected .wg-assign,
.wg-assign:focus { opacity: 1; }

.wg-icon-button {
  flex: none;
  cursor: pointer;
  width: 28px;
  height: 28px;
  color: var(--dsw-alias-label-secondary);
  background: 0 0;
  border: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.wg-icon-button:hover {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}

/* 行内操作按钮：悬停或聚焦该行时才显示，避免常驻噪音。 */
.wg-hover-action { opacity: 0; }
.wg-workspace-head:hover .wg-hover-action,
.wg-workspace-head:focus-within .wg-hover-action,
.wg-group-head:hover .wg-hover-action,
.wg-group-head:focus-within .wg-hover-action { opacity: 1; }

.wg-empty {
  color: var(--dsw-alias-label-tertiary);
  padding: 16px 12px;
  font-size: 13px;
}

.wg-note {
  color: var(--dsw-alias-label-caption, var(--dsw-alias-label-tertiary));
  padding: 10px 12px 0;
  font-size: 12px;
  line-height: 18px;
}

@media (prefers-reduced-motion: reduce) {
  .wg-chevron { transition: none; }
}
`

/**
 * 注入样式表；已注入过则跳过。
 *
 * 客户端模块系统会给未标记的 style 标签打上当前插件的 `data-plugin`，
 * 这里显式标记以配合它的认领与去重。
 */
export function insertStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(STYLE_TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = '@your-scope/dsh-workspace-groups'
  tag.dataset.pluginCss = STYLE_TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}
