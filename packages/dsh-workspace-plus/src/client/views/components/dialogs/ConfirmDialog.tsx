/**
 * 确认框：一句说明加「取消 / 确认」，需要时在两者之间列出一份会被这次操作影响到的名单
 *
 * 用普通 `Modal` 而不是 `RiskConfirmation`：后者带警告图标与勾选框
 * 而删除分组只解散分组、删除工作区只移除注册，都达不到需要勾选确认的破坏级别
 * 危险语义由确认按钮的 `dangerAction` 承载（错误色 token，同官方删除按钮做法）
 *
 * 名单用于关闭子工作区嵌套：列出会被解除嵌套的工作区，用户据此判断要不要继续
 * 只问一句「要不要」的确认框（例如「是否聚焦到新工作区」）不带名单，页脚与别处一样
 */
import type { ReactElement } from 'react'
import { Button, Modal } from '../../../runtime.ts'
import { useLocale } from '../../../useLocale.ts'
import styles from './dialogs.module.css'

export interface ConfirmDialogProps {
  title: string
  /** 说明这次操作到底影响什么，原语只接受纯文本 */
  description?: string
  /** 名单，缺省或空表时整段不渲染 */
  items?: readonly string[]
  confirmLabel: string
  /** 破坏性语义的确认按钮，缺省按普通主按钮渲染 */
  danger?: boolean | undefined
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  title,
  description,
  items = [],
  confirmLabel,
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps): ReactElement {
  const { t } = useLocale()
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t('close')}
      title={title}
      {...(description === undefined ? {} : { description })}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            variant={danger === true ? 'outline' : 'primary'}
            {...(danger === true ? { className: styles.dangerAction } : {})}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {items.length === 0 ? null : (
        // 名单可能很长，限高滚动，对话框因此不会被一个巨大的分组撑出屏幕
        <ul className={styles.dialogList}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
