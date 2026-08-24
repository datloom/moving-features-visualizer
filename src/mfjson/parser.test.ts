import { describe, expect, it } from 'vitest'

import { parseMovingPoint, parseTemporalGeometryTrack } from './parser'

const featureWith = (temporalGeometry: unknown) => ({
  type: 'Feature',
  id: 'vehicle-1',
  temporalGeometry,
})

describe('parseTemporalGeometryTrack MovingLineString', () => {
  it('keeps each 2D/3D LineString snapshot intact', () => {
    const result = parseTemporalGeometryTrack(
      featureWith({
        type: 'MovingLineString',
        datetimes: ['2026-08-25T00:00:00Z', '2026-08-25T00:01:00Z'],
        coordinates: [
          [
            [139.7, 35.6, 10],
            [139.71, 35.61, 12],
          ],
          [
            [139.71, 35.6, 10],
            [139.72, 35.61, 13],
          ],
        ],
        interpolation: 'Linear',
      }),
    )

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.segments[0]).toMatchObject({
      type: 'MovingLineString',
      samples: [
        {
          time: Date.parse('2026-08-25T00:00:00Z'),
          positions: [
            { longitude: 139.7, latitude: 35.6, height: 10 },
            { longitude: 139.71, latitude: 35.61, height: 12 },
          ],
        },
        {
          time: Date.parse('2026-08-25T00:01:00Z'),
          positions: [
            { longitude: 139.71, latitude: 35.6, height: 10 },
            { longitude: 139.72, latitude: 35.61, height: 13 },
          ],
        },
      ],
    })
  })

  it('preserves absent height for 2D positions', () => {
    const result = parseTemporalGeometryTrack(
      featureWith({
        type: 'MovingLineString',
        datetimes: ['2026-08-25T00:00:00Z'],
        coordinates: [
          [
            [139.7, 35.6],
            [139.71, 35.61],
          ],
        ],
      }),
    )
    expect(result.success).toBe(true)
    if (!result.success) return
    const segment = result.data.segments[0]
    expect(segment?.type).toBe('MovingLineString')
    if (segment?.type !== 'MovingLineString') return
    expect(segment.samples[0]?.positions[0]).toEqual({
      longitude: 139.7,
      latitude: 35.6,
    })
  })
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

  it('rejects unordered geometry datetimes without constructing samples', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:01:00Z', '2026-08-21T10:00:00Z'],
        coordinates: [
          [139.7, 35.68],
          [139.71, 35.69],
        ],
      }),
    )

    expect(result).toMatchObject({
      success: false,
      issues: [
        {
          path: '$.temporalGeometry.datetimes[1]',
          code: 'not_ordered',
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

  it('defaults omitted geometry interpolation to Linear', () => {
    const result = parseMovingPoint(
      featureWith({
        type: 'MovingPoint',
        datetimes: ['2026-08-21T10:00:00Z'],
        coordinates: [[139.7, 35.68]],
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
        ],
      },
    })
  })
})
