import { geometryAtTime } from './geometryAtTime'
import type { Position } from './motionCurve'
import {
  buildLineStringSweptQuads,
  type SweptQuad,
  type SweptSurfaceAdapter,
} from './sweptSurface'
import type {
  MovingLineString,
  MovingPoint,
  TemporalGeometry,
  Timestamp,
} from './types'

/**
 * Shared vertical-component accessor for the swept-surface topology in
 * `sweptSurface.ts`: `Position.height` is real, optional altitude (unlike
 * Space-Time's always-present temporal height), so positions without an
 * altitude stay flat rather than gaining a synthetic one.
 */
export const POSITION_SURFACE_ADAPTER: SweptSurfaceAdapter<Position> = {
  heightOf: (position) => position.height ?? 0,
  withHeight: (position, height) =>
    position.height === undefined ? position : { ...position, height },
}

const DEFAULT_SUBDIVISIONS = 4
export const MAX_GEOMETRY_TRAIL_SNAPSHOTS = 64

const boundedSelection = (
  times: readonly Timestamp[],
  maximum: number,
): readonly Timestamp[] => {
  if (times.length <= maximum) return times
  return Array.from(
    { length: maximum },
    (_, index) =>
      times[Math.round((index * (times.length - 1)) / (maximum - 1))]!,
  ).filter((time, index, selected) => time !== selected[index - 1])
}

export const geometryTrailSampleTimes = (
  segment: TemporalGeometry,
  maximum = MAX_GEOMETRY_TRAIL_SNAPSHOTS,
): readonly Timestamp[] => {
  if (!Number.isInteger(maximum) || maximum < 2) {
    throw new RangeError(
      'maximum trail snapshots must be an integer of at least 2.',
    )
  }
  const sourceTimes = segment.samples.map((sample) => sample.time)
  if (
    segment.interpolation === 'Discrete' ||
    segment.interpolation === 'Step'
  ) {
    return boundedSelection(sourceTimes, maximum)
  }
  const times: Timestamp[] = []
  for (let index = 0; index < sourceTimes.length - 1; index += 1) {
    const start = sourceTimes[index]!
    const end = sourceTimes[index + 1]!
    if (index === 0) times.push(start)
    for (
      let subdivision = 1;
      subdivision <= DEFAULT_SUBDIVISIONS;
      subdivision += 1
    ) {
      times.push(start + ((end - start) * subdivision) / DEFAULT_SUBDIVISIONS)
    }
  }
  return boundedSelection(times, maximum)
}

export const buildMovingPointPath = (
  segment: MovingPoint,
): readonly Position[] => {
  if (segment.interpolation === 'Discrete' || segment.interpolation === 'Step')
    return []
  return geometryTrailSampleTimes(segment).flatMap((time) => {
    const evaluated = geometryAtTime(segment, time)
    if (evaluated?.type !== 'MovingPoint') return []
    const { longitude, latitude, height } = evaluated.position
    return [
      {
        longitude,
        latitude,
        ...(height === undefined ? {} : { height }),
      },
    ]
  })
}

export interface MovingLineStringTrailSnapshot {
  readonly time: Timestamp
  readonly positions: readonly Position[]
}

export const movingLineStringTopologyCompatible = (
  segment: MovingLineString,
): boolean => {
  const first = segment.samples[0]
  if (!first || first.positions.length < 2) return false
  return segment.samples.every(
    ({ positions }) =>
      positions.length === first.positions.length &&
      positions.every(
        ({ longitude, latitude, height }, index) =>
          Number.isFinite(longitude) &&
          Number.isFinite(latitude) &&
          (height === undefined) ===
            (first.positions[index]?.height === undefined) &&
          (height === undefined || Number.isFinite(height)),
      ),
  )
}

export const buildMovingLineStringTrail = (
  segment: MovingLineString,
): readonly MovingLineStringTrailSnapshot[] => {
  if (!movingLineStringTopologyCompatible(segment))
    return segment.samples.map(({ time, positions }) => ({ time, positions }))
  return geometryTrailSampleTimes(segment).flatMap((time) => {
    const evaluated = geometryAtTime(segment, time)
    return evaluated?.type === 'MovingLineString'
      ? [{ time, positions: evaluated.positions }]
      : []
  })
}

/**
 * Connects corresponding edges of consecutive evaluated LineString slices
 * into swept-surface quads, mirroring the Space-Time temporal surface for
 * the 2D/3D map. Only defined for continuous interpolation with compatible
 * topology: Discrete has no connecting surface, and Step cannot be swept
 * without implying motion it doesn't have.
 */
export const buildMovingLineStringSurfaces = (
  segment: MovingLineString,
): readonly SweptQuad<Position>[] => {
  if (
    segment.interpolation === 'Discrete' ||
    segment.interpolation === 'Step' ||
    !movingLineStringTopologyCompatible(segment)
  )
    return []
  return buildLineStringSweptQuads(
    buildMovingLineStringTrail(segment),
    false,
    POSITION_SURFACE_ADAPTER,
  )
}
