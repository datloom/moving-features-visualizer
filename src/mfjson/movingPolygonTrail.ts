import { geometryAtTime } from './geometryAtTime'
import type { Position } from './motionCurve'
import type { MovingPolygon, Timestamp } from './types'

export interface MovingPolygonTrailSnapshot {
  readonly time: Timestamp
  readonly rings: readonly (readonly Position[])[]
}

const DEFAULT_SUBDIVISIONS = 4
export const MAX_POLYGON_TRAIL_SNAPSHOTS = 64

const boundedSelection = (
  times: readonly Timestamp[],
  maximum: number,
): readonly Timestamp[] => {
  if (times.length <= maximum) return times
  const selected: Timestamp[] = []
  for (let index = 0; index < maximum; index += 1) {
    selected.push(times[Math.round((index * (times.length - 1)) / (maximum - 1))]!)
  }
  return [...new Set(selected)]
}

export const movingPolygonTrailSampleTimes = (
  segment: MovingPolygon,
  maximum = MAX_POLYGON_TRAIL_SNAPSHOTS,
): readonly Timestamp[] => {
  if (!Number.isInteger(maximum) || maximum < 2) {
    throw new RangeError('maximum trail snapshots must be an integer of at least 2.')
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
    for (let subdivision = 1; subdivision <= DEFAULT_SUBDIVISIONS; subdivision += 1) {
      times.push(start + ((end - start) * subdivision) / DEFAULT_SUBDIVISIONS)
    }
  }
  return boundedSelection(times, maximum)
}

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
