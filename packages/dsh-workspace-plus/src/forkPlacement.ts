/**
 * 分叉出的会话落回源会话所在的分组
 *
 * 判定放在宿主而不是本包的分叉菜单上
 * `session/fork` 是宿主侧的 remote endpoint
 * 发起方不止插件 ui，还可能有官方侧边栏、聊天面板回合末尾，以及任何走网关的调用方
 * 它们都汇到宿主的会话创建路径，因此只有这一处能覆盖全部发起方
 */
import type { Group } from './spec.ts'

/** 工作区注册表在本模块用到的部分，只读成员表，不引入官方工作区包 */
export interface SessionOwners {
  list(): readonly { sessionIds: readonly string[] }[]
}

/** 分组存储在本模块用到的部分 */
export interface ForkPlacementStore {
  /** 读整份快照，只取分组元数据那一格 */
  list(): Promise<{ byWorkspace: Readonly<Record<string, readonly Group[]>> }>
  /** 把会话移入分组，宿主每个变更方法都回整份快照 */
  moveSession(workspaceId: string, sessionId: string, groupId: string): Promise<unknown>
}

/** 创建那一刻要判的两格，只取这两格，整个 `Session` 不进这一层 */
export interface CreatedSession {
  id: string
  header: {
    /** 分叉来源，不是分叉时为 undefined */
    parentSession?: string | undefined
    /** 来源分类，子代理创建时为 `subagent` */
    origin?: 'subagent' | undefined
  }
}

/** 一次落位判定要的输入 */
export interface ForkPlacementInput {
  /** 分叉出的新会话 id */
  childId: string
  /** 它的来源会话，不是分叉时缺省 */
  parentId: string | undefined
  /** 新会话的来源分类 */
  origin: 'subagent' | undefined
  /** 创建那一刻它是否已经属于某个工作区 */
  attached: boolean
  /** 全部工作区的分组元数据 */
  byWorkspace: Readonly<Record<string, readonly Group[]>>
}

/**
 * 判定一个分叉出的会话该落进哪个分组
 *
 * 三条判据缺一不可：它是分叉（不是新建、也不是子代理）、创建那一刻还没被挂进任何工作区、来源会话就在某个分组里
 *
 * 第二条不只为省一次写入：重新打开一条已存盘的会话同样走会话创建，那时它早已挂在工作区名下
 * 只按「有来源会话」判的话，用户手动把子会话移出分组之后，下次打开它又会被挪回去
 *
 * @param input - 见 {@link ForkPlacementInput}
 * @returns 目标工作区与分组，没有可落的分组时缺省
 */
export function forkPlacement(
  input: ForkPlacementInput,
): { workspaceId: string; groupId: string } | undefined {
  const { childId, parentId, origin, attached, byWorkspace } = input
  if (parentId === undefined || origin === 'subagent' || attached) return undefined
  for (const [workspaceId, groups] of Object.entries(byWorkspace)) {
    for (const group of groups) {
      if (!group.sessionIds.includes(parentId)) continue
      // 已经在同一个分组里就不写：重复写只会多一次落盘与一次推送
      if (group.sessionIds.includes(childId)) return undefined
      return { workspaceId, groupId: group.id }
    }
  }
  return undefined
}

/**
 * 按 {@link forkPlacement} 的判定把分叉出的会话写进分组
 *
 * 本函数会把失败交给调用方，`session/created` 的同步抛出会否决这次会话创建并连带回滚
 * 因此调用方必须接住这次 rejection，只留痕，不让归组失败变成分叉失败
 *
 * 「是否已属于某个工作区」在第一个 await 之前读定
 * 分叉流程建好会话之后才把它挂进工作区，那一格要读的正是挂载之前的状态
 * 晚读会读到挂载之后的值而判成「不是新分叉」
 * 因此存储以异步入口的形式传进来，把「等存储就绪」压进本函数内部的 await
 *
 * @param store - 分组元数据读写面的异步入口
 * @param registry - 工作区注册表，缺席时无从判断归属，直接跳过
 * @param session - 刚创建的会话
 * @returns 是否写入了一笔归属，失败时缺省
 */
export async function placeForkedSession(
  store: Promise<ForkPlacementStore>,
  registry: SessionOwners | undefined,
  session: CreatedSession,
): Promise<{ workspaceId: string; groupId: string } | undefined> {
  if (registry === undefined) return undefined
  // 这一格必须落在同步段，上方的 await 一旦提前，读到的就是挂载之后的值
  const attached = registry
    .list()
    .some((workspace) => workspace.sessionIds.includes(session.id))
  // 已属工作区就不必再读一次分组元数据，判据必然把这个会话排除在外
  if (attached) return undefined
  const snapshot = await (await store).list()
  const placement = forkPlacement({
    childId: session.id,
    parentId: session.header.parentSession,
    origin: session.header.origin,
    attached,
    byWorkspace: snapshot.byWorkspace,
  })
  if (placement === undefined) return undefined
  await (await store).moveSession(placement.workspaceId, session.id, placement.groupId)
  return placement
}
