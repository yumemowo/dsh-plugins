# 数据存储

分组元数据与工作区分组记录存在 `$DSH_HOME/storages/workspace_groups.json`。它们的结构、加字段为什么不升版本号，以及变更方法为什么统一回整份快照见下。

## 位置与结构

分组元数据存在 `$DSH_HOME/storages/workspace_groups.json`，由宿主半边通过 `dsh-storage-domain` 读写——与工作区记录本身同一套存储机制。

按 workspaceId 分表，结构为：

```json
{
  "w_abc": { "groups": [{ "id": "g1", "name": "前端", "sessionIds": ["s_1", "s_2"] }] },
  "w_def": { "groups": [] }
}
```

根节点上的**工作区分组**是单例结构（全部根级分组在同一份记录里，天然有序），因此走 storage-domain 的 **global 槽位**而不是再开一张表。菜单的**聚焦 / 最近使用 / 置顶**三份记录也是「根节点这一层」的单例状态，因此与它同处一个 global 槽位——分开两份记录只会多一次可能对不齐的写入：

```json
{
  "virtualWorkspaces": [{ "id": "wg1", "name": "前端仓库", "workspaceIds": ["w_abc"] }],
  "picker": {
    "focused": "vw:wg1",
    "recent": ["vw:wg1", "ws:w_def"],
    "pinned": ["vw:wg1"]
  }
}
```

三份记录存的是**根节点条目的键**，键自带类别前缀（`ws:` 工作区 / `vw:` 工作区分组，见 `src/rootEntry.ts`）：两类的 id 由不同生成器产出但仍可能撞值，只存 id 会让一条记录在两种含义之间摇摆。`recent` 存的是**完整的使用历史**（上限 20 条），比菜单里展示的 5 条长——置顶区的排序按它取次序，只留展示用的那几条会让第 6 次之后用过的条目在置顶区里彼此「一样近」。

## 版本策略

两者都在 v1 之内可加：旧文件没有 global 时按 schema 的初值读，**global 里缺哪一格就按 schema 的默认值读**（`picker` 三格都带默认值），没有这张表时按空表读。没有升版本号——存储后端对 `single` 布局是精确版本读取，升版本会让既有文件直接 `version-mismatch`，而这里并不需要迁移。

global 槽位的字段名是精确匹配的：后端按 schema 校验整份记录，不做字段合并，字段名对不上就整条判 `invalid-record`。因此该字段名不能随手改——改名等于让既有文件读不出来，必须同步改 `$DSH_HOME/storages/<域名>.json` 里的字段名，或删掉整个 global 槽位让它退回空列表初值。表记录同理（每个工作区一份 `{ "groups": … }`）。

## 记录与实际对象的关系

`picker` 是唯一一处「记录比事实活得久」的地方：工作区被删、分组被解散之后，那个键仍会留在记录里。两条防线：宿主在删除时把它从三份记录里一并摘掉（`forgetWorkspace` / `deleteVirtualWorkspace`，与清理归属记录合成一次写），渲染菜单的那一侧再对记录做一次过滤，只列出当前真实存在的条目。前者让磁盘干净，后者保证即使记录是手改过的也不会渲染出指向不存在对象的条目。

不侵入工作区数据：这里只保存「哪些会话属于哪个分组」「哪些工作区属于哪个工作区分组」的结构信息，不修改 `workspaceRegistry` 的会话归属或工作区顺序。把最后一个分组删掉时整条工作区记录会被移除，避免留下死数据。

「未分组」不是存储概念，只是「不在任何分组的 `sessionIds` 里」这一事实的呈现。元数据里出现但已不在会话列表中的 id 会被静默跳过，未归组或元数据失效的会话平铺在工作区下，因此即使元数据与真实列表出现偏差，界面也不会丢行。

## 变更回整份快照

每个变更方法都回整份快照：`createGroup` / `renameGroup` / `deleteGroup` / `moveSession` / `createVirtualWorkspace` / `renameVirtualWorkspace` / `deleteVirtualWorkspace` / `moveWorkspace` / `forgetWorkspace` / `focusEntry` / `togglePinned` 的返回值都是变更后的完整快照（`byWorkspace` + `workspaceGroups` + `picker`），调用方直接替换本地状态，不必再拉一次——既少一次往返，也让「改动已生效、本地状态还是旧的」这段空档消失。

区域组件的 `apply` 因此只收这类回快照的动作；工作区改名走官方控制器、返回的是工作区视图而不是分组快照，所以不经 `apply`，失败单独记一条日志。

`forgetWorkspace` 专供删除工作区时清理归属记录。它由既有的「删一份记录」语义扩出来，而不是让调用方先读快照再逐个 `moveWorkspace`：清理是一次原子写，且没有归属时不写盘。它同时还把这个工作区从菜单的三份记录里摘掉——两件事合成一次 global 写入，否则「工作区已消失、聚焦还指着它」会有一段可观察的窗口。`deleteVirtualWorkspace` 同理。

`focusEntry` / `togglePinned` 也只写自己那一格：宿主不判断键是否指向真实存在的对象（它看不到工作区列表），落盘前只把记录收成完整形状。判断「哪些条目还在」是渲染菜单那一侧的事。
