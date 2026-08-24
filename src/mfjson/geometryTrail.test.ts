import { describe, expect, it } from 'vitest'

import {
  buildMovingLineStringTrail,
  buildMovingPointPath,
  geometryTrailSampleTimes,
} from './geometryTrail'
import type { MovingLineString, MovingPoint } from './types'

const point = (interpolation: 'Discrete' | 'Step' | 'Linear'): MovingPoint => ({
  type: 'MovingPoint',
  interpolation,
  samples: [
    { time: 0, longitude: 0, latitude: 0 },
    { time: 10, longitude: 10, latitude: 10 },
  ],
})

const line = (
  interpolation: 'Discrete' | 'Step' | 'Linear',
): MovingLineString => ({
  type: 'MovingLineString',
  interpolation,
  samples: [
    {
      time: 0,
      positions: [
        { longitude: 0, latitude: 0 },
        { longitude: 2, latitude: 2 },
      ],
    },
    {
      time: 10,
      positions: [
        { longitude: 10, latitude: 10 },
        { longitude: 12, latitude: 12 },
      ],
    },
  ],
})

describe('temporal geometry trail preparation', () => {
  it.each(['Discrete', 'Step'] as const)(
    'uses only MovingPoint source markers for %s',
    (interpolation) => {
      const segment = point(interpolation)
      expect(geometryTrailSampleTimes(segment)).toEqual([0, 10])
      expect(buildMovingPointPath(segment)).toEqual([
        { longitude: 0, latitude: 0 },
        { longitude: 10, latitude: 10 },
      ])
    },
  )

  it.each(['Discrete', 'Step'] as const)(
    'uses only source LineString snapshots for %s',
    (interpolation) => {
      expect(buildMovingLineStringTrail(line(interpolation)).map(({ time }) => time)).toEqual([
        0, 10,
      ])
    },
  )

  it('includes evaluated intermediate LineString snapshots for continuous curves', () => {
    const trail = buildMovingLineStringTrail(line('Linear'))
    expect(trail.map(({ time }) => time)).toContain(5)
    expect(trail.find(({ time }) => time === 5)?.positions[0]).toEqual({
      longitude: 5,
      latitude: 5,
    })
  })
})
