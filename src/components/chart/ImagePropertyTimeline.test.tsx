import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ImageTemporalProperty } from '../../mfjson/types'
import { initialTimeState, useTimeStore } from '../../store/timeStore'
import { ImagePropertyTimeline } from './ImagePropertyTimeline'

const t0 = 1_000
const t1 = 2_000
const t2 = 3_000

const camera: ImageTemporalProperty = {
  type: 'Image',
  name: 'camera',
  interpolation: 'Step',
  samples: [
    { time: t0, value: 'https://example.test/a.png' },
    { time: t1, value: 'https://example.test/b.png' },
    { time: t2, value: 'https://example.test/c.png' },
  ],
}

const viewImageName = /^View image/
const thumbnailName = (timestamp: string) => `Jump to camera at ${timestamp}`

describe('ImagePropertyTimeline', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, t2)
  })

  afterEach(cleanup)

  it('no longer renders a permanent current-frame preview, but keeps the thumbnail timeline and a View Image button', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    expect(
      screen.queryByRole('button', { name: /^View larger image:/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: viewImageName })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Jump to camera at/ })).toHaveLength(
      3,
    )
  })

  it('enables View Image with an accessible label naming the current sample', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    const button = screen.getByRole('button', {
      name: 'View image: camera at 1970-01-01 00:00:01 UTC',
    })
    expect(button).toBeEnabled()
  })

  it('disables View Image for Discrete between samples, without suppressing the thumbnail track', () => {
    const discreteCamera: ImageTemporalProperty = {
      ...camera,
      interpolation: 'Discrete',
    }
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(
      <ImagePropertyTimeline
        propertyName="camera"
        properties={[discreteCamera]}
      />,
    )
    const button = screen.getByRole('button', { name: viewImageName })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'No image at current time')
    // Disabling View Image must not gate the thumbnail timeline: all three
    // source samples stay visible even though none is the current one.
    expect(
      screen.getAllByRole('button', { name: /^Jump to camera at/ }),
    ).toHaveLength(3)
  })

  it('Discrete: clicking a thumbnail lands exactly on that sample and re-enables View Image', () => {
    const discreteCamera: ImageTemporalProperty = {
      ...camera,
      interpolation: 'Discrete',
    }
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(
      <ImagePropertyTimeline
        propertyName="camera"
        properties={[discreteCamera]}
      />,
    )
    expect(screen.getByRole('button', { name: viewImageName })).toBeDisabled()

    fireEvent.click(
      screen.getByRole('button', {
        name: thumbnailName('1970-01-01 00:00:02 UTC'),
      }),
    )

    expect(useTimeStore.getState().currentTime).toBe(t1)
    const button = screen.getByRole('button', {
      name: 'View image: camera at 1970-01-01 00:00:02 UTC',
    })
    expect(button).toBeEnabled()
  })

  it('keeps View Image enabled for a held Step value at a time between samples', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)
    expect(
      screen.getByRole('button', {
        name: 'View image: camera at 1970-01-01 00:00:01 UTC',
      }),
    ).toBeEnabled()
  })

  it('clicking a thumbnail updates TimeStore.currentTime without touching the active window', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: thumbnailName('1970-01-01 00:00:03 UTC'),
      }),
    )

    expect(useTimeStore.getState().currentTime).toBe(t2)
    expect(useTimeStore.getState().queryActive).toBe(false)
  })

  it('clips the thumbnail timeline to an active Time Query window', () => {
    act(() => useTimeStore.getState().applyTimeQuery(t0 + 1, t2 - 1))
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    // Only the middle sample (t1) falls inside (t0+1, t2-1).
    expect(
      screen.getByRole('button', {
        name: thumbnailName('1970-01-01 00:00:02 UTC'),
      }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: thumbnailName('1970-01-01 00:00:01 UTC'),
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: thumbnailName('1970-01-01 00:00:03 UTC'),
      }),
    ).not.toBeInTheDocument()
  })

  it('restores the full thumbnail range after Reset', () => {
    act(() => useTimeStore.getState().applyTimeQuery(t0 + 1, t2 - 1))
    const view = render(
      <ImagePropertyTimeline propertyName="camera" properties={[camera]} />,
    )
    expect(
      screen.queryByRole('button', {
        name: thumbnailName('1970-01-01 00:00:01 UTC'),
      }),
    ).not.toBeInTheDocument()

    act(() => useTimeStore.getState().resetTimeQuery())
    view.rerender(
      <ImagePropertyTimeline propertyName="camera" properties={[camera]} />,
    )
    expect(
      screen.getByRole('button', {
        name: thumbnailName('1970-01-01 00:00:01 UTC'),
      }),
    ).toBeInTheDocument()
  })

  it('disables View Image when the query misses every sample', () => {
    // A dataset extent wider than this Image property's own samples (e.g.
    // driven by other geometry/properties), queried in a sub-range that
    // legitimately contains none of the camera samples.
    useTimeStore.getState().setRange(0, 100_000)
    act(() => useTimeStore.getState().applyTimeQuery(50_000, 60_000))
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)
    expect(
      screen.getByText('No image samples in the selected range'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: viewImageName })).toBeDisabled()
  })

  it('shows an unavailable state for an unsupported image value without crashing', () => {
    const badCamera: ImageTemporalProperty = {
      type: 'Image',
      name: 'camera',
      interpolation: 'Discrete',
      samples: [{ time: t0, value: 'not-a-supported-value' }],
    }
    useTimeStore.getState().setCurrentTime(t0)
    render(
      <ImagePropertyTimeline propertyName="camera" properties={[badCamera]} />,
    )
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('shows an unavailable state when a thumbnail image fails to load', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)
    const thumbnail = screen.getByRole('button', {
      name: thumbnailName('1970-01-01 00:00:01 UTC'),
    })
    const img = thumbnail.querySelector('img')!
    fireEvent.error(img)
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('opens the existing image viewer from View Image, showing the current evaluated sample', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    fireEvent.click(screen.getByRole('button', { name: viewImageName }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByText('1970-01-01 00:00:01 UTC'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close image preview' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not open the viewer when View Image is disabled', () => {
    const discreteCamera: ImageTemporalProperty = {
      ...camera,
      interpolation: 'Discrete',
    }
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(
      <ImagePropertyTimeline
        propertyName="camera"
        properties={[discreteCamera]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: viewImageName }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('View Image always reflects the latest currentTime, never a stale earlier sample', () => {
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    act(() => useTimeStore.getState().setCurrentTime(t0))
    fireEvent.click(screen.getByRole('button', { name: viewImageName }))
    expect(
      within(screen.getByRole('dialog')).getByText('1970-01-01 00:00:01 UTC'),
    ).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close image preview' }))

    act(() => useTimeStore.getState().setCurrentTime(t2))
    fireEvent.click(screen.getByRole('button', { name: viewImageName }))
    expect(
      within(screen.getByRole('dialog')).getByText('1970-01-01 00:00:03 UTC'),
    ).toBeInTheDocument()
  })
})
