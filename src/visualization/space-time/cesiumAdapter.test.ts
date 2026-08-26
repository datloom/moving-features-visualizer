import { Cartesian3, JulianDate } from 'cesium'
import { describe, expect, it } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'
import {
  buildSpaceTimeCesiumEntities,
  featureIdFromSpaceTimeEntityId,
  spaceTimeSampleToCartesian,
} from './cesiumAdapter'

const movingFeature: MovingFeature = {
  id: 'vehicle:one',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 1_000, longitude: 139.7, latitude: 35.6, height: 9_999 },
          { time: 2_000, longitude: 139.8, latitude: 35.7, height: 8_888 },
        ],
      },
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [{ time: 3_000, longitude: 139.9, latitude: 35.8 }],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
}

describe('Space-Time Cesium adapter', () => {
  it('uses visual time height instead of the MF-JSON coordinate height', () => {
    expect(
      Cartesian3.equals(
        spaceTimeSampleToCartesian({
          longitude: 139.7,
          latitude: 35.6,
          visualHeight: 500,
        }),
        Cartesian3.fromDegrees(139.7, 35.6, 500),
      ),
    ).toBe(true)
  })

  it('creates separate identity-preserving entities for every segment', () => {
    const result = buildSpaceTimeCesiumEntities(
      [movingFeature],
      { minTime: 1_000, maxTime: 3_000 },
      {
        currentTime: 2_000,
        selectedFeatureId: movingFeature.id,
        tickCount: 3,
        timeAxisHeight: 1_000,
      },
    )
    const segmentEntities = result.entities.filter(
      (entity) =>
        entity.id.includes(':segment:') && !entity.id.endsWith(':current'),
    )

    expect(
      segmentEntities.map(({ id }) => featureIdFromSpaceTimeEntityId(id)),
    ).toEqual(segmentEntities.map(() => movingFeature.id))
    expect(
      segmentEntities.some(
        ({ polyline }) => polyline?.width?.getValue(JulianDate.now()) === 4,
      ),
    ).toBe(true)
    expect(result.currentGeometryEntities).toHaveLength(2)
    expect(result.currentPositionEntities.has(movingFeature.id)).toBe(true)
    expect(result.entities.some(({ id }) => id === 'space-time:axis')).toBe(
      true,
    )
    expect(
      result.entities.filter(({ id }) => id.startsWith('space-time:tick:')),
    ).toHaveLength(3)
  })

  it('renders MovingPolygon boundary surfaces as translucent-height polygons', () => {
    const polygon: MovingFeature = {
      id: 'storm',
      type: 'MovingFeature',
      temporalGeometry: {
        segments: [
          {
            type: 'MovingPolygon',
            interpolation: 'Linear',
            samples: [0, 10].map((time, offset) => ({
              time,
              rings: [
                [
                  { longitude: offset, latitude: 0 },
                  { longitude: 1 + offset, latitude: 0 },
                  { longitude: 1 + offset, latitude: 1 },
                  { longitude: offset, latitude: 1 },
                  { longitude: offset, latitude: 0 },
                ],
              ],
            })),
          },
        ],
      },
      temporalProperties: [],
      properties: {},
    }
    const result = buildSpaceTimeCesiumEntities(
      [polygon],
      { minTime: 0, maxTime: 10 },
      { selectedFeatureId: polygon.id, timeAxisHeight: 100, timeAxisScale: 8 },
    )
    const surfaces = result.entities.filter(({ id }) =>
      id.includes(':surface:'),
    )
    expect(surfaces).toHaveLength(16)
    expect(
      surfaces.every(
        ({ polygon: surface }) =>
          surface?.perPositionHeight?.getValue(JulianDate.now()) === true &&
          surface.outline?.getValue(JulianDate.now()) === false,
      ),
    ).toBe(true)
  })
})
