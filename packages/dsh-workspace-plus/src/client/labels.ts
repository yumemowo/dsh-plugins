/**
 * 界面文案的契约与投影
 *
 * 字典本体在 `locales.ts`（只含本包自有文案），本模块把三个命名空间的翻译函数投影成组件消费的语义化文案表
 * 让组件只认字段名，不认键名：
 *
 * - 官方 `workspace` 已有的文案（区域标题、工作区改名/删除、会话行标签状态点、空态）直接用官方键
 *   不复制官方译文——官方改措辞时本包自动跟随，两处同屏也不会出现两套说法
 * - 官方 `sidebar` 已有的文案（行右键菜单的「新建会话」）同样直接取官方键
 * - 官方没有对应词的自有文案（建组、分组管理、实验特性说明）取本包命名空间
 *
 * 通用词（`ok` / `cancel` / `close`）三个命名空间都能解析：查找链在命名空间未命中后回退到官方 `common`
 */
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import { officialAddLabels, officialHoverLabels, officialSearchLabels } from './official.ts'
import type {
  OfficialAddLabels,
  OfficialHoverLabels,
  OfficialSearchLabels,
  SidebarTranslate,
  WorkspaceTranslate,
} from './official.ts'

/** 会话状态位的无障碍文案 */
export interface SessionStatusLabels {
  /** 本会话正在运行 */
  running: string
  /** 有 n 个运行中的子代理，中英文的复数形态一致 */
  subagentsRunning: (n: number) => string
  /** 等待用户审批工具调用 */
  waitingApproval: string
  /** 等待用户审阅计划 */
  planReview: string
  /** 等待用户回答问题 */
  waitingAnswer: string
  /** 本轮已完成、尚未打开（绿色提醒点） */
  completed: string
  /**
   * 空闲
   *
   * 行首不画点，但悬停卡片要像官方一样把它列成一条，因此这一格仍需有文案
   */
  idle: string
}

