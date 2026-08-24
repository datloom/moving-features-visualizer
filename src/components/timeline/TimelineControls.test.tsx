import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { initialTimeState, useTimeStore } from '../../store/timeStore'
import { TimelineControls } from './TimelineControls'

const startTime = Date.parse('2026-08-24T09:00:00Z')
const endTime = Date.parse('2026-08-24T09:10:00Z')
const middleTime = Date.parse('2026-08-24T09:05:00Z')

describe('TimelineControls', () => {
  afterEach(cleanup)

  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(startTime, endTime)
  })

  it('displays the current time and configured extent', () => {
    useTimeStore.getState().setCurrentTime(middleTime)
    render(<TimelineControls />)

    expect(screen.getByText('2026-08-24 09:05:00 UTC')).toBeInTheDocument()
    expect(screen.getByText('09:00:00')).toBeInTheDocument()
    expect(screen.getByText('09:10:00')).toBeInTheDocument()
  })

  it('plays and pauses through the shared Time Store', () => {
    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Play timeline' }))
    expect(useTimeStore.getState().playing).toBe(true)
    expect(
      screen.getByRole('button', { name: 'Pause playback' }),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Pause playback' }))
    expect(useTimeStore.getState().playing).toBe(false)
  })

  it('seeks immediately through the shared Time Store', () => {
    render(<TimelineControls />)

    fireEvent.change(
      screen.getByRole('slider', { name: 'Timeline position' }),
      {
        target: { value: String(middleTime) },
      },
    )

    expect(useTimeStore.getState().currentTime).toBe(middleTime)
    expect(screen.getByText('2026-08-24 09:05:00 UTC')).toBeInTheDocument()
  })

  it('jumps to both ends and stops when jumping to the end', () => {
    useTimeStore.getState().setCurrentTime(middleTime)
    useTimeStore.getState().play()
    render(<TimelineControls />)

    fireEvent.click(screen.getByRole('button', { name: 'Jump to start' }))
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: startTime,
      playing: true,
    })

    fireEvent.click(screen.getByRole('button', { name: 'Jump to end' }))
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: endTime,
      playing: false,
    })
  })

  it.each([0.5, 1, 2, 4, 10])('selects the %sx playback rate', (rate) => {
    render(<TimelineControls />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Playback speed' }), {
      target: { value: String(rate) },
    })

    expect(useTimeStore.getState().playbackRate).toBe(rate)
  })
})
