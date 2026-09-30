import { z } from 'zod'
import { normalizePickerState } from '../pickerState.ts'
import type { RootEntryAddress } from '../rootEntry.ts'

/**
 * 客户端侧的 Remote 贡献声明
 *
 * 宿主把 `./typert` 清单注册进 typert 注册表
 * 浏览器这一侧则必须显式 `ctx.remote.$mount(...)` 自己需要的命名空间，网关才会响应调用
 * 这里的 codec 与宿主那份同形：strict 形态 + `create()` 惰性工厂
 */

const groupSchema = z.object({
  id: z.string(),
  name: z.string(),
  sessionIds: z.array(z.string()),
})

const nestingSchema = z.object({
  workspaceId: z.string(),
  groupId: z.string(),
})

const virtualWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspaceIds: z.array(z.string()),
})

/**
 * 与宿主 `spec.ts` 的 `entryAddressSchema` 同形，两端形状必须一致否则网关拒收
 *
 * 标注成 {@link RootEntryAddress} 钉住形状：两侧各写一份是网关的要求（客户端不得引用宿主那半边的模块），但形状只有 `rootEntry.ts` 一处定义
 */
const entryAddressSchema: z.ZodType<RootEntryAddress> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('workspace'), id: z.string() }),
  z.object({ kind: z.literal('virtual'), id: z.string() }),
  z.object({ kind: z.literal('all') }),
])

const pickerSchema = z.object({
  focused: entryAddressSchema,
  recent: z.array(entryAddressSchema),
  pinned: z.array(entryAddressSchema),
})

const snapshotSchema = z.object({
  byWorkspace: z.record(z.string(), z.array(groupSchema)),
  nesting: z.record(z.string(), nestingSchema),
  workspaceGroups: z.array(virtualWorkspaceSchema),
  picker: pickerSchema,
  nested: z.boolean(),
})

/**
 * 造一个惰性 codec
 *
 * 网关要求 `create()` 工厂而不是裸 schema，且同一个 codec 只物化一次
 * @param typeSymbol - 该 codec 的 wire 类型名
 * @param build - 造 schema 的工厂，首次调用时执行
 * @returns 网关要求的 strict codec
 */
const codec = (typeSymbol: string, build: () => z.ZodType) => {
  let value: z.ZodType | undefined
  return {
    mode: 'strict' as const,
    typeSymbol: `@yumemowo/dsh-workspace-plus#${typeSymbol}`,
    create: () => (value ??= build()),
  }
}

/** 与宿主 `./typert` 清单的方法集合一一对应 */
const PACKAGE = '@yumemowo/dsh-workspace-plus'
/** 网关按此 namespace 归组方法表，客户端用 `remote.<namespace>` 取服务 */
export const SERVICE = 'workspacePlus'

const snapshot = codec('WorkspaceGroupsSnapshot', () => snapshotSchema)
const str = (name: string) => codec(name, () => z.string())
const bool = (name: string) => codec(name, () => z.boolean())
const strList = (name: string) => codec(name, () => z.array(z.string()))

/** 构造一条 direct 调用描述，避免逐条重复 id/service/namespace */
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
      { name: 'groupId', codec: codec('NullableGroupId', () => z.string().nullable()) },
    ]),
    descriptor('createVirtualWorkspace', [{ name: 'name', codec: str('GroupName') }]),
    descriptor('renameVirtualWorkspace', [
      { name: 'groupId', codec: str('VirtualWorkspaceId') },
      { name: 'name', codec: str('GroupName') },
    ]),
    descriptor('deleteVirtualWorkspace', [
      { name: 'groupId', codec: str('VirtualWorkspaceId') },
    ]),
    descriptor('moveWorkspace', [
      { name: 'workspaceId', codec: str('WorkspaceId') },
      { name: 'groupId', codec: codec('NullableGroupId', () => z.string().nullable()) },
    ]),
    descriptor('nestWorkspaces', [
      { name: 'workspaceIds', codec: strList('WorkspaceIds') },
      { name: 'parentWorkspaceId', codec: str('WorkspaceId') },
      { name: 'groupId', codec: str('GroupId') },
    ]),
    descriptor('unnestWorkspaces', [{ name: 'workspaceIds', codec: strList('WorkspaceIds') }]),
    descriptor('setNested', [{ name: 'enabled', codec: bool('NestedEnabled') }]),
    descriptor('forgetWorkspace', [{ name: 'workspaceId', codec: str('WorkspaceId') }]),
    descriptor('focusEntry', [
      { name: 'address', codec: codec('RootEntryAddress', () => entryAddressSchema) },
    ]),
    descriptor('togglePinned', [
      { name: 'address', codec: codec('RootEntryAddress', () => entryAddressSchema) },
    ]),
  ],
}

/** 分组快照的形状，与宿主 `spec.ts` 保持一致 */
export interface Group {
  id: string
  name: string
  sessionIds: string[]
}

/** 一个工作区被放进某个分组的归属，形状与宿主 `spec.ts` 一致 */
export interface WorkspaceNesting {
  /** 父工作区 id */
  workspaceId: string
  /** 父工作区体内那个分组的 id */
  groupId: string
}

/** 一个工作区分组，把若干工作区打包在一起的根节点 */
export interface VirtualWorkspace {
  id: string
  name: string
  workspaceIds: string[]
}

/** 菜单的聚焦 / 最近使用 / 置顶记录，形状与宿主 `spec.ts` 一致 */
export interface PickerSnapshot {
  focused: RootEntryAddress
  recent: RootEntryAddress[]
  pinned: RootEntryAddress[]
}

export interface WorkspaceGroupsSnapshot {
  byWorkspace: Record<string, Group[]>
  /** 子工作区 → 它被放进的那个分组，开关关着时是空表 */
  nesting: Record<string, WorkspaceNesting>
  workspaceGroups: VirtualWorkspace[]
  picker: PickerSnapshot
  /** 是否按子工作区渲染，缺省当开启 */
  nested: boolean
}

/**
 * 把一个远端快照收成完整形状
 *
 * 浏览器半边会随热重载换新，而宿主半边要重启 `dsh` 才换，两端版本因此可能短暂不一致
 * 新客户端可能收到旧宿主回的、没有 `workspaceGroups` 这一格的快照
 * 直接迭代那个字段会抛 `groups is not iterable`，把整片区域（对照模式下还包括承载它的右侧栏）打挂
 * 缺什么补什么，界面退化成「没有工作区分组、没有菜单状态」而不是崩掉
 * @param value - 远端回的快照，字段可能不全
 * @returns 五个字段都在的快照
 */
export function normalizeSnapshot(value: unknown): WorkspaceGroupsSnapshot {
  const raw = (value ?? {}) as Partial<WorkspaceGroupsSnapshot>
  return {
    byWorkspace: raw.byWorkspace ?? {},
    nesting: raw.nesting ?? {},
    workspaceGroups: Array.isArray(raw.workspaceGroups) ? raw.workspaceGroups : [],
    picker: normalizePickerState(raw.picker),
    // 旧宿主没有这一格，按默认开启补齐，与宿主 `spec.ts` 的默认值一致
    nested: raw.nested !== false,
  }
}

/** 走网关调用时返回的 Remote 结果信封 */
export interface RemoteEnvelope<T> {
  ok: boolean
  value?: T
  error?: { message?: string }
}

/** 调用一个宿主方法并在失败时抛出可读错误 */
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
