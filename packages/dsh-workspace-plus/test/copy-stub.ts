/**
 * 复制动作与提示源的测试座位
 *
 * 生产上这一格由插槽注入 `copyNotice`（一份 React 之外的快照源）
 * 直接渲染组件时要自己补上一份，与 `shellSeats()` 里其余几格同一分工
 *
 * 源用真的 `createCopyNotice`（它只依赖基线替身里的剪贴板与快照存储），因此断言看到的是生产那套行为
 */
import { createCopyNotice } from '../src/client/copyNotice.ts'
import type { CopyNoticeHandle } from '../src/client/copyNotice.ts'
import type { WorkspaceGroupsProps } from '../src/client/views/WorkspaceGroupsRegion.tsx'

/** 失败文案与字典同值，语言包替身里那一键来自官方 toast.sessionIdCopyFailed */
const FAILURE = '复制失败，请重试'

/** 造一份座位：每次调用一份独立实例，与生产「整片区域一个源」同构 */
export function copySeats(): Pick<WorkspaceGroupsProps, 'copyNotice'> {
  return { copyNotice: createCopyNotice(() => FAILURE) }
}

/**
 * 直接渲染单个组件时用的复制动作
 *
 * 组件收的是 `copy` 而不是整份源，因此这一格从源上摘出来
 */
export function copyAction(): CopyNoticeHandle['copy'] {
  return copySeats().copyNotice.copy
}
