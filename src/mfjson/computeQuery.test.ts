import { describe, expect, it } from 'vitest'

import {
  ALL_TEMPORAL_GEOMETRIES,
  COMPUTE_METRICS,
  getComputeGeometryOptions,
  getComputeTimeRange,
} from './computeQuery'
import type { MovingFeature } from './types'

const featureWithSegments = (
  segments: MovingFeature['temporalGeometry']['segments'],
): MovingFeature => ({
  id: 'mf-1',
  type: 'MovingFeature',
  temporalGeometry: { segments },
  temporalProperties: [],
  properties: {},
})

describe('COMPUTE_METRICS', () => {
  it('exposes exactly velocity, acceleration, and distance', () => {
    expect(COMPUTE_METRICS).toEqual(['velocity', 'acceleration', 'distance'])
  })
})

describe('getComputeGeometryOptions', () => {
  it('always includes "All" plus one entry per segment', () => {
    const feature = featureWithSegments([
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 0, longitude: 0, latitude: 0 },
          { time: 10, longitude: 1, latitude: 1 },
        ],
      },
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 100, longitude: 0, latitude: 0 },
          { time: 200, longitude: 1, latitude: 1 },
          { time: 300, longitude: 2, latitude: 2 },
        ],
      },
    ])
    const options = getComputeGeometryOptions(feature)
    expect(options).toHaveLength(3)
    expect(options[0]).toEqual({
      value: ALL_TEMPORAL_GEOMETRIES,
      label: 'All Temporal Geometries',
      disabled: false,
    })
  })

  it('enables a segment with a retained id and shows its type/sample count', () => {
    const feature = featureWithSegments([
      {
        id: 'tg-1',
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 0, longitude: 0, latitude: 0 },
          { time: 10, longitude: 1, latitude: 1 },
        ],
      },
    ])
    const [, option] = getComputeGeometryOptions(feature)
    expect(option).toEqual({
      value: 'tg-1',
      label: 'tg-1 · MovingPoint · 2 samples',
      disabled: false,
    })
  })

  it('disables a segment with no retained id instead of fabricating one', () => {
    const feature = featureWithSegments([
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 0, longitude: 0, latitude: 0 },
          { time: 10, longitude: 1, latitude: 1 },
        ],
      },
    ])
    const [, option] = getComputeGeometryOptions(feature)
    expect(option?.disabled).toBe(true)
    expect(option?.diagnostic).toBeDefined()
    expect(option?.value).not.toBe('')
  })
})

describe('getComputeTimeRange', () => {
  it('derives Start/End from the first and last sample of one geometry', () => {
    const feature = featureWithSegments([
      {
        id: 'tg-1',
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 1_000, longitude: 0, latitude: 0 },
          { time: 5_000, longitude: 1, latitude: 1 },
          { time: 9_000, longitude: 2, latitude: 2 },
        ],
      },
    ])
    expect(getComputeTimeRange(feature, 'tg-1')).toEqual({
      start: 1_000,
      end: 9_000,
    })
  })

  it('derives Start/End across all segments when "all" is selected', () => {
    const feature = featureWithSegments([
      {
        id: 'tg-1',
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 5_000, longitude: 0, latitude: 0 },
          { time: 9_000, longitude: 1, latitude: 1 },
        ],
      },
      {
        id: 'tg-2',
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 1_000, longitude: 0, latitude: 0 },
          { time: 20_000, longitude: 1, latitude: 1 },
        ],
      },
    ])
    expect(getComputeTimeRange(feature, ALL_TEMPORAL_GEOMETRIES)).toEqual({
      start: 1_000,
      end: 20_000,
    })
  })

  it('returns undefined when there is no sample data to derive a range from', () => {
    const feature = featureWithSegments([])
    expect(
      getComputeTimeRange(feature, ALL_TEMPORAL_GEOMETRIES),
    ).toBeUndefined()
  })
})