/** 区域组件消费的文案表 */
export interface RegionLabels {
  /** 区域标题，同时是窄栏展开按钮的无障碍标签 */
  title: string
  /** 菜单里的「新建分组」项，也是新建分组对话框的标题 */
  newGroup: string
  /** 新建会话按钮的无障碍标签，工作区名由调用方传入 */
  newSessionIn: (name: string) => string
  /**
   * 容器行右键菜单里的「新建会话」项
   *
   * 取官方 sidebar 新建按钮的动词短语 `session.new.label`
   * 与行内 `+` 的无障碍标签（`actions.newSession.aria`，带对象名）分工不同：菜单项是一次性动作，读作动词短语，和「新建分组 / 重命名 / 删除工作区」一致
   */
  newSessionItem: string
  /** 新建中（空白）会话行的固定名，取官方 `session.new` */
  newSession: string
  /** 工作区「更多操作」按钮的无障碍标签，工作区名由调用方传入 */
  workspaceActions: (name: string) => string
  /**
   * 工作区行菜单里的「重命名」项
   *
   * 官方工作区菜单用的就是通用动词 `rename`（`ui-workspace` 里 `label: t("rename")`）
   * 并不是 `rename.workspace.title`——后者只作对话框标题。这里照官方保持同一分工
   */
  rename: string
  /** 重命名工作区对话框的标题 */
  renameWorkspace: string
  /** 「删除工作区」菜单项、对话框标题与确认按钮 */
  deleteWorkspace: string
  /** 删除工作区的说明文案，工作区名由调用方传入 */
  confirmDeleteWorkspace: (name: string) => string
  /** 工作区名输入框的占位与无障碍标签 */
  workspaceNamePrompt: string
  /** 与既有工作区重名时的提示，名称由调用方传入 */
  workspaceConflict: (name: string) => string
  /** 无工作区归属的会话区段标题 */
  ungrouped: string
  /** 分组名输入框的占位与无障碍标签 */
  groupNamePrompt: string
  /** 「删除分组」按钮与对话框标题 */
  deleteGroup: string
  /** 分组名对话框的标题（重命名时用） */
  renameGroup: string
  /** 分组行「更多操作」按钮的无障碍标签，分组名由调用方传入 */
  groupActions: (name: string) => string
  /** 工作区行菜单里的「移动到…」一级项文案，二级子菜单列工作区分组 */
  moveToVirtualWorkspace: string
  /** 该一级项的子菜单里「新建工作区分组」一项 */
  newVirtualWorkspace: string
  /**
   * 二级菜单里那一项的文案，带省略号
   *
   * 与 {@link newVirtualWorkspace} 分开：菜单项带省略号表示「点下去还要再填一次」
   * 而 header 入口与命名框标题是不带省略号的完整说法
   * 官方 `menu.addWorkspace` 与 `workspace.add` 就是这个分工
   */
  newVirtualWorkspaceMenu: string
  /** 工作区已归组时，「移动到…」下方那一项「移出工作区分组」的文案 */
  ungroupWorkspace: string
  /** 工作区分组行「更多操作」按钮的无障碍标签，分组名由调用方传入 */
  virtualWorkspaceActions: (name: string) => string
  /** 重命名工作区分组对话框的标题 */
  renameVirtualWorkspace: string
  /** 「删除工作区分组」菜单项、对话框标题与确认按钮 */
  deleteVirtualWorkspace: string
  /** 删除工作区分组的说明文案，分组名由调用方传入 */
  confirmDeleteVirtualWorkspace: (name: string) => string
  /** 工作区分组名输入框的占位与无障碍标签 */
  virtualWorkspaceNamePrompt: string
  /** 空的工作区分组里的占位文案 */
  virtualWorkspaceEmpty: string
  /** 在分组内新建会话的无障碍标签，分组名由调用方传入 */
  newSessionInGroup: (name: string) => string
  /** 删除分组的说明文案，分组名由调用方传入 */
  confirmDeleteGroup: (name: string) => string
  /** 会话行尾操作位的无障碍标签，会话标题由调用方传入 */
  sessionActions: (name: string) => string
  /** 会话行菜单里的「移动到…」一级项文案，二级子菜单列同工作区的其他分组 */
  moveToGroup: string
  /** 「取消分组」一级菜单项文案 */
  ungroup: string
  /** 会话状态位的无障碍文案 */
  status: SessionStatusLabels
  /** 工作区与会话行的悬停详情卡片文案 */
  hover: OfficialHoverLabels
  /** 「添加工作区」入口与失败错误框的文案 */
  add: OfficialAddLabels
  /** 搜索入口、输入框与结果列表的文案 */
  search: OfficialSearchLabels
  /** 对照 tab 在原生右侧栏引导页里的一行说明 */
  compareTabDescription: string
  /** 工作区内没有任何会话时的占位文案 */
  empty: string
  /** 会话那一段的小标题，只在与会话分组/子工作区混在一起时才露面 */
  sessions: string
  /** 列表底部的一行说明，本区域暂未提供的能力 */
  unimplemented: string
  /** 下拉菜单与 header 两行标题的文案 */
  picker: PickerLabels
  /** 子工作区嵌套的开关、提示与归组入口文案 */
  nested: NestedLabels
  /** 视图选项面板里「展示方式」那一组的文案 */
  viewMode: ViewModeLabels
  /** 视图选项面板里「指示器」那一组的文案 */
  indicatorStyle: IndicatorStyleLabels
  /** 视图选项面板里「置顶溢出」那一组的文案 */
  pinOverflow: PinOverflowLabels
  /** 视图选项面板里「置顶显示」那一组的文案 */
  pinScope: PinScopeLabels
  /** 置顶区的段头、行尾提示与图钉按钮文案 */
  pinned: PinnedLabels
}

/** 视图选项面板里「展示方式」那一组 */
export interface ViewModeLabels {
  /**
   * 这一组的标题
   *
   * 面板里有两组设置，与官方菜单用 `label` 条目给「分组方式 / 排序方式」分组同一做法
   */
  label: string
  /** 「按工作区」这一项：工作区分组结构照常渲染 */
  workspace: string
  /** 「平铺」这一项：全部可见会话在同一条列表里，与官方「单列表」一致 */
  flat: string
}

/** 视图选项面板里「指示器」那一组 */
export interface IndicatorStyleLabels {
  /**
   * 这一组的标题
   *
   * 与「展示方式」并列，都是「标题 + 两条互斥可选项」那一套
   */
  label: string
  /** 「图标」这一项：官方 `StateDot` 字形 */
  icon: string
  /** 「色条」这一项：一条状态色条 */
  bar: string
}

/** 视图选项面板里「置顶溢出」那一组 */
export interface PinOverflowLabels {
  /** 这一组的标题 */
  label: string
  /** 「悬停展开」这一项：静止占可见条数，指针移上去整块浮出 */
  expand: string
  /** 「区内滚动」这一项：同一个高度里自行滚动 */
  scroll: string
}

/** 视图选项面板里「置顶显示」那一组 */
export interface PinScopeLabels {
  /** 这一组的标题 */
  label: string
  /** 「仅置顶区」这一项 */
  section: string
  /** 「置顶区 + 分组内」这一项：置顶会话在它自己那一段里也排到最前 */
  inline: string
}

