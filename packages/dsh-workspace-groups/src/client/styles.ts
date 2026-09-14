/**
 * 本包浏览器半边的样式。
 *
 * 取值对齐官方侧边栏组件（`dsh-client-ui-sidebar` 与 `dsh-client-ui-workspace`
 * 0.1.5-rc.2）的实际规则：工作区/分组行 34px、会话行 32px、圆角 8px、行内
 * 水平内边距 8px、图标列 16px、悬停用 `--dsw-alias-interactive-bg-hover`、
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

/* 右侧栏对照 tab 的外壳：把区域撑满 tab 体并留出与侧边栏一致的水平内边距。 */
.wg-tab {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 6px 12px 0;
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

/* 图标列：工作区的文件夹/箭头、分组的箭头、会话的状态位共用同一列宽。 */
.wg-slot {
  width: 16px;
  height: 20px;
  color: var(--dsw-alias-label-tertiary);
  flex: none;
  justify-content: center;
  align-items: center;
  display: inline-flex;
}

.wg-workspace-head,
.wg-group-head {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-tertiary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
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

/* 工作区行静止时是文件夹，悬停时换成箭头：两个槽都在文档流里，
   各自 16px，因此切换不会让标题横向跳动。 */
.wg-folder-active { color: var(--dsw-alias-state-business-primary); }
.wg-workspace-head .wg-chevron { display: none; }
.wg-workspace-head:hover .wg-chevron { display: inline-flex; }
.wg-workspace-head:hover .wg-folder { display: none; }

.wg-arrow { transition: transform .15s var(--ds-ease-in-out, ease-in-out); }
.wg-arrow-open { transform: rotate(90deg); }

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
  gap: 0;
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
  margin: 0 6px 0 4px;
  font-size: 14px;
  line-height: 20px;
}

/* 行尾操作位目前只有省略号占位，悬停或键盘聚焦时才出现。
   尺寸与配色对齐官方行内图标按钮：16px、4px 圆角、悬停提亮文字色。 */
.wg-row-action {
  opacity: 0;
  cursor: pointer;
  padding: 0;
  background: 0 0;
  border: none;
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary);
}
.wg-row-action:hover { color: var(--dsw-alias-label-primary); }
.wg-row:hover .wg-row-action,
.wg-row-selected .wg-row-action,
.wg-row:focus-within .wg-row-action,
.wg-row-action:focus { opacity: 1; }

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

/* 官方二级菜单面板固定向右展开（left: calc(100% + 10px)）。对照模式下
   区域挂在右侧栏、贴近窗口右缘，面板会开出屏幕外：宿主在 body 上挂
   data-wg-menu-flip 标记（由 COMPARE_MODE 决定），样式只在该标记下把
   面板翻到列表左侧，不依赖官方 hash 类名。 */
body[data-wg-menu-flip] [role='menu'] [role='menu'] {
  left: auto;
  right: calc(100% + 10px);
}
body[data-wg-menu-flip] [role='menu'] [role='menu']::before {
  left: auto;
  right: -10px;
}

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
  .wg-arrow { transition: none; }
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
