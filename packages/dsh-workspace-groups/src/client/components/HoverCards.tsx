/**
 * 悬停详情卡片的内容体
 *
 * 两张卡片的行结构与取值对齐官方 `ui-workspace` 的 `WorkspaceHoverContent` / `SessionHoverContent`
 * 工作区卡片是「名称 / 目录路径 / 绝对创建时刻」，会话卡片是「完整标题 / 相对时间 / 逐条状态」
 * 卡片外框（底色、宽度、内边距、圆角、投影）与浮出时机都属官方 `HoverCard` 原语，本模块只组装内容
 *
 * 会话标题在行上会被省略号截断，卡片因此用 `overflow-wrap` 让它整句折行显示
 * 目录路径同理，另加 `word-break` 照顾没有空格的长路径
 *
 * 入场前的 `data-wg-stagger` 标记不打在这里：卡片内容是 portal 到 body 的浮层，与折叠体的逐个淡入无关
 */
import type { ReactElement } from 'react'
import { StateDot } from '../runtime.ts'
import type { SessionStatus } from '../data/status.ts'
import { CARD_ATTRIBUTE } from '../utils/flip.ts'

/**
 * 给外层那张卡片打标记
 *
 * 卡片盒由官方原语自己渲染，本包拿不到它的引用：原语把正文作为卡片的唯一子节点，于是从正文往上取一层就能拿到它
 * 标记供样式在对照模式下把卡片翻向左侧：卡片是 portal 到 `document.body` 的浮层
 * 官方左侧栏的卡片也挂在同一个父节点上，只能靠这个标记区分出本包的卡片
 *
 * 定义在模块作用域而不是组件内的回调：引用因此恒定，React 不会每次渲染都重挂一遍
 *
 * 刻意不写清理：正文在复制反馈的 1 秒里会被原语换成「已复制」提示
 * 那次卸载若顺手摘掉标记，卡片正好在用户盯着的时候弹回屏幕外
 * 标记随卡片盒本身一起销毁——原语关闭浮层时把整个盒子从 body 上摘掉
 * @param node - 正文根节点，React 传 null 表示它已从树上摘下，此时什么也不做
 */
function tagCard(node: HTMLDivElement | null): void {
  node?.parentElement?.setAttribute(CARD_ATTRIBUTE, '')
}

/**
 * 工作区卡片的正文
 *
 * 三行都是调用方格式化好的字符串：目录路径已按宿主的 home 缩写，创建时刻已套官方日期模板
 * 组件本身不认识时间与路径，也不读语言包，因此在区域重渲染时内容稳定
 */
export interface WorkspaceHoverContentProps {
  /** 工作区名 */
  label: string
  /** 目录路径（已缩写） */
  path: string
  /** 绝对创建时刻文案 */
  created: string
}

export function WorkspaceHoverContent({
  label,
  path,
  created,
}: WorkspaceHoverContentProps): ReactElement {
  return (
    <div className="wg-hover-content" ref={tagCard}>
      <div className="wg-hover-title">{label}</div>
      <div className="wg-hover-path">{path}</div>
      <div className="wg-hover-time">{created}</div>
    </div>
  )
}

/** 会话卡片的正文 */
export interface SessionHoverContentProps {
  /** 完整标题，空白会话是语言包的固定名 */
  title: string
  /** 相对时间文案，空白（新建中）会话没有可显示的时间，缺省即整行不渲染 */
  time?: string | undefined
  /** 该会话说要呈现的全部状态，逐条列出，空闲也有一条 */
  statuses: readonly SessionStatus[]
}

export function SessionHoverContent({
  title,
  time,
  statuses,
}: SessionHoverContentProps): ReactElement {
  return (
    <div className="wg-hover-content" ref={tagCard}>
      <div className="wg-hover-title">{title}</div>
      {time === undefined ? null : <div className="wg-hover-time">{time}</div>}
      {statuses.map((status) => (
        <div className="wg-hover-status" key={status.label}>
          <StateDot state={status.state} />
          <span>{status.label}</span>
        </div>
      ))}
    </div>
  )
}
