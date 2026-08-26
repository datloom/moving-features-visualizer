import { describe, expect, it } from 'vitest'

import { geometryAtTime } from './geometryAtTime'
import {
  buildMovingPolygonBoundaryPaths,
  buildMovingPolygonSurfaces,
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

  it.each(['Discrete', 'Step'] as const)(
    'produces no connecting surface for %s',
    (interpolation) => {
      expect(
        buildMovingPolygonSurfaces(polygon(interpolation, [0, 10])),
      ).toEqual([])
    },
  )

  it('connects the same evaluated Linear slices used by the trail into swept quads', () => {
    const segment = polygon('Linear', [0, 10])
    const trail = buildMovingPolygonTrail(segment)
    const surfaces = buildMovingPolygonSurfaces(segment)
    // Triangle boundary (3 edges) per pair of consecutive trail slices.
    expect(surfaces).toHaveLength(3 * (trail.length - 1))
    expect(surfaces.every(({ ringIndex }) => ringIndex === 0)).toBe(true)
    const firstEdge = surfaces.find(
      ({ startTime, edgeIndex }) => startTime === trail[0]!.time && edgeIndex === 0,
    )!
    expect(firstEdge.positions[0]).toEqual(trail[0]!.rings[0]![0])
    expect(firstEdge.positions[1]).toEqual(trail[1]!.rings[0]![0])
  })

  it('uses nonlinear Quadratic/Cubic evaluated slices, not naive Linear motion', () => {
    const quadratic = polygon('Quadratic', [0, 10, 0])
    const surfaces = buildMovingPolygonSurfaces(quadratic)
    const geometry = geometryAtTime(quadratic, 15)
    const quadTouchingT15 = surfaces.find(
      ({ startTime, endTime }) => startTime === 15 || endTime === 15,
    )!
    const vertexAtT15 =
      quadTouchingT15.startTime === 15
        ? quadTouchingT15.positions[0]
        : quadTouchingT15.positions[1]
    expect(geometry?.type).toBe('MovingPolygon')
    expect(vertexAtT15?.longitude).toBeCloseTo(
      geometry?.type === 'MovingPolygon' ? geometry.rings[0]![0]!.longitude : NaN,
    )
    // A naive Linear sweep between the raw t=0/t=10 samples would place
    // this vertex at longitude 5; the nonlinear evaluator must not.
    expect(vertexAtT15?.longitude).not.toBeCloseTo(5)
  })

  it('produces independent swept quads per ring for polygons with holes', () => {
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
    const surfaces = buildMovingPolygonSurfaces(withHole)
    const trail = buildMovingPolygonTrail(withHole)
    const edgesPerRing = 3 * (trail.length - 1)
    expect(surfaces.filter(({ ringIndex }) => ringIndex === 0)).toHaveLength(
      edgesPerRing,
    )
    expect(surfaces.filter(({ ringIndex }) => ringIndex === 1)).toHaveLength(
      edgesPerRing,
    )
  })

  it('falls back to no surface for incompatible topology', () => {
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
    expect(buildMovingPolygonSurfaces(incompatible)).toEqual([])
  })

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

describe('Time Query window integration', () => {
  it('clips the Polygon trail to the window using evaluated boundaries', () => {
    const segment = polygon('Linear', [0, 10, 20])
    const trail = buildMovingPolygonTrail(segment, {
      window: { start: 5, end: 15 },
    })
    expect(trail[0]!.time).toBe(5)
    expect(trail.at(-1)!.time).toBe(15)
    expect(trail.every(({ time }) => time >= 5 && time <= 15)).toBe(true)
  })

  it('omits the trail entirely when the window misses the segment', () => {
    const segment = polygon('Linear', [0, 10])
    expect(
      buildMovingPolygonTrail(segment, {
        window: { start: 100, end: 200 },
      }),
    ).toEqual([])
  })

  it('clips a topologically-incompatible Polygon trail by raw sample time', () => {
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
    expect(
      buildMovingPolygonTrail(incompatible, {
        window: { start: 5, end: 20 },
      }).map(({ time }) => time),
    ).toEqual([10])
  })

  it('clips Polygon swept surfaces to the window', () => {
    const segment = polygon('Linear', [0, 10, 20])
    const surfaces = buildMovingPolygonSurfaces(segment, {
      window: { start: 5, end: 15 },
    })
    expect(surfaces.length).toBeGreaterThan(0)
    expect(
      surfaces.every(
        ({ startTime, endTime }) => startTime >= 5 && endTime <= 15,
      ),
    ).toBe(true)
  })

  it('clips Polygon boundary vertex paths to the window', () => {
    const window = { start: 5, end: 15 }
    const segment = polygon('Linear', [0, 10, 20])
    const trail = buildMovingPolygonTrail(segment, { window })
    const paths = buildMovingPolygonBoundaryPaths(segment, { window })
    expect(paths.length).toBeGreaterThan(0)
    // Each boundary vertex path has one position per windowed trail snapshot.
    expect(
      paths.every(({ positions }) => positions.length === trail.length),
    ).toBe(true)
  })

  it('uses the shared nonlinear evaluator at a windowed Polygon boundary', () => {
    const quadratic = polygon('Quadratic', [0, 10, 0])
    const trail = buildMovingPolygonTrail(quadratic, {
      window: { start: 15, end: 20 },
    })
    // The Quadratic evaluator at t=15 must differ from a naive Linear guess.
    expect(trail[0]?.rings[0]?.[0]?.longitude).not.toBeCloseTo(5)
  })
})
