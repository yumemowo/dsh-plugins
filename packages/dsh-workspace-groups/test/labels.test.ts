import { describe, expect, it } from 'vitest'
import { regionLabels } from '../src/client/labels.ts'
import { NS, en, zh } from '../src/client/locales.ts'
import {
  OFFICIAL_SIDEBAR_ZH,
  OFFICIAL_WORKSPACE_ZH,
  regionTranslate,
  sidebarTranslate,
  translateFor,
  workspaceTranslate,
} from './locale-stub.ts'

/**
 * 文案分两个来源，这里同时固化这条边界：
 *
 * - 官方 `workspace` 已有的文案只从官方命名空间取，本包字典里不复制一份；
 * - 只有官方没有对应词的自有文案才在本包字典里。
 */
describe('locales', () => {
  it('keeps the English dictionary complete against the Chinese key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('owns a short namespace name rather than the package name', () => {
    // 官方插件的命名空间都是短名（workspace / sidebar / goal …）。
    expect(NS).toBe('workspaceGroups')
  })

  it('holds only the copy the official namespace does not already have', () => {
    // 键名与官方字典重合即意味着又复制了一份官方译文。
    const duplicated = Object.keys(zh).filter(
      (key) => key in OFFICIAL_WORKSPACE_ZH || key in OFFICIAL_SIDEBAR_ZH,
    )

    expect(duplicated).toEqual([])
  })

  it('lists every package-owned key explicitly', () => {
    // 自有键不多，逐个列出；新增文案时这里会提醒重新确认它是否真的官方没有。
    expect(Object.keys(zh).sort()).toEqual([
      'actions.group.aria',
      'compareTabDescription',
      'delete.desc.group',
      'deleteGroup',
      'groupNamePrompt',
      'moveToGroup',
      'newGroup',
      'renameGroup',
      'ungroup',
      'unimplemented',
    ])
  })
})

