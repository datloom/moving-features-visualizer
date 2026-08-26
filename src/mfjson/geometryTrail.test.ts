import { describe, expect, it } from 'vitest'

import {
  buildMovingLineStringSurfaces,
  buildMovingLineStringTrail,
  buildMovingPointPath,
  geometryTrailSampleTimes,
} from './geometryTrail'
import { geometryAtTime } from './geometryAtTime'
import type {
  GeometryInterpolation,
  MovingLineString,
  MovingPoint,
} from './types'

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
      expect(buildMovingPointPath(segment)).toEqual([])
    },
  )

  it.each(['Discrete', 'Step'] as const)(
    'uses only source LineString snapshots for %s',
    (interpolation) => {
      expect(
        buildMovingLineStringTrail(line(interpolation)).map(({ time }) => time),
      ).toEqual([0, 10])
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

  it.each(['Quadratic', 'Cubic'] as const)(
    'uses the %s evaluator for both MovingPoint geometry and path samples',
    (interpolation) => {
      const longitudes =
        interpolation === 'Quadratic' ? [0, 10, 0] : [0, 10, 0, 20]
      const segment: MovingPoint = {
        type: 'MovingPoint',
        interpolation,
        samples: longitudes.map((longitude, index) => ({
          time: index * 10,
          longitude,
          latitude: 0,
        })),
      }
      const times = geometryTrailSampleTimes(segment)
      const sampleIndex = times.indexOf(15)
      const geometry = geometryAtTime(segment, 15)
      const path = buildMovingPointPath(segment)
      expect(sampleIndex).toBeGreaterThanOrEqual(0)
      expect(geometry?.type).toBe('MovingPoint')
      expect(path[sampleIndex]?.longitude).toBeCloseTo(
        geometry?.type === 'MovingPoint' ? geometry.position.longitude : NaN,
      )
      expect(path[sampleIndex]?.longitude).not.toBeCloseTo(5)
    },
  )

  it.each(['Quadratic', 'Cubic'] as const)(
    'uses the %s evaluator for both MovingLineString geometry and trail vertices',
    (interpolation: GeometryInterpolation) => {
      const longitudes =
        interpolation === 'Quadratic' ? [0, 10, 0] : [0, 10, 0, 20]
      const segment: MovingLineString = {
        type: 'MovingLineString',
        interpolation,
        samples: longitudes.map((longitude, index) => ({
          time: index * 10,
          positions: [
            { longitude, latitude: 0 },
            { longitude: longitude + 2, latitude: 2 },
          ],
        })),
      }
      const geometry = geometryAtTime(segment, 15)
      const trailVertex = buildMovingLineStringTrail(segment).find(
        ({ time }) => time === 15,
      )?.positions[0]
      expect(geometry?.type).toBe('MovingLineString')
      expect(trailVertex?.longitude).toBeCloseTo(
        geometry?.type === 'MovingLineString'
          ? geometry.positions[0]!.longitude
          : NaN,
      )
      expect(trailVertex?.longitude).not.toBeCloseTo(5)
    },
  )

  it.each(['Discrete', 'Step'] as const)(
    'produces no connecting surface for %s',
    (interpolation) => {
      expect(buildMovingLineStringSurfaces(line(interpolation))).toEqual([])
    },
  )

  it('connects the same evaluated Linear slices used by the trail into swept quads', () => {
    const segment = line('Linear')
    const surfaces = buildMovingLineStringSurfaces(segment)
    const trail = buildMovingLineStringTrail(segment)
    // One quad per edge (1) between every pair of consecutive trail slices.
    expect(surfaces).toHaveLength(trail.length - 1)
    expect(surfaces[0]).toEqual({
      startTime: trail[0]!.time,
      endTime: trail[1]!.time,
      edgeIndex: 0,
      positions: [
        trail[0]!.positions[0],
        trail[1]!.positions[0],
        trail[1]!.positions[1],
        trail[0]!.positions[1],
      ],
    })
  })

  it.each(['Quadratic', 'Cubic'] as const)(
    'uses the shared %s evaluator for swept-surface quads, not naive Linear motion',
    (interpolation: GeometryInterpolation) => {
      const longitudes =
        interpolation === 'Quadratic' ? [0, 10, 0] : [0, 10, 0, 20]
      const segment: MovingLineString = {
        type: 'MovingLineString',
        interpolation,
        samples: longitudes.map((longitude, index) => ({
          time: index * 10,
          positions: [
            { longitude, latitude: 0 },
            { longitude: longitude + 2, latitude: 2 },
          ],
        })),
      }
      const surfaces = buildMovingLineStringSurfaces(segment)
      const geometry = geometryAtTime(segment, 15)
      const quadTouchingT15 = surfaces.find(
        ({ startTime, endTime }) => startTime === 15 || endTime === 15,
      )!
      const vertexAtT15 =
        quadTouchingT15.startTime === 15
          ? quadTouchingT15.positions[0]
          : quadTouchingT15.positions[1]
      expect(geometry?.type).toBe('MovingLineString')
      expect(vertexAtT15?.longitude).toBeCloseTo(
        geometry?.type === 'MovingLineString'
          ? geometry.positions[0]!.longitude
          : NaN,
      )
      // A naive Linear sweep between the raw t=0/t=10 samples would place
      // this vertex at longitude 5; the nonlinear evaluator must not.
      expect(vertexAtT15?.longitude).not.toBeCloseTo(5)
    },
  )

  it('falls back to no surface for incompatible topology', () => {
    const incompatible: MovingLineString = {
      type: 'MovingLineString',
      interpolation: 'Linear',
      samples: [
        {
          time: 0,
          positions: [
            { longitude: 0, latitude: 0 },
            { longitude: 1, latitude: 1 },
          ],
        },
        { time: 10, positions: [{ longitude: 1, latitude: 1 }] },
      ],
    }
    expect(buildMovingLineStringSurfaces(incompatible)).toEqual([])
  })

  it('falls back to source LineString snapshots for incompatible topology', () => {
    const incompatible: MovingLineString = {
      type: 'MovingLineString',
      interpolation: 'Cubic',
      samples: [
        {
          time: 0,
          positions: [
            { longitude: 0, latitude: 0 },
            { longitude: 1, latitude: 1 },
          ],
        },
        { time: 10, positions: [{ longitude: 1, latitude: 1 }] },
        {
          time: 20,
          positions: [
            { longitude: 2, latitude: 2 },
            { longitude: 3, latitude: 3 },
          ],
        },
        {
          time: 30,
          positions: [
            { longitude: 3, latitude: 3 },
            { longitude: 4, latitude: 4 },
          ],
        },
      ],
    }
    expect(buildMovingLineStringTrail(incompatible)).toEqual(
      incompatible.samples,
    )
  })
})
