/**
 * 区域顶部：标题、选择器入口、搜索、视图选项、两个建造型入口，以及窄栏的同名入口
 *
 * 几何与官方 WorkspaceBrowser 的 `.sectionHeader` 一致：36px 高
 * 左侧标题最多占 45%、右侧一组 28px 圆形图标按钮（间距 4px）
 *
 * 「搜索 + 视图选项 + 新建工作区分组 + 添加工作区」四个入口同属右侧那一组，紧挨着排在栏的右缘
 * 把这一组推向右缘的是搜索槽位自己的 `margin-left: auto`，官方 `.searchSlot` 就是这么写的
 * 其余入口因此紧跟其后，彼此只有 4px 间距
 *
 * 搜索展开时标题向左收拢淡出、右侧入口组整体向右收拢淡出，与官方 `.sectionLabelHidden` / `.headerActionsHidden` 同一取舍
 * 它们都整体移出，而不是留在原地把搜索框挤窄
 *
 * 左侧标题是上下两行：上行是「工作区」这一层级的名字，它自带一个下拉菜单入口（箭头紧跟文字其后）；下行是当前聚焦的工作区或工作区分组
 * 两行都由这一行的定高承担——36px 是官方给单行标题的量，两行各 20px 行高放不下，因此宽栏这一层把高度放开到内容
 * 见样式表里的 `.wg-header-title`
 *
 * 两张浮层面板（视图选项、选择器）也挂在 `RegionHeaderArea` 这一层，并分别在搜索展开时收起
 * 搜索会顶掉标题与入口组，面板若还开着就悬在一片与它无关的结果列表上
 *
 * 窄栏由 `RegionRailHeader` 渲染：官方 rail 下这些入口不是并排的一行
 * section header 里只留建造型入口，36px 一个，与「新建工作区分组」并列
 * 搜索是它们下方独立的一个 36px 块（官方 rail 下那条搜索规则自带 `margin: 0 0 12px`），标题与视图选项在窄栏都不渲染
 */
import type { ReactElement, RefObject } from 'react'
import type { AddWorkspaceActions } from '../actions.ts'
import { pickerSections } from '../data/picker.ts'
import type { PickerEntry } from '../data/picker.ts'
import type { ViewMode } from '../data/types.ts'
import type { RegionLabels } from '../labels.ts'
import type { RegionTranslate } from '../locales.ts'
import type { OfficialSearchLabels } from '../official.ts'
import { IconChevronDownOutlineRegular, IconSlidersTwoOutlineRegular } from '../runtime.ts'
import { AddWorkspaceControl } from './AddWorkspaceControl.tsx'
import { SearchEntry, SearchRailEntry } from './SearchControl.tsx'
import type { SearchState } from './SearchControl.tsx'
import { ViewOptionsMenu } from './ViewOptionsMenu.tsx'
import { VirtualWorkspaceCreateControl } from './VirtualWorkspaceCreateControl.tsx'
import { WorkspacePickerMenu } from './WorkspacePickerMenu.tsx'

/** 顶部区消费的派生布局 */
export interface RegionHeaderLayout {
  /** 第二行显示的文案，没有聚焦时是「全部工作区」 */
  currentFocus: string
  /** 菜单的三个分区，与列表取自同一次切分 */
  picker: ReturnType<typeof pickerSections>
}

/**
 * 顶部区消费的浮层开合状态
 *
 * 两张面板共用「开合 + 触发器 + 切换 + 面板自己请求关闭」四格
 * `onClose` 与 `onToggle` 是两条路径：前者来自面板内部（点外部、Esc、选中一项），后者来自触发器
 */
export interface RegionHeaderOverlays {
  picker: {
    open: boolean
    triggerRef: RefObject<HTMLButtonElement>
    onToggle: () => void
    onClose: () => void
  }
  viewOptions: {
    open: boolean
    triggerRef: RefObject<HTMLButtonElement>
    onToggle: () => void
    onClose: () => void
  }
}

/** 顶部区消费的命令 */
export interface RegionHeaderCommands {
  onSelectFocus: (key: string) => void
  onTogglePinned: (key: string) => void
  onRenameEntry: (entry: PickerEntry) => void
  onDeleteEntry: (entry: PickerEntry) => void
  /** 把一个工作区放进某个分组，或先建一个再放 */
  startVirtualWorkspaceCreate: () => void
}

interface RegionHeaderAreaProps {
  labels: RegionLabels
  layout: RegionHeaderLayout
  overlays: RegionHeaderOverlays
  commands: RegionHeaderCommands
  /** 两行标题是否被搜索顶掉 */
  searching: boolean
  viewMode: ViewMode
  onSelectMode: (mode: ViewMode) => void
  nestingEnabled: boolean
  onToggleNested: () => void
  /** 当前聚焦条目的键，菜单按它标出选中项 */
  focusedKey: string
  /** 解析出来的「添加工作区」服务面，缺省时该入口不渲染 */
  addWorkspace: AddWorkspaceActions | undefined
  search: SearchState
  t: RegionTranslate
}

/**
 * 区域顶部那一整组入口与两张浮层面板
 *
 * 无状态：全部开合、布局与命令都由区域容器传下来
 * 与 `RegionRailHeader` 是一个顶部的两种形态，因此同处一个文件
 */
