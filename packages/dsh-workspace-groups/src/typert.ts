import { z } from 'zod'
import { snapshotSchema } from './spec.ts'

/**
 * Host 面 Typert 清单
 *
 * typert-loader 按 package.json 的 `exports["./typert"]` 自动发现并注册本对象，
 * 客户端据此通过 `remote.workspaceGroups.*` 调用宿主方法。
 * 所有 codec 必须是 zod v4 实例，且为 strict 形态
 */

const snapshotCodec = {
  mode: 'strict',
  typeSymbol: '@your-scope/dsh-workspace-groups#WorkspaceGroupsSnapshot',
  schema: snapshotSchema,
}

const workspaceIdCodec = {
  mode: 'strict',
  typeSymbol: '@your-scope/dsh-workspace-groups#WorkspaceId',
  schema: z.string(),
}

const groupIdCodec = {
  mode: 'strict',
  typeSymbol: '@your-scope/dsh-workspace-groups#GroupId',
  schema: z.string(),
}

const sessionIdCodec = {
  mode: 'strict',
  typeSymbol: '@your-scope/dsh-workspace-groups#SessionId',
  schema: z.string(),
}

const nameCodec = {
  mode: 'strict',
  typeSymbol: '@your-scope/dsh-workspace-groups#GroupName',
  schema: z.string(),
}

/** 可空分组 id：null 表示「移出到未分组」 */
const nullableGroupIdCodec = {
  mode: 'strict',
  typeSymbol: '@your-scope/dsh-workspace-groups#NullableGroupId',
  schema: z.string().nullable(),
}

const PACKAGE = '@your-scope/dsh-workspace-groups'
const SERVICE = 'workspaceGroups'

/** 构造一条 direct 调用的描述，减少重复 */
function direct(
  method: string,
  parameters: readonly {
    name: string
    wire: string
    codec: unknown
  }[],
) {
  return {
    id: `${PACKAGE}#${SERVICE}/${method}`,
    service: SERVICE,
    namespace: SERVICE,
    method,
    invocation: { kind: 'direct' as const },
    parameters: parameters.map((parameter) => ({
      name: parameter.name,
      wire: parameter.wire,
      source: 'json' as const,
      codec: parameter.codec,
    })),
    result: snapshotCodec,
  }
}

export const TYPERT = {
  package: PACKAGE,
  face: 'host' as const,
  schemas: [],
  invocations: [
    direct('list', []),
    direct('createGroup', [
      { name: 'workspaceId', wire: 'workspaceId', codec: workspaceIdCodec },
      { name: 'name', wire: 'name', codec: nameCodec },
    ]),
    direct('renameGroup', [
      { name: 'workspaceId', wire: 'workspaceId', codec: workspaceIdCodec },
      { name: 'groupId', wire: 'groupId', codec: groupIdCodec },
      { name: 'name', wire: 'name', codec: nameCodec },
    ]),
    direct('deleteGroup', [
      { name: 'workspaceId', wire: 'workspaceId', codec: workspaceIdCodec },
      { name: 'groupId', wire: 'groupId', codec: groupIdCodec },
    ]),
    direct('moveSession', [
      { name: 'workspaceId', wire: 'workspaceId', codec: workspaceIdCodec },
      { name: 'sessionId', wire: 'sessionId', codec: sessionIdCodec },
      { name: 'groupId', wire: 'groupId', codec: nullableGroupIdCodec },
    ]),
  ],
  model: {
    services: [
      {
        description: '按工作区维护会话分组。',
        summary: '会话分组的读写；分组只保存结构信息，不改变工作区的会话归属。',
        tags: [],
        jsDoc: '/** 按工作区维护会话分组。 */',
        key: SERVICE,
        exportName: 'WorkspaceGroupsService',
        members: [
          { kind: 'method', name: 'list', signature: 'list(): Promise<WorkspaceGroupsSnapshot>' },
          {
            kind: 'method',
            name: 'createGroup',
            signature: 'createGroup(workspaceId: string, name: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'renameGroup',
            signature:
              'renameGroup(workspaceId: string, groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'deleteGroup',
            signature: 'deleteGroup(workspaceId: string, groupId: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'moveSession',
            signature:
              'moveSession(workspaceId: string, sessionId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>',
          },
        ],
        types: [
          { name: 'Group', declaration: 'export interface Group { id: string; name: string; sessionIds: string[] }' },
          {
            name: 'WorkspaceGroupsSnapshot',
            declaration:
              'export interface WorkspaceGroupsSnapshot { byWorkspace: Record<string, Group[]> }',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}

export default TYPERT
