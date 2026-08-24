import { Cartesian3, JulianDate } from 'cesium'
import { describe, expect, it } from 'vitest'

import {
  coordinateToCartesian3,
  getFeatureTimeRange,
  movingFeatureToEntity,
  movingFeatureToEntities,
  samplesToPositionProperty,
  timestampToJulianDate,
} from './adapters'
import type { MovingFeature } from '../../mfjson/types'

const movingFeature: MovingFeature = {
  id: 'vehicle-1',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          {
            time: Date.parse('2026-08-24T12:00:00Z'),
            longitude: 139.7,
            latitude: 35.6,
          },
          {
            time: Date.parse('2026-08-24T12:00:10Z'),
            longitude: 139.8,
            latitude: 35.7,
            height: 120,
          },
        ],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
}

describe('Cesium adapters', () => {
  it('converts Unix epoch milliseconds to a JulianDate', () => {
    const timestamp = Date.parse('2026-08-24T12:34:56.789Z')

    expect(
      JulianDate.equals(
        timestampToJulianDate(timestamp),
        JulianDate.fromIso8601('2026-08-24T12:34:56.789Z'),
      ),
    ).toBe(true)
  })

  it('converts a normalized coordinate to an Earth-fixed Cartesian3', () => {
    const coordinate = { longitude: 139.6917, latitude: 35.6895, height: 25 }

    expect(
      Cartesian3.equals(
        coordinateToCartesian3(coordinate),
        Cartesian3.fromDegrees(139.6917, 35.6895, 25),
      ),
    ).toBe(true)
  })

  it('uses zero height when a normalized coordinate omits height', () => {
    const coordinate = { longitude: -0.1276, latitude: 51.5072 }

    expect(
      Cartesian3.equals(
        coordinateToCartesian3(coordinate),
        Cartesian3.fromDegrees(-0.1276, 51.5072, 0),
      ),
    ).toBe(true)
  })

  it('builds a sampled property resolved by timestamp', () => {
    const firstTime = Date.parse('2026-08-24T12:00:00Z')
    const secondTime = Date.parse('2026-08-24T12:00:10Z')
    const samples = [
      { time: firstTime, longitude: 139.7, latitude: 35.6 },
      { time: secondTime, longitude: 139.8, latitude: 35.7, height: 10 },
    ]

    const property = samplesToPositionProperty(samples)

    expect(
      Cartesian3.equals(
        property.getValue(timestampToJulianDate(firstTime)),
        coordinateToCartesian3(samples[0]!),
      ),
    ).toBe(true)
    expect(
      Cartesian3.equals(
        property.getValue(timestampToJulianDate(secondTime)),
        coordinateToCartesian3(samples[1]!),
      ),
    ).toBe(true)
  })

  it.each([
    () => timestampToJulianDate(Number.NaN),
    () => coordinateToCartesian3({ longitude: Infinity, latitude: 0 }),
  ])('rejects non-finite domain values', (convert) => {
    expect(convert).toThrow(RangeError)
  })

  it('derives entity availability from normalized sample timestamps', () => {
    expect(getFeatureTimeRange(movingFeature)).toEqual({
      startTime: movingFeature.temporalGeometry.segments[0]!.samples[0]!.time,
      endTime: movingFeature.temporalGeometry.segments[0]!.samples[1]!.time,
    })

    const entity = movingFeatureToEntity(movingFeature)
    const interval = entity.availability!.get(0)
    if (!interval) throw new Error('Expected entity availability interval')

    expect(entity.id).toBe('vehicle-1--geometry--1')
    expect(entity.position).toBeDefined()
    expect(entity.point).toBeDefined()
    expect(entity.path).toBeDefined()
    expect(
      JulianDate.equals(
        interval.start,
        timestampToJulianDate(
          movingFeature.temporalGeometry.segments[0]!.samples[0]!.time,
        ),
      ),
    ).toBe(true)
    expect(
      JulianDate.equals(
        interval.stop,
        timestampToJulianDate(
          movingFeature.temporalGeometry.segments[0]!.samples[1]!.time,
        ),
      ),
    ).toBe(true)
  })

  it('maps every temporal geometry segment to a separate stable entity', () => {
    const multiSegmentFeature: MovingFeature = {
      ...movingFeature,
      temporalGeometry: {
        segments: Array.from({ length: 5 }, (_, index) => ({
          ...movingFeature.temporalGeometry.segments[0]!,
          type: 'MovingPoint' as const,
          id: `tg-${index + 1}`,
          samples: [
            {
              time: index * 20 * 60_000,
              longitude: index,
              latitude: index,
            },
            {
              time: (index * 20 + 5) * 60_000,
              longitude: index + 1,
              latitude: index + 1,
            },
          ],
        })),
      },
    }

    const entities = movingFeatureToEntities(multiSegmentFeature, {
      selected: true,
    })

    const trajectories = entities.filter((entity) =>
      String(entity.id).endsWith('--trajectory'),
    )
    const positions = entities.filter((entity) =>
      String(entity.id).endsWith('--position'),
    )

    expect(trajectories.map(({ id }) => id)).toEqual([
      'vehicle-1--geometry--tg-1--trajectory',
      'vehicle-1--geometry--tg-2--trajectory',
      'vehicle-1--geometry--tg-3--trajectory',
      'vehicle-1--geometry--tg-4--trajectory',
      'vehicle-1--geometry--tg-5--trajectory',
    ])
    expect(trajectories).toHaveLength(5)
    expect(
      trajectories.every((entity) => entity.availability === undefined),
    ).toBe(true)
    expect(trajectories.every((entity) => entity.polyline !== undefined)).toBe(
      true,
    )
    expect(positions).toHaveLength(5)
    expect(positions.every((entity) => entity.availability !== undefined)).toBe(
      true,
    )
    expect(positions.every((entity) => entity.polyline === undefined)).toBe(
      true,
    )
    expect(positions[0]?.availability?.get(0)?.stop).not.toEqual(
      positions[1]?.availability?.get(0)?.start,
    )

    const withinSecondSegment = timestampToJulianDate(22 * 60_000)
    expect(
      positions.map((entity) => entity.position?.getValue(withinSecondSegment)),
    ).toEqual([
      undefined,
      expect.any(Cartesian3),
      undefined,
      undefined,
      undefined,
    ])
  })

  it('gives the selected Feature a stronger style without changing its identity', () => {
    const normal = movingFeatureToEntities(movingFeature)[0]!
    const selected = movingFeatureToEntities(movingFeature, {
      selected: true,
    })
    const selectedTrajectory = selected.find((entity) =>
      String(entity.id).endsWith('--trajectory'),
    )!
    const selectedPosition = selected.find((entity) =>
      String(entity.id).endsWith('--position'),
    )!

    expect(String(selectedTrajectory.id)).toBe(`${normal.id}--trajectory`)
    expect(
      Number(selectedPosition.point?.pixelSize?.getValue()),
    ).toBeGreaterThan(Number(normal.point?.pixelSize?.getValue() ?? 0))
    expect(
      Number(selectedTrajectory.polyline?.width?.getValue()),
    ).toBeGreaterThan(Number(normal.path?.width?.getValue() ?? 0))
  })

  it('renders the current MovingLineString as one stable dynamic polyline', () => {
    let currentTime = 5
    const lineFeature: MovingFeature = {
      ...movingFeature,
      id: 'line-1',
      temporalGeometry: {
        segments: [
          {
            type: 'MovingLineString',
            interpolation: 'Linear',
            samples: [
              {
                time: 0,
                positions: [
                  { longitude: 0, latitude: 0 },
                  { longitude: 10, latitude: 10, height: 10 },
                ],
              },
              {
                time: 10,
                positions: [
                  { longitude: 10, latitude: 10 },
                  { longitude: 20, latitude: 20, height: 20 },
                ],
              },
            ],
          },
        ],
      },
    }

    const entity = movingFeatureToEntities(lineFeature, {
      getCurrentTime: () => currentTime,
    })[0]!
    const positions: unknown = entity.polyline?.positions?.getValue(
      timestampToJulianDate(currentTime),
    )
    expect(Array.isArray(positions)).toBe(true)
    if (!Array.isArray(positions)) return
    expect(positions).toHaveLength(2)
    expect(
      Cartesian3.equals(
        positions[0] as Cartesian3,
        Cartesian3.fromDegrees(5, 5, 0),
      ),
    ).toBe(true)

    currentTime = 20
    expect(
      entity.polyline?.positions?.getValue(timestampToJulianDate(currentTime)),
    ).toBeUndefined()
    expect(movingFeatureToEntities(lineFeature)).toHaveLength(1)
  })

  it('rejects MovingPoint geometry without samples', () => {
    const emptyFeature: MovingFeature = {
      ...movingFeature,
      temporalGeometry: {
        segments: [
          { ...movingFeature.temporalGeometry.segments[0]!, samples: [] },
        ],
      },
    }

    expect(() => movingFeatureToEntity(emptyFeature)).toThrow(RangeError)
  })
})
