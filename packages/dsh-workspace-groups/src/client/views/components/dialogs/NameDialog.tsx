/**
 * 单行输入对话框：建组、改名与工作区重命名共用
 *
 * 输入法组合期间的 Enter 属于候选词确认，不能当提交用
 *
 * 「取消」与「关闭」是通用词，直接取插槽注入的 `t` 座位，本包命名空间没有这两个键，查找链会回退到官方 `common` 命名空间
 */
import { useRef } from 'react'
import type { ReactElement, ReactNode } from 'react'
import { Button, Input, Modal } from '../../../runtime.ts'
import type { RegionTranslate } from '../../../locales.ts'

export interface NameDialogProps {
  title: string
  value: string
  /** 输入框的占位与无障碍标签 */
  placeholder: string
  confirmLabel: string
  /** 确认按钮是否置灰（空名或重名） */
  confirmDisabled: boolean
  /** 校验失败时的提示，如工作区重名 */
  error?: ReactNode
  /**
   * 可选的勾选项，排在输入框下方
   *
   * 用原生 `checkbox` 而不是官方原语：primitives 只有 `Switch`，没有 checkbox
   * 官方在自己的 `RiskConfirmation` 里也是直接用一个原生 checkbox + label，这里沿用同一种形态
   */
  check?: { label: string; checked: boolean; onChange: (checked: boolean) => void } | undefined
  /** 本包命名空间的翻译座位（解析通用词） */
  t: RegionTranslate
  onValueChange: (value: string) => void
  onConfirm: () => void
  onClose: () => void
}

export function NameDialog({
  title,
  value,
  placeholder,
  confirmLabel,
  confirmDisabled,
  error,
  check,
  t,
  onValueChange,
  onConfirm,
  onClose,
}: NameDialogProps): ReactElement {
  const composing = useRef(false)
  return (
    <Modal
      open
      onClose={onClose}
      closeLabel={t('close')}
      title={title}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button variant="primary" disabled={confirmDisabled} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <Input
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        autoFocus
        onFocus={(event) => event.target.select()}
        onChange={(event) => onValueChange(event.currentTarget.value)}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || composing.current) return
          event.preventDefault()
          onConfirm()
        }}
      />
      {check === undefined ? null : (
        // 整行可点：勾选框自己只有 16px，而这句话是要读的
        <label className="wg-dialog-check">
          <input
            type="checkbox"
            checked={check.checked}
            onChange={(event) => check.onChange(event.currentTarget.checked)}
          />
          <span>{check.label}</span>
        </label>
      )}
      {error === undefined || error === null ? null : (
        <div className="wg-dialog-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  )
}
