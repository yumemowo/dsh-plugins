import { z } from 'zod'
import { snapshotSchema } from './spec.ts'

/**
 * Host 面 Typert 清单
 *
 * typert-loader 按 package.json 的 `exports["./typert"]` 自动发现并注册本对象
 * 客户端据此通过 `remote.workspaceGroups.*` 调用宿主方法
 * 每个 codec 都包一个 zod v4 schema，且必须是 strict 形态
 * 造 schema 的活交给 `create()` 惰性工厂：注册表按需物化，且同一个 codec 只构造一次
 */

/**
 * 造一个惰性 codec
 *
 * `create` 必须每次返回同一个实例——注册表会缓存首次结果，重复构造不报错但白费一遍
 * @param typeSymbol - 该 codec 的 wire 类型名
 * @param build - 造 schema 的工厂，首次调用时执行
 * @returns 注册表要求的 strict codec
 */
function codec(typeSymbol: string, build: () => z.ZodType) {
  let value: z.ZodType | undefined
  return {
    mode: 'strict' as const,
    typeSymbol: `@yumemowo/dsh-workspace-groups#${typeSymbol}`,
    create: () => (value ??= build()),
  }
}

const snapshotCodec = codec('WorkspaceGroupsSnapshot', () => snapshotSchema)

const workspaceIdCodec = codec('WorkspaceId', () => z.string())

const groupIdCodec = codec('GroupId', () => z.string())

const virtualWorkspaceIdCodec = codec('VirtualWorkspaceId', () => z.string())

const sessionIdCodec = codec('SessionId', () => z.string())

const nameCodec = codec('GroupName', () => z.string())

/** 一批工作区 id，一次把整棵子树写进同一个分组 */
const workspaceIdsCodec = codec('WorkspaceIds', () => z.array(z.string()))

/** 嵌套渲染开关 */
const nestedEnabledCodec = codec('NestedEnabled', () => z.boolean())

/** 可空分组 id，null 表示「移出到未分组」 */
const nullableGroupIdCodec = codec('NullableGroupId', () => z.string().nullable())

/** 菜单条目键：工作区与工作区分组共用一套带前缀的键（见 `rootEntry.ts`） */
const entryKeyCodec = codec('RootEntryKey', () => z.string())

const PACKAGE = '@yumemowo/dsh-workspace-groups'
const SERVICE = 'workspaceGroups'

/**
 * 构造一条 direct 调用的描述，减少重复
 *
 * 参数上 `name` 与 `wire` 的分工见官方文档
 * https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/typert.html
 *
 * 本包参数全是 `source: 'json'`，这类参数的 `wire` 恒等于源码形参名，因此缺省回退到 `name`
 * 将来引入 lookup 参数时必须逐条显式写出 `wire`
 * @param method - 宿主服务上的方法名，同时是 endpoint 的方法段
 * @param parameters - 按宿主签名顺序排列的形参
 */
function direct(
  method: string,
  parameters: readonly {
    name: string
    /** 线上键名，缺省时回退 `name` */
    wire?: string | undefined
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
      wire: parameter.wire ?? parameter.name,
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
      { name: 'workspaceId', codec: workspaceIdCodec },
      { name: 'name', codec: nameCodec },
    ]),
    direct('renameGroup', [
      { name: 'workspaceId', codec: workspaceIdCodec },
      { name: 'groupId', codec: groupIdCodec },
      { name: 'name', codec: nameCodec },
    ]),
    direct('deleteGroup', [
      { name: 'workspaceId', codec: workspaceIdCodec },
      { name: 'groupId', codec: groupIdCodec },
    ]),
    direct('moveSession', [
      { name: 'workspaceId', codec: workspaceIdCodec },
      { name: 'sessionId', codec: sessionIdCodec },
      { name: 'groupId', codec: nullableGroupIdCodec },
    ]),
    direct('createVirtualWorkspace', [{ name: 'name', codec: nameCodec }]),
    direct('renameVirtualWorkspace', [
      { name: 'groupId', codec: virtualWorkspaceIdCodec },
      { name: 'name', codec: nameCodec },
    ]),
    direct('deleteVirtualWorkspace', [
      { name: 'groupId', codec: virtualWorkspaceIdCodec },
    ]),
    direct('moveWorkspace', [
      { name: 'workspaceId', codec: workspaceIdCodec },
      { name: 'groupId', codec: nullableGroupIdCodec },
    ]),
    direct('nestWorkspaces', [
      { name: 'workspaceIds', codec: workspaceIdsCodec },
      { name: 'parentWorkspaceId', codec: workspaceIdCodec },
      { name: 'groupId', codec: groupIdCodec },
    ]),
    direct('unnestWorkspaces', [
      { name: 'workspaceIds', codec: workspaceIdsCodec },
    ]),
    direct('setNested', [{ name: 'enabled', codec: nestedEnabledCodec }]),
    direct('forgetWorkspace', [
      { name: 'workspaceId', codec: workspaceIdCodec },
    ]),
    direct('focusEntry', [{ name: 'key', codec: entryKeyCodec }]),
    direct('togglePinned', [{ name: 'key', codec: entryKeyCodec }]),
  ],
  model: {
    services: [
      {
        description: '按工作区维护会话分组，并在根节点维护工作区分组。',
        summary:
          '会话分组与工作区分组的读写；两者都只保存结构信息，不改变工作区或会话本身的归属。',
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
          {
            kind: 'method',
            name: 'createVirtualWorkspace',
            signature: 'createVirtualWorkspace(name: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'renameVirtualWorkspace',
            signature:
              'renameVirtualWorkspace(groupId: string, name: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'deleteVirtualWorkspace',
            signature: 'deleteVirtualWorkspace(groupId: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'moveWorkspace',
            signature:
              'moveWorkspace(workspaceId: string, groupId: string | null): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'nestWorkspaces',
            signature:
              'nestWorkspaces(workspaceIds: readonly string[], parentWorkspaceId: string, groupId: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'unnestWorkspaces',
            signature:
              'unnestWorkspaces(workspaceIds: readonly string[]): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'setNested',
            signature: 'setNested(enabled: boolean): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'forgetWorkspace',
            signature: 'forgetWorkspace(workspaceId: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'focusEntry',
            signature: 'focusEntry(key: string): Promise<WorkspaceGroupsSnapshot>',
          },
          {
            kind: 'method',
            name: 'togglePinned',
            signature: 'togglePinned(key: string): Promise<WorkspaceGroupsSnapshot>',
          },
        ],
        types: [
          { name: 'Group', declaration: 'export interface Group { id: string; name: string; sessionIds: string[] }' },
          {
            name: 'WorkspaceNesting',
            declaration:
              'export interface WorkspaceNesting { workspaceId: string; groupId: string }',
          },
          {
            name: 'VirtualWorkspace',
            declaration:
              'export interface VirtualWorkspace { id: string; name: string; workspaceIds: string[] }',
          },
          {
            name: 'PickerSnapshot',
            declaration:
              'export interface PickerSnapshot { focused: string; recent: string[]; pinned: string[] }',
          },
          {
            name: 'WorkspaceGroupsSnapshot',
            declaration:
              'export interface WorkspaceGroupsSnapshot { byWorkspace: Record<string, Group[]>; nesting: Record<string, WorkspaceNesting>; workspaceGroups: VirtualWorkspace[]; picker: PickerSnapshot; nested: boolean }',
          },
        ],
      },
    ],
    events: [],
    objects: [],
  },
}

export default TYPERT
