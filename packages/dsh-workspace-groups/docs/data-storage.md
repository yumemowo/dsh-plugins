# 数据存储

分组元数据与工作区分组记录存在哪里、结构如何、加字段为什么不升版本号，以及变更方法
为什么统一回整份快照。README 只在「客户端代码结构」一节留一句指向本文的引用。

分组元数据存在 `$DSH_HOME/storages/workspace_groups.json`，由宿主半边通过
`dsh-storage-domain` 读写——与工作区记录本身同一套存储机制。

按 workspaceId 分表，结构为：

```json
{
  "w_abc": { "groups": [{ "id": "g1", "name": "前端", "sessionIds": ["s_1", "s_2"] }] },
  "w_def": { "groups": [] }
}
```

根节点上的**工作区分组**是单例结构（全部根级分组在同一份记录里，天然有序），
因此走 storage-domain 的 **global 槽位**而不是再开一张表：

```json
{ "virtualWorkspaces": [{ "id": "wg1", "name": "前端仓库", "workspaceIds": ["w_abc"] }] }
```

两者都在 v1 之内可加：旧文件没有 global 时按 schema 的初值（空列表）读，没有
这张表时按空表读。**没有升版本号**——存储后端对 `single` 布局是精确版本读取，
升版本会让既有文件直接 `version-mismatch`，而这里并不需要迁移。

global 槽位的字段名是**精确匹配**的：后端按 schema 校验整份记录，不做字段合并，
字段名对不上就整条判 `invalid-record`。因此该字段名不能随手改——改名等于让既有
文件读不出来，必须同步改 `$DSH_HOME/storages/<域名>.json` 里的字段名，或删掉
整个 global 槽位让它退回空列表初值。表记录同理（每个工作区一份 `{ "groups": … }`）。

**不侵入工作区数据**：这里只保存「哪些会话属于哪个分组」「哪些工作区属于哪个
工作区分组」的结构信息，不修改 `workspaceRegistry` 的会话归属或工作区顺序。
把最后一个分组删掉时整条工作区记录会被移除，避免留下死数据。

「未分组」不是存储概念，只是「不在任何分组的 `sessionIds` 里」这一事实的呈现。
元数据里出现但已不在会话列表中的 id 会被静默跳过，未归组或元数据失效的会话
平铺在工作区下，因此即使元数据与真实列表出现偏差，界面也不会丢行。

**每个变更方法都回整份快照**：`createGroup` / `renameGroup` / `deleteGroup` /
`moveSession` / `createVirtualWorkspace` / `renameVirtualWorkspace` /
`deleteVirtualWorkspace` / `moveWorkspace` / `forgetWorkspace` 的返回值都是变更后的
完整快照（`byWorkspace` + `workspaceGroups`），调用方直接替换本地状态，不必再拉
一次——既少一次往返，也让「改动已生效、本地状态还是旧的」这段空档消失。
区域组件的 `apply` 因此只收这类回快照的动作；工作区改名走官方控制器、返回的是
工作区视图而不是分组快照，所以不经 `apply`，失败单独记一条日志。

`forgetWorkspace` 专供删除工作区时清理归属记录。它由既有的
「删一份记录」语义扩出来，而不是让调用方先读快照再逐个 `moveWorkspace`：
清理是一次原子写，且没有归属时不写盘。

