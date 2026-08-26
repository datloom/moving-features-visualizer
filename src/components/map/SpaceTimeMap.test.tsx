import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'

const {
  buildEntities,
  destroy,
  imageryLayer,
  ImageryLayer,
  OpenStreetMapImageryProvider,
  removeImageryErrorListener,
  Viewer,
} = vi.hoisted(() => {
  const add = vi.fn((entity: unknown) => entity)
  const remove = vi.fn()
  const destroy = vi.fn()
  const zoomTo = vi.fn(() => Promise.resolve(true))
  const removeImageryErrorListener = vi.fn()
  const imageryLayer = { kind: 'osm' }
  const OpenStreetMapImageryProvider = vi.fn(function () {
    return {
      errorEvent: {
        addEventListener: vi.fn(() => removeImageryErrorListener),
      },
    }
  })
  const ImageryLayer = vi.fn(function () {
    return imageryLayer
  })
  const Viewer = vi.fn(function () {
    return {
      destroy,
      entities: { add, remove },
      isDestroyed: vi.fn(() => false),
      zoomTo,
    }
  })
  const buildEntities = vi.fn(() => ({
    entities: [{ id: 'trajectory' }],
    currentGeometryEntities: [],
    currentPositionEntities: new Map(),
  }))
  return {
    add,
    buildEntities,
    destroy,
    imageryLayer,
    ImageryLayer,
    OpenStreetMapImageryProvider,
    remove,
    removeImageryErrorListener,
    Viewer,
    zoomTo,
  }
})

vi.mock('cesium', () => ({
  ConstantPositionProperty: vi.fn(),
  ImageryLayer,
  OpenStreetMapImageryProvider,
  SceneMode: { COLUMBUS_VIEW: 'columbus-view' },
  Viewer,
}))

vi.mock('../../visualization/space-time/cesiumAdapter', () => ({
  buildSpaceTimeCesiumEntities: buildEntities,
  spaceTimeSampleToCartesian: vi.fn(),
}))

import { SpaceTimeMap } from './SpaceTimeMap'
import { initialFeatureState, useFeatureStore } from '../../store/featureStore'
import { initialTimeState, useTimeStore } from '../../store/timeStore'

const feature: MovingFeature = {
  id: 'one',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 1_000, longitude: 1, latitude: 2 },
          { time: 2_000, longitude: 2, latitude: 3 },
        ],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
}

describe('SpaceTimeMap', () => {
  beforeEach(() => {
    useFeatureStore.setState(initialFeatureState)
    useFeatureStore.getState().replaceFeatures([feature])
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(1_000, 2_000)
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('creates a Columbus View Viewer and applies reactive time-axis scale', () => {
    const { container, rerender, unmount } = render(<SpaceTimeMap />)

    expect(Viewer).toHaveBeenCalledWith(
      container.querySelector('.cesium-map'),
      expect.objectContaining({
        baseLayer: imageryLayer,
        sceneMode: 'columbus-view',
      }),
    )
    expect(OpenStreetMapImageryProvider).toHaveBeenCalledWith({
      url: 'https://tile.openstreetmap.org/',
    })
    expect(buildEntities).toHaveBeenCalledWith(
      [feature],
      { minTime: 1_000, maxTime: 2_000 },
      expect.objectContaining({ tickCount: 6 }),
    )
    expect(screen.getByText('Vertical axis: UTC time')).toBeInTheDocument()
    expect(screen.getByText('Time scale: Auto (1×)')).toBeInTheDocument()

    rerender(<SpaceTimeMap timeAxisScale={4} />)
    expect(buildEntities).toHaveBeenLastCalledWith(
      [feature],
      { minTime: 1_000, maxTime: 2_000 },
      expect.objectContaining({ timeAxisScale: 4 }),
    )
    expect(screen.getByText('Time scale: 4×')).toBeInTheDocument()
    expect(Viewer).toHaveBeenCalledOnce()

    unmount()
    expect(removeImageryErrorListener).toHaveBeenCalledOnce()
    expect(destroy).toHaveBeenCalledOnce()
  })
})
