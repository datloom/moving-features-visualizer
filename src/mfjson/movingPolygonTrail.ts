import { geometryAtTime } from './geometryAtTime'
import {
  geometryTrailSampleTimes,
  MAX_GEOMETRY_TRAIL_SNAPSHOTS,
  POSITION_SURFACE_ADAPTER,
} from './geometryTrail'
import type { Position } from './motionCurve'
import { buildPolygonSweptQuads, type PolygonSweptQuad } from './sweptSurface'
import { windowedGeometrySampleTimes, type TemporalWindow } from './temporalWindow'
import type { MovingPolygon, Timestamp } from './types'

export interface MovingPolygonTrailSnapshot {
  readonly time: Timestamp
  readonly rings: readonly (readonly Position[])[]
}

export interface MovingPolygonBoundaryPath {
  readonly ringIndex: number
  readonly vertexIndex: number
  readonly positions: readonly Position[]
}

/** Optional Time Query window and snapshot cap shared by every trail/surface builder below. */
export interface MovingPolygonSelectionOptions {
  readonly maximum?: number
  readonly window?: TemporalWindow
}

export const MAX_POLYGON_TRAIL_SNAPSHOTS = MAX_GEOMETRY_TRAIL_SNAPSHOTS

export const movingPolygonTrailSampleTimes = (
  segment: MovingPolygon,
  options: MovingPolygonSelectionOptions = {},
): readonly Timestamp[] => {
  const maximum = options.maximum ?? MAX_POLYGON_TRAIL_SNAPSHOTS
  return options.window
    ? windowedGeometrySampleTimes(segment, options.window, maximum)
    : geometryTrailSampleTimes(segment, maximum)
}

const positionsEqual = (first: Position, second: Position): boolean =>
  first.longitude === second.longitude &&
  first.latitude === second.latitude &&
  first.height === second.height

const ringVertexCount = (ring: readonly Position[]): number =>
  ring.length > 1 && positionsEqual(ring[0]!, ring.at(-1)!)
    ? ring.length - 1
    : ring.length

/** Checks the exact vertex correspondence required by geometryAtTime(). */
export const movingPolygonTopologyCompatible = (
  segment: MovingPolygon,
): boolean => {
  const first = segment.samples[0]
  if (!first) return false
  if (
    first.rings.length === 0 ||
    first.rings.some(
      (ring) =>
        ringVertexCount(ring) < 3 ||
        ring.some(
          ({ longitude, latitude, height }) =>
            !Number.isFinite(longitude) ||
            !Number.isFinite(latitude) ||
            (height !== undefined && !Number.isFinite(height)),
        ),
    )
  )
    return false
  return segment.samples.slice(1).every(
    (sample) =>
      sample.rings.length === first.rings.length &&
      sample.rings.every(
        (ring, ringIndex) =>
          ring.length === first.rings[ringIndex]!.length &&
          ringVertexCount(ring) === ringVertexCount(first.rings[ringIndex]!) &&
          ring.every(
            ({ longitude, latitude, height }) =>
              Number.isFinite(longitude) &&
              Number.isFinite(latitude) &&
              (height === undefined || Number.isFinite(height)),
          ),
      ),
  )
}

export const buildMovingPolygonTrail = (
  segment: MovingPolygon,
  options: MovingPolygonSelectionOptions = {},
): readonly MovingPolygonTrailSnapshot[] => {
  if (!movingPolygonTopologyCompatible(segment)) {
    const { window } = options
    const samples = window
      ? segment.samples.filter(
          ({ time }) => time >= window.start && time <= window.end,
        )
      : segment.samples
    return samples.map(({ time, rings }) => ({ time, rings }))
  }
  return movingPolygonTrailSampleTimes(segment, options).flatMap((time) => {
    const evaluated = geometryAtTime(segment, time)
    return evaluated?.type === 'MovingPolygon'
      ? [{ time, rings: evaluated.rings }]
      : []
  })
}

/**
 * Connects corresponding boundary edges of consecutive evaluated Polygon
 * slices into swept-surface quads, mirroring the Space-Time temporal
 * surface for the 2D/3D map. Only defined for continuous interpolation with
 * compatible topology: Discrete has no connecting surface, and Step cannot
 * be swept without implying motion it doesn't have.
 */
export const buildMovingPolygonSurfaces = (
  segment: MovingPolygon,
  options: MovingPolygonSelectionOptions = {},
): readonly PolygonSweptQuad<Position>[] => {
  if (
    segment.interpolation === 'Discrete' ||
    segment.interpolation === 'Step' ||
    !movingPolygonTopologyCompatible(segment)
  )
    return []
  return buildPolygonSweptQuads(
    buildMovingPolygonTrail(segment, options),
    false,
    POSITION_SURFACE_ADAPTER,
  )
}

/** Transposes evaluated Polygon slices into one path per boundary vertex. */
export const buildMovingPolygonBoundaryPaths = (
  segment: MovingPolygon,
  options: MovingPolygonSelectionOptions = {},
): readonly MovingPolygonBoundaryPath[] => {
  if (
    segment.interpolation === 'Discrete' ||
    segment.interpolation === 'Step' ||
    !movingPolygonTopologyCompatible(segment)
  )
    return []
  const snapshots = buildMovingPolygonTrail(segment, options)
  const first = snapshots[0]
  if (!first) return []
  return first.rings.flatMap((ring, ringIndex) =>
    Array.from({ length: ringVertexCount(ring) }, (_, vertexIndex) => ({
      ringIndex,
      vertexIndex,
      positions: snapshots.map(
        (snapshot) => snapshot.rings[ringIndex]![vertexIndex]!,
      ),
    })),
  )
}
