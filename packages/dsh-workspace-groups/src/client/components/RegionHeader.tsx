/**
 * 区域的 section header
 *
 * 几何与官方 WorkspaceBrowser 的 `.sectionHeader` 一致：36px 高
 * 左侧标题最多占 45%、右侧一组 28px 圆形图标按钮（间距 4px）
 *
 * 「搜索 + 视图选项 + 新建工作区分组 + 添加工作区」四个入口同属右侧那一组
 * 紧挨着排在栏的右缘
 * 把这一组推向右缘的是搜索槽位自己的 `margin-left: auto`
 * 官方 `.searchSlot` 就是这么写的
 * 其余入口因此紧跟其后，彼此只有 4px 间距
 *
 * 搜索展开时标题向左收拢淡出、右侧入口组整体向右收拢淡出
 * 与官方 `.sectionLabelHidden` / `.headerActionsHidden` 同一取舍
 * 它们都整体移出，而不是留在原地把搜索框挤窄
 *
 * 左侧标题是上下两行：
 * 上行是「工作区」这一层级的名字，它自带一个下拉菜单入口（箭头紧跟文字其后）
 * 下行是当前聚焦的工作区或工作区分组
 * 两行都由这一行的定高承担——36px 是官方给单行标题的量
 * 两行各 20px 行高放不下，因此宽栏这一层把高度放开到内容
 * 见样式表里的 `.wg-header-title`
 */
import type { ReactElement, RefObject } from 'react'
import { IconChevronDownOutlineRegular, IconSlidersTwoOutlineRegular } from '../runtime.ts'
import { AddWorkspaceControl } from './AddWorkspaceControl.tsx'
import { VirtualWorkspaceCreateControl } from './VirtualWorkspaceCreateControl.tsx'
import { SearchEntry, SearchRailEntry } from './SearchControl.tsx'
import type { SearchState } from './SearchControl.tsx'
import type { AddWorkspaceActions } from '../actions.ts'
import type { OfficialSearchLabels } from '../official.ts'
import type { RegionTranslate } from '../locales.ts'

/** 「视图选项」入口与它打开的面板 */
export interface ViewOptionsProps {
  /** 按钮的无障碍标签与面板的无障碍标签 */
  label: string
  open: boolean
  triggerRef: RefObject<HTMLButtonElement>
  onToggle: () => void
}

export interface RegionHeaderProps {
  /** 区域标题，官方在工作区视图下取 section.workspaces */
  title: string
  /** 第二行：当前聚焦的工作区或工作区分组，没有聚焦时是「全部工作区」 */
  focusedLabel: string
  /** 两行标题是否被搜索顶掉 */
  titleHidden: boolean
  /**
   * 标题这块的菜单入口
   *
   * 开合状态留在区域组件里而不是 header 内部
   * 菜单面板是 portal 到 body 的浮层，它要读到菜单的三个分区
   * 那些分区由区域组件从快照算出来
   */
  picker: {
    open: boolean
    triggerRef: RefObject<HTMLButtonElement>
    onToggle: () => void
    /** 整块标题按钮的无障碍标签，取当前聚焦对象的名称 */
    changeLabel: (name: string) => string
  }
  /** 「添加工作区」的官方服务面，缺省时该入口不渲染 */
  addWorkspace?: AddWorkspaceActions | undefined
  /** 搜索的状态面与文案，缺省时搜索入口不渲染 */
  search?: { state: SearchState; labels: OfficialSearchLabels } | undefined
  /** 视图选项入口与它打开的面板 */
  viewOptions: ViewOptionsProps
  /**
   * 「新建工作区分组」的入口文案，缺省时该入口不渲染
   *
   * 与「添加工作区」分开传，后者要有官方 directoryFlow 洞的占用者才出现
   * 而建组只依赖本包的存储，两者在场条件不同
   */
  newVirtualWorkspace?: { label: string; onCreate: () => void } | undefined
  /** 本包命名空间的翻译座位，供错误框解析通用词 */
  t: RegionTranslate
}

export function RegionHeader({
  title,
  focusedLabel,
  titleHidden,
  picker,
  addWorkspace,
  search,
  viewOptions,
  newVirtualWorkspace,
  t,
}: RegionHeaderProps): ReactElement {
  const expanded = search?.state.expanded === true
  // 搜索展开时整块标题让位，两行一起收拢淡出，与官方单行标题同一个取舍
  const hidden = titleHidden || expanded
  return (
    <div className="wg-header wg-header-titled">
      {/* 两行是同一个按钮：它们合起来表达一件事，即当前在看哪个工作区，点开可以换一个
          箭头因此也不是独立按钮，它就是这块按钮自己的开合指示 */}
      <button
        type="button"
        ref={picker.triggerRef}
        className={`wg-header-title${hidden ? ' wg-header-title-hidden' : ''}`}
        aria-label={picker.changeLabel(focusedLabel)}
        aria-expanded={picker.open}
        onClick={picker.onToggle}
      >
        <span className="wg-header-heading">
          <span className="wg-header-label">{title}</span>
          <IconChevronDownOutlineRegular
            className={`wg-header-caret${picker.open ? ' wg-header-caret-open' : ''}`}
          />
        </span>
        {/* 第二行是当前聚焦的对象
          * 字号比上行小一档、色阶高一档：它与上行是两个层级的信息（层级名 / 层级里的取值）
          * 靠字号与色阶一起区分 */}
        <span className="wg-header-focus">{focusedLabel}</span>
      </button>
      {search === undefined ? null : <SearchEntry search={search.state} labels={search.labels} />}
      <div className={`wg-header-actions${expanded ? ' wg-header-actions-hidden' : ''}`}>
        {/* 官方的位置与字形保留，但这里是一个真的入口，点开的是本包的视图选项面板 */}
        <button
          type="button"
          ref={viewOptions.triggerRef}
          className="wg-header-action"
          aria-label={viewOptions.label}
          aria-expanded={viewOptions.open}
          onClick={viewOptions.onToggle}
        >
          <IconSlidersTwoOutlineRegular />
        </button>
        {newVirtualWorkspace === undefined ? null : (
          <VirtualWorkspaceCreateControl
            label={newVirtualWorkspace.label}
            narrow={false}
            onCreate={newVirtualWorkspace.onCreate}
          />
        )}
        {addWorkspace === undefined ? null : (
          <AddWorkspaceControl actions={addWorkspace} narrow={false} t={t} />
        )}
      </div>
    </div>
  )
}

/**
 * 窄栏区域的入口
 *
 * 官方 rail 下这些入口不是并排的一行：
 * section header 里只留建造型入口，36px 一个，与「新建工作区分组」并列
 * 搜索是它们下方独立的一个 36px 块（官方 rail 下那条搜索规则自带 `margin: 0 0 12px`）
 * 标题与视图选项在窄栏都不渲染
 *
 * 搜索在这里点下去会先请求展开侧栏
 * 等列滑动跑完再把焦点交给宽栏的输入框（见 `useSearch`）
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
