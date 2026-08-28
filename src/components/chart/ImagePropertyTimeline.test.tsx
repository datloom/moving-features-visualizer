import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ImageTemporalProperty } from '../../mfjson/types'
import {
  initialImageViewerState,
  useImageViewerStore,
} from '../../store/imageViewerStore'
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

let resizeObserverCallbacks: ResizeObserverCallback[] = []

const stubResizeObserver = () => {
  resizeObserverCallbacks = []
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn((callback: ResizeObserverCallback) => {
      resizeObserverCallbacks.push(callback)
      return {
        disconnect: vi.fn(),
        observe: vi.fn(),
        unobserve: vi.fn(),
      }
    }),
  )
}

/** Reports the stubbed container at `width`, as if ResizeObserver just measured it. */
const reportContainerWidth = (container: Element, width: number) => {
  Object.defineProperty(container, 'clientWidth', {
    configurable: true,
    value: width,
  })
  act(() => {
    resizeObserverCallbacks.forEach((callback) =>
      callback(
        [{ contentRect: { width } } as ResizeObserverEntry],
        {} as ResizeObserver,
      ),
    )
  })
}

describe('ImagePropertyTimeline', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, t2)
    useImageViewerStore.setState(initialImageViewerState)
    stubResizeObserver()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('no longer renders a permanent current-frame preview, but keeps the thumbnail timeline and a View Image button', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )

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
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )

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
        featureId="feature-1"
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
        featureId="feature-1"
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
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    expect(
      screen.getByRole('button', {
        name: 'View image: camera at 1970-01-01 00:00:01 UTC',
      }),
    ).toBeEnabled()
  })

  it('clicking a thumbnail updates TimeStore.currentTime without touching the active window', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )

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
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )

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
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    expect(
      screen.queryByRole('button', {
        name: thumbnailName('1970-01-01 00:00:01 UTC'),
      }),
    ).not.toBeInTheDocument()

    act(() => useTimeStore.getState().resetTimeQuery())
    view.rerender(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
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
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )
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
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[badCamera]}
      />,
    )
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('shows an unavailable state when a thumbnail image fails to load', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    const thumbnail = screen.getByRole('button', {
      name: thumbnailName('1970-01-01 00:00:01 UTC'),
    })
    const img = thumbnail.querySelector('img')!
    fireEvent.error(img)
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('clicking View Image opens the shared floating viewer on this property, with its live source properties', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: viewImageName }))

    expect(useImageViewerStore.getState()).toMatchObject({
      propertyName: 'camera',
      properties: [camera],
    })
  })

  it('closes the shared viewer on unmount if it was showing this property', () => {
    useTimeStore.getState().setCurrentTime(t0)
    const view = render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: viewImageName }))
    expect(useImageViewerStore.getState().propertyName).toBe('camera')

    view.unmount()
    expect(useImageViewerStore.getState().propertyName).toBeUndefined()
  })

  it('does not close the shared viewer if it is showing a different property', () => {
    useImageViewerStore.getState().open('thermal', [])
    const view = render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )

    view.unmount()
    expect(useImageViewerStore.getState().propertyName).toBe('thermal')
  })

  it('closes the shared viewer when the owning Feature changes while it was showing this property', () => {
    const view = render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: viewImageName }))
    expect(useImageViewerStore.getState().propertyName).toBe('camera')

    // Same logical property name, but now sourced from a different Feature —
    // must not silently keep showing the previous Feature's images.
    view.rerender(
      <ImagePropertyTimeline
        featureId="feature-2"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    expect(useImageViewerStore.getState().propertyName).toBeUndefined()
  })
})

