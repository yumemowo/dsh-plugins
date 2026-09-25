/**
 * 对照模式：把分组区域挂进 DSH 原生右侧栏的一个 tab
 *
 * 官方 `ui-workspace` 只有 `apply` 一个出口，`WorkspaceBrowser` 并未导出，因此无法在别处复现官方渲染
 * 唯一能同屏对照的做法是反过来：左侧 `sidebar.workspaces` 交还官方，本区域改挂到右侧栏当 tab
 *
 * 右侧栏走官方 `dsh-client-ui-sidebar-right`，不引第三方侧栏包
 * 注册照官方 `ui-sidebar-files` / `ui-sidebar-documentpreview` 的两段式走：
 * 类型进 `ctx.sidebarRightTabs`，tab 体进按 `id` 键控的 `sidebar.right.pane.tab` 座位
 */
import type { ReactElement } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import type { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
// 只取类型与插槽声明增强：`sidebar.right.pane.tab` 的 SlotMap 条目来自这个入口
import type { SidebarRightTabDefinition } from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type { RegionActions } from './actions.ts'
import { NS } from './locales.ts'
import { directoryFlowSource } from './directoryFlow.ts'
import { hostInfoSource } from './hostInfo.ts'
import { WorkspaceGroupsRegion } from './components/WorkspaceGroupsRegion.tsx'
import { IconWorkspaceTreeOutlineRegular } from './runtime.ts'

/** 注册进原生右侧栏的实现 id，同时是 tab 体座位的键 */
export const COMPARE_TAB_ID = '@your-scope/dsh-workspace-groups/compare'

/** 判别值：`openTab` 按它找类型，tab 记录也按它找类型 */
export const COMPARE_TAB_KIND = 'workspace-groups'

/** 区域组件的 props 面，对照 tab 只是换一处宿主，消费的还是同一份 */
type RegionProps = Parameters<typeof WorkspaceGroupsRegion>[0]

/**
 * 对照 tab 的 tab 体
 *
 * 标准 hook 与 `t` 座位由插槽在渲染期注入
 * 目录选择洞的占用情况与宿主 home 由本包入口起好源，经 inject 面的 `hooks` 隔间绑成选择器
 * 键名到 prop 名的推导是 `directoryFlow` → `useDirectoryFlow`，与官方同一套机制
 */
function CompareTabBody(props: RegionProps): ReactElement {
  return (
    <div className="wg-tab">
      <WorkspaceGroupsRegion {...props} />
    </div>
  )
}

/**
 * 把分组区域注册成原生右侧栏的一个 tab 类型
 *
 * 两段式注册：类型进 `ctx.sidebarRightTabs`，tab 体进按键控的 `sidebar.right.pane.tab` 座位
 * 两者用同一个 `id` 关联——座位按类型定义里的 `id` 找体
 *
 * `sidebarRightTabs` 缺失时静默跳过：宿主半边与存储不受影响，只是对照界面不出现
 * @param ctx - 客户端根 context（本包自己的，已 inject `remote`）
 * @param actions - 区域的动作面
 * @param locale - 语言服务，用于标题与说明的 thunk
 * @returns 反注册回调
 */
export function registerCompareTab(
  ctx: Context,
  actions: RegionActions,
  locale: LocaleRuntime,
): () => void {
  // 宿主固定事实源在本包自己的 context 上起：`ctx.remote` 要求 remote 在 inject 列表里
  const remote = ctx.get('remote')
  const hooks = {
    // 占用者在渲染期解析：洞的加载顺序不受本包约束（见 directoryFlow.ts）
    directoryFlow: directoryFlowSource(ctx.slots),
    // remote 缺失时退回「home 未知」，卡片因此只显示原始路径
    hostInfo: remote === undefined ? UNKNOWN_HOST : hostInfoSource(ctx),
  }

  // tab 体：座位按键控，键就是下面那个 `id`
  const bodyFiber = ctx.slots.inject('sidebar.right.pane.tab', () =>
    ctx.slots.register(
      {
        name: 'sidebar.right.pane.tab',
        key: COMPARE_TAB_ID,
        locale: NS,
        // 右侧栏没有 shell 的折叠态：始终按宽栏渲染，展开请求是空操作
        inject: () => ({ ...actions, wide: true as const, expandSidebar: noop, hooks }),
      },
      CompareTabBody as never,
    ),
  )

  const typeFiber = ctx.inject(['sidebarRightTabs'], (injected) => {
    const tabs = injected.get('sidebarRightTabs')
    if (tabs === undefined) return

    // 标题与说明都是 thunk：每次取用时现读当前语言，切换语言后无需重注册
    const title = (): string => locale.bind('workspace')('section.workspaces')
    const description = (): string =>
      (locale.bind(NS) as (key: 'compareTabDescription') => string)('compareTabDescription')

    const definition: SidebarRightTabDefinition = {
      id: COMPARE_TAB_ID,
      kind: COMPARE_TAB_KIND,
      // 产品外挂类型取最高一档：它不与任何官方类型争同一批地址，只是自己要有一档
      priority: 'extension',
      title,
      guide: [
        {
          id: COMPARE_TAB_KIND,
          order: 200,
          title,
          description,
          icon: IconWorkspaceTreeOutlineRegular,
        },
      ],
    }

    const dispose = tabs.register(definition)

    // 类型注册好之后立刻请求打开：右侧栏只在有活动会话时才挂载出面板，没有选中会话时这次调用不生效
    // 用户仍可从引导页手动打开。放在这里而不是 inject 之外，是因为类型可能晚于本包挂载才注册得上
    try {
      ctx.get('sidebarRight')?.openTab(COMPARE_TAB_KIND)
    } catch {
      // 没有挂载的面时打开失败是预期的，忽略
    }

    return dispose
  })

  return () => {
    bodyFiber()
    void typeFiber.dispose()
  }
}

/** 恒定的空操作，避免每次渲染新建一份 */
const noop = (): void => {}

/** remote 缺失时的宿主事实源：home 未知，恒定同一份快照因此不会让 uSES 空转 */
const UNKNOWN_HOST = {
  getSnapshot: () => ({ home: undefined }),
  subscribe: () => () => {},
}