describe('regionLabels', () => {
  const labels = regionLabels(regionTranslate(), workspaceTranslate(), sidebarTranslate())

  it('reads the region title from the official section key', () => {
    expect(labels.title).toBe('工作区')
  })

  it('reads the ungrouped bucket title from the official key', () => {
    expect(labels.ungrouped).toBe('未分组')
  })

  it('reads the empty placeholder from the official key', () => {
    expect(labels.empty).toBe('暂无会话')
  })

  it('reads the new-session row name from the official session.new key', () => {
    // 空白（新建中）会话行的固定名是官方词，本包字典里不存副本；会话正式
    // 启用后的名字由标题服务投影，不走这一格
    expect(labels.newSession).toBe('新会话')
  })

  it('reads the workspace name prompt and its conflict hint from the official keys', () => {
    expect(labels.workspaceNamePrompt).toBe('工作区名称')
    expect(labels.workspaceConflict('w1')).toBe('已存在名为“w1”的工作区。')
  })

  it('reads the workspace rename and delete copy from the official keys', () => {
    // 菜单项是通用动词，对话框标题才点明对象——官方 ui-workspace 就是这样分的
    expect(labels.rename).toBe('重命名')
    expect(labels.renameWorkspace).toBe('重命名工作区')
    expect(labels.deleteWorkspace).toBe('删除工作区')
    expect(labels.confirmDeleteWorkspace('w1')).toBe(
      '将把“w1”从工作区列表中移除。文件夹与会话记录会保留，其会话将显示在“未分组”下。',
    )
  })

  it('interpolates the workspace name into the aria labels', () => {
    expect(labels.workspaceActions('w1')).toBe('工作区“w1”的操作')
    expect(labels.newSessionIn('w1')).toBe('在“w1”中新建会话')
    expect(labels.sessionActions('S1')).toBe('会话“S1”的操作')
  })

  it('reads the row menu new-session item from the official sidebar key', () => {
    // 菜单项是一次性动作，读作动词短语；它取官方 sidebar 新建按钮的文案，
    // 与行内 `+` 的无障碍标签（带对象名的 actions.newSession.aria）分工不同
    expect(labels.newSessionItem).toBe('新建会话')
    expect(labels.newSessionItem).not.toBe(labels.newSessionIn('w1'))
    // 本包字典里没有这个键，只能来自官方 sidebar 命名空间
    const ours = regionTranslate() as unknown as (key: string) => string
    expect(ours('session.new.label')).toBe('session.new.label')
  })

  it('reads every session status label from the official status keys', () => {
    expect(labels.status.running).toBe('进行中')
    expect(labels.status.subagentsRunning(1)).toBe('1 个子代理运行中')
    expect(labels.status.subagentsRunning(3)).toBe('3 个子代理运行中')
    expect(labels.status.waitingApproval).toBe('等待审批')
    expect(labels.status.planReview).toBe('计划待审')
    expect(labels.status.waitingAnswer).toBe('等待回答')
    expect(labels.status.completed).toBe('已完成')
  })

  it('reads the add-workspace copy from the official keys', () => {
    // 入口、错误框标题与「重新选择」官方都有现成词，本包字典里不存副本
    expect(labels.add.add).toBe('添加工作区')
    expect(labels.add.folderErrorTitle).toBe('无法打开文件夹')
    expect(labels.add.folderErrorRetry).toBe('重新选择')
    // 视图选项仍是未实现的入口，也要有可读的无障碍标签，占位按钮才不会是无名按钮
    expect(labels.add.viewOptions).toBe('视图选项')
  })

  it('reads the search copy from the official keys', () => {
    // 搜索自身已实现，文案与官方同一套键：入口 tooltip 用通用词「搜索」，
    // 无障碍标签与结果区各自点明对象
    expect(labels.search.hint).toBe('搜索')
    expect(labels.search.entry).toBe('搜索会话')
    expect(labels.search.placeholder).toBe('搜索会话…')
    expect(labels.search.clear).toBe('清除搜索')
    expect(labels.search.results).toBe('搜索结果')
    expect(labels.search.noMatches).toBe('无匹配会话')
    expect(labels.search.truncated(20)).toBe('仅显示前 20 条结果，请缩小搜索范围。')
  })

  it('keeps the package-owned group copy under its own keys', () => {
    expect(labels.newGroup).toBe('新建分组')
    expect(labels.renameGroup).toBe('重命名分组')
    expect(labels.deleteGroup).toBe('删除分组')
    expect(labels.groupNamePrompt).toBe('分组名称')
    expect(labels.confirmDeleteGroup('g1')).toBe(
      '删除分组“g1”？组内会话会移出分组，会话本身不受影响。',
    )
    expect(labels.moveToGroup).toBe('分组')
    expect(labels.ungroup).toBe('取消分组')
  })

  it('splits the group rename menu item from its dialog title', () => {
    // 两个容器行共用同一个菜单项动词，各自的对话框标题才点明对象
    expect(labels.rename).toBe('重命名')
    expect(labels.renameGroup).toBe('重命名分组')
    expect(labels.renameWorkspace).toBe('重命名工作区')
    // 三个标题两两不同，说明「点明对象」这件事没有被漏掉
    expect(new Set([labels.renameGroup, labels.renameWorkspace])).toHaveLength(2)
  })

  it('resolves official copy through the official namespace, not our dictionary', () => {
    // 本包自己的翻译函数里没有官方那些键（类型上也不允许传），运行期只能
    // 拿到原始键名；因此这类文案必须由官方命名空间提供。
    const ours = regionTranslate() as unknown as (key: string) => string
    const official = workspaceTranslate() as unknown as (key: string) => string

    expect(ours('section.workspaces')).toBe('section.workspaces')
    expect(official('section.workspaces')).toBe('工作区')
  })
})

describe('translateFor', () => {
  it('dispatches by namespace like LocaleRuntime.bind does', () => {
    const raw = translateFor as unknown as (ns: string) => (key: string) => string

    expect(raw(NS)('newGroup')).toBe('新建分组')
    expect(raw('workspace')('section.workspaces')).toBe('工作区')
    expect(raw('sidebar')('session.new.label')).toBe('新建会话')
  })

  it('falls back to the shared common vocabulary from both namespaces', () => {
    // 确认/取消/关闭是通用词，两个命名空间的字典里都没有，查找链回退到 common。
    for (const ns of [NS, 'workspace']) {
      expect(translateFor(ns)('ok')).toBe('确定')
      expect(translateFor(ns)('cancel')).toBe('取消')
      expect(translateFor(ns)('close')).toBe('关闭')
    }
  })
})
