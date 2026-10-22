/**
 * 行头外壳：一条可点、可聚焦、可拖、可右键的行头
 *
 * 会话、会话分组、工作区、虚拟分组四类行头长着同一个外壳：一条带、带里一颗药丸、右键菜单跟在最前。
 * 它们各自的差异（撑开箭头与数目、药丸里放什么、拖拽接线从哪来）都由 children 与可选 props 表达，
 * 因此「哪些属性必须写、写在哪」只在本文里有一份
 *
 * 四处原本各写一遍这七格属性，漏一处的表现是「这一行 Tab 不到」或「这一行拖不动」，都不会报错
 *
 * 键盘激活与点击走同一个动作：行里按钮上的按键不该连带整行动作，那条判断在 `handleRowKeyDown` 里
 */
import clsx from 'clsx'
import type { ReactElement, ReactNode, Ref } from 'react'
import { handleRowKeyDown } from './rowKeyboard.ts'
import { draggingProps } from '../../data/protocol.ts'
import type { RowContextMenuEvent } from './RowContextMenu.tsx'
import type { DragStartEvent } from '../../hooks/useDnd.ts'
import styles from './rows.module.css'

export interface RowHeadShellProps {
  /** 这一行自己的类名：药丸的底色与高度由它决定 */
  className: string
  /**
   * 撑开态
   *
   * 给了才写 `aria-expanded`：会话行没有可撑开的东西，读屏器不该听到一个开合状态
   */
  expanded?: boolean | undefined
  /** 参与所在容器的逐个淡入，序号由容器按文档序下发，缺省参与 */
  stagger?: boolean | undefined
  /** 这一行是否正被拖，样式据此画淡 */
  dragging: boolean
  /** 整行的动作，点击与键盘激活都走它 */
  activate: () => void
  /** 行右键处理，缺省表示该行没有右键菜单，右键保持浏览器默认行为 */
  onContextMenu: ((event: RowContextMenuEvent) => void) | undefined
  /** 随行渲染的右键菜单，由持有条目的组件传进来 */
  menu: ReactNode
  /** 排序段的区域属性：这一行自己就是一段落点 */
  zone?: Record<string, string> | undefined
  /** 参照行 id 那一格，可作 before / after 参照物的行才有 */
  rowAttribute?: Record<string, string> | undefined
  /** 排序段的拖拽接线，与参照行属性同生共死；缺省表示这一行拖不动 */
  drag?:
    | {
        draggable: true
        onDragStart: (event: DragStartEvent) => void
        onDragEnd: () => void
      }
    | null
    | undefined
  /** 会话行自己拼的那三格：没有排序计划时仍然可拖（归组是另一套落点） */
  draggable?: boolean | undefined
  onDragStart?: ((event: DragStartEvent) => void) | undefined
  onDragEnd?: (() => void) | undefined
  /** 行自己的数据属性：状态色、是否被裁、面板是否开着，都只给样式表读 */
  dataProps?: Record<string, string | undefined> | undefined
  /** 行元素本身的引用，需要滚进可视区的行用 */
  elementRef?: Ref<HTMLDivElement> | undefined
  children: ReactNode
}

/**
 * 一条行头
 *
 * 属性顺序即叠放顺序：行自己的数据属性在前，拖拽那三格在后，因此计划有变时后者覆盖前者
 * @param props - 行头的类名、动作、拖拽接线与内容
 */
export function RowHeadShell({
  className,
  expanded,
  stagger = true,
  dragging,
  activate,
  onContextMenu,
  menu,
  zone,
  rowAttribute,
  drag,
  draggable,
  onDragStart,
  onDragEnd,
  dataProps,
  elementRef,
  children,
}: RowHeadShellProps): ReactElement {
  // 排序段与「自己拼的那几格」互斥：前者是一整格，后者是会话行手工拼的三项
  const dragProps = drag ?? { draggable, onDragStart, onDragEnd }
  return (
    <div
      ref={elementRef}
      // 画淡落在带上：整条带（含它承担的那点上间距）一起退下去
      className={clsx(className, dragging && styles.rowDragging)}
      {...dataProps}
      {...zone}
      {...rowAttribute}
      {...dragProps}
      {...draggingProps(dragging)}
      {...(stagger ? { 'data-wg-stagger': '' } : {})}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      onClick={activate}
      onKeyDown={(event) => handleRowKeyDown(event, activate)}
      onContextMenu={onContextMenu}
    >
      {menu}
      {children}
    </div>
  )
}
