import type {
  GeometryInterpolation,
  PositionSample,
  Timestamp,
} from './types'

export type Position = Omit<PositionSample, 'time'>

const minimumSamples: Readonly<Record<GeometryInterpolation, number>> = {
  Discrete: 1,
  Step: 2,
  Linear: 2,
  Quadratic: 3,
  Cubic: 4,
}

export interface MotionCurveInterval {
  readonly exactIndex?: number
  readonly intervalIndex?: number
  readonly elapsed?: number
  readonly duration?: number
}

export const resolveMotionCurveInterval = (
  timestamps: readonly Timestamp[],
  currentTime: Timestamp,
): MotionCurveInterval | undefined => {
  if (!Number.isFinite(currentTime)) throw new RangeError('time must be finite.')
  if (timestamps.length === 0) return undefined

  let low = 0
  let high = timestamps.length - 1
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    const time = timestamps[middle]!
    if (time === currentTime) return { exactIndex: middle }
    if (time < currentTime) low = middle + 1
    else high = middle - 1
  }

  const intervalIndex = low - 1
  const start = timestamps[intervalIndex]
  const end = timestamps[intervalIndex + 1]
  if (start === undefined || end === undefined) return undefined
  return {
    intervalIndex,
    elapsed: currentTime - start,
    duration: end - start,
  }
}

const sameDimension = (a: Position, b: Position): boolean =>
  ('height' in a) === ('height' in b)

const component = (
  position: Position,
  key: 'longitude' | 'latitude' | 'height',
): number => (key === 'height' ? position.height! : position[key])

const createPosition = (
  reference: Position,
  evaluate: (key: 'longitude' | 'latitude' | 'height') => number,
): Position => ({
  longitude: evaluate('longitude'),
  latitude: evaluate('latitude'),
  ...('height' in reference ? { height: evaluate('height') } : {}),
})

const requireCompatiblePositions = (positions: readonly Position[]): void => {
  const first = positions[0]
  if (!first || positions.some((position) => !sameDimension(first, position))) {
    throw new RangeError('MotionCurve positions require matching dimensions.')
  }
}

const quadraticComponent = (
  positions: readonly Position[],
  timestamps: readonly Timestamp[],
  intervalIndex: number,
  elapsed: number,
  key: 'longitude' | 'latitude' | 'height',
): number => {
  let velocity =
    (component(positions[1]!, key) - component(positions[0]!, key)) /
    (timestamps[1]! - timestamps[0]!)
  for (let index = 0; index < intervalIndex; index += 1) {
    const duration = timestamps[index + 1]! - timestamps[index]!
    velocity =
      (2 *
        (component(positions[index + 1]!, key) -
          component(positions[index]!, key))) /
        duration -
      velocity
  }
  const start = component(positions[intervalIndex]!, key)
  const end = component(positions[intervalIndex + 1]!, key)
  const duration = timestamps[intervalIndex + 1]! - timestamps[intervalIndex]!
  const acceleration = (end - start - velocity * duration) / duration ** 2
  return start + velocity * elapsed + acceleration * elapsed ** 2
}

const cubicComponent = (
  positions: readonly Position[],
  intervalIndex: number,
  u: number,
  key: 'longitude' | 'latitude' | 'height',
): number => {
  const lastIndex = positions.length - 1
  const p1 = component(positions[intervalIndex]!, key)
  const p2 = component(positions[intervalIndex + 1]!, key)
  const m1 =
    intervalIndex === 0
      ? p2 - p1
      : (p2 - component(positions[intervalIndex - 1]!, key)) / 2
  const m2 =
    intervalIndex + 1 === lastIndex
      ? p2 - p1
      : (component(positions[intervalIndex + 2]!, key) - p1) / 2
  const u2 = u * u
  const u3 = u2 * u
  return (
    (2 * u3 - 3 * u2 + 1) * p1 +
    (u3 - 2 * u2 + u) * m1 +
    (-2 * u3 + 3 * u2) * p2 +
    (u3 - u2) * m2
  )
}

export const evaluatePositionMotionCurve = (
  timestamps: readonly Timestamp[],
  positions: readonly Position[],
  interpolation: GeometryInterpolation,
  resolved: MotionCurveInterval,
): Position | undefined => {
  if (timestamps.length !== positions.length || positions.length === 0) {
    throw new RangeError('MotionCurve timestamps and positions must align.')
  }
  if (positions.length < minimumSamples[interpolation]) {
    throw new RangeError(
      `${interpolation} MotionCurve requires at least ${minimumSamples[interpolation]} samples.`,
    )
  }
  requireCompatiblePositions(positions)
  if (resolved.exactIndex !== undefined) return positions[resolved.exactIndex]
  const intervalIndex = resolved.intervalIndex
  const elapsed = resolved.elapsed
  const duration = resolved.duration
  if (
    intervalIndex === undefined ||
    elapsed === undefined ||
    duration === undefined ||
    duration <= 0
  ) {
    return undefined
  }
  if (interpolation === 'Discrete') return undefined
  if (interpolation === 'Step') return positions[intervalIndex]
  const before = positions[intervalIndex]!
  const after = positions[intervalIndex + 1]!
  if (interpolation === 'Linear') {
    const u = elapsed / duration
    return createPosition(before, (key) =>
      key === 'height' && !('height' in before)
        ? 0
        : component(before, key) +
          (component(after, key) - component(before, key)) * u,
    )
  }
  if (interpolation === 'Quadratic') {
    return createPosition(before, (key) =>
      quadraticComponent(
        positions,
        timestamps,
        intervalIndex,
        elapsed,
        key,
      ),
    )
  }
  const u = elapsed / duration
  return createPosition(before, (key) =>
    cubicComponent(positions, intervalIndex, u, key),
  )
}
