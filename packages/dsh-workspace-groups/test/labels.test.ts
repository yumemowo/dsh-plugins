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
 * - 只有官方没有对应词的自有文案才在本包字典里
 */
describe('locales', () => {
  it('keeps the English dictionary complete against the Chinese key set', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('owns a short namespace name rather than the package name', () => {
    // 官方插件的命名空间都是短名（workspace / sidebar / goal …）
    expect(NS).toBe('workspaceGroups')
  })

  it('holds only the copy the official namespace does not already have', () => {
    // 键名与官方字典重合即意味着又复制了一份官方译文
    const duplicated = Object.keys(zh).filter(
      (key) => key in OFFICIAL_WORKSPACE_ZH || key in OFFICIAL_SIDEBAR_ZH,
    )

    expect(duplicated).toEqual([])
  })

  it('lists every package-owned key explicitly', () => {
    // 自有键不多，逐个列出；新增文案时这里会提醒重新确认它是否真的官方没有
    expect(Object.keys(zh).sort()).toEqual([
      'actions.group.aria',
      'actions.virtualWorkspace.aria',
      'compareTabDescription',
      'delete.desc.group',
      'delete.desc.virtualWorkspace',
      'deleteGroup',
      'deleteVirtualWorkspace',
      'groupNamePrompt',
      'menu.newVirtualWorkspace',
      'moveToGroup',
      'moveToVirtualWorkspace',
      'newGroup',
      'newVirtualWorkspace',
      'picker.all',
      'picker.change',
      'picker.entry',
      'picker.followFocus',
      'picker.pin',
      'picker.pinned',
      'picker.recent',
      'picker.remove',
      'picker.rename',
      'picker.unpin',
      'renameGroup',
      'renameVirtualWorkspace',
      'ungroup',
      'ungroupWorkspace',
      'unimplemented',
      'virtualWorkspaceEmpty',
      'virtualWorkspaceNamePrompt',
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
    // 空白（新建中）会话行的固定名是官方词，本包字典里不存副本；
    // 会话正式启用后的名字由标题服务投影，不走这一格
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
    // 菜单项是一次性动作，读作动词短语；它取官方 sidebar 新建按钮的文案
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
    // 搜索自身已实现，文案与官方同一套键：入口 tooltip 用通用词「搜索」
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
    // 一级菜单项说「移动到…」，省略号表示点下去还要选一个目标
    expect(labels.moveToGroup).toBe('移动到…')
    expect(labels.ungroup).toBe('取消分组')
  })

  it('keeps the virtual-workspace copy under its own keys', () => {
    expect(labels.newVirtualWorkspace).toBe('新建工作区分组')
    expect(labels.renameVirtualWorkspace).toBe('重命名工作区分组')
    expect(labels.deleteVirtualWorkspace).toBe('删除工作区分组')
    // 一级菜单项说「移动到…」，省略号表示点下去还要选一个目标
    expect(labels.moveToVirtualWorkspace).toBe('移动到…')
    expect(labels.ungroupWorkspace).toBe('移出工作区分组')
    expect(labels.virtualWorkspaceNamePrompt).toBe('工作区分组名称')
    expect(labels.virtualWorkspaceEmpty).toBe('这个工作区分组里还没有工作区')
    expect(labels.confirmDeleteVirtualWorkspace('g1')).toBe(
      '删除工作区分组“g1”？组内工作区会移出分组，工作区本身不受影响。',
    )
    expect(labels.virtualWorkspaceActions('g1')).toBe('工作区分组“g1”的操作')
  })

  it('shares one move-to wording across the two grouping levels', () => {
    // 两个层级的归组一级项都是「点下去还要选一个目标」的二级菜单父项，措辞分工一致
    // 因此共用同一句；层级由所在菜单本身区分，文案不必再加限定词
    expect(labels.moveToGroup).toBe(labels.moveToVirtualWorkspace)
    expect(labels.moveToGroup).toBe('移动到…')
  })

  it('keeps the two grouping levels apart by name', () => {
    // 根级与会话级各有一套「新建 / 重命名 / 删除」，措辞必须能区分层级
    expect(labels.newGroup).not.toBe(labels.newVirtualWorkspace)
    expect(labels.renameGroup).not.toBe(labels.renameVirtualWorkspace)
    expect(labels.deleteGroup).not.toBe(labels.deleteVirtualWorkspace)
    // 两层的删除说明也是两句话，指向的对象不同
    expect(labels.confirmDeleteGroup('x')).not.toBe(labels.confirmDeleteVirtualWorkspace('x'))
  })

  it('splits the group rename menu item from its dialog title', () => {
    // 两个容器行共用同一个菜单项动词，各自的对话框标题才点明对象
    expect(labels.rename).toBe('重命名')
    expect(labels.renameGroup).toBe('重命名分组')
    expect(labels.renameWorkspace).toBe('重命名工作区')
    // 三个标题两两不同，说明「点明对象」这件事没有被漏掉
    expect(new Set([labels.renameGroup, labels.renameWorkspace])).toHaveLength(2)
  })

  it('projects the picker copy from our own namespace', () => {
    // 「换一个工作区看」这件事官方没有对应词（官方的 header 没有这一层）
    // 因此这一组全部取本包命名空间
    expect(labels.picker.entry).toBe('选择工作区')
    expect(labels.picker.all).toBe('全部工作区')
    expect(labels.picker.recent).toBe('最近使用')
    expect(labels.picker.pinned).toBe('置顶')
  })

  it('names the row actions after the entry they act on', () => {
    // 行尾三枚按钮只有字形，读屏要靠标签读出「对谁做什么」
    expect(labels.picker.rename('前端仓库')).toBe('重命名“前端仓库”')
    expect(labels.picker.remove('前端仓库')).toBe('删除“前端仓库”')
  })

  it('drops the all-section title since that column has no heading', () => {
    // 「全部」那一栏是**没有标题时默认的那一栏**
    // 上面两栏的标题正是因为要与它区分才需要；它自己再写一个标题就是同义反复
    expect('allSection' in labels.picker).toBe(false)
  })

  it('names the focused entry in the second-line entry label', () => {
    // 第二行可见的文字只是一个名字；读屏要靠这个标签读出「点它是做什么用的」
    expect(labels.picker.change('前端仓库')).toBe('切换工作区：前端仓库')
    expect(labels.picker.change('全部工作区')).toBe('切换工作区：全部工作区')
  })

  it('names the pin target in the pin button labels', () => {
    // 一枚按钮上只有字形，读屏要靠它读出「对谁做什么」
    expect(labels.picker.pin('前端仓库')).toBe('置顶“前端仓库”')
    expect(labels.picker.unpin('前端仓库')).toBe('取消置顶“前端仓库”')
  })



  it('resolves official copy through the official namespace, not our dictionary', () => {
    // 本包自己的翻译函数里没有官方那些键（类型上也不允许传），运行期只能拿到原始键名；
    // 因此这类文案必须由官方命名空间提供
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
    // 确认/取消/关闭是通用词，两个命名空间的字典里都没有，查找链回退到 common
    for (const ns of [NS, 'workspace']) {
      expect(translateFor(ns)('ok')).toBe('确定')
      expect(translateFor(ns)('cancel')).toBe('取消')
      expect(translateFor(ns)('close')).toBe('关闭')
    }
  })
})
