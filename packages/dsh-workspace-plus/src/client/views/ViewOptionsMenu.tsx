/**
 * header 里「视图选项」那个按钮打开的自绘弹出菜单
 *
 * 官方原语 `Menu` 的条目只有「前导图标 → 文案 → 尾部选中标记」三个槽，表达不了「一个开关」
 * 因此照官方菜单面板的外观与交互约定自绘一份，规矩与 `WorkspacePickerMenu` 同一套：
 * 贴触发器下缘展开、放不下翻到上方、两个方向都夹进窗口、指针离开延迟关闭、点外/Escape 关闭、方向键在条目间移动
 *
 * 面板是不透明浮层，底色与描边必须用官方菜单面板那套 token（见样式表），否则 token 名写错时面板会变透明而界面不会报错
 *
 * 内容分两组：上面是展示方式（两条互斥的可选项，行尾以勾标记当前值），下面是子工作区嵌套开关
 * 两组之间用一条分隔线隔开，与官方把「分组方式」和「排序方式」分成两段的做法一致
 */
import { createPortal } from 'react-dom'
import type { ReactElement, RefObject } from 'react'
import {
  IconBarIndicator16,
  IconDotIndicator16,
} from '../icons.tsx'
import {
  IconCheckOutlineRegular,
  IconFlatListOutlineRegular,
  IconFolderCloseRegular,
  IconPinFillRegular,
  IconPinOutlineRegular,
  IconWorkspaceTreeOutlineRegular,
  Switch,
} from '../runtime.ts'
import type { IndicatorStyle, ViewMode } from '../data/types.ts'
import type { PinOverflow, PinScope } from '../store/viewMode.ts'
import { useLocale } from '../hooks/useLocale.ts'
import { useLocalViewOptions } from '../hooks/useLocalViewOptions.ts'
import { useFloatingPanel } from './components/useFloatingPanel.ts'
import styles from './ViewOptionsMenu.module.css'

/**
 * 展示方式的两个取值，按面板里的先后
 *
 * 图标与官方那组「分组方式」同字形：按工作区是文件夹，平铺是一条列表
 */
const VIEW_MODES: readonly {
  mode: ViewMode
  icon: ReactElement
}[] = [
  { mode: 'workspace', icon: <IconFolderCloseRegular /> },
  { mode: 'flat', icon: <IconFlatListOutlineRegular /> },
]

/**
 * 指示器样式的两个取值，按面板里的先后
 *
 * 与展示方式那一组同形：标题 + 两条互斥可选项，行尾以勾标记当前值
 */
const INDICATOR_STYLES: readonly {
  style: IndicatorStyle
  icon: ReactElement
}[] = [
  { style: 'icon', icon: <IconDotIndicator16 /> },
  { style: 'bar', icon: <IconBarIndicator16 /> },
]

/**
 * 置顶溢出给法的两个取值
 *
 * 字形取官方的图钉两态：浮出对应实心（一次给全），区内滚动对应描边
 */
const PIN_OVERFLOWS: readonly {
  overflow: PinOverflow
  icon: ReactElement
}[] = [
  { overflow: 'expand', icon: <IconPinFillRegular /> },
  { overflow: 'scroll', icon: <IconPinOutlineRegular /> },
]

/** 置顶显示方式的两个取值 */
const PIN_SCOPES: readonly {
  scope: PinScope
  icon: ReactElement
}[] = [
  { scope: 'section', icon: <IconPinOutlineRegular /> },
  { scope: 'inline', icon: <IconPinFillRegular /> },
]

export interface ViewOptionsMenuProps {
  /** 菜单是否打开，开合状态由持有触发器的 header 持有 */
  open: boolean
  /** 触发器元素，面板贴它的下缘展开 */
  triggerRef: RefObject<HTMLElement>
  /** 另一组设置：子工作区嵌套开关。它是分组元数据，随快照往返，因此仍由区域容器下发 */
  nesting: {
    /** 当前是否开启 */
    enabled: boolean
    onToggle: () => void
  }
  onClose: () => void
}

