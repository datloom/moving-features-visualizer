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
    expect(transformed[0]?.segments[1]?.samples[1]).toEqual({
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
    expect(
      transformSpaceTimeFeatures([feature('single', [[2_000]])], degenerate)[0]
        ?.segments[0]?.samples[0]?.visualHeight,
    ).toBe(0)
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
