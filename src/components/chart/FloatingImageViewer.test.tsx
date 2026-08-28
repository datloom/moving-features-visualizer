import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RefObject } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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

const noAnchorRef: RefObject<HTMLElement | null> = { current: null }

let resizeObserverEntries: { callback: ResizeObserverCallback; element: Element }[] =
  []

const stubResizeObserver = () => {
  resizeObserverEntries = []
  vi.stubGlobal(
    'ResizeObserver',
    vi.fn((callback: ResizeObserverCallback) => ({
      observe: (element: Element) =>
        resizeObserverEntries.push({ callback, element }),
      disconnect: () => {
        resizeObserverEntries = resizeObserverEntries.filter(
          (entry) => entry.callback !== callback,
        )
      },
      unobserve: vi.fn(),
    })),
  )
}

const triggerResizeObserver = (element: Element) => {
  act(() => {
    resizeObserverEntries
      .filter((entry) => entry.element === element)
      .forEach((entry) =>
        entry.callback([{} as ResizeObserverEntry], {} as ResizeObserver),
      )
  })
}

/** A fake Selected Feature anchor element with a controllable bounding rect. */
const makeAnchorElement = (rect: Partial<DOMRect>): HTMLElement => {
  const element = document.createElement('section')
  element.getBoundingClientRect = () =>
    ({
      left: 20,
      top: 60,
      right: 300,
      bottom: 160,
      width: 280,
      height: 100,
      x: 20,
      y: 60,
      toJSON: () => ({}),
      ...rect,
    })
  return element
}

describe('FloatingImageViewer', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, t1)
    useImageViewerStore.setState(initialImageViewerState)
    stubResizeObserver()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('renders nothing when the store has no property open', () => {
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens showing the property name and the current evaluated sample, with no modal backdrop', () => {
    useTimeStore.getState().setCurrentTime(t0)
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

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
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

    fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: t0,
      playing: true,
    })
  })

  it('follows TimeStore.currentTime live, without a second timer', () => {
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

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
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

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

  it('keeps a manual window position/size independent of TimeStore updates', () => {
    useImageViewerStore.getState().setManualPosition({ x: 40, y: 60 })
    useImageViewerStore.getState().setSize({ width: 400, height: 300 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

    act(() => useTimeStore.getState().setCurrentTime(t1))

    expect(useImageViewerStore.getState().manualPosition).toEqual({
      x: 40,
      y: 60,
    })
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
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

    expect(useTimeStore.getState()).toEqual(timeStoreBefore)
  })
})

describe('FloatingImageViewer Selected Feature anchoring', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(t0, t1)
    useImageViewerStore.setState(initialImageViewerState)
    stubResizeObserver()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('positions the viewer directly below the actual rendered Selected Feature bounds', () => {
    const anchorElement = makeAnchorElement({ left: 20, bottom: 160 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(
      <FloatingImageViewer
        selectedFeatureRef={{ current: anchorElement }}
      />,
    )

    const dialog = screen.getByRole('dialog')
    expect(parseFloat(dialog.style.left)).toBe(20)
    expect(parseFloat(dialog.style.top)).toBeGreaterThan(160)
  })

  it('follows a taller Selected Feature panel (e.g. server-loaded metadata) while still anchored', () => {
    const anchorElement = makeAnchorElement({ left: 20, bottom: 160 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(
      <FloatingImageViewer
        selectedFeatureRef={{ current: anchorElement }}
      />,
    )
    const initialTop = parseFloat(screen.getByRole('dialog').style.top)

    // Selected Feature grows taller (e.g. server metadata finished loading).
    anchorElement.getBoundingClientRect = () =>
      ({
        left: 20,
        top: 60,
        right: 300,
        bottom: 420,
        width: 280,
        height: 360,
        x: 20,
        y: 60,
        toJSON: () => ({}),
      })
    triggerResizeObserver(anchorElement)

    const newTop = parseFloat(screen.getByRole('dialog').style.top)
    expect(newTop).toBeGreaterThan(initialTop)
  })

  it('switches to manual positioning as soon as the user drags, and no longer follows Selected Feature resizing', () => {
    const anchorElement = makeAnchorElement({ left: 20, bottom: 160 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(
      <FloatingImageViewer
        selectedFeatureRef={{ current: anchorElement }}
      />,
    )
    expect(useImageViewerStore.getState().positionMode).toBe('anchored')

    const header = screen
      .getByRole('dialog')
      .querySelector('.image-floating-viewer-header')!
    // jsdom has no native PointerEvent, so fireEvent.pointerDown's synthetic
    // event wouldn't carry clientX/clientY — dispatch a MouseEvent (which the
    // 'pointerdown'-named listener accepts the same way) with real coordinates.
    fireEvent(
      header,
      new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 100 }),
    )
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 260, clientY: 340 }),
      )
    })
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(useImageViewerStore.getState().positionMode).toBe('manual')
    const draggedTop = parseFloat(screen.getByRole('dialog').style.top)

    // Selected Feature resizing again must NOT move the manually placed viewer.
    anchorElement.getBoundingClientRect = () =>
      ({
        left: 20,
        top: 60,
        right: 300,
        bottom: 700,
        width: 280,
        height: 640,
        x: 20,
        y: 60,
        toJSON: () => ({}),
      })
    triggerResizeObserver(anchorElement)

    expect(parseFloat(screen.getByRole('dialog').style.top)).toBe(draggedTop)
  })

  it('resizing the viewer alone does not change its positioning mode', () => {
    const anchorElement = makeAnchorElement({ left: 20, bottom: 160 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(
      <FloatingImageViewer
        selectedFeatureRef={{ current: anchorElement }}
      />,
    )

    const handle = screen
      .getByRole('dialog')
      .querySelector('.image-floating-viewer-resize-handle')!
    fireEvent(
      handle,
      new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 300 }),
    )
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointermove', { clientX: 340, clientY: 340 }),
      )
    })
    window.dispatchEvent(new MouseEvent('pointerup'))

    expect(useImageViewerStore.getState().positionMode).toBe('anchored')
  })

  it('clamps into the viewport so the header/close control stay reachable when there is no room below', () => {
    vi.stubGlobal('innerWidth', 1_200)
    vi.stubGlobal('innerHeight', 700)
    const anchorElement = makeAnchorElement({
      left: 20,
      bottom: 690,
      top: 600,
      height: 90,
    })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(
      <FloatingImageViewer
        selectedFeatureRef={{ current: anchorElement }}
      />,
    )

    const dialog = screen.getByRole('dialog')
    const top = parseFloat(dialog.style.top)
    const height = parseFloat(dialog.style.height)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(top + height).toBeLessThanOrEqual(700)
  })

  it('re-clamps a manual position on browser resize so it never gets stranded off-screen', () => {
    vi.stubGlobal('innerWidth', 1_200)
    vi.stubGlobal('innerHeight', 800)
    useImageViewerStore.getState().setManualPosition({ x: 1_000, y: 700 })
    act(() => useImageViewerStore.getState().open('camera', [camera]))
    render(<FloatingImageViewer selectedFeatureRef={noAnchorRef} />)

    vi.stubGlobal('innerWidth', 500)
    vi.stubGlobal('innerHeight', 400)
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })

    const dialog = screen.getByRole('dialog')
    const left = parseFloat(dialog.style.left)
    const top = parseFloat(dialog.style.top)
    const width = parseFloat(dialog.style.width)
    const height = parseFloat(dialog.style.height)
    expect(left + width).toBeLessThanOrEqual(500)
    expect(top + height).toBeLessThanOrEqual(400)
  })
})
