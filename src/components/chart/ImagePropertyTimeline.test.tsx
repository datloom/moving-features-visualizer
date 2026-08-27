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

const currentFrameName = (timestamp: string) =>
  `View larger image: camera at ${timestamp}`
const thumbnailName = (timestamp: string) => `Jump to camera at ${timestamp}`

describe('ImagePropertyTimeline', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, t2)
  })

  afterEach(cleanup)

  it('renders the current Image and a thumbnail per source sample', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    expect(
      screen.getByRole('button', {
        name: currentFrameName('1970-01-01 00:00:01 UTC'),
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Jump to camera at/ })).toHaveLength(
      3,
    )
  })

  it('shows "No image at current time" for Discrete between samples, without suppressing the thumbnail track', () => {
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
    expect(screen.getByText('No image at current time')).toBeInTheDocument()
    // The current-frame empty state must not gate the thumbnail timeline: all
    // three source samples stay visible even though none is the current one.
    expect(
      screen.getAllByRole('button', { name: /^Jump to camera at/ }),
    ).toHaveLength(3)
  })

  it('Discrete: clicking a thumbnail lands exactly on that sample so Current Frame shows it immediately', () => {
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
    expect(screen.getByText('No image at current time')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: thumbnailName('1970-01-01 00:00:02 UTC'),
      }),
    )

    expect(useTimeStore.getState().currentTime).toBe(t1)
    expect(
      screen.getByRole('button', {
        name: currentFrameName('1970-01-01 00:00:02 UTC'),
      }),
    ).toBeInTheDocument()
    expect(screen.queryByText('No image at current time')).not.toBeInTheDocument()
  })

  it('shows a held Step value at a time between samples', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)
    expect(
      screen.getByRole('button', {
        name: currentFrameName('1970-01-01 00:00:01 UTC'),
      }),
    ).toBeInTheDocument()
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

  it('shows an empty-range message when the query misses every sample', () => {
    // A dataset extent wider than this Image property's own samples (e.g.
    // driven by other geometry/properties), queried in a sub-range that
    // legitimately contains none of the camera samples.
    useTimeStore.getState().setRange(0, 100_000)
    act(() => useTimeStore.getState().applyTimeQuery(50_000, 60_000))
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)
    expect(
      screen.getByText('No image samples in the selected range'),
    ).toBeInTheDocument()
    expect(screen.getByText('No image at current time')).toBeInTheDocument()
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

  it('shows an unavailable state when the image element fails to load', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)
    const currentFrame = screen.getByRole('button', {
      name: currentFrameName('1970-01-01 00:00:01 UTC'),
    })
    const img = currentFrame.querySelector('img')!
    fireEvent.error(img)
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('opens an expanded preview showing the actual source timestamp for a held Step value', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(<ImagePropertyTimeline propertyName="camera" properties={[camera]} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: currentFrameName('1970-01-01 00:00:01 UTC'),
      }),
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeInTheDocument()
    expect(
      within(dialog).getByText('1970-01-01 00:00:01 UTC'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Close image preview' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
