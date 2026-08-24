import type {
  MovingFeature,
  PositionSample,
  Timestamp,
} from '../../mfjson/types'

export const DEFAULT_TIME_AXIS_HEIGHT = 100_000
export const DEFAULT_TIME_TICK_COUNT = 6

export interface TemporalExtent {
  readonly minTime: Timestamp
  readonly maxTime: Timestamp
}

export interface SpatialExtent {
  readonly minLongitude: number
  readonly maxLongitude: number
  readonly minLatitude: number
  readonly maxLatitude: number
}

export interface TimeTick {
  readonly ratio: number
  readonly time: Timestamp
  readonly height: number
  readonly label: string
}

export interface SpaceTimeSample {
  readonly time: Timestamp
  readonly longitude: number
  readonly latitude: number
  readonly visualHeight: number
}

export interface SpaceTimeSegment {
  readonly interpolation: 'Linear'
  readonly samples: readonly SpaceTimeSample[]
}

export interface SpaceTimeFeature {
  readonly id: string
  readonly segments: readonly SpaceTimeSegment[]
}

const requireFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite.`)
}

export const getTemporalExtent = (
  features: readonly MovingFeature[],
): TemporalExtent | undefined => {
  let minTime = Number.POSITIVE_INFINITY
  let maxTime = Number.NEGATIVE_INFINITY
  for (const feature of features) {
    for (const segment of feature.temporalGeometry.segments) {
      for (const sample of segment.samples) {
        if (!Number.isFinite(sample.time)) continue
        minTime = Math.min(minTime, sample.time)
        maxTime = Math.max(maxTime, sample.time)
      }
    }
  }
  return Number.isFinite(minTime) && Number.isFinite(maxTime)
    ? { minTime, maxTime }
    : undefined
}

export const resolveTemporalExtent = (
  features: readonly MovingFeature[],
  effectiveExtent?: TemporalExtent,
): TemporalExtent | undefined => {
  const dataExtent = getTemporalExtent(features)
  if (!dataExtent) return undefined
  if (
    effectiveExtent &&
    Number.isFinite(effectiveExtent.minTime) &&
    Number.isFinite(effectiveExtent.maxTime) &&
    effectiveExtent.minTime <= effectiveExtent.maxTime &&
    effectiveExtent.maxTime >= dataExtent.minTime &&
    effectiveExtent.minTime <= dataExtent.maxTime
  ) {
    return effectiveExtent
  }
  return dataExtent
}

export const getSpatialExtent = (
  features: readonly MovingFeature[],
): SpatialExtent | undefined => {
  let minLongitude = Number.POSITIVE_INFINITY
  let maxLongitude = Number.NEGATIVE_INFINITY
  let minLatitude = Number.POSITIVE_INFINITY
  let maxLatitude = Number.NEGATIVE_INFINITY
  for (const feature of features) {
    for (const segment of feature.temporalGeometry.segments) {
      for (const sample of segment.samples) {
        if (
          !Number.isFinite(sample.longitude) ||
          !Number.isFinite(sample.latitude)
        ) {
          continue
        }
        minLongitude = Math.min(minLongitude, sample.longitude)
        maxLongitude = Math.max(maxLongitude, sample.longitude)
        minLatitude = Math.min(minLatitude, sample.latitude)
        maxLatitude = Math.max(maxLatitude, sample.latitude)
      }
    }
  }
  return Number.isFinite(minLongitude) && Number.isFinite(minLatitude)
    ? { minLongitude, maxLongitude, minLatitude, maxLatitude }
    : undefined
}

export const timestampToVisualHeight = (
  timestamp: Timestamp,
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): number => {
  requireFinite(timestamp, 'timestamp')
  requireFinite(extent.minTime, 'minTime')
  requireFinite(extent.maxTime, 'maxTime')
  requireFinite(timeAxisHeight, 'timeAxisHeight')
  if (timeAxisHeight < 0)
    throw new RangeError('timeAxisHeight must not be negative.')
  if (extent.minTime > extent.maxTime)
    throw new RangeError('minTime must not exceed maxTime.')
  if (extent.minTime === extent.maxTime) return 0
  return (
    ((timestamp - extent.minTime) / (extent.maxTime - extent.minTime)) *
    timeAxisHeight
  )
}

export const formatUtcTick = (
  timestamp: Timestamp,
  extent: TemporalExtent,
): string => {
  requireFinite(timestamp, 'timestamp')
  const date = new Date(timestamp)
  const withinOneDay = extent.maxTime - extent.minTime <= 86_400_000
  const sameUtcDay =
    new Date(extent.minTime).toISOString().slice(0, 10) ===
    new Date(extent.maxTime).toISOString().slice(0, 10)
  return withinOneDay && sameUtcDay
    ? `${date.toISOString().slice(11, 19)}Z`
    : `${date.toISOString().slice(0, 10)} ${date.toISOString().slice(11, 19)}Z`
}

export const generateTimeTicks = (
  extent: TemporalExtent,
  tickCount = DEFAULT_TIME_TICK_COUNT,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): readonly TimeTick[] => {
  if (!Number.isInteger(tickCount) || tickCount < 2) {
    throw new RangeError('tickCount must be an integer of at least 2.')
  }
  if (extent.minTime === extent.maxTime) {
    return [
      {
        ratio: 0,
        time: extent.minTime,
        height: 0,
        label: formatUtcTick(extent.minTime, extent),
      },
    ]
  }
  return Array.from({ length: tickCount }, (_, index) => {
    const ratio = index / (tickCount - 1)
    const time = extent.minTime + ratio * (extent.maxTime - extent.minTime)
    return {
      ratio,
      time,
      height: timestampToVisualHeight(time, extent, timeAxisHeight),
      label: formatUtcTick(time, extent),
    }
  })
}

export const transformSpaceTimeFeatures = (
  features: readonly MovingFeature[],
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): readonly SpaceTimeFeature[] =>
  features.map((feature) => ({
    id: feature.id,
    segments: feature.temporalGeometry.segments.map((segment) => ({
      interpolation: segment.interpolation,
      samples: segment.samples.map((sample) => ({
        time: sample.time,
        longitude: sample.longitude,
        latitude: sample.latitude,
        visualHeight: timestampToVisualHeight(
          sample.time,
          extent,
          timeAxisHeight,
        ),
      })),
    })),
  }))

const interpolate = (
  before: PositionSample,
  after: PositionSample,
  time: Timestamp,
): Pick<PositionSample, 'longitude' | 'latitude'> => {
  if (before.time === after.time) return before
  const ratio = (time - before.time) / (after.time - before.time)
  return {
    longitude: before.longitude + ratio * (after.longitude - before.longitude),
    latitude: before.latitude + ratio * (after.latitude - before.latitude),
  }
}

export const getSpaceTimePositionAtTime = (
  feature: MovingFeature,
  time: Timestamp,
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): SpaceTimeSample | undefined => {
  requireFinite(time, 'timestamp')
  for (const segment of feature.temporalGeometry.segments) {
    const samples = segment.samples
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index]!
      if (sample.time === time) {
        return {
          time,
          longitude: sample.longitude,
          latitude: sample.latitude,
          visualHeight: timestampToVisualHeight(time, extent, timeAxisHeight),
        }
      }
      const next = samples[index + 1]
      if (next && sample.time < time && time < next.time) {
        const position = interpolate(sample, next, time)
        return {
          time,
          ...position,
          visualHeight: timestampToVisualHeight(time, extent, timeAxisHeight),
        }
      }
    }
  }
  return undefined
}
