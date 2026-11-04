/**
 * 「复制标识」的通知源
 *
 * 复制本身只是一次 `writeClipboard` 调用，与 React 无关
 * 需要共享的只有「刚才那次复制成没成」这一条事实，以及由它生出的那条提示
 * 因此源建在 React 之外：三处行只拿到 `copy` 这一个动作，区域根部持整份句柄并订阅它渲染提示
 *
 * 与官方 `ui-workspace` 的 `rowToast` 同一形态：一个快照存储加一个自增序号
 * 序号同时是提示的 key，再复制一次即换一次挂载，否则新文案不重放停留时长
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { writeClipboard } from './runtime.ts'

/** 一条待显示的复制结果 */
export interface CopyNotice {
  /** 要显示的文案 */
  text: string
  /** 写成成功还是失败，决定提示的语气 */
  ok: boolean
  /** 每次通知自增，同时是提示的 key */
  seq: number
}

/**
 * 通知源与它的两个写入入口
 *
 * 读那半边是 `ObservableSnapshot` 的形状，交进插槽的 inject 面后由订阅方直接拿它起订阅
 * 写那半边只有复制与清场两个动作：谁持有它谁既能发起复制、又能收起那条提示
 */
export interface CopyNoticeHandle {
  getSnapshot: () => CopyNotice | null
  subscribe: (listener: () => void) => () => void
  /**
   * 复制一段文本，并按结果写一条通知
   * @param text - 要写进剪贴板的内容
   * @param successText - 写成成功时的提示文案
   */
  copy: (text: string, successText: string) => void
  /** 清掉当前那条通知，提示自己消失时调它 */
  dismiss: () => void
}

/**
 * 造一份复制通知源
 *
 * 一个区域一份：三处复制共用它，因此同一时刻至多只有一条提示
 * @param failureText - 写失败时的提示文案，每次失败现取，语言切换后自然跟上
 */
export function createCopyNotice(failureText: () => string): CopyNoticeHandle {
  const store = createSnapshotStore<CopyNotice | null>(null)
  let seq = 0
  return {
    getSnapshot: () => store.getSnapshot(),
    subscribe: (listener) => store.subscribe(listener),
    copy: (text, successText) => {
      void writeClipboard(text).then((ok) => {
        seq += 1
        store.set({ text: ok ? successText : failureText(), ok, seq })
      })
    },
    dismiss: () => store.set(null),
  }
}
