import { describe, expect, it } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'
import {
  generateTimeTicks,
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

describe('Space-Time transformation', () => {
  const extent = { minTime: 1_000, maxTime: 3_000 }

  it('normalizes minimum, midpoint, and maximum timestamps to visual height', () => {
    expect(timestampToVisualHeight(1_000, extent, 500)).toBe(0)
    expect(timestampToVisualHeight(2_000, extent, 500)).toBe(250)
    expect(timestampToVisualHeight(3_000, extent, 500)).toBe(500)
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
                  { longitude: offset, latitude: 0 },
                ],
                [
                  { longitude: 0.5 + offset, latitude: 0.5 },
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
