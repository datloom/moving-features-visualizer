import { describe, expect, it } from 'vitest'

import { parseMovingPoint } from './parser'

const featureWith = (temporalGeometry: unknown) => ({
  type: 'Feature',
  id: 'vehicle-1',
  temporalGeometry,
})

describe('parseMovingPoint', () => {
  it('normalizes a valid 2D MovingPoint', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z', '2026-08-21T10:01:00Z'],
        coordinates: [
          [139.7, 35.68],
          [139.71, 35.69],
        ],
      }),
    )

    expect(result).toEqual({
      success: true,
      data: {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          {
            time: Date.parse('2026-08-21T10:00:00Z'),
            longitude: 139.7,
            latitude: 35.68,
          },
          {
            time: Date.parse('2026-08-21T10:01:00Z'),
            longitude: 139.71,
            latitude: 35.69,
          },
        ],
      },
    })
  })

  it('normalizes a valid 3D MovingPoint with height', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z'],
        coordinates: [[139.7, 35.68, 10]],
      }),
    )

    expect(result).toMatchObject({
      success: true,
      data: {
        samples: [{ longitude: 139.7, latitude: 35.68, height: 10 }],
      },
    })
  })

  it('rejects malformed coordinates through validation', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z'],
        coordinates: [[139.7]],
      }),
    )

    expect(result).toMatchObject({
      success: false,
      issues: [
        {
          path: '$.temporalGeometry.coordinates[0]',
          code: 'invalid_coordinate',
        },
      ],
    })
  })

  it('rejects invalid datetimes', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['not-a-date'],
        coordinates: [[139.7, 35.68]],
      }),
    )

    expect(result).toMatchObject({
      success: false,
      issues: [
        {
          path: '$.temporalGeometry.datetimes[0]',
          code: 'invalid_datetime',
        },
      ],
    })
  })

  it('rejects coordinate and datetime count mismatches', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z', '2026-08-21T10:01:00Z'],
        coordinates: [[139.7, 35.68]],
      }),
    )

    expect(result).toMatchObject({
      success: false,
      issues: [
        {
          path: '$.temporalGeometry',
          code: 'count_mismatch',
        },
      ],
    })
  })

  it('preserves supported interpolation metadata', () => {
    const explicit = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z'],
        coordinates: [[139.7, 35.68]],
        interpolation: 'Linear',
      }),
    )
    const unsupported = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z'],
        coordinates: [[139.7, 35.68]],
        interpolation: 'Spline',
      }),
    )

    expect(explicit).toMatchObject({
      success: true,
      data: { interpolation: 'Linear' },
    })
    expect(unsupported).toMatchObject({
      success: false,
      issues: [
        {
          path: '$.temporalGeometry.interpolation',
          code: 'unsupported_value',
        },
      ],
    })
  })
})
