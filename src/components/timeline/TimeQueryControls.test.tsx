import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { formatUtcDateTimeLocal, parseUtcDateTimeLocal } from '../../mfjson/utcDateTimeLocal'
import { initialTimeState, useTimeStore } from '../../store/timeStore'
import { TimeQueryControls } from './TimeQueryControls'

const fullStart = Date.parse('2026-08-24T09:00:00Z')
const fullEnd = Date.parse('2026-08-24T09:20:00Z')

describe('TimeQueryControls', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
  })

  it('disables Apply/Reset and reports no data before a dataset loads', () => {
    render(<TimeQueryControls />)

    expect(screen.getByText('No data loaded')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('shows the full extent and keeps Reset disabled until a query is applied', () => {
    useTimeStore.getState().setRange(fullStart, fullEnd)
    render(<TimeQueryControls />)

    expect(
      screen.getByText('2026-08-24 09:00 UTC – 2026-08-24 09:20 UTC'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
  })

  it('applies a Time Query narrowing the active window', () => {
    useTimeStore.getState().setRange(fullStart, fullEnd)
    render(<TimeQueryControls />)

    const from = screen.getByLabelText('From (UTC)')
    const to = screen.getByLabelText('To (UTC)')
    fireEvent.change(from, { target: { value: '2026-08-24T09:05' } })
    fireEvent.change(to, { target: { value: '2026-08-24T09:15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(useTimeStore.getState()).toMatchObject({
      startTime: Date.parse('2026-08-24T09:05:00Z'),
      endTime: Date.parse('2026-08-24T09:15:00Z'),
      queryActive: true,
    })
    // The full extent must remain untouched by the query.
    expect(useTimeStore.getState()).toMatchObject({
      fullStartTime: fullStart,
      fullEndTime: fullEnd,
    })
  })

  it('shows a validation message and disables Apply for a reversed range', () => {
    useTimeStore.getState().setRange(fullStart, fullEnd)
    render(<TimeQueryControls />)

    fireEvent.change(screen.getByLabelText('From (UTC)'), {
      target: { value: '2026-08-24T09:15' },
    })
    fireEvent.change(screen.getByLabelText('To (UTC)'), {
      target: { value: '2026-08-24T09:05' },
    })

    expect(
      screen.getByText('From must be on or before To.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })

  it('defaults From/To to the UTC instant of the active window, not the host timezone', () => {
    const tokyoStart = Date.parse('2026-08-24T09:00:00Z')
    const tokyoEnd = Date.parse('2026-08-24T09:06:00Z')
    useTimeStore.getState().setRange(tokyoStart, tokyoEnd)
    render(<TimeQueryControls />)

    const from = screen.getByLabelText<HTMLInputElement>('From (UTC)')
    const to = screen.getByLabelText<HTMLInputElement>('To (UTC)')

    expect(from.value).toBe('2026-08-24T09:00')
    expect(to.value).toBe('2026-08-24T09:06')
    expect(from.value).not.toBe('2026-08-24T18:00')
    expect(to.value).not.toBe('2026-08-24T18:06')
  })

  it('restores the full extent and re-enables Reset-disabled state on Reset', () => {
    useTimeStore.getState().setRange(fullStart, fullEnd)
    useTimeStore.getState().applyTimeQuery(
      new Date('2026-08-24T09:05').getTime(),
      new Date('2026-08-24T09:15').getTime(),
    )
    render(<TimeQueryControls />)

    expect(screen.getByRole('button', { name: 'Reset' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(useTimeStore.getState()).toMatchObject({
      startTime: fullStart,
      endTime: fullEnd,
      queryActive: false,
    })
    expect(screen.getByRole('button', { name: 'Reset' })).toBeDisabled()
  })

  it('represents the same instant as the shared UTC time-of-day formatting used by Selected Feature/Graph/Playback', () => {
    const timestamp = Date.parse('2026-08-24T09:00:00Z')
    // Selected Feature / graph x-axis / playback all format via
    // `new Date(timestamp).toISOString().slice(11, 19)` -> 'HH:MM:SS' in UTC.
    const sharedTimeOfDay = new Date(timestamp).toISOString().slice(11, 16)

    const timeQueryValue = formatUtcDateTimeLocal(timestamp)

    expect(timeQueryValue.slice(11)).toBe(sharedTimeOfDay)
    expect(parseUtcDateTimeLocal(timeQueryValue)).toBe(timestamp)
  })
})
