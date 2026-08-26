import { describe, expect, it } from 'vitest'

import { normalizeTemporalProperties } from './normalizer'

const geometryDatetimes = [
  '2026-08-21T10:00:00Z',
  '2026-08-21T10:00:10Z',
  '2026-08-21T10:00:20Z',
]

const featureWith = (temporalProperties: unknown) => ({
  type: 'Feature',
  id: 'vehicle-1',
  temporalGeometry: {
    type: 'MovingPoint',
    datetimes: geometryDatetimes,
    coordinates: [
      [139.7, 35.68],
      [139.71, 35.69],
      [139.72, 35.7],
    ],
  },
  temporalProperties,
})

describe('normalizeTemporalProperties', () => {
  it('defaults omitted interpolation to Discrete and preserves Regression', () => {
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:03Z', '2026-08-21T10:00:08Z'],
          speed: { type: 'Measure', values: [10, 14] },
          trend: {
            type: 'Measure',
            values: [10, 14],
            interpolation: 'Regression',
          },
        },
      ]),
    )
    expect(result).toMatchObject({
      success: true,
      data: [
        { name: 'speed', interpolation: 'Discrete' },
        { name: 'trend', interpolation: 'Regression' },
      ],
    })
  })

  it('normalizes Measure samples and preserves unit, form, and interpolation', () => {
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:03Z', '2026-08-21T10:00:08Z'],
          speed: {
            type: 'Measure',
            values: [10, 14],
            interpolation: 'Linear',
            unit: 'km/h',
            form: 'https://example.test/speed',
          },
        },
      ]),
    )

    expect(result).toEqual({
      success: true,
      data: [
        {
          name: 'speed',
          type: 'Measure',
          interpolation: 'Linear',
          unit: 'km/h',
          form: 'https://example.test/speed',
          samples: [
            { time: Date.parse('2026-08-21T10:00:03Z'), value: 10 },
            { time: Date.parse('2026-08-21T10:00:08Z'), value: 14 },
          ],
        },
      ],
    })
  })

  it('preserves Text values as categorical states', () => {
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:01Z', '2026-08-21T10:00:09Z'],
          status: {
            type: 'Text',
            values: ['idle', 'moving'],
            interpolation: 'Step',
            form: 'https://example.test/status',
          },
        },
      ]),
    )

    expect(result).toMatchObject({
      success: true,
      data: [
        {
          name: 'status',
          type: 'Text',
          interpolation: 'Step',
          samples: [{ value: 'idle' }, { value: 'moving' }],
        },
      ],
    })
  })

  it.each(['Discrete', 'Step'] as const)(
    'normalizes opaque IMAGE values with %s interpolation',
    (interpolation) => {
      const value = 'data:image/png;base64,untrusted-payload'
      const result = normalizeTemporalProperties(
        featureWith([
          {
            datetimes: ['2026-08-21T10:00:01Z'],
            camera: {
              type: 'IMAGE',
              values: [value],
              interpolation,
              form: 'https://example.test/camera',
            },
          },
        ]),
      )

      expect(result).toEqual({
        success: true,
        data: [
          {
            name: 'camera',
            type: 'Image',
            interpolation,
            form: 'https://example.test/camera',
            samples: [{ time: Date.parse('2026-08-21T10:00:01Z'), value }],
          },
        ],
      })
    },
  )

  it('converts raw base64 Image values to data URLs, one flat sample per datetime', () => {
    const first = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'
    const second = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA8'
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:01Z', '2026-08-21T10:00:02Z'],
          camera: {
            type: 'IMAGE',
            values: [first, second],
            interpolation: 'Discrete',
          },
        },
      ]),
    )

    expect(result).toEqual({
      success: true,
      data: [
        {
          name: 'camera',
          type: 'Image',
          interpolation: 'Discrete',
          form: undefined,
          samples: [
            {
              time: Date.parse('2026-08-21T10:00:01Z'),
              value: `data:image/gif;base64,${first}`,
            },
            {
              time: Date.parse('2026-08-21T10:00:02Z'),
              value: `data:image/gif;base64,${second}`,
            },
          ],
        },
      ],
    })
  })

  it('normalizes multiple properties from one group', () => {
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:03Z'],
          speed: { type: 'Measure', values: [10], interpolation: 'Discrete' },
          status: { type: 'Text', values: ['idle'], interpolation: 'Discrete' },
        },
      ]),
    )

    expect(result).toEqual({
      success: true,
      data: [
        {
          type: 'Measure',
          name: 'speed',
          interpolation: 'Discrete',
          unit: undefined,
          form: undefined,
          samples: [{ time: Date.parse('2026-08-21T10:00:03Z'), value: 10 }],
        },
        {
          type: 'Text',
          name: 'status',
          interpolation: 'Discrete',
          form: undefined,
          samples: [
            { time: Date.parse('2026-08-21T10:00:03Z'), value: 'idle' },
          ],
        },
      ],
    })
  })

  it('normalizes multiple groups with their independent timestamps', () => {
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:03Z'],
          speed: { type: 'Measure', values: [10], interpolation: 'Linear' },
        },
        {
          datetimes: ['2026-08-21T10:00:17Z'],
          status: { type: 'Text', values: ['moving'], interpolation: 'Step' },
        },
      ]),
    )

    expect(result).toEqual({
      success: true,
      data: [
        {
          type: 'Measure',
          name: 'speed',
          interpolation: 'Linear',
          unit: undefined,
          form: undefined,
          samples: [{ time: Date.parse('2026-08-21T10:00:03Z'), value: 10 }],
        },
        {
          type: 'Text',
          name: 'status',
          interpolation: 'Step',
          form: undefined,
          samples: [
            { time: Date.parse('2026-08-21T10:00:17Z'), value: 'moving' },
          ],
        },
      ],
    })
  })

  it('does not align property samples to geometry timestamps', () => {
    const propertyDatetimes = [
      '2026-08-21T10:00:03Z',
      '2026-08-21T10:00:08Z',
      '2026-08-21T10:00:17Z',
    ]
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: propertyDatetimes,
          speed: {
            type: 'Measure',
            values: [10, 12, 14],
            interpolation: 'Linear',
          },
        },
      ]),
    )

    if (!result.success) throw new Error('Expected normalization to succeed')

    expect(result.data[0]?.samples.map(({ time }) => time)).toEqual(
      propertyDatetimes.map(Date.parse),
    )
    expect(result.data[0]?.samples[0]?.time).not.toBe(
      Date.parse(geometryDatetimes[0]!),
    )
  })

  it('rejects mismatched property datetime and value lengths', () => {
    const result = normalizeTemporalProperties(
      featureWith([
        {
          datetimes: ['2026-08-21T10:00:03Z', '2026-08-21T10:00:08Z'],
          speed: { type: 'Measure', values: [10], interpolation: 'Linear' },
        },
      ]),
    )

    expect(result).toMatchObject({
      success: false,
      issues: [
        {
          path: '$.temporalProperties[0].speed',
          code: 'count_mismatch',
        },
      ],
    })
  })
})
