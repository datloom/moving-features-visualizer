import { describe, expect, it } from 'vitest'

import type {
  GeometryInterpolation,
  MovingFeature,
  MovingPolygon,
} from '../../mfjson/types'
import {
  calculateAutoTimeAxisScale,
  generateTimeTicks,
  getSpaceTimeGeometryAtTime,
  getSpaceTimePositionAtTime,
  getTemporalExtent,
  resolveTemporalExtent,
  timestampToVisualHeight,
  transformSpaceTimeFeatures,
} from './transform'

const feature = (id: string, times: readonly number[][]): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: {
    segments: times.map((segment, segmentIndex) => ({
      type: 'MovingPoint',
      interpolation: 'Linear',
      samples: segment.map((time, index) => ({
        time,
        longitude: segmentIndex + index,
        latitude: segmentIndex - index,
        height: 999,
      })),
    })),
  },
  temporalProperties: [],
  properties: {},
})

const polygonSegment = (
  interpolation: GeometryInterpolation,
  secondRing: readonly {
    readonly longitude: number
    readonly latitude: number
  }[] = [
    { longitude: 1, latitude: 0 },
    { longitude: 2, latitude: 0 },
    { longitude: 2, latitude: 1 },
    { longitude: 1, latitude: 1 },
    { longitude: 1, latitude: 0 },
  ],
): MovingPolygon => ({
  type: 'MovingPolygon',
  interpolation,
  samples: [
    {
      time: 0,
      rings: [
        [
          { longitude: 0, latitude: 0 },
          { longitude: 1, latitude: 0 },
          { longitude: 1, latitude: 1 },
          { longitude: 0, latitude: 1 },
          { longitude: 0, latitude: 0 },
        ],
      ],
    },
    { time: 10, rings: [secondRing] },
  ],
})

const polygonFeature = (segment: MovingPolygon): MovingFeature => ({
  id: `polygon-${segment.interpolation}`,
  type: 'MovingFeature',
  temporalGeometry: { segments: [segment] },
  temporalProperties: [],
  properties: {},
})

