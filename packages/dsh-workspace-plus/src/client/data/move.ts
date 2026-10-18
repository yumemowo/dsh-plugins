/**
 * 一次「把工作区挪到别处」要写哪几笔
 *
 * 用户拖一行时只说了一件事：「这一行到那一片去」。但那一片可能同时意味着三份落盘数据：
 * 虚拟工作区分组归属、会话分组归属、以及跟随它的那几个后代。三者该不该写，
 * 由**来源与目的地的差异**决定，不是由调用方各写一遍——同一个动作在拖拽、菜单、
 * 以及将来的其它入口上都只有这一份判断。
 *
 * 三个判据：
 * - 虚拟分组归属只在「此刻不在目的地那一片」时写
 * - 会话分组归属只在目的地指名了一个分组时写（写它天然覆盖原来那一份）
 * - 没有指名分组、而原来那份归属的父工作区**不在目的地那一片**时，清掉它——
 *   这条归属已经不可能生效（见 `deriveNesting` 的同片判定），留着只是死数据，
 *   而且工作区将来被挪回那一片时会毫无征兆地复活
 */

/** 一个工作区此刻的会话分组归属 */
export interface MoveBinding {
  /** 父工作区 */
  workspaceId: string
  /** 那个工作区体内的会话分组 */
  groupId: string
}

/** 一次移动的目的地 */
export interface WorkspaceMoveTarget {
  /** 目的地的虚拟工作区分组，空串表示根节点 */
  scope: string
  /** 落进某个工作区的会话分组；不给表示这次只改虚拟分组归属 */
  nest?: MoveBinding | undefined
}

/** 一次移动要写的那几笔，按执行顺序给出 */
export interface WorkspaceMoveWrites {
  /** 要改虚拟分组归属的，值是要挪进去的分组（空串表示根节点） */
  reslotted: readonly { workspaceId: string; scope: string }[]
  /** 要写会话分组归属的 */
  nested: readonly string[]
  /** 要解除会话分组归属的 */
  unnested: readonly string[]
}

/** 规划一次移动 */
export interface WorkspaceMoveInput {
  /** 被挪动的那个工作区 */
  workspaceId: string
  /** 目的地 */
  target: WorkspaceMoveTarget
  /** 要跟着一起过去的后代：它们自己的归属指向这块子树里，留在原地会让层级在边界上断开 */
  followers: readonly string[]
  /** 某个工作区此刻所在的虚拟分组，空串表示根节点 */
  scopeOf: (workspaceId: string) => string
  /** 某个工作区此刻的会话分组归属 */
  bindingOf: (workspaceId: string) => MoveBinding | undefined
}

/**
 * 规划一次工作区移动
 *
 * 不写盘、不碰渲染：只回答「按目的地与现状的差，该发哪几笔」，
 * 调用方按 {@link WorkspaceMoveWrites} 的三份名单依次写即可。
 * @param input - 被挪的工作区、目的地、跟随者与两份现状读数
 */
export function planWorkspaceMove(input: WorkspaceMoveInput): WorkspaceMoveWrites {
  const { workspaceId, target, followers, scopeOf, bindingOf } = input
  const moving = [workspaceId, ...followers]

  // 1. 虚拟分组归属：只有此刻不在目的地那一片的才写，已在的写一次是多余的落盘
  const reslotted = moving
    .filter((id) => scopeOf(id) !== target.scope)
    .map((id) => ({ workspaceId: id, scope: target.scope }))

  // 2. 指名了分组：写归属，原来那一份被覆盖，因此不必先解除
  if (target.nest !== undefined) {
    return { reslotted, nested: moving, unnested: [] }
  }

  // 3. 没有指名分组：原来那份归属的父工作区若不在目的地这一片，它已经不可能生效
  const unnested = moving.filter((id) => {
    const binding = bindingOf(id)
    if (binding === undefined) return false
    return scopeOf(binding.workspaceId) !== target.scope
  })

  return { reslotted, nested: [], unnested }
}
