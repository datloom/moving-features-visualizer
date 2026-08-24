import type {
  MovingLineString,
  MovingPoint,
  PositionSample,
  TemporalGeometry,
  Timestamp,
} from './types'

export type Position = Omit<PositionSample, 'time'>

export type EvaluatedTemporalGeometry =
  | { readonly type: 'MovingPoint'; readonly position: Position }
  | {
      readonly type: 'MovingLineString'
      readonly positions: readonly Position[]
    }

const interpolatePosition = (
  before: Position,
  after: Position,
  ratio: number,
): Position => ({
  longitude: before.longitude + (after.longitude - before.longitude) * ratio,
  latitude: before.latitude + (after.latitude - before.latitude) * ratio,
  ...('height' in before || 'height' in after
    ? {
        height:
          (before.height ?? 0) +
          ((after.height ?? 0) - (before.height ?? 0)) * ratio,
      }
    : {}),
})

const findSamplePair = <Sample extends { readonly time: Timestamp }>(
  samples: readonly Sample[],
  time: Timestamp,
): readonly [Sample, Sample, number] | undefined => {
  const first = samples[0]
  const last = samples.at(-1)
  if (!first || !last || time < first.time || time > last.time) return undefined

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index]!
    if (sample.time === time) return [sample, sample, 0]
    const next = samples[index + 1]
    if (next && sample.time < time && time < next.time) {
      return [sample, next, (time - sample.time) / (next.time - sample.time)]
    }
  }
  return undefined
}

const movingPointAtTime = (
  segment: MovingPoint,
  time: Timestamp,
): EvaluatedTemporalGeometry | undefined => {
  const pair = findSamplePair(segment.samples, time)
  if (!pair) return undefined
  const [before, after, ratio] = pair
  return {
    type: 'MovingPoint',
    position: interpolatePosition(before, after, ratio),
  }
}

const movingLineStringAtTime = (
  segment: MovingLineString,
  time: Timestamp,
): EvaluatedTemporalGeometry | undefined => {
  const pair = findSamplePair(segment.samples, time)
  if (!pair) return undefined
  const [before, after, ratio] = pair
  if (before.positions.length !== after.positions.length) {
    throw new RangeError(
      'Linear MovingLineString samples require matching vertex counts.',
    )
  }
  return {
    type: 'MovingLineString',
    positions: before.positions.map((position, index) =>
      interpolatePosition(position, after.positions[index]!, ratio),
    ),
  }
}

/** Evaluates one temporal-geometry segment without bridging segment gaps. */
export const geometryAtTime = (
  segment: TemporalGeometry,
  time: Timestamp,
): EvaluatedTemporalGeometry | undefined => {
  if (!Number.isFinite(time)) throw new RangeError('time must be finite.')
  return segment.type === 'MovingPoint'
    ? movingPointAtTime(segment, time)
    : movingLineStringAtTime(segment, time)
}