/** 置顶区的文案 */
export interface PinnedLabels {
  /** 段头那个名字，同时是收起 / 展开按钮可见的文字 */
  section: string
  /** 行尾提示：共 n 条 */
  count: (n: number) => string
  /** 行尾提示：共 total 条、其中还有 more 条没显示 */
  more: (total: number, more: number) => string
  /** 未置顶行的图钉按钮标签，会话标题由调用方传入 */
  pin: (name: string) => string
  /** 已置顶行的图钉按钮标签，会话标题由调用方传入 */
  unpin: (name: string) => string
  /** 置顶数量已达上限时的提示 */
  limitReached: string
}

/** 子工作区嵌套相关的文案 */
export interface NestedLabels {
  /** 视图选项面板里那个开关的设置名 */
  setting: string
  /** 关闭确认框的确认按钮 */
  disable: string
  /** 关闭时的二次确认框标题 */
  disableTitle: string
  /** 关闭时的二次确认框说明，下面跟着会被解除嵌套的工作区名单 */
  disableDesc: string
  /** 关闭后列表顶部那条提示 */
  disabledNote: string
  /** 提示里那句「重新启用会恢复」，与上一条同一行 */
  reEnableHint: string
  /** 工作区行菜单里进父工作区分组那一项的「移动到分组…」 */
  moveToGroup: string
  /** 已放进分组时，它下面那一项 */
  ungroupChild: string
  /** 分组行上标出「这是某个父工作区的分组」，父工作区名由调用方传入 */
  inGroup: (parent: string) => string
  /** 既没有会话也没有子工作区的分组里的占位文案 */
  groupEmpty: string
}

/** 工作区下拉菜单的文案 */
export interface PickerLabels {
  /** 菜单面板的无障碍标签 */
  entry: string
  /**
   * 两行标题那个按钮的无障碍标签，名称由调用方传入
   *
   * 它可见的文字是「工作区」+ 当前聚焦的对象，读屏要读出「点它是做什么用的」：
   * 只报一个工作区名字的话，这行听上去是一段说明文字而不是一个入口
   */
  change: (name: string) => string
  /** 第二行没有聚焦任何条目时的文案，也是菜单顶部那一项 */
  all: string
  /** 菜单里「最近使用」分区的标题 */
  recent: string
  /**
   * 菜单里「置顶」分区的标题
   *
   * 「全部」那一栏没有标题：它是没有标题时默认的那一栏
   * 上面两栏的标题正是要与它区分才需要
   */
  pinned: string
  /** 未置顶条目的置顶按钮标签，名称由调用方传入 */
  pin: (name: string) => string
  /** 已置顶条目的取消置顶按钮标签，名称由调用方传入 */
  unpin: (name: string) => string
  /** 条目行尾的重命名按钮标签，名称由调用方传入 */
  rename: (name: string) => string
  /**
   * 条目行尾的删除按钮标签，名称由调用方传入
   *
   * 不叫 `delete`：那个名字留给菜单外层已有的「删除工作区 / 删除工作区分组」
   * 这里指的是菜单里这一行的对象
   */
  remove: (name: string) => string
  /**
   * 新建工作区分组对话框里的「切换到新工作区」勾选项
   *
   * 只在当前不是「显示全部工作区」时才给
   * 已经看着全部内容时，「切过去」没有可切的目的地
   */
  followFocus: string
  /** 新增工作区时那个「是否聚焦到新工作区」确认框的标题，新工作区名由调用方传入 */
  focusNewTitle: (name: string) => string
  /** 该确认框的说明，新工作区名与当前聚焦的工作区名由调用方传入 */
  focusNewDesc: (name: string, focused: string) => string
  /** 同上那个框的「聚焦」 */
  focusNewConfirm: string
}

/**
 * 把三个命名空间的翻译函数投影成组件需要的文案表
 *
 * `t` 是本包命名空间的翻译函数，自有文案并回退 `common` 通用词
 * @param tw - 官方 `workspace` 命名空间的翻译函数（官方已有文案）
 * @param ts - 官方 `sidebar` 命名空间的翻译函数（外壳控件的官方文案）
 */
