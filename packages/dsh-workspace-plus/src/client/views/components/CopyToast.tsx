/**
 * 复制结果的那一条提示
 *
 * 复制本身是纯调用（见 `copyNotice.ts`），它只往源里写一条通知
 * 这个组件是唯一订阅那个源的地方，因此同一时刻至多只有一条提示
 *
 * 订阅留在这里而不是区域组件里：区域组件订阅会让整片列表随每次复制重渲染，而这个浮层是叶子
 *
 * 与官方 `RowActionToast` 同一分工：官方也是在 frame 级的 `shell.overlay` 上挂一个宿主订阅 `rowToast`
 */
import { useSyncExternalStore } from 'react'
import type { ReactElement } from 'react'
import { IconWarningOutlineRegular, Toast } from '../../runtime.ts'
import type { CopyNoticeHandle } from '../../copyNotice.ts'

export interface CopyToastProps {
  /** 复制结果的通知源，读与清场都在它身上 */
  source: CopyNoticeHandle
}

/**
 * 渲染那条提示
 *
 * 成功走 `tone: 'success'`（原语自己画字形），失败挂警告图标，与官方那两条提示同一做法
 * 没有通知时什么都不渲染
 */
export function CopyToast({ source }: CopyToastProps): ReactElement | null {
  const notice = useSyncExternalStore(source.subscribe, source.getSnapshot, source.getSnapshot)
  if (notice === null) return null
  return (
    <Toast
      key={notice.seq}
      text={notice.text}
      {...(notice.ok ? { tone: 'success' } : { icon: <IconWarningOutlineRegular /> })}
      onDone={source.dismiss}
    />
  )
}
