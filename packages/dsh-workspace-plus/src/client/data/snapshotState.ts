/**
 * 快照迁入的调度记账
 *
 * 快照有三个来源： reload （就绪信号、推送）、写入方法的返回值、以及 reload 失败后的重试
 * 它们并发到达，而「谁可以覆盖谁」必须是一条显式规则，不能散落在各个 `.then` 里
 *
 * 这一层只做判定、不碰 React
 * 输入是当前记账，输出是「这次响应是否该被采用」与「要不要紧接着再来一次」
 * 因此调度规则可以逐条单测，而组件里只剩下「按判定结果改状态」这一件事
 */

/** 一份记账 */
export interface SnapshotBookkeeping {
  /** 最近一次发出的 reload 序号 */
  issued: number
  /** 已被采用的最新序号，比它小的响应一律丢弃 */
  accepted: number
  /** 是否有一次 reload 在途 */
  inFlight: boolean
  /**
   * 在途期间又被要求 reload 
   *
   * 一次操作可能推出多帧（逐条写工作区、先写 global 再清归属），每帧都会要求 reload 
   * 记账在这里把它们并成一次：等这一次落地之后再补一次，而不是并发发出去
   */
  dirty: boolean
}

/** 起始记账：什么都没发过，也没有在途 */
export function initialBookkeeping(): SnapshotBookkeeping {
  return { issued: 0, accepted: 0, inFlight: false, dirty: false }
}

/**
 * 请求一次 reload 
 *
 * 已有在途时不并发第二次，只记下「落地后还要再来一次」
 * 并发发出去的那些响应之间没有次序，谁先回来取决于网络，而它们各自都可能被误判成「最新」
 * @param state - 当前记账
 * @returns 新的记账，以及要发出的请求序号；现在不该发时为 undefined
 */
export function requestReload(state: SnapshotBookkeeping): {
  state: SnapshotBookkeeping
  issue: number | undefined
} {
  if (state.inFlight) return { state: { ...state, dirty: true }, issue: undefined }
  const issue = state.issued + 1
  return { state: { ...state, issued: issue, inFlight: true, dirty: false }, issue }
}

/**
 * 一次 reload 落地
 *
 * 只有序号等于「最近一次发出」的响应可以落笔：更早的那些即使后到，也只是过期的内容
 * @param state - 当前记账
 * @param issue - 这个响应属于哪一次请求
 * @returns 新的记账、是否该采用这份内容、以及是否要紧接着补一次
 */
export function settleReload(
  state: SnapshotBookkeeping,
  issue: number,
): { state: SnapshotBookkeeping; adopt: boolean; followUp: boolean } {
  // 在途期间写入返回值已经把序号推进了，那次 reload 的响应因此作废
  if (issue !== state.issued) {
    return { state: { ...state, inFlight: false }, adopt: false, followUp: state.dirty }
  }
  const followUp = state.dirty
  return {
    state: { ...state, accepted: issue, inFlight: false, dirty: false },
    adopt: true,
    followUp,
  }
}

/**
 * 采用一次写入返回值
 *
 * 写入的返回值比任何在途 reload 都新，因此把序号一并推进，让那些响应全部作废
 * @param state - 当前记账
 * @returns 新的记账，调用方据此直接采用返回值
 */
export function adoptWrite(state: SnapshotBookkeeping): SnapshotBookkeeping {
  const next = state.issued + 1
  return { ...state, issued: next, accepted: next, dirty: false }
}
