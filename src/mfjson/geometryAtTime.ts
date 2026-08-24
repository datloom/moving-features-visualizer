import {
  evaluatePositionMotionCurve,
  resolveMotionCurveInterval,
  type Position,
} from './motionCurve'
import type { TemporalGeometry, Timestamp } from './types'

export type EvaluatedTemporalGeometry =
  | { readonly type: 'MovingPoint'; readonly position: Position }
  | {
      readonly type: 'MovingLineString'
      readonly positions: readonly Position[]
    }

/** Evaluates one temporal-geometry segment without bridging segment gaps. */
export const geometryAtTime = (
  segment: TemporalGeometry,
  time: Timestamp,
): EvaluatedTemporalGeometry | undefined => {
  const timestamps = segment.samples.map((sample) => sample.time)
  const resolved = resolveMotionCurveInterval(timestamps, time)
  if (!resolved) return undefined
  if (segment.type === 'MovingPoint') {
    const position = evaluatePositionMotionCurve(
      timestamps,
      segment.samples,
      segment.interpolation,
      resolved,
    )
    return position ? { type: 'MovingPoint', position } : undefined
  }
  const first = segment.samples[0]
  if (!first) return undefined
  const vertexCount = first.positions.length
  if (segment.samples.some((sample) => sample.positions.length !== vertexCount)) {
    throw new RangeError(
      'MovingLineString samples require matching vertex counts.',
    )
  }
  const positions: Position[] = []
  const vertexTrajectory = Array.from(
    { length: segment.samples.length },
    () => first.positions[0]!,
  )
  for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
    for (let sampleIndex = 0; sampleIndex < segment.samples.length; sampleIndex += 1) {
      vertexTrajectory[sampleIndex] =
        segment.samples[sampleIndex]!.positions[vertexIndex]!
    }
    const position = evaluatePositionMotionCurve(
      timestamps,
      vertexTrajectory,
      segment.interpolation,
      resolved,
    )
    if (!position) return undefined
    positions.push(position)
  }
  return { type: 'MovingLineString', positions }
}