export function ViewOptionsMenu({
  open,
  triggerRef,
  nesting,
  onClose,
}: ViewOptionsMenuProps): ReactElement | null {
  const { labels } = useLocale()
  const { mode, indicator, setMode, setIndicator, pinnedOptions, setPinned } = useLocalViewOptions()
  const { overflow: pinOverflow, scope: pinScope } = pinnedOptions
  const viewMode = labels.viewMode
  const indicatorLabels = labels.indicatorStyle
  const overflowLabels = labels.pinOverflow
  const scopeLabels = labels.pinScope
  const { panelRef, rect, cancelClose, armClose } = useFloatingPanel({
    open,
    triggerRef,
    onClose,
    align: 'end',
    focusable: `.${styles.viewOptionRow}, .${styles.viewOptionSwitch}`,
  })

  if (!open) return null

  /** 两条可选行的文案 */
  const modeLabel = (candidate: ViewMode): string =>
    candidate === 'flat' ? viewMode.flat : viewMode.workspace

  const styleLabel = (candidate: IndicatorStyle): string =>
    candidate === 'bar' ? indicatorLabels.bar : indicatorLabels.icon

  const overflowLabel = (candidate: PinOverflow): string =>
    candidate === 'scroll' ? overflowLabels.scroll : overflowLabels.expand

  const scopeText = (candidate: PinScope): string =>
    candidate === 'inline' ? scopeLabels.inline : scopeLabels.section

  /** 分组标题 + 该组的互斥可选项，当前值由 `aria-pressed` 与行尾那个勾共同表达 */
  const optionGroup = <T extends string>(
    label: string,
    options: readonly { value: T; icon: ReactElement; text: string }[],
    selected: T,
    onSelect: (value: T) => void,
  ): ReactElement => (
    <>
      <div className={styles.viewGroupLabel}>{label}</div>
      {options.map(({ value, icon, text }) => (
        <button
          key={value}
          type="button"
          className={styles.viewOptionRow}
          aria-pressed={value === selected}
          onClick={() => onSelect(value)}
        >
          <span className={styles.viewOptionIcon}>{icon}</span>
          <span className={styles.viewOptionLabel}>{text}</span>
          {value === selected ? (
            <IconCheckOutlineRegular className={styles.viewOptionCheck} />
          ) : null}
        </button>
      ))}
    </>
  )

  return createPortal(
    <div
      ref={panelRef}
      className={styles.viewMenu}
      role="group"
      aria-label={labels.add.viewOptions}
      // 首次渲染时还没量过，先藏起来，否则面板会先在窗口左上角露一帧再跳到落点
      style={rect ?? { visibility: 'hidden', left: 0, top: 0 }}
      onPointerEnter={cancelClose}
      onPointerLeave={armClose}
    >
      {/* 展示方式 */}
      {optionGroup(
        viewMode.label,
        VIEW_MODES.map(({ mode: value, icon }) => ({ value, icon, text: modeLabel(value) })),
        mode,
        setMode,
      )}
      <div className={styles.viewSeparator} role="separator" />
      {/* 指示器：与展示方式同形 */}
      {optionGroup(
        indicatorLabels.label,
        INDICATOR_STYLES.map(({ style: value, icon }) => ({
          value,
          icon,
          text: styleLabel(value),
        })),
        indicator,
        setIndicator,
      )}
      <div className={styles.viewSeparator} role="separator" />
      {/* 置顶溢出：与上面两组同形 */}
      {optionGroup(
        overflowLabels.label,
        PIN_OVERFLOWS.map(({ overflow: value, icon }) => ({
          value,
          icon,
          text: overflowLabel(value),
        })),
        pinOverflow,
        (value) => setPinned({ overflow: value }),
      )}
      <div className={styles.viewSeparator} role="separator" />
      {/* 置顶显示：仅置顶区，或同时在各分组内置顶 */}
      {optionGroup(
        scopeLabels.label,
        PIN_SCOPES.map(({ scope: value, icon }) => ({ value, icon, text: scopeText(value) })),
        pinScope,
        (value) => setPinned({ scope: value }),
      )}
      <div className={styles.viewSeparator} role="separator" />
      {/* 子工作区嵌套：行不可点——`Switch` 自己已是按钮，嵌进可点的行会叠两层控件 */}
      <div className={styles.viewOption}>
        <span className={styles.viewOptionIcon}>
          {/* 官方在视图选项里就是用这个字形标「按工作区树分组」，而本条开关控制的正是子工作区的树形渲染 */}
          <IconWorkspaceTreeOutlineRegular />
        </span>
        <span className={styles.viewOptionLabel}>{labels.nested.setting}</span>
        <Switch
          checked={nesting.enabled}
          label={labels.nested.setting}
          className={styles.viewOptionSwitch}
          onChange={() => nesting.onToggle()}
        />
      </div>
    </div>,
    document.body,
  )
}
