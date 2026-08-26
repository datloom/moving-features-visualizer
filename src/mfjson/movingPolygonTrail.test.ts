import { describe, expect, it } from 'vitest'

import {
  buildMovingPolygonBoundaryPaths,
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

  it.each(['Discrete', 'Step'] as const)(
    'does not imply spatial vertex travel for %s',
    (interpolation) => {
      expect(
        buildMovingPolygonBoundaryPaths(polygon(interpolation, [0, 10])),
      ).toEqual([])
    },
  )

  it('builds corresponding Linear boundary vertex paths', () => {
    const paths = buildMovingPolygonBoundaryPaths(polygon('Linear', [0, 10]))
    expect(paths).toHaveLength(3)
    expect(paths[0]?.positions.map(({ longitude }) => longitude)).toEqual([
      0, 2.5, 5, 7.5, 10,
    ])
  })

  it('uses nonlinear Quadratic and Cubic evaluator coordinates', () => {
    const quadratic = buildMovingPolygonBoundaryPaths(
      polygon('Quadratic', [0, 10, 0]),
    )[0]
    const cubic = buildMovingPolygonBoundaryPaths(
      polygon('Cubic', [0, 10, 0, 20]),
    )[0]
    expect(quadratic?.positions[6]?.longitude).toBe(10)
    expect(cubic?.positions[6]?.longitude).toBe(4.375)
  })

  it('builds paths for exterior and interior ring vertices', () => {
    const segment = polygon('Linear', [0, 10])
    const withHole: MovingPolygon = {
      ...segment,
      samples: segment.samples.map((sample) => ({
        ...sample,
        rings: [
          ...sample.rings,
          [
            { longitude: sample.rings[0]![0]!.longitude + 0.5, latitude: 0.5 },
            { longitude: sample.rings[0]![0]!.longitude + 1, latitude: 0.5 },
            { longitude: sample.rings[0]![0]!.longitude + 0.5, latitude: 1 },
            { longitude: sample.rings[0]![0]!.longitude + 0.5, latitude: 0.5 },
          ],
        ],
      })),
    }
    const paths = buildMovingPolygonBoundaryPaths(withHole)
    expect(paths.filter(({ ringIndex }) => ringIndex === 0)).toHaveLength(3)
    expect(paths.filter(({ ringIndex }) => ringIndex === 1)).toHaveLength(3)
  })

  it('keeps source snapshots and skips paths for incompatible topology', () => {
    const segment = polygon('Linear', [0, 10])
    const incompatible: MovingPolygon = {
      ...segment,
      samples: [
        segment.samples[0]!,
        {
          ...segment.samples[1]!,
          rings: [
            [
              ...segment.samples[1]!.rings[0]!.slice(0, -1),
              { longitude: 11, latitude: 1 },
              segment.samples[1]!.rings[0]![0]!,
            ],
          ],
        },
      ],
    }
    expect(() => buildMovingPolygonBoundaryPaths(incompatible)).not.toThrow()
    expect(buildMovingPolygonBoundaryPaths(incompatible)).toEqual([])
    expect(buildMovingPolygonTrail(incompatible)).toHaveLength(2)
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
