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
  | {
      readonly type: 'MovingPolygon'
      readonly rings: readonly (readonly Position[])[]
    }

const evaluatePositionLeaves = (
  timestamps: readonly Timestamp[],
  samples: readonly (readonly Position[])[],
  interpolation: TemporalGeometry['interpolation'],
  resolved: NonNullable<ReturnType<typeof resolveMotionCurveInterval>>,
): readonly Position[] | undefined => {
  const first = samples[0]
  if (!first) return undefined
  const positionCount = first.length
  if (samples.some((sample) => sample.length !== positionCount)) {
    throw new RangeError('Temporal geometry samples require matching structure.')
  }
  const evaluated: Position[] = []
  const trajectory = Array.from(
    { length: samples.length },
    () => first[0]!,
  )
  for (let positionIndex = 0; positionIndex < positionCount; positionIndex += 1) {
    for (let sampleIndex = 0; sampleIndex < samples.length; sampleIndex += 1) {
      trajectory[sampleIndex] = samples[sampleIndex]![positionIndex]!
    }
    const position = evaluatePositionMotionCurve(
      timestamps,
      trajectory,
      interpolation,
      resolved,
    )
    if (!position) return undefined
    evaluated.push(position)
  }
  return evaluated
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
  if (segment.type === 'MovingLineString') {
    const positions = evaluatePositionLeaves(
      timestamps,
      segment.samples.map((sample) => sample.positions),
      segment.interpolation,
      resolved,
    )
    return positions ? { type: 'MovingLineString', positions } : undefined
  }
  const first = segment.samples[0]
  if (!first) return undefined
  const ringCount = first.rings.length
  if (segment.samples.some((sample) => sample.rings.length !== ringCount)) {
    throw new RangeError('MovingPolygon samples require matching ring counts.')
  }
  const rings: Position[][] = []
  for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
    const sourceRings = segment.samples.map((sample) => sample.rings[ringIndex]!)
    const evaluatedRing = evaluatePositionLeaves(
      timestamps,
      sourceRings,
      segment.interpolation,
      resolved,
    )
    if (!evaluatedRing) return undefined
    const ring = [...evaluatedRing]
    const sourceFirst = sourceRings[0]?.[0]
    const sourceLast = sourceRings[0]?.at(-1)
    if (
      sourceFirst &&
      sourceLast &&
      sourceFirst.longitude === sourceLast.longitude &&
      sourceFirst.latitude === sourceLast.latitude &&
      sourceFirst.height === sourceLast.height &&
      ring.length > 1
    ) {
      ring[ring.length - 1] = ring[0]!
    }
    rings.push(ring)
  }
  return { type: 'MovingPolygon', rings }
}
