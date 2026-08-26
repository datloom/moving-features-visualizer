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
      [139.71, 35.61],
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

  it('accepts Stepwise as an alias for temporal geometry Step', () => {
    expect(
      validateMfJson({
        ...validFeature,
        temporalGeometry: {
          ...validFeature.temporalGeometry,
          interpolation: 'Stepwise',
        },
      }),
    ).toEqual({ valid: true, issues: [] })
  })

  it.each([null, [], 'invalid', 42])(
    'rejects a non-object root: %j',
    (input) => {
      expect(validateMfJson(input)).toMatchObject({
        valid: false,
        issues: [{ path: '$', code: 'invalid_type' }],
      })
    },
  )

  it('requires a supported temporal geometry', () => {
    const missing = validateMfJson({ type: 'Feature', id: 'missing' })
    const unsupported = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        ...validFeature.temporalGeometry,
        type: 'MovingMultiPolygon',
      },
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

  it('accepts compatible MovingLineString snapshots', () => {
    expect(
      validateMfJson({
        ...validFeature,
        temporalGeometry: {
          type: 'MovingLineString',
          interpolation: 'Linear',
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
        },
      }),
    ).toEqual({ valid: true, issues: [] })
  })

  it.each([
    ['Discrete', 1, true],
    ['Step', 1, false],
    ['Step', 2, true],
    ['Linear', 1, false],
    ['Linear', 2, true],
    ['Quadratic', 2, false],
    ['Quadratic', 3, true],
    ['Cubic', 3, false],
    ['Cubic', 4, true],
  ] as const)(
    'validates %s minimum sample count (%i)',
    (interpolation, count, valid) => {
      const datetimes = Array.from({ length: count }, (_, index) =>
        new Date(index * 1_000).toISOString(),
      )
      const result = validateMfJson({
        ...validFeature,
        temporalGeometry: {
          type: 'MovingPoint',
          interpolation,
          datetimes,
          coordinates: datetimes.map((_, index) => [index, index]),
        },
      })
      expect(result.valid).toBe(valid)
    },
  )

  it('rejects MovingLineString count and topology mismatches', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        type: 'MovingLineString',
        interpolation: 'Linear',
        datetimes: ['2026-08-25T00:00:00Z', '2026-08-25T00:01:00Z'],
        coordinates: [
          [
            [0, 0],
            [1, 1],
          ],
          [
            [0, 0],
            [1, 1],
            [2, 2],
          ],
          [[0, 0]],
        ],
      },
    })
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'count_mismatch' }),
        expect.objectContaining({
          path: '$.temporalGeometry.coordinates[2]',
          code: 'invalid_coordinate',
        }),
      ]),
    )
  })

  it('rejects incompatible MovingPolygon ring structure', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        type: 'MovingPolygon',
        interpolation: 'Linear',
        datetimes: ['2026-08-25T00:00:00Z', '2026-08-25T00:01:00Z'],
        coordinates: [
          [
            [
              [0, 0],
              [2, 0],
              [2, 2],
              [0, 0],
            ],
          ],
          [
            [
              [1, 0],
              [3, 0],
              [3, 2],
              [1, 2],
              [1, 0],
            ],
          ],
        ],
      },
    })
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: '$.temporalGeometry.coordinates[1]',
        code: 'count_mismatch',
      }),
    )
  })

  it('reports invalid and unordered datetimes', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalGeometry: {
        ...validFeature.temporalGeometry,
        datetimes: [
          '2024-01-01T00:01:00Z',
          'not-a-date',
          '2023-12-31T23:00:00Z',
        ],
        coordinates: [
          [0, 0],
          [1, 1],
          [2, 2],
        ],
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
        coordinates: [
          [181, -91],
          [0, 0],
        ],
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
          status: {
            type: 'Text',
            values: ['idle', 'moving'],
            interpolation: 'Linear',
          },
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

  it('accepts omitted temporal-property interpolation for Discrete defaults', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalProperties: [
        {
          datetimes: ['2024-01-01T00:00:00Z'],
          speed: { type: 'Measure', values: [10] },
          status: { type: 'Text', values: ['idle'] },
        },
      ],
    })

    expect(result).toEqual({ valid: true, issues: [] })
  })

  it.each([
    ['Measure', 'Discrete', [1]],
    ['Measure', 'Linear', [1.5]],
    ['Measure', 'Step', [2]],
    ['Measure', 'Regression', [1, 3]],
    ['Text', 'Discrete', ['idle']],
    ['Text', 'Step', ['moving']],
    ['IMAGE', 'Discrete', ['https://example.test/frame.png']],
    ['IMAGE', 'Step', ['data:image/png;base64,opaque']],
  ])('accepts %s + %s', (type, interpolation, values) => {
    expect(
      validateMfJson({
        ...validFeature,
        temporalProperties: [
          {
            datetimes: values.map((_, index) =>
              new Date(Date.UTC(2024, 0, 1, 0, index)).toISOString(),
            ),
            observed: { type, interpolation, values },
          },
        ],
      }),
    ).toEqual({ valid: true, issues: [] })
  })

  it('rejects Regression for Text and Regression Measure with one sample', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalProperties: [
        {
          datetimes: ['2024-01-01T00:00:00Z'],
          speed: {
            type: 'Measure',
            interpolation: 'Regression',
            values: [10],
          },
          status: {
            type: 'Text',
            interpolation: 'Regression',
            values: ['moving'],
          },
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
          path: '$.temporalProperties[0].status.interpolation',
          code: 'unsupported_value',
        }),
      ]),
    )
  })

  it.each([
    ['Measure', ['fast'], 'finite number'],
    ['Text', [42], 'string'],
    ['IMAGE', [42], 'string'],
  ])('rejects invalid %s values', (type, values, expected) => {
    const result = validateMfJson({
      ...validFeature,
      temporalProperties: [
        {
          datetimes: ['2024-01-01T00:00:00Z'],
          observed: { type, interpolation: 'Discrete', values },
        },
      ],
    })

    expect(result).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          path: '$.temporalProperties[0].observed.values[0]',
          code: 'invalid_value',
          expected,
        }),
      ],
    })
  })

  it.each(['Linear', 'Regression', 'Quadratic', 'Cubic'])(
    'rejects IMAGE + %s interpolation',
    (interpolation) => {
      const result = validateMfJson({
        ...validFeature,
        temporalProperties: [
          {
            datetimes: ['2024-01-01T00:00:00Z'],
            camera: {
              type: 'IMAGE',
              interpolation,
              values: ['https://example.test/frame.png'],
            },
          },
        ],
      })
      expect(result).toMatchObject({
        valid: false,
        issues: [
          expect.objectContaining({
            path: '$.temporalProperties[0].camera.interpolation',
            code: 'unsupported_value',
            expected: ['Discrete', 'Step'],
          }),
        ],
      })
    },
  )

  it.each([
    ['a plain string with no scheme', 'not-a-url'],
    ['an arbitrary word', 'camera-frame'],
    ['an unsupported scheme', 'ftp://example.test/frame.png'],
  ])('rejects an IMAGE value that is %s', (_description, value) => {
    const result = validateMfJson({
      ...validFeature,
      temporalProperties: [
        {
          datetimes: ['2024-01-01T00:00:00Z'],
          camera: { type: 'IMAGE', interpolation: 'Discrete', values: [value] },
        },
      ],
    })

    expect(result).toMatchObject({
      valid: false,
      issues: [
        expect.objectContaining({
          path: '$.temporalProperties[0].camera.values[0]',
          code: 'invalid_value',
          expected:
            'http(s) URL, data:image/... URL, or raw base64 image payload',
        }),
      ],
    })
  })

  it('rejects unordered temporal-property datetimes independently of geometry', () => {
    const result = validateMfJson({
      ...validFeature,
      temporalProperties: [
        {
          datetimes: ['2024-01-01T00:00:30Z', '2024-01-01T00:00:10Z'],
          speed: {
            type: 'Measure',
            values: [10, 12],
            interpolation: 'Linear',
          },
        },
      ],
    })

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        path: '$.temporalProperties[0].datetimes[1]',
        code: 'not_ordered',
      }),
    )
  })
})
