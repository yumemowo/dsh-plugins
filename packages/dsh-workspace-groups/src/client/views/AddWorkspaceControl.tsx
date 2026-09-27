/**
 * 「添加工作区」入口与它的 picking 流程
 *
 * 外观照官方 WorkspaceBrowser：section header 右侧一个 28px 圆形图标按钮
 * 图标取 `IconProjectAddOutlineRegular`，tooltip 与无障碍标签都是官方的 `workspace.add`
 * 窄栏下放大成 36px 并取 `label-primary`
 *
 * 行为也照官方，点击直接打开 directoryFlow 洞（侧边栏里官方用的是 `addOnly: true`，不先弹工作区列表菜单）
 * 占用者完成交互后把路径交回来，这里用官方工作区控制器采纳，成功后在该工作区开一个新会话并打开
 */
import { useState } from 'react'
import type { ReactElement } from 'react'
import { Button, IconProjectAddOutlineRegular, Modal, Tooltip } from '../runtime.ts'
import { useLocale } from '../useLocale.ts'
import type { AddWorkspaceActions } from '../actions.ts'
import dialogsStyles from './components/dialogs/dialogs.module.css'
import headerStyles from './header.module.css'

export interface AddWorkspaceControlProps {
  /** 官方服务面，缺省时整个入口不渲染 */
  actions: AddWorkspaceActions
  /** 窄栏（rail）形态：按钮放大、色阶提亮，与官方一致 */
  narrow: boolean
}

export function AddWorkspaceControl({
  actions,
  narrow,
}: AddWorkspaceControlProps): ReactElement {
  const { t } = useLocale()
  // 一次 picking 请求的开合，用户点入口时置真，占用者完成后交回结果
  const [flowOpen, setFlowOpen] = useState(false)
  // 采纳选中的路径期间的忙碌位，占用者据此禁用提交入口
  const [adopting, setAdopting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { occupant, labels } = actions

  /** 采纳一个选中的目录，成功后直接在该工作区开新会话，与官方 onPick 一致 */
  const adopt = (path: string): void => {
    setAdopting(true)
    actions
      .createWorkspace(path)
      .then((workspace) => {
        setFlowOpen(false)
        // 先让区域判断要不要问一句「放进父所在的分组」，再开新会话：
        // 对话框与新建会话的导航抢焦点时，先到的那一个才读得到用户的意图
        actions.onAdopted?.(String(workspace.workspaceId), path)
        actions.startSession(String(workspace.workspaceId))
      })
      .catch((reason: unknown) => {
        // 失败改由错误框承担，官方同样把 picker 侧的异常收进这里
        setFlowOpen(false)
        setError(reason instanceof Error ? reason.message : String(reason))
      })
      .finally(() => setAdopting(false))
  }

  // 占用者在渲染期解析，注册项可能在两次渲染之间换过占用者
  // 解析不到时不渲染交互，但入口按钮与错误框仍在——区域那边订阅了占用情况，下一次渲染就会把入口一起收掉
  const resolved = occupant()
  // 占用者的 inject 面随 props 交给它，native 那份读 `pick`
  // browse 那份读 `listDirectory` / `createDirectory` / 自己的 `t`
  // 这与渲染器给插槽注册项传播 inject 的做法一致，占用者因此不需要知道自己被谁渲染
  const occupantProps = resolved?.inject() ?? {}
  const Flow = resolved?.component

  return (
    <>
      <Tooltip label={labels.add} side="bottom" delayMs={500}>
        <button
          type="button"
          className={headerStyles.headerAction}
          aria-label={labels.add}
          onClick={() => {
            setError(null)
            setFlowOpen(true)
          }}
        >
          <IconProjectAddOutlineRegular size={narrow ? 18 : 16} />
        </button>
      </Tooltip>
      {/* owner 会话的键排在 inject 面之后，同名时由 owner 的那份胜出 */}
      {Flow === undefined ? null : (
        <Flow
          {...occupantProps}
          open={flowOpen}
          busy={adopting}
          onPicked={adopt}
          onCancel={() => setFlowOpen(false)}
          onError={(message: string) => {
            setFlowOpen(false)
            setError(message)
          }}
        />
      )}
      <Modal
        open={error !== null}
        onClose={() => setError(null)}
        closeLabel={t('close')}
        title={labels.folderErrorTitle}
        footer={
          <>
            <Button variant="outline" onClick={() => setError(null)}>
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setError(null)
                setFlowOpen(true)
              }}
            >
              {labels.folderErrorRetry}
            </Button>
          </>
        }
      >
        <div className={dialogsStyles.dialogError} role="alert">
          {error}
        </div>
      </Modal>
    </>
  )
}
