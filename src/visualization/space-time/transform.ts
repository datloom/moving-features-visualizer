import { geometryAtTime } from '../../mfjson/geometryAtTime'
import { geometryTrailSampleTimes } from '../../mfjson/geometryTrail'
import type { Position } from '../../mfjson/motionCurve'
import type {
  GeometryInterpolation,
  MovingFeature,
  TemporalGeometry,
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

/** Spatial height is intentionally replaced by time height in this view. */
export interface SpaceTimePosition {
  readonly longitude: number
  readonly latitude: number
  readonly visualHeight: number
}
export interface SpaceTimeSample extends SpaceTimePosition {
  readonly time: Timestamp
}
interface SegmentBase {
  readonly interpolation: GeometryInterpolation
  readonly segmentIndex: number
}
export interface SpaceTimePointSegment extends SegmentBase {
  readonly type: 'MovingPoint'
  readonly points: readonly SpaceTimeSample[]
  readonly paths: readonly (readonly SpaceTimeSample[])[]
}
export interface SpaceTimeLineStringSlice {
  readonly time: Timestamp
  readonly positions: readonly SpaceTimePosition[]
}
export interface SpaceTimeLineStringSegment extends SegmentBase {
  readonly type: 'MovingLineString'
  readonly slices: readonly SpaceTimeLineStringSlice[]
}
export interface SpaceTimePolygonSlice {
  readonly time: Timestamp
  readonly rings: readonly (readonly SpaceTimePosition[])[]
}
export interface SpaceTimePolygonSegment extends SegmentBase {
  readonly type: 'MovingPolygon'
  readonly slices: readonly SpaceTimePolygonSlice[]
}
export type SpaceTimeSegment =
  SpaceTimePointSegment | SpaceTimeLineStringSegment | SpaceTimePolygonSegment
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
  for (const feature of features)
    for (const segment of feature.temporalGeometry.segments)
      for (const sample of segment.samples) {
        if (!Number.isFinite(sample.time)) continue
        minTime = Math.min(minTime, sample.time)
        maxTime = Math.max(maxTime, sample.time)
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
  )
    return effectiveExtent
  return dataExtent
}

const geometryPositions = (segment: TemporalGeometry): readonly Position[] => {
  if (segment.type === 'MovingPoint') return segment.samples
  if (segment.type === 'MovingLineString')
    return segment.samples.flatMap(({ positions }) => positions)
  return segment.samples.flatMap(({ rings }) => rings.flat())
}