export function regionLabels(
  t: TranslateNS<typeof NS>,
  tw: WorkspaceTranslate,
  ts: SidebarTranslate,
): RegionLabels {
  return {
    title: tw('section.workspaces'),
    newGroup: t('newGroup'),
    newSessionIn: (name: string) => tw('actions.newSession.aria', { name }),
    newSessionItem: ts('session.new.label'),
    newSession: tw('session.new'),
    workspaceActions: (name: string) => tw('actions.workspace.aria', { name }),
    rename: tw('rename'),
    renameWorkspace: tw('rename.workspace.title'),
    deleteWorkspace: tw('delete.workspace'),
    confirmDeleteWorkspace: (name: string) => tw('delete.desc', { name }),
    workspaceNamePrompt: tw('field.workspaceName'),
    workspaceConflict: (name: string) => tw('conflict.named', { name }),
    ungrouped: tw('group.ungrouped'),
    groupNamePrompt: t('groupNamePrompt'),
    deleteGroup: t('deleteGroup'),
    renameGroup: t('renameGroup'),
    confirmDeleteGroup: (name: string) => t('delete.desc.group', { name }),
    groupActions: (name: string) => t('actions.group.aria', { name }),
    moveToVirtualWorkspace: t('moveToVirtualWorkspace'),
    newVirtualWorkspace: t('newVirtualWorkspace'),
    newVirtualWorkspaceMenu: t('menu.newVirtualWorkspace'),
    ungroupWorkspace: t('ungroupWorkspace'),
    virtualWorkspaceActions: (name: string) => t('actions.virtualWorkspace.aria', { name }),
    renameVirtualWorkspace: t('renameVirtualWorkspace'),
    deleteVirtualWorkspace: t('deleteVirtualWorkspace'),
    confirmDeleteVirtualWorkspace: (name: string) => t('delete.desc.virtualWorkspace', { name }),
    virtualWorkspaceNamePrompt: t('virtualWorkspaceNamePrompt'),
    virtualWorkspaceEmpty: t('virtualWorkspaceEmpty'),
    newSessionInGroup: (name: string) => tw('actions.newSession.aria', { name }),
    sessionActions: (name: string) => tw('actions.session.aria', { name }),
    moveToGroup: t('moveToGroup'),
    ungroup: t('ungroup'),
    status: {
      running: tw('status.running'),
      // 官方对单复数各有一条文案，中文两份相同，这里按 n 选键保持同一契约
      subagentsRunning: (n: number) =>
        n === 1
          ? tw('status.subagentsRunning.one', { n })
          : tw('status.subagentsRunning.other', { n }),
      waitingApproval: tw('status.waitingApproval'),
      planReview: tw('status.planReview'),
      waitingAnswer: tw('status.waitingAnswer'),
      completed: tw('status.completed'),
      idle: tw('status.idle'),
    },
    hover: officialHoverLabels(tw),
    compareTabDescription: t('compareTabDescription'),
    add: officialAddLabels(tw),
    search: officialSearchLabels(tw),
    empty: tw('empty.none'),
    // 官方在工作区列表上就是用这个键给会话那一段当标题的，本包不另造一份
    sessions: tw('section.sessions'),
    unimplemented: t('unimplemented'),
    picker: {
      // 官方没有「换一个工作区看」这件事的文案，入口与三个分区标题都取本包命名空间
      entry: t('picker.entry'),
      change: (name: string) => t('picker.change', { name }),
      all: t('picker.all'),
      recent: t('picker.recent'),
      pinned: t('picker.pinned'),
      pin: (name: string) => t('picker.pin', { name }),
      unpin: (name: string) => t('picker.unpin', { name }),
      rename: (name: string) => t('picker.rename', { name }),
      remove: (name: string) => t('picker.remove', { name }),
      followFocus: t('picker.followFocus'),
      focusNewTitle: (name: string) => t('picker.focusNewTitle', { name }),
      focusNewDesc: (name: string, focused: string) => t('picker.focusNewDesc', { name, focused }),
      focusNewConfirm: t('picker.focusNewConfirm'),
    },
    nested: {
      setting: t('nested.setting'),
      disable: t('nested.disable'),
      disableTitle: t('nested.disableTitle'),
      disableDesc: t('nested.disableDesc'),
      disabledNote: t('nested.disabledNote'),
      reEnableHint: t('nested.reEnableHint'),
      moveToGroup: t('nested.moveToGroup'),
      ungroupChild: t('nested.ungroupChild'),
      inGroup: (parent: string) => t('nested.inGroup', { parent }),
      groupEmpty: t('nested.groupEmpty'),
    },
    viewMode: {
      // 官方菜单里那组「分组方式 / 按工作区 / 按工作区树 / 单列表」的措辞本包不复用：这边的两个取值是另一套语义
      label: t('viewMode.label'),
      workspace: t('viewMode.workspace'),
      flat: t('viewMode.flat'),
    },
    indicatorStyle: {
      label: t('indicator.label'),
      icon: t('indicator.icon'),
      bar: t('indicator.bar'),
    },
    pinOverflow: {
      label: t('pinOverflow.label'),
      expand: t('pinOverflow.expand'),
      scroll: t('pinOverflow.scroll'),
    },
    pinScope: {
      label: t('pinScope.label'),
      section: t('pinScope.section'),
      inline: t('pinScope.inline'),
    },
    pinned: {
      section: t('pinned.section'),
      count: (n: number) => t('pinned.count', { n }),
      more: (total: number, more: number) => t('pinned.more', { total, more }),
      pin: (name: string) => t('pinned.pin', { name }),
      unpin: (name: string) => t('pinned.unpin', { name }),
      limitReached: t('pinned.limitReached'),
    },
  }
}
