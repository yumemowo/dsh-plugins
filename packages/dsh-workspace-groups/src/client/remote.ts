import { z } from 'zod'

/**
 * 客户端侧的 Remote 贡献声明。
 *
 * 宿主把 `./typert` 清单注册进 typert 注册表；浏览器这一侧则必须显式
 * `ctx.remote.$mount(...)` 自己需要的命名空间，网关才会响应调用。
 * 这里的 codec 同样必须是 zod v4 的 strict 实例。
 */

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionIds: z.array(z.string()),
})

const snapshotSchema = z.object({
  byWorkspace: z.record(z.string(), z.array(groupSchema)),
})

const codec = (typeSymbol: string, schema: z.ZodType) => ({
  mode: 'strict' as const,
  typeSymbol: `@your-scope/dsh-workspace-groups#${typeSymbol}`,
  schema,
})

/** 与宿主 `./typert` 清单的方法集合一一对应。 */
const PACKAGE = '@your-scope/dsh-workspace-groups'
const SERVICE = 'workspaceGroups'

const snapshot = codec('WorkspaceGroupsSnapshot', snapshotSchema)
const str = (name: string) => codec(name, z.string())

/** 构造一条 direct 调用描述，避免逐条重复 id/service/namespace。 */
function descriptor(
  method: string,
  parameters: { name: string; codec: unknown }[],
): Record<string, unknown> {
  return {
    id: `${PACKAGE}#${SERVICE}/${method}`,
    service: SERVICE,
    namespace: SERVICE,
    method,
    invocation: { kind: 'direct' },
    parameters: parameters.map((parameter) => ({
      name: parameter.name,
      wire: parameter.name,
      source: 'json',
      codec: parameter.codec,
    })),
    result: snapshot,
  }
}

export const REMOTE_CONTRIBUTION = {
  package: PACKAGE,
  descriptors: [
    descriptor('list', []),
    descriptor('createGroup', [
      { name: 'workspaceId', codec: str('WorkspaceId') },
      { name: 'name', codec: str('GroupName') },
    ]),
    descriptor('renameGroup', [
      { name: 'workspaceId', codec: str('WorkspaceId') },
      { name: 'groupId', codec: str('GroupId') },
      { name: 'name', codec: str('GroupName') },
    ]),
    descriptor('deleteGroup', [
      { name: 'workspaceId', codec: str('WorkspaceId') },
      { name: 'groupId', codec: str('GroupId') },
    ]),
    descriptor('moveSession', [
      { name: 'workspaceId', codec: str('WorkspaceId') },
      { name: 'sessionId', codec: str('SessionId') },
      { name: 'groupId', codec: codec('NullableGroupId', z.string().nullable()) },
    ]),
  ],
}

/** 分组快照的形状，与宿主 `spec.ts` 保持一致。 */
export interface Group {
  id: string
  name: string
  sessionIds: string[]
}

export interface WorkspaceGroupsSnapshot {
  byWorkspace: Record<string, Group[]>
}

/** 走网关调用时返回的 Remote 结果信封。 */
export interface RemoteEnvelope<T> {
  ok: boolean
  value?: T
  error?: { message?: string }
}

/** 调用一个宿主方法并在失败时抛出可读错误。 */
export async function callRemote<T>(
  namespace: Record<string, (...args: never[]) => Promise<RemoteEnvelope<T>>>,
  method: string,
  args: unknown[] = [],
): Promise<T> {
  const fn = namespace[method]
  if (typeof fn !== 'function') throw new Error(`remote method "${method}" is unavailable`)
  const result = await (fn as (...a: unknown[]) => Promise<RemoteEnvelope<T>>)(...args)
  if (result === null || typeof result !== 'object' || result.ok !== true) {
    throw new Error(result?.error?.message ?? `remote call "${method}" failed`)
  }
  return result.value as T
}
