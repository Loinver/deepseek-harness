// Switch: token-styled on/off control (`role="switch"`). No framework
// imports; the accessible name and any visible copy stay with the caller.

import type { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'
import css from './Switch.module.css'

/**
 * Render an on/off switch.
 * @param props.checked - whether the switch is on.
 * @param props.label - accessible name (the control renders no visible text).
 * @param props.disabled - blocks interaction and dims the control when set.
 * @param props.onChange - invoked with the requested next state on click.
 * @returns the switch element; native button attributes pass through.
 */
export function Switch({ checked, label, disabled, className, onChange, ...rest }: {
  checked: boolean
  label: string
  disabled?: boolean
  className?: string | undefined
  onChange: (next: boolean) => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'checked' | 'label' | 'disabled' | 'className' | 'onChange'>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={clsx(css.switch, checked ? css.on : css.off, className)}
      onClick={() => { onChange(!checked) }}
      {...rest}
    />
  )
}
