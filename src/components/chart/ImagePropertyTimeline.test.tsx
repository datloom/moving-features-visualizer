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
/** Every source sample gets one of these (a lightweight tick) — full navigability regardless of thumbnail density-thinning. */
const tickName = (timestamp: string) => `Jump to camera at ${timestamp}`
/** Only a bounded, density-thinned subset gets an actual image preview. */
const previewName = (timestamp: string) => `Preview camera near ${timestamp}`

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

const renderTimeline = (
  props: Partial<{
    featureId: string
    propertyName: string
    properties: readonly ImageTemporalProperty[]
  }> = {},
) => {
  const view = render(
    <ImagePropertyTimeline
      featureId={props.featureId ?? 'feature-1'}
      propertyName={props.propertyName ?? 'camera'}
      properties={props.properties ?? [camera]}
    />,
  )
  const track = screen.getByLabelText(
    `${props.propertyName ?? 'camera'} thumbnail timeline`,
  )
  reportContainerWidth(track, 800)
  return { ...view, track }
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
    renderTimeline()

    expect(
      screen.queryByRole('button', { name: /^View larger image:/ }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: viewImageName })).toBeInTheDocument()
    // Every source sample remains represented (as a tick) regardless of
    // thumbnail-preview thinning.
    expect(screen.getAllByRole('button', { name: /^Jump to camera at/ })).toHaveLength(
      3,
    )
  })

  it('enables View Image with an accessible label naming the current sample', () => {
    useTimeStore.getState().setCurrentTime(t0)
    renderTimeline()

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
    renderTimeline({ properties: [discreteCamera] })

    const button = screen.getByRole('button', { name: viewImageName })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', 'No image at current time')
    // Disabling View Image must not gate the thumbnail timeline: all three
    // source samples stay visible even though none is the current one.
    expect(
      screen.getAllByRole('button', { name: /^Jump to camera at/ }),
    ).toHaveLength(3)
  })

  it('Discrete: clicking a tick lands exactly on that sample and re-enables View Image', () => {
    const discreteCamera: ImageTemporalProperty = {
      ...camera,
      interpolation: 'Discrete',
    }
    useTimeStore.getState().setCurrentTime(t0 + 500)
    renderTimeline({ properties: [discreteCamera] })
    expect(screen.getByRole('button', { name: viewImageName })).toBeDisabled()

    fireEvent.click(
      screen.getByRole('button', { name: tickName('1970-01-01 00:00:02 UTC') }),
    )

    expect(useTimeStore.getState().currentTime).toBe(t1)
    const button = screen.getByRole('button', {
      name: 'View image: camera at 1970-01-01 00:00:02 UTC',
    })
    expect(button).toBeEnabled()
  })

  it('keeps View Image enabled for a held Step value at a time between samples', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    renderTimeline()
    expect(
      screen.getByRole('button', {
        name: 'View image: camera at 1970-01-01 00:00:01 UTC',
      }),
    ).toBeEnabled()
  })

  it('clicking a tick updates TimeStore.currentTime without touching the active window', () => {
    useTimeStore.getState().setCurrentTime(t0)
    renderTimeline()

    fireEvent.click(
      screen.getByRole('button', { name: tickName('1970-01-01 00:00:03 UTC') }),
    )

    expect(useTimeStore.getState().currentTime).toBe(t2)
    expect(useTimeStore.getState().queryActive).toBe(false)
  })

  it('clicking a preview thumbnail also updates TimeStore.currentTime', () => {
    useTimeStore.getState().setCurrentTime(t0)
    renderTimeline()

    fireEvent.click(
      screen.getByRole('button', {
        name: previewName('1970-01-01 00:00:03 UTC'),
      }),
    )

    expect(useTimeStore.getState().currentTime).toBe(t2)
  })

  it('clips the thumbnail timeline to an active Time Query window', () => {
    act(() => useTimeStore.getState().applyTimeQuery(t0 + 1, t2 - 1))
    renderTimeline()

    // Only the middle sample (t1) falls inside (t0+1, t2-1).
    expect(
      screen.getByRole('button', { name: tickName('1970-01-01 00:00:02 UTC') }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: tickName('1970-01-01 00:00:01 UTC'),
      }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', {
        name: tickName('1970-01-01 00:00:03 UTC'),
      }),
    ).not.toBeInTheDocument()
  })

  it('restores the full thumbnail range after Reset', () => {
    act(() => useTimeStore.getState().applyTimeQuery(t0 + 1, t2 - 1))
    const { track } = renderTimeline()
    expect(
      screen.queryByRole('button', {
        name: tickName('1970-01-01 00:00:01 UTC'),
      }),
    ).not.toBeInTheDocument()

    act(() => useTimeStore.getState().resetTimeQuery())
    reportContainerWidth(track, 800)
    expect(
      screen.getByRole('button', { name: tickName('1970-01-01 00:00:01 UTC') }),
    ).toBeInTheDocument()
  })

  it('disables View Image when the query misses every sample', () => {
    // A dataset extent wider than this Image property's own samples (e.g.
    // driven by other geometry/properties), queried in a sub-range that
    // legitimately contains none of the camera samples.
    useTimeStore.getState().setRange(0, 100_000)
    act(() => useTimeStore.getState().applyTimeQuery(50_000, 60_000))
    renderTimeline()
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
    renderTimeline({ properties: [badCamera] })
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('shows an unavailable state when a preview thumbnail image fails to load', () => {
    useTimeStore.getState().setCurrentTime(t0)
    renderTimeline()
    const thumbnail = screen.getByRole('button', {
      name: previewName('1970-01-01 00:00:01 UTC'),
    })
    const img = thumbnail.querySelector('img')!
    fireEvent.error(img)
    expect(screen.getAllByText('Image unavailable').length).toBeGreaterThan(0)
  })

  it('clicking View Image opens the shared floating viewer on this property, with its live source properties', () => {
    useTimeStore.getState().setCurrentTime(t0 + 500)
    renderTimeline()

    fireEvent.click(screen.getByRole('button', { name: viewImageName }))

    expect(useImageViewerStore.getState()).toMatchObject({
      propertyName: 'camera',
      properties: [camera],
    })
  })

  it('closes the shared viewer on unmount if it was showing this property', () => {
    useTimeStore.getState().setCurrentTime(t0)
    const { unmount } = renderTimeline()
    fireEvent.click(screen.getByRole('button', { name: viewImageName }))
    expect(useImageViewerStore.getState().propertyName).toBe('camera')

    unmount()
    expect(useImageViewerStore.getState().propertyName).toBeUndefined()
  })

  it('does not close the shared viewer if it is showing a different property', () => {
    useImageViewerStore.getState().open('thermal', [])
    const { unmount } = renderTimeline()

    unmount()
    expect(useImageViewerStore.getState().propertyName).toBe('thermal')
  })

  it('closes the shared viewer when the owning Feature changes while it was showing this property', () => {
    const { rerender } = render(
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
    rerender(
      <ImagePropertyTimeline
        featureId="feature-2"
        propertyName="camera"
        properties={[camera]}
      />,
    )
    expect(useImageViewerStore.getState().propertyName).toBeUndefined()
  })
})

describe('ImagePropertyTimeline temporal-width and density handling at scale', () => {
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
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('total track width does not scale with source sample count — 100 vs 1000 samples use the same width', () => {
    const oneHundredCamera: ImageTemporalProperty = {
      ...bigCamera,
      samples: bigCamera.samples.filter((_, index) => index % 10 === 0),
    }

    const first = renderTimeline({ properties: [bigCamera] })
    const rail1000 = first.track.querySelector(
      '.image-thumbnail-rail',
    ) as HTMLElement
    const width1000 = getComputedStyle(rail1000).width
    first.unmount()

    const second = renderTimeline({ properties: [oneHundredCamera] })
    const rail100 = second.track.querySelector(
      '.image-thumbnail-rail',
    ) as HTMLElement
    // Neither rail declares an explicit pixel width keyed to sample count —
    // both simply fill the (identically stubbed, 800px) container.
    expect(rail1000.style.width).toBe('')
    expect(rail100.style.width).toBe('')
    expect(width1000).toBe(getComputedStyle(rail100).width)
  })

  it('renders only a small bounded number of active preview thumbnails out of 1000 logical samples', () => {
    renderTimeline({ properties: [bigCamera] })
    const images = screen.getAllByRole('button', {
      name: /^Preview camera near/,
    })
    expect(images.length).toBeGreaterThan(0)
    expect(images.length).toBeLessThan(sampleCount / 5)
  })

  it('every one of the 1000 source samples still gets its own tick — none are dropped', () => {
    renderTimeline({ properties: [bigCamera] })
    expect(
      screen.getAllByRole('button', { name: /^Jump to camera at/ }),
    ).toHaveLength(sampleCount)
  })

  it('the earliest sample sits at the start of the track and the latest at its end', () => {
    const { track } = renderTimeline({ properties: [bigCamera] })
    const first = screen.getByRole('button', {
      name: tickName('1970-01-01 00:00:01 UTC'),
    })
    const last = screen.getByRole('button', {
      name: tickName(
        new Date(bigDomainEnd).toISOString().slice(0, 19).replace('T', ' ') +
          ' UTC',
      ),
    })
    const trackWidth = (track.querySelector('.image-thumbnail-rail') as HTMLElement)
      .getBoundingClientRect().width

    expect(parseFloat(first.style.left)).toBeCloseTo(0, 0)
    expect(parseFloat(last.style.left)).toBeCloseTo(trackWidth || 800, 0)
  })

  it('a midpoint timestamp sits near the middle of the track', () => {
    renderTimeline({ properties: [bigCamera] })
    const midSample = bigCamera.samples[Math.floor(sampleCount / 2)]!
    const midTick = screen.getByRole('button', {
      name: tickName(
        new Date(midSample.time).toISOString().slice(0, 19).replace('T', ' ') +
          ' UTC',
      ),
    })
    expect(parseFloat(midTick.style.left)).toBeGreaterThan(300)
    expect(parseFloat(midTick.style.left)).toBeLessThan(500)
  })

  it('all 1000 source samples remain logically navigable via the full active range', () => {
    useTimeStore.getState().setCurrentTime(t0)
    renderTimeline({ properties: [bigCamera] })
    // Jumping straight to the very last sample must work even though it was
    // never rendered as a preview thumbnail — proving no sample was dropped.
    act(() => useTimeStore.getState().setCurrentTime(bigDomainEnd))
    expect(
      screen.getByRole('button', {
        name: `View image: camera at ${new Date(bigDomainEnd).toISOString().slice(0, 19).replace('T', ' ')} UTC`,
      }),
    ).toBeEnabled()
  })

  it('an active Time Query range repositions samples correctly and still bounds preview count', () => {
    const queryStart = t0 + 400_000
    const queryEnd = t0 + 600_000
    act(() => useTimeStore.getState().applyTimeQuery(queryStart, queryEnd))
    renderTimeline({ properties: [bigCamera] })

    // Roughly 200 of the 1000 samples fall in this narrower query window.
    const ticks = screen.getAllByRole('button', { name: /^Jump to camera at/ })
    expect(ticks.length).toBeGreaterThan(150)
    expect(ticks.length).toBeLessThan(250)

    const previews = screen.getAllByRole('button', {
      name: /^Preview camera near/,
    })
    expect(previews.length).toBeLessThan(sampleCount / 5)
  })

  it('currentTime changes alone do not change which samples are selected as preview thumbnails', () => {
    renderTimeline({ properties: [bigCamera] })

    const before = screen
      .getAllByRole('button', { name: /^Preview camera near/ })
      .map((button) => button.querySelector('img')?.getAttribute('src'))

    act(() => useTimeStore.getState().setCurrentTime(t0 + 1_000))
    act(() => useTimeStore.getState().setCurrentTime(t0 + 2_000))
    act(() => useTimeStore.getState().setCurrentTime(t0 + 3_000))

    const after = screen
      .getAllByRole('button', { name: /^Preview camera near/ })
      .map((button) => button.querySelector('img')?.getAttribute('src'))
    expect(after).toEqual(before)
  })

  it('the current-time cursor keeps moving even while the preview-thumbnail population stays fixed', () => {
    const { track } = renderTimeline({ properties: [bigCamera] })

    const cursor = () => track.querySelector('.image-current-cursor') as HTMLElement
    act(() => useTimeStore.getState().setCurrentTime(t0))
    const firstLeft = cursor().style.left

    act(() => useTimeStore.getState().setCurrentTime(t0 + 500_000))
    const secondLeft = cursor().style.left

    expect(secondLeft).not.toBe(firstLeft)
  })

  it('View Image stays outside the timeline track content (not one of its ticks/thumbnails)', () => {
    const { track } = renderTimeline({ properties: [bigCamera] })
    const viewImageButton = screen.getByRole('button', { name: viewImageName })
    expect(track.contains(viewImageButton)).toBe(false)
  })

  it('tick click resolves the correct source sample by its own timestamp, not by DOM/thumbnail position', () => {
    renderTimeline({ properties: [bigCamera] })

    const targetSample = bigCamera.samples[500]!
    fireEvent.click(
      screen.getByRole('button', {
        name: tickName(
          new Date(targetSample.time).toISOString().slice(0, 19).replace('T', ' ') +
            ' UTC',
        ),
      }),
    )

    expect(useTimeStore.getState().currentTime).toBe(targetSample.time)
  })
})
