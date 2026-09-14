/**
 * 本包浏览器半边的样式。
 *
 * 取值对齐官方侧边栏组件（`dsh-client-ui-sidebar` 与 `dsh-client-ui-workspace`
 * 0.1.5-rc.2）的实际规则：工作区/分组行 34px、会话行 32px、圆角 8px、行内
 * 水平内边距 8px、图标列 16px、悬停用 `--dsw-alias-interactive-bg-hover`、
 * 文字色走 `--dsw-alias-label-primary/secondary/tertiary`，滚动条留白复用
 * shell 提供的 `--dsh-sidebar-inline-padding`。
 *
 * 文字层级照官方照搬：容器行（`projectRow`）与其中的标题一律
 * `label-primary` 14px/20px，且都**不加字重**——官方工作区标题与会话标题
 * 同色同字号，只靠行高（34px vs 32px）区分层级。字号与行高成对写在叶子上，
 * 根节点不设 line-height（官方 `.empty` 等就这样吃浏览器默认值）。
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
  /* 正圆必须配对 round，否则会被主题的全局超级椭圆磨成方圆角。 */
  corner-shape: round;
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

/* 容器行底色取官方 projectRow 的 label-primary；图标槽自己显式设 tertiary，
   所以这里的颜色只影响直接继承的行内文字。 */
.wg-workspace-head,
.wg-group-head {
  box-sizing: border-box;
  cursor: pointer;
  user-select: none;
  color: var(--dsw-alias-label-primary);
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  height: 34px;
}
.wg-workspace-head:hover,
.wg-group-head:hover { background: var(--dsw-alias-interactive-bg-hover); }

/* 字号与行高成对写在叶子上（官方 .title 即如此），根节点不设 line-height。 */
.wg-workspace-title,
.wg-group-label {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
}
/* 官方工作区标题即 label-primary 14px/20px，不加字重：与会话标题同色同字号，
   层级只由行高（34px vs 32px）承担。 */
.wg-workspace-title { color: var(--dsw-alias-label-primary); }
/* 分组是工作区之下的一层，靠更暗的色阶表示「低一级」。 */
.wg-group-label { color: var(--dsw-alias-label-tertiary); }

/* 工作区行静止时是文件夹，悬停时换成箭头：两个槽都在文档流里，
   各自 16px，因此切换不会让标题横向跳动。悬停箭头的色阶同官方 .chevron。 */
.wg-folder-active { color: var(--dsw-alias-state-business-primary); }
.wg-workspace-head .wg-chevron { display: none; color: var(--dsw-alias-label-caption); }
.wg-workspace-head:hover .wg-chevron { display: inline-flex; }
.wg-workspace-head:hover .wg-folder { display: none; }

.wg-arrow { transition: transform .15s var(--ds-ease-in-out, ease-in-out); }
.wg-arrow-open { transform: rotate(90deg); }

/* 相邻行的 2px 间距。官方一条 .groupSection > * + * 就同时覆盖了
   「容器行 → 首个会话行」与「会话 → 会话」，因为那里的会话行是容器行的
   直接兄弟。本包把分组结构多包了 .wg-workspace-body / .wg-group / .wg-sessions
   三层，同一规则要在每层各写一次，分组头与首个会话行之间才会有间距。
   各层都建成 flex 列容器：flex 容器的子项边距不合并，间距值所见即所得。 */
.wg-workspace-body,
.wg-group,
.wg-sessions { display: flex; flex-direction: column; }

.wg-workspace > * + *,
.wg-workspace-body > * + *,
.wg-group > * + *,
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

/* 行内操作按钮：默认隐藏，仅在该行悬停、菜单展开、或键盘聚焦时出现。
   不用 :focus / :focus-within / 选中态——鼠标点过之后焦点仍留在按钮或行上，
   会让按钮一直可见；:focus-visible 只在键盘导航时命中，既去掉鼠标残留，
   又保留清晰可见的键盘焦点。
   隐藏时一并禁用指针事件：否则会留下一个看不见却能点中的 16px 热区。 */
.wg-row-action {
  flex: none;
  opacity: 0;
  pointer-events: none;
  cursor: pointer;
  width: 16px;
  height: 16px;
  padding: 0;
  background: 0 0;
  border: none;
  border-radius: 4px;
  color: var(--dsw-alias-label-tertiary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.wg-row-action:hover { color: var(--dsw-alias-label-primary); }

/* 工作区行尾的操作位容器：官方 .rowActions 的 gap:12px 与 20px 行高。
   本包的操作按钮始终参与布局、只切换不透明度，因此悬停时标题不会位移。 */
.wg-row-actions {
  flex: none;
  height: 20px;
  display: inline-flex;
  align-items: center;
  gap: 12px;
}

/* 显示路径只有三条：所在行悬停、菜单展开期间（否则锚点按钮会在菜单还开着时
   消失）、以及键盘聚焦。工作区行与分组行各有自己的行类，因此悬停选择器
   要分别列出。 */
.wg-row:hover .wg-row-action,
.wg-workspace-head:hover .wg-row-action,
.wg-group-head:hover .wg-row-action,
.wg-row-menu-open .wg-row-action,
.wg-row-action:focus-visible { opacity: 1; pointer-events: auto; }

/* 对话框内的错误提示（如工作区重名）：只上错误色，几何走官方 Modal。 */
.wg-dialog-error {
  color: var(--dsw-alias-state-error-primary);
  margin-top: 8px;
  font-size: 12px;
  line-height: 18px;
}

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

/* 危险操作的确认按钮：只换文字色，按钮几何仍由官方 Button 拥有。
   与官方删除按钮同一做法（错误色 token --dsw-alias-state-error-primary）。 */
.wg-danger-action:not(:disabled) { color: var(--dsw-alias-state-error-primary); }

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
