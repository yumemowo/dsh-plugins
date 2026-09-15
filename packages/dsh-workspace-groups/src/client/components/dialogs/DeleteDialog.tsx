/**
 * 破坏性操作的确认框
 *
 * 用普通 `Modal` 而不是 `RiskConfirmation`：后者带警告图标与勾选框，而
 * 删除分组只解散分组、删除工作区只移除注册，都达不到需要勾选确认的破坏
 * 级别。危险语义由确认按钮的 `wg-danger-action` 承载（错误色 token，
 * 同官方删除按钮做法）
 *
 * 「取消」与「关闭」是通用词，取插槽注入的 `t` 座位回退到官方 `common`
 * 命名空间
 */
import type { ReactElement, ReactNode } from 'react'
import { Button, Modal } from '../../runtime.ts'
import type { RegionTranslate } from '../../locales.ts'

export interface DeleteDialogProps {
  title: string
  /** 说明这次删除到底影响什么 */
  description?: ReactNode
  confirmLabel: string
  /** 本包命名空间的翻译座位（解析通用词） */
  t: RegionTranslate
  onConfirm: () => void
  onClose: () => void
}

export function DeleteDialog({
  title,
  description,
  confirmLabel,
  t,
  onConfirm,
  onClose,
}: DeleteDialogProps): ReactElement {
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
          <Button variant="outline" className="wg-danger-action" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    />
  )
}
