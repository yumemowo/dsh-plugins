/**
 * 工作区分组插件的浏览器半边。
 *
 * 注册进侧边栏 shell 的 `sidebar.workspaces` 区域。该插槽是 `single` 类型：
 * 同一优先级重复注册会抛错，且**数值更低的优先级渲染**。官方 ui-workspace
 * 用默认优先级 0，本包以 `priority: -1` 成为渲染者。
 *
 * 不声明任何子插槽：`sidebar.workspaces.directoryFlow` 已被 ui-workspace 声明，
 * 而一个插槽只能有一个声明者，重复声明会直接抛错。阶段一不提供
 * 「新增工作区」入口，因此也不需要那个洞。
 *
 * @module @your-scope/dsh-workspace-groups/client
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { ISessions, SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
// 仅用于引入 ui-renderer 的客户端类型增强（ctx.slots 等）。
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// 仅用于引入 sidebar 的插槽声明增强（sidebar.workspaces 的 SlotMap 条目）。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import { REMOTE_CONTRIBUTION, SERVICE, callRemote } from './remote.ts'
import type { Group, WorkspaceGroupsSnapshot } from './remote.ts'
import { registerCompareTab } from './compare.ts'
import type { RegionActions } from './compare.ts'
import { WorkspaceGroupsRegion } from './region.ts'
import { insertStyles } from './styles.ts'

/**
 * 声明本包占用的插槽与语言包键域。
 *
 * 这两个合并只有在本模块被引入后才会生效，因此上面的类型导入不可省略。
 */
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'workspace-groups': keyof (typeof DICTIONARIES)['zh']
  }
}

/** 浏览器半边声明的服务依赖。 */
export const inject = ['slots', 'sessions', 'workspaces', 'locale', 'remote']

/** 界面文案，中英各一份。 */
const DICTIONARIES = {
  zh: {
    title: '工作区',
    newGroup: '新建分组',
    newSession: '新建会话',
    groupNamePrompt: '分组名称',
    renameGroup: '重命名分组',
    deleteGroup: '删除分组',
    confirmDeleteGroup: '删除分组「{name}」？组内会话会移出分组，会话本身不受影响。',
    confirmLabel: '确定',
    cancelLabel: '取消',
    closeLabel: '关闭',
    sessionActions: '会话操作',
    moveToGroup: '分组',
    ungroup: '取消分组',
    compareTabDescription: '分组区域的对照视图（左侧为官方工作区列表）',
    empty: '暂无会话',
    unimplemented: '分组为实验特性：搜索、归档、拖拽暂未提供。',
  },
  en: {
    title: 'Workspaces',
    newGroup: 'New group',
    newSession: 'New session',
    groupNamePrompt: 'Group name',
    renameGroup: 'Rename group',
    deleteGroup: 'Delete group',
    confirmDeleteGroup:
      'Delete group "{name}"? Its sessions leave the group; the sessions themselves are unaffected.',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    closeLabel: 'Close',
    sessionActions: 'Session actions',
    moveToGroup: 'Group',
    ungroup: 'Ungroup',
    compareTabDescription: 'Grouping region for side-by-side comparison with the official list',
    empty: 'No sessions',
    unimplemented: 'Groups are experimental: search, archive and drag are not available yet.',
  },
}

/** 语言包命名空间。 */
const NS = 'workspace-groups'

/**
 * 对照模式开关。
 *
 * `true` 时左侧 `sidebar.workspaces` 交还官方 ui-workspace，本区域改挂进
 * `dsh-better-sidebar` 的右侧栏 tab，便于和官方渲染同屏比对；
 * `false`（默认）时维持 `priority: -1` 接替左侧区域。
 *
 * 之所以是编译期常量而不是配置项：这是开发期的对照开关，
 * 不是要交付给用户的能力，配置化反而要多一套 schema 与文档。
 */
//const COMPARE_MODE = false
const COMPARE_MODE = true

/** 把翻译函数绑定成组件需要的文案表。 */
function buildLabels(
  t: (key: keyof (typeof DICTIONARIES)['zh'], params?: Record<string, unknown>) => string,
): RegionActions['labels'] {
  return {
    title: t('title'),
    newGroup: t('newGroup'),
    newSession: t('newSession'),
    groupNamePrompt: t('groupNamePrompt'),
    renameGroup: t('renameGroup'),
    deleteGroup: t('deleteGroup'),
    confirmDeleteGroup: (name: string) => t('confirmDeleteGroup', { name }),
    confirmLabel: t('confirmLabel'),
    cancelLabel: t('cancelLabel'),
    closeLabel: t('closeLabel'),
    sessionActions: t('sessionActions'),
    moveToGroup: t('moveToGroup'),
    ungroup: t('ungroup'),
    compareTabDescription: t('compareTabDescription'),
    empty: t('empty'),
    unimplemented: t('unimplemented'),
  }
}

/**
 * 插件入口。
 * @param ctx - 客户端根 context。
 */
