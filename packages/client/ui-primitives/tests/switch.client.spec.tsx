// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Switch } from '../src/Switch.tsx'

afterEach(cleanup)

function toggle(name: string): { label: string; checked: boolean; onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn()
  render(<Switch checked={false} label={name} onChange={onChange} />)
  return { label: name, checked: false, onChange }
}

describe('Switch', () => {
  it('renders as a role=switch button with the accessible name', () => {
    const { label } = toggle('Enable provider')
    expect(screen.getByRole('switch', { name: label })).toBeDefined()
  })

  it('flips checked through clicks, disabled blocks', () => {
    const onChange = vi.fn()
    const { rerender } = render(<Switch checked={false} label="On off" onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'On off' }))
    expect(onChange).toHaveBeenCalledWith(true)
    rerender(<Switch checked onChange={onChange} label="On off" />)
    fireEvent.click(screen.getByRole('switch', { name: 'On off' }))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('disabled does not call onChange', () => {
    const onChange = vi.fn()
    render(<Switch checked label="Locked" disabled onChange={onChange} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Locked' }))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('carries aria-checked matching the prop', () => {
    const { rerender } = render(<Switch checked={false} label="aria" onChange={() => {}} />)
    const on = screen.getByRole('switch', { name: 'aria' })
    expect(on.getAttribute('aria-checked')).toBe('false')
    rerender(<Switch checked label="aria" onChange={() => {}} />)
    expect(screen.getByRole('switch', { name: 'aria' }).getAttribute('aria-checked')).toBe('true')
  })
})
