import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  add,
  destroy,
  ImageryLayer,
  imageryErrorListeners,
  movingFeatureToEntity,
  osmImageryLayer,
  OpenStreetMapImageryProvider,
  removeImageryErrorListener,
  remove,
  setView,
  timestampToJulianDate,
  Viewer,
  zoomTo,
} = vi.hoisted(() => {
  const add = vi.fn((entity: unknown) => entity)
  const destroy = vi.fn()
  const isDestroyed = vi.fn(() => false)
  const imageryErrorListeners: (() => void)[] = []
  const removeImageryErrorListener = vi.fn()
  const OpenStreetMapImageryProvider = vi.fn(function () {
    return {
      errorEvent: {
        addEventListener: vi.fn((listener: () => void) => {
          imageryErrorListeners.push(listener)
          return removeImageryErrorListener
        }),
      },
    }
  })
  const osmImageryLayer = { kind: 'osm-imagery-layer' }
  const ImageryLayer = vi.fn(function () {
    return osmImageryLayer
  })
  const movingFeatureToEntity = vi.fn((feature: { id: string }) => ({
    id: feature.id,
  }))
  const remove = vi.fn()
  const setView = vi.fn()
  const timestampToJulianDate = vi.fn((timestamp: number) => timestamp)
  const zoomTo = vi.fn(() => Promise.resolve(true))
  const Viewer = vi.fn(function () {
    return {
      camera: { setView },
      clock: { currentTime: 0 },
      destroy,
      entities: { add, remove },
      isDestroyed,
      zoomTo,
    }
  })

  return {
    add,
    destroy,
    ImageryLayer,
    imageryErrorListeners,
    movingFeatureToEntity,
    osmImageryLayer,
    OpenStreetMapImageryProvider,
    removeImageryErrorListener,
    remove,
    setView,
    timestampToJulianDate,
    Viewer,
    zoomTo,
  }
})

vi.mock('cesium', () => ({
  Cartesian3: { fromDegrees: vi.fn(() => 'initial-camera') },
  ImageryLayer,
  OpenStreetMapImageryProvider,
  Viewer,
}))

vi.mock('../../visualization/cesium/adapters', () => ({
  getFeatureTimeRange: (feature: {
    temporalGeometry: { segments: { samples: unknown[] }[] }
  }) => {
    const samples = feature.temporalGeometry.segments[0]!.samples as {
      time: number
    }[]
    return {
      startTime: samples[0]!.time,
      endTime: samples.at(-1)!.time,
    }
  },
  movingFeatureToEntities: (feature: { id: string }) => [
    movingFeatureToEntity(feature),
  ],
  timestampToJulianDate,
}))

import { CesiumMap } from './CesiumMap'
import type { MovingFeature } from '../../mfjson/types'
import { initialTimeState, useTimeStore } from '../../store/timeStore'

const feature: MovingFeature = {
  id: 'vehicle-1',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 100, longitude: 139.7, latitude: 35.6 },
          { time: 200, longitude: 139.8, latitude: 35.7 },
        ],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
}

describe('CesiumMap', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('creates one Viewer on mount and destroys it on unmount', () => {
    const { container, rerender, unmount } = render(<CesiumMap />)

    expect(Viewer).toHaveBeenCalledTimes(1)
    expect(Viewer).toHaveBeenCalledWith(
      container.querySelector('.cesium-map'),
      expect.objectContaining({
        animation: false,
        baseLayer: osmImageryLayer,
        timeline: false,
      }),
    )
    expect(OpenStreetMapImageryProvider).toHaveBeenCalledWith({
      url: 'https://tile.openstreetmap.org/',
    })
    expect(ImageryLayer).toHaveBeenCalledTimes(1)
    expect(setView).toHaveBeenCalledWith({ destination: 'initial-camera' })

    rerender(<CesiumMap />)
    expect(Viewer).toHaveBeenCalledTimes(1)

    unmount()
    expect(removeImageryErrorListener).toHaveBeenCalledTimes(1)
    expect(destroy).toHaveBeenCalledTimes(1)
  })

  it('reports OpenStreetMap imagery loading failures without removing the map', () => {
    const { container } = render(<CesiumMap />)

    act(() => imageryErrorListeners.at(-1)?.())

    expect(container.querySelector('.cesium-map')).toBeInTheDocument()
    expect(container.querySelector('.map-imagery-error')).toHaveTextContent(
      'OpenStreetMap imagery is temporarily unavailable.',
    )
  })

  it('cleans up each Viewer created during React Strict Mode checks', () => {
    const { unmount } = render(
      <StrictMode>
        <CesiumMap />
      </StrictMode>,
    )

    expect(Viewer).toHaveBeenCalledTimes(2)
    expect(destroy).toHaveBeenCalledTimes(1)

    unmount()
    expect(destroy).toHaveBeenCalledTimes(2)
  })

  it('renders normalized features without recreating the Viewer', () => {
    const { rerender } = render(<CesiumMap features={[feature]} />)

    expect(movingFeatureToEntity).toHaveBeenCalledWith(feature)
    expect(add).toHaveBeenCalledWith({ id: 'vehicle-1' })
    expect(zoomTo).toHaveBeenCalledWith([{ id: 'vehicle-1' }])
    expect(useTimeStore.getState()).toMatchObject({
      startTime: 100,
      endTime: 200,
      currentTime: 100,
    })

    act(() => useTimeStore.getState().setCurrentTime(150))
    expect(timestampToJulianDate).toHaveBeenLastCalledWith(150)

    rerender(<CesiumMap features={[]} />)

    expect(Viewer).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith({ id: 'vehicle-1' })
  })

  it('refocuses existing entities without recreating the Viewer', () => {
    const features = [feature]
    const { rerender } = render(
      <CesiumMap features={features} focusRevision={0} />,
    )
    const viewerCalls = Viewer.mock.calls.length
    const adapterCalls = movingFeatureToEntity.mock.calls.length
    zoomTo.mockClear()

    rerender(<CesiumMap features={features} focusRevision={1} />)

    expect(zoomTo).toHaveBeenCalledWith([{ id: 'vehicle-1' }])
    expect(Viewer).toHaveBeenCalledTimes(viewerCalls)
    expect(movingFeatureToEntity).toHaveBeenCalledTimes(adapterCalls)
  })
})