export function RegionHeaderArea(props: RegionHeaderAreaProps): ReactElement {
  const { labels, search, t } = props
  const expanded = search.expanded
  // 搜索展开时整块标题让位，两行一起收拢淡出，与官方单行标题同一个取舍
  const hidden = props.searching || expanded
  const pickerOpen = props.overlays.picker.open
  const viewOptionsOpen = props.overlays.viewOptions.open
  return (
    <>
      <div className="wg-header wg-header-titled">
        {/* 两行是同一个按钮：它们合起来表达一件事，即当前在看哪个工作区，点开可以换一个
            箭头因此也不是独立按钮，它就是这块按钮自己的开合指示 */}
        <button
          type="button"
          ref={props.overlays.picker.triggerRef}
          className={`wg-header-title${hidden ? ' wg-header-title-hidden' : ''}`}
          aria-label={labels.picker.change(props.layout.currentFocus)}
          aria-expanded={pickerOpen}
          onClick={props.overlays.picker.onToggle}
        >
          <span className="wg-header-heading">
            <span className="wg-header-label">{labels.title}</span>
            <IconChevronDownOutlineRegular
              className={`wg-header-caret${pickerOpen ? ' wg-header-caret-open' : ''}`}
            />
          </span>
          {/* 第二行是当前聚焦的对象
            * 字号比上行小一档、色阶高一档：它与上行是两个层级的信息（层级名 / 层级里的取值）
            * 靠字号与色阶一起区分 */}
          <span className="wg-header-focus">{props.layout.currentFocus}</span>
        </button>
        <SearchEntry search={search} labels={labels.search} />
        <div className={`wg-header-actions${expanded ? ' wg-header-actions-hidden' : ''}`}>
          {/* 官方的位置与字形保留，但这里是一个真的入口，点开的是本包的视图选项面板 */}
          <button
            type="button"
            ref={props.overlays.viewOptions.triggerRef}
            className="wg-header-action"
            aria-label={labels.add.viewOptions}
            aria-expanded={viewOptionsOpen}
            onClick={props.overlays.viewOptions.onToggle}
          >
            <IconSlidersTwoOutlineRegular />
          </button>
          <VirtualWorkspaceCreateControl
            label={labels.newVirtualWorkspace}
            narrow={false}
            onCreate={props.commands.startVirtualWorkspaceCreate}
          />
          {props.addWorkspace === undefined ? null : (
            <AddWorkspaceControl actions={props.addWorkspace} narrow={false} t={t} />
          )}
        </div>
      </div>
      <ViewOptionsMenu
        open={viewOptionsOpen && !props.searching}
        triggerRef={props.overlays.viewOptions.triggerRef}
        label={labels.add.viewOptions}
        nesting={{
          enabled: props.nestingEnabled,
          label: labels.nested.setting,
          onToggle: props.onToggleNested,
        }}
        mode={props.viewMode}
        viewMode={labels.viewMode}
        onSelectMode={props.onSelectMode}
        onClose={props.overlays.viewOptions.onClose}
      />
      <WorkspacePickerMenu
        open={pickerOpen && !props.searching}
        triggerRef={props.overlays.picker.triggerRef}
        focused={props.focusedKey}
        sections={props.layout.picker}
        labels={labels.picker}
        onClose={props.overlays.picker.onClose}
        onSelect={props.commands.onSelectFocus}
        onTogglePinned={props.commands.onTogglePinned}
        onRename={props.commands.onRenameEntry}
        onDelete={props.commands.onDeleteEntry}
      />
    </>
  )
}

/**
 * 窄栏区域的入口
 *
 * 搜索在这里点下去会先请求展开侧栏，等列滑动跑完再把焦点交给宽栏的输入框（见 `useSearch`）
 * 全部入口都不可用时整段不出现，不留空行
 */
export function RegionRailHeader({
  addWorkspace,
  search,
  newVirtualWorkspace,
  t,
}: {
  addWorkspace?: AddWorkspaceActions | undefined
  search?: { state: SearchState; labels: OfficialSearchLabels } | undefined
  newVirtualWorkspace?: { label: string; onCreate: () => void } | undefined
  t: RegionTranslate
}): ReactElement | null {
  if (addWorkspace === undefined && search === undefined && newVirtualWorkspace === undefined) {
    return null
  }
  const creates = addWorkspace !== undefined || newVirtualWorkspace !== undefined
  return (
    <>
      {/* header 行只在有建造型入口时出现，它为空时不留一行空高度 */}
      {!creates ? null : (
        <div className="wg-header wg-header-rail">
          {newVirtualWorkspace === undefined ? null : (
            <VirtualWorkspaceCreateControl
              label={newVirtualWorkspace.label}
              narrow
              onCreate={newVirtualWorkspace.onCreate}
            />
          )}
          {addWorkspace === undefined ? null : (
            <AddWorkspaceControl actions={addWorkspace} narrow t={t} />
          )}
        </div>
      )}
      {search === undefined ? null : (
        <SearchRailEntry search={search.state} labels={search.labels} />
      )}
    </>
  )
}
