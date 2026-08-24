import { describe, expect, it } from 'vitest'

import {
  buildMovingPolygonTrail,
  movingPolygonTrailSampleTimes,
} from './movingPolygonTrail'
import type { GeometryInterpolation, MovingPolygon } from './types'

const polygon = (
  interpolation: GeometryInterpolation,
  values: readonly number[],
): MovingPolygon => ({
  type: 'MovingPolygon',
  interpolation,
  samples: values.map((value, index) => ({
    time: index * 10,
    rings: [
      [
        { longitude: value, latitude: 0 },
        { longitude: value + 2, latitude: 0 },
        { longitude: value + 2, latitude: 2 },
        { longitude: value, latitude: 0 },
      ],
    ],
  })),
})

describe('MovingPolygon trail', () => {
  it('includes MotionCurve-evaluated intermediate Polygon snapshots', () => {
    const trail = buildMovingPolygonTrail(polygon('Linear', [0, 10]))
    expect(trail.map(({ time }) => time)).toContain(5)
    expect(trail.find(({ time }) => time === 5)?.rings[0]?.[0]).toEqual({
      longitude: 5,
      latitude: 0,
    })
  })

  it('uses Cubic rather than Linear coordinates for nonlinear snapshots', () => {
    const trail = buildMovingPolygonTrail(polygon('Cubic', [0, 10, 0, 20]))
    expect(trail.find(({ time }) => time === 15)?.rings[0]?.[0]?.longitude).toBe(
      4.375,
    )
  })

  it('uses only source states for Discrete and Step trails', () => {
    expect(movingPolygonTrailSampleTimes(polygon('Discrete', [0, 10]))).toEqual([
      0, 10,
    ])
    expect(movingPolygonTrailSampleTimes(polygon('Step', [0, 10]))).toEqual([
      0, 10,
    ])
  })

  it('samples segments independently without filling temporal gaps', () => {
    const first = polygon('Linear', [0, 10])
    const second: MovingPolygon = {
      ...first,
      samples: first.samples.map((sample) => ({
        ...sample,
        time: sample.time + 30,
      })),
    }
    const times = [
      ...movingPolygonTrailSampleTimes(first),
      ...movingPolygonTrailSampleTimes(second),
    ]
    expect(times.some((time) => time > 10 && time < 30)).toBe(false)
  })
})
