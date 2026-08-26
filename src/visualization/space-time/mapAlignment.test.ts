import { describe, expect, it } from 'vitest'

import {
  buildMovingLineStringSurfaces,
  buildMovingLineStringTrail,
} from '../../mfjson/geometryTrail'
import {
  buildMovingPolygonSurfaces,
  buildMovingPolygonTrail,
} from '../../mfjson/movingPolygonTrail'
import type {
  GeometryInterpolation,
  MovingLineString,
  MovingPolygon,
} from '../../mfjson/types'
import { getSpaceTimeGeometryAtTime } from './transform'

/**
 * The map (real altitude) and Space-Time (temporal height) views must place
 * identical planar (longitude/latitude) geometry for MovingLineString and
 * MovingPolygon; only the vertical coordinate is view-specific. These tests
 * prove both views consume the same evaluated slices from the shared
 * interpolation evaluator, for every non-Discrete/Step interpolation.
 */

const lineSegment = (interpolation: GeometryInterpolation): MovingLineString => {
  const longitudes =
    interpolation === 'Quadratic'
      ? [0, 10, 0]
      : interpolation === 'Cubic'
        ? [0, 10, 0, 20]
        : [0, 10]
  return {
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
}

const polygonSegment = (interpolation: GeometryInterpolation): MovingPolygon => {
  const offsets =
    interpolation === 'Quadratic'
      ? [0, 10, 0]
      : interpolation === 'Cubic'
        ? [0, 10, 0, 20]
        : [0, 10]
  return {
    type: 'MovingPolygon',
    interpolation,
    samples: offsets.map((offset, index) => ({
      time: index * 10,
      rings: [
        [
          { longitude: offset, latitude: 0 },
          { longitude: offset + 2, latitude: 0 },
          { longitude: offset + 2, latitude: 2 },
          { longitude: offset, latitude: 0 },
        ],
      ],
    })),
  }
}

const extent = { minTime: 0, maxTime: 100 }

describe('map/space-time path alignment', () => {
  it.each(['Linear', 'Quadratic', 'Cubic'] as const)(
    'uses the same evaluated MovingLineString slice longitudes/latitudes for %s',
    (interpolation) => {
      const segment = lineSegment(interpolation)
      const mapTrail = buildMovingLineStringTrail(segment)
      expect(mapTrail.length).toBeGreaterThan(2)
      for (const snapshot of mapTrail) {
        const spaceTime = getSpaceTimeGeometryAtTime(
          segment,
          snapshot.time,
          extent,
        )
        expect(spaceTime?.type).toBe('MovingLineString')
        if (spaceTime?.type !== 'MovingLineString') continue
        expect(
          spaceTime.positions.map(({ longitude, latitude }) => ({
            longitude,
            latitude,
          })),
        ).toEqual(
          snapshot.positions.map(({ longitude, latitude }) => ({
            longitude,
            latitude,
          })),
        )
      }
    },
  )

  it.each(['Linear', 'Quadratic', 'Cubic'] as const)(
    'connects the same planar swept-surface quads as Space-Time for MovingLineString %s',
    (interpolation) => {
      const segment = lineSegment(interpolation)
      const mapSurfaces = buildMovingLineStringSurfaces(segment)
      expect(mapSurfaces.length).toBeGreaterThan(0)
      for (const quad of mapSurfaces) {
        const lower = getSpaceTimeGeometryAtTime(segment, quad.startTime, extent)
        const upper = getSpaceTimeGeometryAtTime(segment, quad.endTime, extent)
        if (lower?.type !== 'MovingLineString' || upper?.type !== 'MovingLineString')
          throw new Error('expected MovingLineString evaluations')
        expect(quad.positions[0].longitude).toBeCloseTo(
          lower.positions[quad.edgeIndex]!.longitude,
        )
        expect(quad.positions[1].longitude).toBeCloseTo(
          upper.positions[quad.edgeIndex]!.longitude,
        )
      }
    },
  )

  it.each(['Linear', 'Quadratic', 'Cubic'] as const)(
    'uses the same evaluated MovingPolygon ring longitudes/latitudes for %s',
    (interpolation) => {
      const segment = polygonSegment(interpolation)
      const mapTrail = buildMovingPolygonTrail(segment)
      expect(mapTrail.length).toBeGreaterThan(2)
      for (const snapshot of mapTrail) {
        const spaceTime = getSpaceTimeGeometryAtTime(
          segment,
          snapshot.time,
          extent,
        )
        expect(spaceTime?.type).toBe('MovingPolygon')
        if (spaceTime?.type !== 'MovingPolygon') continue
        expect(
          spaceTime.rings.map((ring) =>
            ring.map(({ longitude, latitude }) => ({ longitude, latitude })),
          ),
        ).toEqual(
          snapshot.rings.map((ring) =>
            ring.map(({ longitude, latitude }) => ({ longitude, latitude })),
          ),
        )
      }
    },
  )

  it.each(['Linear', 'Quadratic', 'Cubic'] as const)(
    'connects the same planar swept-surface quads as Space-Time for MovingPolygon %s',
    (interpolation) => {
      const segment = polygonSegment(interpolation)
      const mapSurfaces = buildMovingPolygonSurfaces(segment)
      expect(mapSurfaces.length).toBeGreaterThan(0)
      for (const quad of mapSurfaces) {
        const lower = getSpaceTimeGeometryAtTime(segment, quad.startTime, extent)
        const upper = getSpaceTimeGeometryAtTime(segment, quad.endTime, extent)
        if (lower?.type !== 'MovingPolygon' || upper?.type !== 'MovingPolygon')
          throw new Error('expected MovingPolygon evaluations')
        expect(quad.positions[0].longitude).toBeCloseTo(
          lower.rings[quad.ringIndex]![quad.edgeIndex]!.longitude,
        )
      }
    },
  )
})
