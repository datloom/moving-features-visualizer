import { describe, expect, it } from 'vitest'

import type { MovingFeature } from '../mfjson/types'
import { getDatasetTimeRange } from './datasetTimeRange'

const feature: MovingFeature = {
  id: 'range-test',
  type: 'MovingFeature',
  temporalGeometry: {
    type: 'MovingPoint',
    interpolation: 'Linear',
    samples: [
      { time: 200, longitude: 0, latitude: 0 },
      { time: 300, longitude: 1, latitude: 1 },
    ],
  },
  temporalProperties: [
    {
      type: 'Measure',
      name: 'Speed',
      interpolation: 'Step',
      samples: [
        { time: 100, value: 1 },
        { time: 400, value: 2 },
      ],
    },
  ],
  properties: {},
}

describe('getDatasetTimeRange', () => {
  it('uses geometry and property timestamps across all features', () => {
    const laterFeature: MovingFeature = {
      ...feature,
      id: 'later',
      temporalGeometry: {
        ...feature.temporalGeometry,
        samples: [{ time: 500, longitude: 2, latitude: 2 }],
      },
      temporalProperties: [],
    }

    expect(getDatasetTimeRange([feature, laterFeature])).toEqual({
      startTime: 100,
      endTime: 500,
    })
  })

  it('returns undefined for an empty dataset', () => {
    expect(getDatasetTimeRange([])).toBeUndefined()
  })
})
