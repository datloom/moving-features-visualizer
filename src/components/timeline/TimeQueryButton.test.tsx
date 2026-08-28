import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initialFeatureState, useFeatureStore } from '../../store/featureStore'
import { initialTimeState, useTimeStore } from '../../store/timeStore'
import { TimeQueryButton } from './TimeQueryButton'

const fullStart = Date.parse('2026-08-24T09:00:00Z')
const fullEnd = Date.parse('2026-08-24T09:06:00Z')

const openPopover = () => {
  fireEvent.click(screen.getByRole('button', { name: /Time Query/ }))
}

describe('TimeQueryButton', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useFeatureStore.setState(initialFeatureState)
    useTimeStore.getState().setRange(fullStart, fullEnd)
  })

  it('exists as a toolbar control with the popover hidden until clicked', () => {
    render(<TimeQueryButton />)

    expect(
      screen.getByRole('button', { name: /Time Query/ }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Time Query' })).toBeNull()
  })

  it('opens the popover seeded from the current active range, not the full extent', () => {
    useTimeStore.getState().applyTimeQuery(
      Date.parse('2026-08-24T09:01:00Z'),
      Date.parse('2026-08-24T09:04:00Z'),
    )
    render(<TimeQueryButton />)

    openPopover()

    expect(
      screen.getByLabelText<HTMLInputElement>('Start (UTC)').value,
    ).toBe('2026-08-24T09:01')
    expect(screen.getByLabelText<HTMLInputElement>('End (UTC)').value).toBe(
      '2026-08-24T09:04',
    )
  })

  it('does not apply edits to the active range until Apply is clicked', () => {
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2026-08-24T09:01' },
    })
    fireEvent.change(screen.getByLabelText('End (UTC)'), {
      target: { value: '2026-08-24T09:04' },
    })

    expect(useTimeStore.getState()).toMatchObject({
      startTime: fullStart,
      endTime: fullEnd,
    })
  })

  it('discards the draft on Cancel, leaving the active range untouched', () => {
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2026-08-24T09:01' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Time Query' })).toBeNull()
    expect(useTimeStore.getState()).toMatchObject({
      startTime: fullStart,
      endTime: fullEnd,
    })

    openPopover()
    expect(
      screen.getByLabelText<HTMLInputElement>('Start (UTC)').value,
    ).toBe('2026-08-24T09:00')
  })

  it('commits the draft range on Apply, updating the shared authoritative range', () => {
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2026-08-24T09:01' },
    })
    fireEvent.change(screen.getByLabelText('End (UTC)'), {
      target: { value: '2026-08-24T09:04' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(screen.queryByRole('dialog', { name: 'Time Query' })).toBeNull()
    expect(useTimeStore.getState()).toMatchObject({
      startTime: Date.parse('2026-08-24T09:01:00Z'),
      endTime: Date.parse('2026-08-24T09:04:00Z'),
    })
  })

  it('preserves currentTime when it still falls inside the newly applied range', () => {
    useTimeStore.getState().setCurrentTime(Date.parse('2026-08-24T09:02:00Z'))
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2026-08-24T09:01' },
    })
    fireEvent.change(screen.getByLabelText('End (UTC)'), {
      target: { value: '2026-08-24T09:04' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(useTimeStore.getState().currentTime).toBe(
      Date.parse('2026-08-24T09:02:00Z'),
    )
  })

  it('clamps currentTime into the newly applied range when it falls outside', () => {
    useTimeStore.getState().setCurrentTime(Date.parse('2026-08-24T09:05:00Z'))
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2026-08-24T09:01' },
    })
    fireEvent.change(screen.getByLabelText('End (UTC)'), {
      target: { value: '2026-08-24T09:04' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(useTimeStore.getState().currentTime).toBe(
      Date.parse('2026-08-24T09:04:00Z'),
    )
  })

  it('Reset restores the draft to the full feature extent without touching the active range', () => {
    useTimeStore.getState().applyTimeQuery(
      Date.parse('2026-08-24T09:01:00Z'),
      Date.parse('2026-08-24T09:04:00Z'),
    )
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))

    expect(
      screen.getByLabelText<HTMLInputElement>('Start (UTC)').value,
    ).toBe('2026-08-24T09:00')
    expect(screen.getByLabelText<HTMLInputElement>('End (UTC)').value).toBe(
      '2026-08-24T09:06',
    )
    // Reset alone must not change the active range.
    expect(useTimeStore.getState()).toMatchObject({
      startTime: Date.parse('2026-08-24T09:01:00Z'),
      endTime: Date.parse('2026-08-24T09:04:00Z'),
    })

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(useTimeStore.getState()).toMatchObject({
      startTime: fullStart,
      endTime: fullEnd,
    })
  })

  it('closes and discards the draft when the selected feature changes', () => {
    useFeatureStore.setState({ selectedFeatureId: 'feature-a' })
    useTimeStore.getState().applyTimeQuery(
      Date.parse('2026-08-24T09:01:00Z'),
      Date.parse('2026-08-24T09:04:00Z'),
    )
    render(<TimeQueryButton />)
    openPopover()

    fireEvent.change(screen.getByLabelText('Start (UTC)'), {
      target: { value: '2026-08-24T09:00' },
    })

    act(() => {
      useFeatureStore.getState().selectFeature('feature-b')
    })

    // The popover closed on the feature change, so its edited (but never
    // applied) draft never reached the store.
    expect(screen.queryByRole('dialog', { name: 'Time Query' })).toBeNull()
    expect(useTimeStore.getState()).toMatchObject({
      startTime: Date.parse('2026-08-24T09:01:00Z'),
      endTime: Date.parse('2026-08-24T09:04:00Z'),
    })
  })

  it('shows an active indicator only when the active range is narrower than the full extent', () => {
    const { rerender } = render(<TimeQueryButton />)
    expect(
      screen.queryByText('(range filtered)', { exact: false }),
    ).toBeNull()

    useTimeStore.getState().applyTimeQuery(
      Date.parse('2026-08-24T09:01:00Z'),
      Date.parse('2026-08-24T09:04:00Z'),
    )
    rerender(<TimeQueryButton />)

    expect(
      screen.getByText('(range filtered)', { exact: false }),
    ).toBeInTheDocument()
  })

  it('keeps the Tokyo survey route default at 09:00-09:06, not 18:00-18:06', () => {
    render(<TimeQueryButton />)
    openPopover()

    expect(
      screen.getByLabelText<HTMLInputElement>('Start (UTC)').value,
    ).toBe('2026-08-24T09:00')
    expect(screen.getByLabelText<HTMLInputElement>('End (UTC)').value).toBe(
      '2026-08-24T09:06',
    )
  })
})
