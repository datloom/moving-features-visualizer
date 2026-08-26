import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  add,
  destroy,
  ImageryLayer,
  imageryErrorListeners,
  morphTo2D,
  morphTo3D,
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
  const morphTo2D = vi.fn()
  const morphTo3D = vi.fn()
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
  const movingFeatureToEntity = vi.fn(
    (feature: { id: string }, options?: { selected?: boolean }) => {
      void options
      return { id: feature.id }
    },
  )
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
      scene: { morphTo2D, morphTo3D },
      zoomTo,
    }
  })

  return {
    add,
    destroy,
    ImageryLayer,
    imageryErrorListeners,
    morphTo2D,
    morphTo3D,
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
  geometrySegmentEntityId: (
    featureId: string,
    segment: { id?: string },
    index: number,
  ) =>
    `${featureId}--geometry--${segment.id ? encodeURIComponent(segment.id) : index + 1}`,
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
  movingFeatureEntityIds: (
    feature: {
      id: string
      temporalGeometry: { segments: { id?: string }[] }
    },
    options: { selected?: boolean },
  ) =>
    feature.temporalGeometry.segments.flatMap((segment, index) => {
      const id = `${feature.id}--geometry--${segment.id ? encodeURIComponent(segment.id) : index + 1}`
      return options.selected ? [`${id}--trajectory`, `${id}--position`] : [id]
    }),
  movingFeatureToEntities: (
    feature: {
      id: string
      temporalGeometry: { segments: { id?: string }[] }
    },
    options: { selected?: boolean },
  ) => {
    movingFeatureToEntity(feature, options)
    return feature.temporalGeometry.segments.flatMap((segment, index) => {
      const id = `${feature.id}--geometry--${segment.id ? encodeURIComponent(segment.id) : index + 1}`
      return options.selected
        ? [{ id: `${id}--trajectory` }, { id: `${id}--position` }]
        : [{ id }]
    })
  },
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

  it('uses native scene morphs without recreating the Viewer', () => {
    const { rerender } = render(<CesiumMap mapMode="3d" />)

    expect(morphTo2D).not.toHaveBeenCalled()
    expect(morphTo3D).not.toHaveBeenCalled()

    rerender(<CesiumMap mapMode="2d" />)
    expect(morphTo2D).toHaveBeenCalledWith(0.5)
    expect(Viewer).toHaveBeenCalledTimes(1)

    rerender(<CesiumMap mapMode="3d" />)
    expect(morphTo3D).toHaveBeenCalledWith(0.5)
    expect(Viewer).toHaveBeenCalledTimes(1)
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

    expect(movingFeatureToEntity).toHaveBeenCalledWith(
      feature,
      expect.objectContaining({ selected: false }),
    )
    expect(add).toHaveBeenCalledWith({ id: 'vehicle-1--geometry--1' })
    expect(zoomTo).toHaveBeenCalledWith([{ id: 'vehicle-1--geometry--1' }])
    expect(useTimeStore.getState()).toMatchObject({
      startTime: 100,
      endTime: 200,
      currentTime: 100,
    })

    act(() => useTimeStore.getState().setCurrentTime(150))
    expect(timestampToJulianDate).toHaveBeenLastCalledWith(150)

    rerender(<CesiumMap features={[]} />)

    expect(Viewer).toHaveBeenCalledTimes(1)
    expect(remove).toHaveBeenCalledWith({
      id: 'vehicle-1--geometry--1',
    })
  })

  it('rebuilds entities with the active Time Query window on Apply and Reset', () => {
    render(<CesiumMap features={[feature]} />)
    expect(useTimeStore.getState()).toMatchObject({
      startTime: 100,
      endTime: 200,
    })
    movingFeatureToEntity.mockClear()

    act(() => useTimeStore.getState().applyTimeQuery(120, 180))

    expect(movingFeatureToEntity).toHaveBeenCalledWith(
      feature,
      expect.objectContaining({ window: { start: 120, end: 180 } }),
    )

    movingFeatureToEntity.mockClear()
    act(() => useTimeStore.getState().resetTimeQuery())

    expect(movingFeatureToEntity).toHaveBeenCalledWith(
      feature,
      expect.objectContaining({ window: undefined }),
    )
  })

  it('renders every loaded Feature while styling selection independently', () => {
    const loadedFeatures = Array.from({ length: 10 }, (_, index) => ({
      ...feature,
      id: `vehicle-${index + 1}`,
    }))
    const { rerender } = render(
      <CesiumMap features={loadedFeatures} selectedFeatureId="vehicle-1" />,
    )

    expect(add).toHaveBeenCalledTimes(11)
    expect(movingFeatureToEntity).toHaveBeenCalledWith(
      loadedFeatures[0],
      expect.objectContaining({ selected: true }),
    )
    expect(movingFeatureToEntity).toHaveBeenCalledWith(
      loadedFeatures[1],
      expect.objectContaining({ selected: false }),
    )

    add.mockClear()
    zoomTo.mockClear()
    rerender(
      <CesiumMap
        features={[...loadedFeatures, { ...feature, id: 'vehicle-11' }]}
        selectedFeatureId="vehicle-2"
      />,
    )
    // Only the two Features whose selection emphasis changed and the new
    // Feature are replaced/added; the other eight entities remain stable.
    expect(add).toHaveBeenCalledTimes(4)
    expect(add).toHaveBeenCalledWith({ id: 'vehicle-1--geometry--1' })
    expect(add).toHaveBeenCalledWith({ id: 'vehicle-11--geometry--1' })
    expect(zoomTo).toHaveBeenCalledOnce()

    zoomTo.mockClear()
    rerender(
      <CesiumMap
        features={[
          ...loadedFeatures,
          {
            ...feature,
            id: 'vehicle-11',
            temporalGeometry: {
              segments: [
                ...feature.temporalGeometry.segments,
                feature.temporalGeometry.segments[0]!,
              ],
            },
          },
        ]}
        selectedFeatureId="vehicle-2"
      />,
    )
    expect(zoomTo).not.toHaveBeenCalled()
  })

  it('does not create duplicate entities for duplicate Feature IDs', () => {
    render(<CesiumMap features={[feature, { ...feature }]} />)
    expect(add).toHaveBeenCalledTimes(1)
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

    expect(zoomTo).toHaveBeenCalledWith([{ id: 'vehicle-1--geometry--1' }])
    expect(Viewer).toHaveBeenCalledTimes(viewerCalls)
    expect(movingFeatureToEntity).toHaveBeenCalledTimes(adapterCalls)
  })

  it('appends independent paths without recreating existing entities or moving the camera', () => {
    const fiveSegments = Array.from({ length: 5 }, (_, index) => ({
      ...feature.temporalGeometry.segments[0]!,
      type: 'MovingPoint' as const,
      id: `tg-${index + 1}`,
      samples: [
        { time: 100 + index * 20, longitude: index, latitude: index },
        { time: 105 + index * 20, longitude: index + 1, latitude: index + 1 },
      ],
    }))
    const initial = {
      ...feature,
      temporalGeometry: { segments: fiveSegments },
    }
    const { rerender } = render(
      <CesiumMap features={[initial]} selectedFeatureId="vehicle-1" />,
    )
    expect(add).toHaveBeenCalledTimes(10)

    add.mockClear()
    remove.mockClear()
    zoomTo.mockClear()
    useTimeStore.setState({
      currentTime: 103,
      playing: true,
      playbackRate: 2,
    })
    const appended = {
      ...initial,
      temporalGeometry: {
        segments: [
          ...fiveSegments,
          ...Array.from({ length: 5 }, (_, index) => ({
            ...fiveSegments[0]!,
            id: `tg-${index + 6}`,
          })),
        ],
      },
    }
    rerender(<CesiumMap features={[appended]} selectedFeatureId="vehicle-1" />)

    expect(add).toHaveBeenCalledTimes(10)
    expect(add).toHaveBeenCalledWith({
      id: 'vehicle-1--geometry--tg-10--trajectory',
    })
    expect(remove).not.toHaveBeenCalled()
    expect(zoomTo).not.toHaveBeenCalled()
    expect(useTimeStore.getState()).toMatchObject({
      currentTime: 103,
      playing: true,
      playbackRate: 2,
    })
  })
})
