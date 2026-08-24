import { geometryAtTime } from './geometryAtTime'
import {
  geometryTrailSampleTimes,
  MAX_GEOMETRY_TRAIL_SNAPSHOTS,
} from './geometryTrail'
import type { Position } from './motionCurve'
import type { MovingPolygon, Timestamp } from './types'

export interface MovingPolygonTrailSnapshot {
  readonly time: Timestamp
  readonly rings: readonly (readonly Position[])[]
}

export const MAX_POLYGON_TRAIL_SNAPSHOTS = MAX_GEOMETRY_TRAIL_SNAPSHOTS

export const movingPolygonTrailSampleTimes = (
  segment: MovingPolygon,
  maximum = MAX_POLYGON_TRAIL_SNAPSHOTS,
): readonly Timestamp[] => geometryTrailSampleTimes(segment, maximum)

export const buildMovingPolygonTrail = (
  segment: MovingPolygon,
  maximum = MAX_POLYGON_TRAIL_SNAPSHOTS,
): readonly MovingPolygonTrailSnapshot[] =>
  movingPolygonTrailSampleTimes(segment, maximum).flatMap((time) => {
    const evaluated = geometryAtTime(segment, time)
    return evaluated?.type === 'MovingPolygon'
      ? [{ time, rings: evaluated.rings }]
      : []
  })
