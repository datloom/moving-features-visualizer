import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ImageTemporalProperty } from '../../mfjson/types'
import {
  initialImageViewerState,
  useImageViewerStore,
} from '../../store/imageViewerStore'
import { initialTimeState, useTimeStore } from '../../store/timeStore'
import { FloatingImageViewer } from './FloatingImageViewer'

const t0 = 1_000
const t1 = 2_000

const camera: ImageTemporalProperty = {
  type: 'Image',
  name: 'camera',
  interpolation: 'Step',
  samples: [
    { time: t0, value: 'https://example.test/a.png' },
    { time: t1, value: 'https://example.test/b.png' },
  ],
}

describe('FloatingImageViewer', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, t1)
    useImageViewerStore.setState(initialImageViewerState)
  })

  afterEach(cleanup)

  it('renders nothing when the store has no property open', () => {
    render(<FloatingImageViewer />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens showing the property name and the current evaluated sample, with no modal backdrop', () => {
    useTimeStore.getState().setCurrentTime(t0)
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer />)

    const dialog = screen.getByRole('dialog', { name: 'camera image viewer' })
    expect(dialog).toBeInTheDocument()
    expect(dialog).toHaveTextContent('camera')
    expect(dialog).toHaveTextContent('1970-01-01 00:00:01 UTC')
    // No full-screen backdrop element — the map/timeline stay reachable.
    expect(document.querySelector('.image-preview-backdrop')).toBeNull()
    expect(document.querySelector('[class*="backdrop"]')).toBeNull()
  })

  it('closing the viewer does not change playback/currentTime', () => {
    useTimeStore.getState().setCurrentTime(t0)
    useTimeStore.getState().play()
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer />)

    fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: t0,
      playing: true,
    })
  })

  it('follows TimeStore.currentTime live, without a second timer', () => {
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer />)

    act(() => useTimeStore.getState().setCurrentTime(t0))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '1970-01-01 00:00:01 UTC',
    )

    act(() => useTimeStore.getState().setCurrentTime(t1))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '1970-01-01 00:00:02 UTC',
    )
  })

  it('shows "No image at current time" for a Discrete gap instead of a stale previous image', () => {
    const discreteCamera: ImageTemporalProperty = {
      ...camera,
      interpolation: 'Discrete',
    }
    act(() => useImageViewerStore.getState().open('camera', [discreteCamera]))
    render(<FloatingImageViewer />)

    act(() => useTimeStore.getState().setCurrentTime(t0))
    expect(screen.getByRole('dialog')).toHaveTextContent(
      '1970-01-01 00:00:01 UTC',
    )

    // Past the Discrete visual window and before the next sample: a gap.
    act(() => useTimeStore.getState().setCurrentTime(t1 - 1))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('No image at current time')
    expect(dialog).not.toHaveTextContent('1970-01-01 00:00:01 UTC')
  })

  it('keeps window position/size independent of TimeStore updates', () => {
    useImageViewerStore.getState().setPosition({ x: 40, y: 60 })
    useImageViewerStore.getState().setSize({ width: 400, height: 300 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer />)

    act(() => useTimeStore.getState().setCurrentTime(t1))

    expect(useImageViewerStore.getState().position).toEqual({ x: 40, y: 60 })
    expect(useImageViewerStore.getState().size).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('opening the viewer does not touch TimeStore', () => {
    useTimeStore.getState().setCurrentTime(t0)
    useTimeStore.getState().play()
    const timeStoreBefore = useTimeStore.getState()

    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer />)

    expect(useTimeStore.getState()).toEqual(timeStoreBefore)
  })
})
