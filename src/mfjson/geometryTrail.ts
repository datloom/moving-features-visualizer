import { geometryAtTime } from './geometryAtTime'
import type { Position } from './motionCurve'
import type {
  MovingLineString,
  MovingPoint,
  TemporalGeometry,
  Timestamp,
} from './types'

const DEFAULT_SUBDIVISIONS = 4
export const MAX_GEOMETRY_TRAIL_SNAPSHOTS = 64

const boundedSelection = (
  times: readonly Timestamp[],
  maximum: number,
): readonly Timestamp[] => {
  if (times.length <= maximum) return times
  return Array.from({ length: maximum }, (_, index) =>
    times[Math.round((index * (times.length - 1)) / (maximum - 1))]!,
  ).filter((time, index, selected) => time !== selected[index - 1])
}

export const geometryTrailSampleTimes = (
  segment: TemporalGeometry,
  maximum = MAX_GEOMETRY_TRAIL_SNAPSHOTS,
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

export const buildMovingPointPath = (
  segment: MovingPoint,
): readonly Position[] =>
  geometryTrailSampleTimes(segment).flatMap((time) => {
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

export interface MovingLineStringTrailSnapshot {
  readonly time: Timestamp
  readonly positions: readonly Position[]
}

export const buildMovingLineStringTrail = (
  segment: MovingLineString,
): readonly MovingLineStringTrailSnapshot[] =>
  geometryTrailSampleTimes(segment).flatMap((time) => {
    const evaluated = geometryAtTime(segment, time)
    return evaluated?.type === 'MovingLineString'
      ? [{ time, positions: evaluated.positions }]
      : []
  })