export const getSpatialExtent = (
  features: readonly MovingFeature[],
): SpatialExtent | undefined => {
  let minLongitude = Number.POSITIVE_INFINITY
  let maxLongitude = Number.NEGATIVE_INFINITY
  let minLatitude = Number.POSITIVE_INFINITY
  let maxLatitude = Number.NEGATIVE_INFINITY
  for (const feature of features)
    for (const segment of feature.temporalGeometry.segments)
      for (const position of geometryPositions(segment)) {
        if (
          !Number.isFinite(position.longitude) ||
          !Number.isFinite(position.latitude)
        )
          continue
        minLongitude = Math.min(minLongitude, position.longitude)
        maxLongitude = Math.max(maxLongitude, position.longitude)
        minLatitude = Math.min(minLatitude, position.latitude)
        maxLatitude = Math.max(maxLatitude, position.latitude)
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
  return extent.minTime === extent.maxTime
    ? 0
    : ((timestamp - extent.minTime) / (extent.maxTime - extent.minTime)) *
        timeAxisHeight
}

export const formatUtcTick = (
  timestamp: Timestamp,
  extent: TemporalExtent,
): string => {
  requireFinite(timestamp, 'timestamp')
  const iso = new Date(timestamp).toISOString()
  const sameUtcDay =
    new Date(extent.minTime).toISOString().slice(0, 10) ===
    new Date(extent.maxTime).toISOString().slice(0, 10)
  return extent.maxTime - extent.minTime <= 86_400_000 && sameUtcDay
    ? `${iso.slice(11, 19)}Z`
    : `${iso.slice(0, 10)} ${iso.slice(11, 19)}Z`
}

export const generateTimeTicks = (
  extent: TemporalExtent,
  tickCount = DEFAULT_TIME_TICK_COUNT,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): readonly TimeTick[] => {
  if (!Number.isInteger(tickCount) || tickCount < 2)
    throw new RangeError('tickCount must be an integer of at least 2.')
  if (extent.minTime === extent.maxTime)
    return [
      {
        ratio: 0,
        time: extent.minTime,
        height: 0,
        label: formatUtcTick(extent.minTime, extent),
      },
    ]
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

const toPosition = (
  position: Position,
  time: Timestamp,
  extent: TemporalExtent,
  height: number,
): SpaceTimePosition => ({
  longitude: position.longitude,
  latitude: position.latitude,
  visualHeight: timestampToVisualHeight(time, extent, height),
})

const transformSegment = (
  segment: TemporalGeometry,
  segmentIndex: number,
  extent: TemporalExtent,
  height: number,
): SpaceTimeSegment => {
  const times = geometryTrailSampleTimes(segment)
  if (segment.type === 'MovingPoint') {
    const points = segment.samples.map((sample) => ({
      time: sample.time,
      ...toPosition(sample, sample.time, extent, height),
    }))
    if (segment.interpolation === 'Discrete')
      return {
        type: segment.type,
        interpolation: segment.interpolation,
        segmentIndex,
        points,
        paths: [],
      }
    if (segment.interpolation === 'Step')
      return {
        type: segment.type,
        interpolation: segment.interpolation,
        segmentIndex,
        points,
        paths: segment.samples
          .slice(0, -1)
          .map((sample, index) => [
            points[index]!,
            {
              time: segment.samples[index + 1]!.time,
              ...toPosition(
                sample,
                segment.samples[index + 1]!.time,
                extent,
                height,
              ),
            },
          ]),
      }
    return {
      type: segment.type,
      interpolation: segment.interpolation,
      segmentIndex,
      points,
      paths: [
        times.flatMap((time) => {
          const evaluated = geometryAtTime(segment, time)
          return evaluated?.type === 'MovingPoint'
            ? [
                {
                  time,
                  ...toPosition(evaluated.position, time, extent, height),
                },
              ]
            : []
        }),
      ],
    }
  }
  if (segment.type === 'MovingLineString')
    return {
      type: segment.type,
      interpolation: segment.interpolation,
      segmentIndex,
      slices: times.flatMap((time) => {
        const evaluated = geometryAtTime(segment, time)
        return evaluated?.type === 'MovingLineString'
          ? [
              {
                time,
                positions: evaluated.positions.map((position) =>
                  toPosition(position, time, extent, height),
                ),
              },
            ]
          : []
      }),
    }
  return {
    type: segment.type,
    interpolation: segment.interpolation,
    segmentIndex,
    slices: times.flatMap((time) => {
      const evaluated = geometryAtTime(segment, time)
      return evaluated?.type === 'MovingPolygon'
        ? [
            {
              time,
              rings: evaluated.rings.map((ring) =>
                ring.map((position) =>
                  toPosition(position, time, extent, height),
                ),
              ),
            },
          ]
        : []
    }),
  }
}

export const transformSpaceTimeFeatures = (
  features: readonly MovingFeature[],
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): readonly SpaceTimeFeature[] =>
  features.map((feature) => ({
    id: feature.id,
    segments: feature.temporalGeometry.segments.map((segment, index) =>
      transformSegment(segment, index, extent, timeAxisHeight),
    ),
  }))

export const getSpaceTimeGeometryAtTime = (
  segment: TemporalGeometry,
  time: Timestamp,
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
) => {
  requireFinite(time, 'timestamp')
  const evaluated = geometryAtTime(segment, time)
  if (!evaluated) return undefined
  if (evaluated.type === 'MovingPoint')
    return {
      type: evaluated.type,
      position: toPosition(evaluated.position, time, extent, timeAxisHeight),
    } as const
  if (evaluated.type === 'MovingLineString')
    return {
      type: evaluated.type,
      positions: evaluated.positions.map((position) =>
        toPosition(position, time, extent, timeAxisHeight),
      ),
    } as const
  return {
    type: evaluated.type,
    rings: evaluated.rings.map((ring) =>
      ring.map((position) =>
        toPosition(position, time, extent, timeAxisHeight),
      ),
    ),
  } as const
}

/** Compatibility helper for callers interested only in MovingPoint. */
export const getSpaceTimePositionAtTime = (
  feature: MovingFeature,
  time: Timestamp,
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): SpaceTimeSample | undefined => {
  for (const segment of feature.temporalGeometry.segments) {
    if (segment.type !== 'MovingPoint') continue
    const evaluated = getSpaceTimeGeometryAtTime(
      segment,
      time,
      extent,
      timeAxisHeight,
    )
    if (evaluated?.type === 'MovingPoint')
      return { time, ...evaluated.position }
  }
  return undefined
}