describe('ImagePropertyTimeline virtualization at scale', () => {
  // A lightweight synthetic large-dataset fixture — fake URLs, not real
  // images/Base64 — 1000 samples one second apart (so each has a distinct
  // formatted timestamp/label), evenly spread across the active range.
  const sampleCount = 1_000
  const bigDomainEnd = t0 + (sampleCount - 1) * 1_000
  const bigCamera: ImageTemporalProperty = {
    type: 'Image',
    name: 'camera',
    interpolation: 'Step',
    samples: Array.from({ length: sampleCount }, (_, index) => ({
      time: t0 + index * 1_000,
      value: `https://example.test/frame-${index}.png`,
    })),
  }

  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, bigDomainEnd)
    useImageViewerStore.setState(initialImageViewerState)
    stubResizeObserver()
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 0
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders only a small bounded window of active thumbnails out of 1000 logical samples', () => {
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[bigCamera]}
      />,
    )
    const track = screen.getByLabelText('camera thumbnail timeline')
    reportContainerWidth(track, 800)

    const images = track.querySelectorAll('img')
    expect(images.length).toBeGreaterThan(0)
    expect(images.length).toBeLessThan(sampleCount)
  })

  it('all 1000 source samples remain logically navigable via the full active range', () => {
    useTimeStore.getState().setCurrentTime(t0)
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[bigCamera]}
      />,
    )
    // Jumping straight to the very last sample must work even though it was
    // never rendered as a DOM thumbnail — proving no sample was dropped.
    act(() => useTimeStore.getState().setCurrentTime(bigDomainEnd))
    expect(
      screen.getByRole('button', {
        name: `View image: camera at ${new Date(bigDomainEnd).toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      }),
    ).toBeEnabled()
  })

  it('scrolling changes which thumbnails are mounted', () => {
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[bigCamera]}
      />,
    )
    const track = screen.getByLabelText('camera thumbnail timeline')
    reportContainerWidth(track, 800)

    const initialSrcs = new Set(
      [...track.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    )

    Object.defineProperty(track, 'scrollLeft', {
      configurable: true,
      value: 20_000,
    })
    act(() => {
      track.dispatchEvent(new Event('scroll'))
    })

    const scrolledSrcs = new Set(
      [...track.querySelectorAll('img')].map((img) => img.getAttribute('src')),
    )
    expect(scrolledSrcs).not.toEqual(initialSrcs)
    expect(scrolledSrcs.size).toBeGreaterThan(0)
    expect(scrolledSrcs.size).toBeLessThan(sampleCount)
  })

  it('currentTime changes alone do not change which thumbnails are mounted', () => {
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[bigCamera]}
      />,
    )
    const track = screen.getByLabelText('camera thumbnail timeline')
    reportContainerWidth(track, 800)

    const before = [...track.querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    )

    act(() => useTimeStore.getState().setCurrentTime(t0 + 1))
    act(() => useTimeStore.getState().setCurrentTime(t0 + 2))
    act(() => useTimeStore.getState().setCurrentTime(t0 + 3))

    const after = [...track.querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    )
    expect(after).toEqual(before)
  })

  it('the current-time indicator keeps moving even while the thumbnail window stays fixed', () => {
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[bigCamera]}
      />,
    )
    const track = screen.getByLabelText('camera thumbnail timeline')
    reportContainerWidth(track, 800)

    const cursor = () => track.querySelector('.image-current-cursor') as HTMLElement
    act(() => useTimeStore.getState().setCurrentTime(t0))
    const firstLeft = cursor().style.left

    act(() => useTimeStore.getState().setCurrentTime(t0 + 5))
    const secondLeft = cursor().style.left

    expect(secondLeft).not.toBe(firstLeft)
  })

  it('thumbnail click resolves the correct source sample by its own timestamp, not by its position in the virtualized DOM', () => {
    render(
      <ImagePropertyTimeline
        featureId="feature-1"
        propertyName="camera"
        properties={[bigCamera]}
      />,
    )
    const track = screen.getByLabelText('camera thumbnail timeline')
    reportContainerWidth(track, 800)

    // A sample from the middle of the range, well outside the initial
    // (scrollLeft = 0) visible window — reachable only once scrolled into view.
    const targetSample = bigCamera.samples[500]!
    Object.defineProperty(track, 'scrollLeft', {
      configurable: true,
      value: 22_000,
    })
    act(() => {
      track.dispatchEvent(new Event('scroll'))
    })

    fireEvent.click(
      screen.getByRole('button', {
        name: thumbnailName(
          new Date(targetSample.time).toISOString().slice(0, 19).replace('T', ' ') +
            ' UTC',
        ),
      }),
    )

    expect(useTimeStore.getState().currentTime).toBe(targetSample.time)
  })
})
