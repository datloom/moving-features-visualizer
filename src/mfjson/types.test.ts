import { describe, expect, expectTypeOf, it } from 'vitest'

import type {
  MeasureTemporalProperty,
  MovingFeature,
  PositionSample,
  TemporalGeometry,
  TemporalPropertySample,
  TextTemporalProperty,
} from './types'

describe('Moving Feature domain model', () => {
  it('represents a normalized moving point with numeric timestamps', () => {
    const sample = {
      time: 1_700_000_000_000,
      longitude: 139.6917,
      latitude: 35.6895,
      height: 40,
    } satisfies PositionSample

    const geometry = {
      type: 'MovingPoint',
      interpolation: 'Linear',
      samples: [sample],
    } satisfies TemporalGeometry

    expect(sample.time).toBeTypeOf('number')
    expect(geometry.samples).toEqual([sample])
  })

  it('keeps measure and text property value types distinct', () => {
    const speed = {
      type: 'Measure',
      name: 'speed',
      unit: 'km/h',
      interpolation: 'Linear',
      samples: [{ time: 1_700_000_000_000, value: 42 }],
    } satisfies MeasureTemporalProperty

    const status = {
      type: 'Text',
      name: 'status',
      interpolation: 'Step',
      samples: [{ time: 1_700_000_000_000, value: 'moving' }],
    } satisfies TextTemporalProperty

    expectTypeOf(speed.samples[0]!).toMatchTypeOf<
      TemporalPropertySample<number>
    >()
    expectTypeOf(status.samples[0]!).toMatchTypeOf<
      TemporalPropertySample<string>
    >()
  })

  it('composes geometry and properties into a moving feature', () => {
    const feature = {
      id: 'vehicle-1',
      type: 'MovingFeature',
      temporalGeometry: {
        segments: [
          { type: 'MovingPoint', interpolation: 'Linear', samples: [] },
        ],
      },
      temporalProperties: [],
      properties: { label: 'Vehicle 1' },
    } satisfies MovingFeature

    expect(feature.id).toBe('vehicle-1')
    expect(feature.temporalGeometry.segments[0]?.type).toBe('MovingPoint')
  })
})
