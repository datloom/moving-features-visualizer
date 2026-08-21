import { describe, expect, it } from 'vitest'

import { validateMfJson } from './validator'

const validFeature = {
  type: 'Feature',
  id: 'vehicle-1',
  temporalGeometry: {
    type: 'MovingPoint',
    datetimes: ['2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z'],
    coordinates: [
      [139.7, 35.6],
      [139.71, 35.61, 20],
    ],
  },
  temporalProperties: [
    {
      datetimes: ['2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z'],
      speed: {
        type: 'Measure',
        values: [10, 12],
        interpolation: 'Linear',
        unit: 'km/h',
      },
      status: {
        type: 'Text',
        values: ['idle', 'moving'],
        interpolation: 'Step',
      },
    },
  ],
}

describe('validateMfJson', () => {
  it('accepts a supported Moving Feature', () => {
    expect(validateMfJson(validFeature)).toEqual({ valid: true, issues: [] })
  })

  it.each([null, [], 'invalid', 42])('rejects a non-object root: %j', (input) => {
    expect(validateMfJson(input)).toMatchObject({
      valid: false,
      issues: [{ path: '$', code: 'invalid_type' }],
    })
  })

  it('requires a supported temporal geometry', () => {
    const missing = validateMfJson({ type: 'Feature', id: 'missing' })
    const unsupported = validateMfJson({
      ...validFeature,
      temporalGeometry: { ...validFeature.temporalGeometry, type: 'MovingLineString' },
    })

    expect(missing).toMatchObject({
      valid: false,
      issues: [
        {
          path: '$.temporalGeometry',
          code: 'required',
          featureId: 'missing',
        },
      ],
    })
    expect(unsupported.issues).toContainEqual(
      expect.objectContaining({
        path: '$.temporalGeometry.type',
        code: 'unsupported_value',
      }),
    )
  })

  it('reports invalid and unordered datetimes', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        ...validFeature.temporalGeometry,
        datetimes: ['2024-01-01T00:01:00Z', 'not-a-date', '2023-12-31T23:00:00Z'],
        coordinates: [[0, 0], [1, 1], [2, 2]],
      },
    })

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.temporalGeometry.datetimes[1]',
          code: 'invalid_datetime',
        }),
        expect.objectContaining({
          path: '$.temporalGeometry.datetimes[2]',
          code: 'not_ordered',
        }),
      ]),
    )
  })

  it('validates coordinate shape, ranges, and sample count', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        ...validFeature.temporalGeometry,
        coordinates: [[181, 91, 0, 4]],
      },
    })

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.temporalGeometry.coordinates[0]',
          code: 'invalid_coordinate',
        }),
        expect.objectContaining({
          path: '$.temporalGeometry',
          code: 'count_mismatch',
        }),
      ]),
    )
  })

  it('reports longitude and latitude outside valid ranges', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        ...validFeature.temporalGeometry,
        coordinates: [[181, -91], [0, 0]],
      },
    })

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.temporalGeometry.coordinates[0][0]',
          code: 'out_of_range',
        }),
        expect.objectContaining({
          path: '$.temporalGeometry.coordinates[0][1]',
          code: 'out_of_range',
        }),
      ]),
    )
  })

  it('validates temporal property structure, values, and aligned counts', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalProperties: [
        {
          datetimes: ['2024-01-01T00:00:00Z', '2024-01-01T00:01:00Z'],
          speed: { type: 'Measure', values: ['fast'], interpolation: 'Linear' },
          status: { type: 'Text', values: ['idle', 'moving'], interpolation: 'Linear' },
        },
      ],
    })

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: '$.temporalProperties[0].speed',
          code: 'count_mismatch',
        }),
        expect.objectContaining({
          path: '$.temporalProperties[0].speed.values[0]',
          code: 'invalid_value',
        }),
        expect.objectContaining({
          path: '$.temporalProperties[0].status.interpolation',
          code: 'unsupported_value',
        }),
      ]),
    )
  })
})