describe('Space-Time transformation', () => {
  const extent = { minTime: 1_000, maxTime: 3_000 }

  it('normalizes minimum, midpoint, and maximum timestamps to visual height', () => {
    expect(timestampToVisualHeight(1_000, extent, 500)).toBe(0)
    expect(timestampToVisualHeight(2_000, extent, 500)).toBe(250)
    expect(timestampToVisualHeight(3_000, extent, 500)).toBe(500)
  })

  it('scales the complete axis while preserving irregular elapsed-time ratios', () => {
    const irregularExtent = { minTime: 0, maxTime: 7 * 60 * 60 * 1_000 }
    const oneHour = timestampToVisualHeight(
      60 * 60 * 1_000,
      irregularExtent,
      100,
      4,
    )
    const sevenHours = timestampToVisualHeight(
      irregularExtent.maxTime,
      irregularExtent,
      100,
      4,
    )
    expect(timestampToVisualHeight(0, irregularExtent, 100, 4)).toBe(0)
    expect(sevenHours).toBe(400)
    expect(oneHour).toBeCloseTo(400 / 7)
    expect(sevenHours - oneHour).toBeCloseTo(oneHour * 6)
  })

  it('keeps MovingPoint Auto scale conservative and expands a dense large Cubic Polygon', () => {
    expect(
      calculateAutoTimeAxisScale([feature('point', [[0, 1]])], {
        minTime: 0,
        maxTime: 1,
      }),
    ).toBe(1)

    const interval = 6 * 60 * 60 * 1_000
    const polygon: MovingFeature = {
      ...feature('typhoon-like', []),
      temporalGeometry: {
        segments: [
          {
            type: 'MovingPolygon',
            interpolation: 'Cubic',
            samples: Array.from({ length: 25 }, (_, index) => ({
              time: index * interval,
              rings: [
                [
                  { longitude: 130 + index * 0.1, latitude: 20 },
                  { longitude: 134 + index * 0.1, latitude: 20 },
                  { longitude: 134 + index * 0.1, latitude: 24 },
                  { longitude: 130 + index * 0.1, latitude: 20 },
                ],
              ],
            })),
          },
        ],
      },
    }
    expect(
      calculateAutoTimeAxisScale(
        [polygon],
        { minTime: 0, maxTime: 24 * interval },
        100_000,
      ),
    ).toBe(16)
    const transformed = transformSpaceTimeFeatures(
      [polygon],
      { minTime: 0, maxTime: 24 * interval },
      100_000,
      16,
    )[0]?.segments[0]
    expect(transformed?.type).toBe('MovingPolygon')
    if (transformed?.type !== 'MovingPolygon')
      throw new Error('Expected polygon')
    expect(
      transformed.surfaces.some(
        ({ endTime }) => endTime > 0 && endTime < interval,
      ),
    ).toBe(true)
    expect(transformed.slices.at(-1)?.rings[0]?.[0]).toMatchObject({
      longitude: 132.4,
      latitude: 20,
      visualHeight: 1_600_000,
    })
  })

  it('generates evenly spaced ticks including min and max', () => {
    const ticks = generateTimeTicks(extent, 5, 400)
    expect(ticks.map(({ time }) => time)).toEqual([
      1_000, 1_500, 2_000, 2_500, 3_000,
    ])
    expect(ticks.map(({ height }) => height)).toEqual([0, 100, 200, 300, 400])
    expect(ticks[0]).toMatchObject({ ratio: 0, time: 1_000, height: 0 })
    expect(ticks.at(-1)).toMatchObject({ ratio: 1, time: 3_000, height: 400 })
  })

  it('preserves multiple Features and geometry segments without coordinate height', () => {
    const features = [
      feature('one', [
        [1_000, 2_000],
        [2_500, 3_000],
      ]),
      feature('two', [[1_500]]),
    ]
    const transformed = transformSpaceTimeFeatures(features, extent, 600)
    expect(transformed.map(({ id }) => id)).toEqual(['one', 'two'])
    expect(transformed[0]?.segments).toHaveLength(2)
    const secondSegment = transformed[0]?.segments[1]
    expect(secondSegment?.type).toBe('MovingPoint')
    expect(
      secondSegment?.type === 'MovingPoint'
        ? secondSegment.points[1]
        : undefined,
    ).toEqual({
      time: 3_000,
      longitude: 2,
      latitude: 0,
      visualHeight: 600,
    })
  })

  it('derives extent across multiple Features and segments', () => {
    expect(
      getTemporalExtent([
        feature('one', [[2_000], [4_000]]),
        feature('two', [[1_000, 3_000]]),
      ]),
    ).toEqual({ minTime: 1_000, maxTime: 4_000 })
    expect(getTemporalExtent([])).toBeUndefined()
    expect(
      resolveTemporalExtent([feature('one', [[2_000, 4_000]])], {
        minTime: 1_000,
        maxTime: 5_000,
      }),
    ).toEqual({ minTime: 1_000, maxTime: 5_000 })
    expect(
      resolveTemporalExtent([feature('one', [[2_000, 4_000]])], {
        minTime: 0,
        maxTime: 0,
      }),
    ).toEqual({ minTime: 2_000, maxTime: 4_000 })
  })

  it('handles degenerate ranges and a single sample', () => {
    const degenerate = { minTime: 2_000, maxTime: 2_000 }
    expect(timestampToVisualHeight(2_000, degenerate, 500)).toBe(0)
    expect(generateTimeTicks(degenerate, 6, 500)).toHaveLength(1)
    const segment = transformSpaceTimeFeatures(
      [feature('single', [[2_000]])],
      degenerate,
    )[0]?.segments[0]
    expect(
      segment?.type === 'MovingPoint'
        ? segment.points[0]?.visualHeight
        : undefined,
    ).toBe(0)
  })

  it('preserves every LineString vertex on one temporal plane', () => {
    const line: MovingFeature = {
      ...feature('line', []),
      temporalGeometry: {
        segments: [
          {
            type: 'MovingLineString',
            interpolation: 'Discrete',
            samples: [
              {
                time: 2_000,
                positions: [
                  { longitude: 1, latitude: 2, height: 500 },
                  { longitude: 3, latitude: 4, height: 900 },
                ],
              },
            ],
          },
        ],
      },
    }
    const segment = transformSpaceTimeFeatures([line], extent, 400)[0]
      ?.segments[0]
    expect(segment?.type).toBe('MovingLineString')
    if (segment?.type !== 'MovingLineString') throw new Error('Expected line')
    expect(segment.slices[0]?.positions).toEqual([
      { longitude: 1, latitude: 2, visualHeight: 200 },
      { longitude: 3, latitude: 4, visualHeight: 200 },
    ])
  })

  it('preserves Polygon rings and samples continuous geometry through the evaluator', () => {
    const polygon: MovingFeature = {
      ...feature('polygon', []),
      temporalGeometry: {
        segments: [
          {
            type: 'MovingPolygon',
            interpolation: 'Linear',
            samples: [1_000, 3_000].map((time, offset) => ({
              time,
              rings: [
                [
                  { longitude: offset, latitude: 0 },
                  { longitude: 2 + offset, latitude: 0 },
                  { longitude: 2 + offset, latitude: 2 },
                  { longitude: offset, latitude: 2 },
                  { longitude: offset, latitude: 0 },
                ],
                [
                  { longitude: 0.5 + offset, latitude: 0.5 },
                  { longitude: 1 + offset, latitude: 0.5 },
                  { longitude: 0.5 + offset, latitude: 1 },
                  { longitude: 0.5 + offset, latitude: 0.5 },
                ],
              ],
            })),
          },
        ],
      },
    }
    const segment = transformSpaceTimeFeatures([polygon], extent, 400)[0]
      ?.segments[0]
    expect(segment?.type).toBe('MovingPolygon')
    if (segment?.type !== 'MovingPolygon') throw new Error('Expected polygon')
    expect(segment.slices).toHaveLength(5)
    expect(segment.slices[2]?.rings).toHaveLength(2)
    expect(segment.surfaces.some(({ ringIndex }) => ringIndex === 1)).toBe(true)
    expect(segment.slices[2]?.rings[0]?.[0]).toEqual({
      longitude: 0.5,
      latitude: 0,
      visualHeight: 200,
    })
    expect(
      segment.slices[2]?.rings
        .flat()
        .every(({ visualHeight }) => visualHeight === 200),
    ).toBe(true)
  })

  it('builds Linear temporal edge surfaces between evaluated Polygon slices', () => {
    const segment = transformSpaceTimeFeatures(
      [polygonFeature(polygonSegment('Linear'))],
      { minTime: 0, maxTime: 10 },
      100,
      4,
    )[0]?.segments[0]
    expect(segment?.type).toBe('MovingPolygon')
    if (segment?.type !== 'MovingPolygon') throw new Error('Expected polygon')
    expect(segment.slices).toHaveLength(5)
    expect(segment.surfaces).toHaveLength(16)
    expect(segment.surfaces[0]).toMatchObject({
      startTime: 0,
      endTime: 2.5,
      ringIndex: 0,
      edgeIndex: 0,
      positions: [
        { longitude: 0, latitude: 0, visualHeight: 0 },
        { longitude: 0.25, latitude: 0, visualHeight: 100 },
        { longitude: 1.25, latitude: 0, visualHeight: 100 },
        { longitude: 1, latitude: 0, visualHeight: 0 },
      ],
    })
  })

  it('builds Quadratic surfaces from nonlinear intermediate Polygon slices', () => {
    const segment = polygonSegment('Quadratic')
    const nonlinear: MovingPolygon = {
      ...segment,
      samples: [0, 10, 0].map((longitude, index) => ({
        time: index * 10,
        rings: segment.samples[0]!.rings.map((ring) =>
          ring.map((position) => ({
            ...position,
            longitude: position.longitude + longitude,
          })),
        ),
      })),
    }
    const transformed = transformSpaceTimeFeatures(
      [polygonFeature(nonlinear)],
      { minTime: 0, maxTime: 20 },
      100,
    )[0]?.segments[0]
    expect(transformed?.type).toBe('MovingPolygon')
    if (transformed?.type !== 'MovingPolygon') throw new Error('Expected polygon')
    expect(transformed.slices.find(({ time }) => time === 15)?.rings[0]?.[0])
      .toMatchObject({ longitude: 10, visualHeight: 75 })
    expect(
      transformed.surfaces.find(
        ({ startTime, endTime, edgeIndex }) =>
          startTime === 12.5 && endTime === 15 && edgeIndex === 0,
      )?.positions[1],
    ).toMatchObject({ longitude: 10, visualHeight: 75 })
  })

  it('builds Cubic surface quads from nonlinear intermediate Polygon slices', () => {
    const segment = polygonSegment('Cubic')
    const nonlinear: MovingPolygon = {
      ...segment,
      samples: [0, 10, 0, 20].map((longitude, index) => ({
        time: index * 10,
        rings: segment.samples[0]!.rings.map((ring) =>
          ring.map((position) => ({
            ...position,
            longitude: position.longitude + longitude,
          })),
        ),
      })),
    }
    const transformed = transformSpaceTimeFeatures(
      [polygonFeature(nonlinear)],
      { minTime: 0, maxTime: 30 },
      120,
    )[0]?.segments[0]
    expect(transformed?.type).toBe('MovingPolygon')
    if (transformed?.type !== 'MovingPolygon') throw new Error('Expected polygon')
    const surface = transformed.surfaces.find(
      ({ startTime, endTime, edgeIndex }) =>
        startTime === 12.5 && endTime === 15 && edgeIndex === 0,
    )
    expect(surface?.positions).toMatchObject([
      { visualHeight: 50 },
      { longitude: 4.375, visualHeight: 60 },
      { longitude: 5.375, visualHeight: 60 },
      { visualHeight: 50 },
    ])
  })

  it('uses vertical earlier-state surfaces for Step and none for Discrete', () => {
    const step = transformSpaceTimeFeatures(
      [polygonFeature(polygonSegment('Step'))],
      { minTime: 0, maxTime: 10 },
      100,
      4,
    )[0]?.segments[0]
    expect(step?.type).toBe('MovingPolygon')
    if (step?.type !== 'MovingPolygon') throw new Error('Expected polygon')
    expect(step.surfaces).toHaveLength(4)
    expect(step.surfaces[0]?.positions).toEqual([
      { longitude: 0, latitude: 0, visualHeight: 0 },
      { longitude: 0, latitude: 0, visualHeight: 400 },
      { longitude: 1, latitude: 0, visualHeight: 400 },
      { longitude: 1, latitude: 0, visualHeight: 0 },
    ])

    const discrete = transformSpaceTimeFeatures(
      [polygonFeature(polygonSegment('Discrete'))],
      { minTime: 0, maxTime: 10 },
    )[0]?.segments[0]
    expect(discrete?.type === 'MovingPolygon' ? discrete.surfaces : []).toEqual(
      [],
    )
  })

  it('keeps incompatible Polygon snapshots visible and skips temporal surfaces', () => {
    const incompatible = polygonSegment('Linear', [
      { longitude: 1, latitude: 0 },
      { longitude: 2, latitude: 0 },
      { longitude: 2.5, latitude: 0.5 },
      { longitude: 2, latitude: 1 },
      { longitude: 1, latitude: 1 },
      { longitude: 1, latitude: 0 },
    ])
    const segment = transformSpaceTimeFeatures([polygonFeature(incompatible)], {
      minTime: 0,
      maxTime: 10,
    })[0]?.segments[0]
    expect(segment?.type).toBe('MovingPolygon')
    if (segment?.type !== 'MovingPolygon') throw new Error('Expected polygon')
    expect(segment.slices).toHaveLength(2)
    expect(segment.surfaces).toEqual([])
    expect(
      getSpaceTimeGeometryAtTime(
        incompatible,
        5,
        { minTime: 0, maxTime: 10 },
      ),
    ).toBeUndefined()
  })

  it('keeps temporal segments independent across a gap', () => {
    const transformed = transformSpaceTimeFeatures(
      [
        feature('gapped', [
          [1_000, 1_500],
          [2_500, 3_000],
        ]),
      ],
      extent,
    )[0]!
    expect(transformed.segments).toHaveLength(2)
    expect(
      transformed.segments.every(
        (segment) =>
          segment.type === 'MovingPoint' && segment.paths.length === 1,
      ),
    ).toBe(true)
  })

  it('rejects invalid timestamps and interpolates current positions within segments', () => {
    expect(() => timestampToVisualHeight(Number.NaN, extent)).toThrow(
      RangeError,
    )
    expect(
      getSpaceTimePositionAtTime(
        feature('moving', [[1_000, 3_000]]),
        2_000,
        extent,
        500,
      ),
    ).toEqual({
      time: 2_000,
      longitude: 0.5,
      latitude: -0.5,
      visualHeight: 250,
    })
  })
})