export function apply(ctx: Context): void {
  const sessions = ctx.get('sessions') as ISessions | undefined
  const workspaces = ctx.get('workspaces') as IWorkspaces | undefined
  const locale = ctx.get('locale') as LocaleRuntime | undefined
  if (locale === undefined) return

  // 两种注册形式：带类型合并的整表形式按内置语言 id 传字典。
  ctx.effect(
    () => locale.register(NS, { zh: DICTIONARIES.zh, en: DICTIONARIES.en }),
    'workspace-groups: dictionaries',
  )

  /**
   * 远程命名空间就绪信号。
   *
   * 区域组件的首次拉取可能早于 `$mount` 完成；就绪时这里发布一次，
   * 订阅者借此重试此前被就绪性拒绝的加载。
   */
  const readyListeners = new Set<() => void>()
  const onReady = (listener: () => void): (() => void) => {
    // 先挂订阅再看状态，避免「检查时未就绪、发布前刚就绪」的窗口漏报。
    if (groupsApi !== undefined) {
      listener()
      return () => {}
    }
    readyListeners.add(listener)
    return () => {
      readyListeners.delete(listener)
    }
  }

  /** 挂载本包自己的 remote 命名空间；成功后取回可调用的方法表。 */
  let groupsApi: Record<string, (...args: never[]) => Promise<never>> | undefined
  ctx.effect(
    () => {
      let disposed = false
      void ctx.remote.$mount(REMOTE_CONTRIBUTION as never).then(() => {
        if (disposed) return
        // 服务键按 descriptor 的 namespace 注册（remote.<namespace>），
        // 不是包名——typert 网关以 namespace 归组安装方法表。
        groupsApi = ctx.get(`remote.${SERVICE}`) as typeof groupsApi
        for (const listener of [...readyListeners]) listener()
        readyListeners.clear()
      })
      return () => {
        disposed = true
      }
    },
    'workspace-groups: remote mount',
  )

  const requireApi = (): Record<string, (...args: never[]) => Promise<never>> => {
    if (groupsApi === undefined) throw new Error('workspace-groups remote is not ready')
    return groupsApi
  }

  const loadGroups = async (): Promise<Record<string, Group[]>> => {
    const snapshot = await callRemote<WorkspaceGroupsSnapshot>(requireApi(), 'list')
    return snapshot.byWorkspace
  }

  const injected = (): RegionActions => {
    const t = locale.bind(NS)
    const labels = buildLabels(t)
    if (sessions === undefined || workspaces === undefined) {
      // 依赖缺失时给出空实现：组件仍可渲染，只是没有可操作的动作。
      return {
        openSession: () => {},
        startSession: () => {},
        onReady: () => () => {},
        loadGroups: async () => ({}),
        createGroup: async () => {},
        renameGroup: async () => {},
        deleteGroup: async () => {},
        moveSession: async () => {},
        labels,
      }
    }
    return {
      openSession: (sessionId: string) => {
        sessions.open(sessionId as never)
      },
      startSession: (workspaceId: string) => {
        void sessions.create({ workspaceId: workspaceId as never }).then((created) => {
          sessions.open(created)
        })
      },
      onReady,
      loadGroups,
      createGroup: (workspaceId, name) =>
        callRemote(requireApi(), 'createGroup', [workspaceId, name]).then(() => undefined),
      renameGroup: (workspaceId, groupId, name) =>
        callRemote(requireApi(), 'renameGroup', [workspaceId, groupId, name]).then(() => undefined),
      deleteGroup: (workspaceId, groupId) =>
        callRemote(requireApi(), 'deleteGroup', [workspaceId, groupId]).then(() => undefined),
      // 选择器用空串表示「不属于任何分组」，宿主接口用 null 表达同一含义。
      moveSession: (workspaceId, sessionId, groupId) =>
        callRemote(requireApi(), 'moveSession', [
          workspaceId,
          sessionId,
          groupId === '' ? null : groupId,
        ]).then(() => undefined),
      labels,
    }
  }

  // 样式随插件挂载注入；卸载由模块系统的样式记账处理，无需显式移除。
  insertStyles()

  /**
   * 二级菜单面板的展开方向标记。
   *
   * 对照模式下区域在右侧栏、贴近窗口右缘，官方 Menu 的二级面板固定
   * 向右展开会开出屏幕外，样式表只在该标记下把面板翻向左侧。
   * 用编译期常量做参考而不是运行期测量：宿主列由 COMPARE_MODE 唯一
   * 决定，插件卸载时 effect 收尾会摘掉标记。
   */
  ctx.effect(
    () => {
      if (typeof document === 'undefined' || !COMPARE_MODE) return () => {}
      document.body.setAttribute('data-wg-menu-flip', '')
      return () => {
        document.body.removeAttribute('data-wg-menu-flip')
      }
    },
    'workspace-groups: menu flip marker',
  )

  // 对照模式：把左侧 `sidebar.workspaces` 交还官方 ui-workspace，
  // 本区域改挂进 dsh-better-sidebar 的右侧栏 tab，好和官方渲染同屏比对。
  if (COMPARE_MODE) {
    ctx.effect(() => registerCompareTab(ctx, injected()), 'workspace-groups: compare tab')
    return
  }

  // 接替模式：priority: -1 —— 覆盖官方 ui-workspace（其优先级为默认 0）。
  ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register(
      { name: 'sidebar.workspaces', priority: -1, inject: injected, locale: NS },
      WorkspaceGroupsRegion as never,
    ),
  )
}

export type { SessionListState }
