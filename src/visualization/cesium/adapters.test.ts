import { Cartesian3, JulianDate } from 'cesium'
import { describe, expect, it } from 'vitest'

import {
  coordinateToCartesian3,
  getFeatureTimeRange,
  movingFeatureToEntity,
  samplesToPositionProperty,
  timestampToJulianDate,
} from './adapters'
import type { MovingFeature } from '../../mfjson/types'

const movingFeature: MovingFeature = {
  id: 'vehicle-1',
  type: 'MovingFeature',
  temporalGeometry: {
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
      startTime: movingFeature.temporalGeometry.samples[0]!.time,
      endTime: movingFeature.temporalGeometry.samples[1]!.time,
    })

    const entity = movingFeatureToEntity(movingFeature)
    const interval = entity.availability!.get(0)
    if (!interval) throw new Error('Expected entity availability interval')

    expect(entity.id).toBe('vehicle-1')
    expect(entity.position).toBeDefined()
    expect(entity.point).toBeDefined()
    expect(entity.path).toBeDefined()
    expect(
      JulianDate.equals(
        interval.start,
        timestampToJulianDate(movingFeature.temporalGeometry.samples[0]!.time),
      ),
    ).toBe(true)
    expect(
      JulianDate.equals(
        interval.stop,
        timestampToJulianDate(movingFeature.temporalGeometry.samples[1]!.time),
      ),
    ).toBe(true)
  })

  it('rejects MovingPoint geometry without samples', () => {
    const emptyFeature: MovingFeature = {
      ...movingFeature,
      temporalGeometry: { ...movingFeature.temporalGeometry, samples: [] },
    }

    expect(() => movingFeatureToEntity(emptyFeature)).toThrow(RangeError)
  })
})
