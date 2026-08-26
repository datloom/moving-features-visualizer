import { geometryAtTime } from '../../mfjson/geometryAtTime'
import {
  geometryTrailSampleTimes,
  movingLineStringTopologyCompatible,
} from '../../mfjson/geometryTrail'
import { movingPolygonTopologyCompatible } from '../../mfjson/movingPolygonTrail'
import type { Position } from '../../mfjson/motionCurve'
import type {
  GeometryInterpolation,
  MovingFeature,
  TemporalGeometry,
  Timestamp,
} from '../../mfjson/types'

export const DEFAULT_TIME_AXIS_HEIGHT = 100_000
export const DEFAULT_TIME_TICK_COUNT = 6
export const TIME_AXIS_SCALE_VALUES = [1, 2, 4, 8, 16] as const
export type ManualTimeAxisScale = (typeof TIME_AXIS_SCALE_VALUES)[number]
export type TimeAxisScale = 'auto' | ManualTimeAxisScale

const EARTH_RADIUS_METERS = 6_371_008.8
const AUTO_GEOMETRY_SEPARATION_RATIO = 0.15
const AUTO_MINIMUM_SLICE_SEPARATION_METERS = 5_000

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
export interface SpaceTimeLineStringSurface {
  readonly startTime: Timestamp
  readonly endTime: Timestamp
  readonly edgeIndex: number
  readonly positions: readonly [
    SpaceTimePosition,
    SpaceTimePosition,
    SpaceTimePosition,
    SpaceTimePosition,
  ]
}
export interface SpaceTimeLineStringSegment extends SegmentBase {
  readonly type: 'MovingLineString'
  readonly slices: readonly SpaceTimeLineStringSlice[]
  readonly surfaces: readonly SpaceTimeLineStringSurface[]
}
export interface SpaceTimePolygonSlice {
  readonly time: Timestamp
  readonly rings: readonly (readonly SpaceTimePosition[])[]
}
export interface SpaceTimePolygonSurface {
  readonly startTime: Timestamp
  readonly endTime: Timestamp
  readonly ringIndex: number
  readonly edgeIndex: number
  readonly positions: readonly [
    SpaceTimePosition,
    SpaceTimePosition,
    SpaceTimePosition,
    SpaceTimePosition,
  ]
}
export interface SpaceTimePolygonSegment extends SegmentBase {
  readonly type: 'MovingPolygon'
  readonly slices: readonly SpaceTimePolygonSlice[]
  readonly surfaces: readonly SpaceTimePolygonSurface[]
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
  timeAxisScale = 1,
): number => {
  requireFinite(timestamp, 'timestamp')
  requireFinite(extent.minTime, 'minTime')
  requireFinite(extent.maxTime, 'maxTime')
  requireFinite(timeAxisHeight, 'timeAxisHeight')
  requireFinite(timeAxisScale, 'timeAxisScale')
  if (timeAxisHeight < 0)
    throw new RangeError('timeAxisHeight must not be negative.')
  if (timeAxisScale < 1)
    throw new RangeError('timeAxisScale must be at least 1.')
  if (extent.minTime > extent.maxTime)
    throw new RangeError('minTime must not exceed maxTime.')
  return extent.minTime === extent.maxTime
    ? 0
    : ((timestamp - extent.minTime) / (extent.maxTime - extent.minTime)) *
        timeAxisHeight *
        timeAxisScale
}

export const scaledTimeAxisHeight = (
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
  timeAxisScale = 1,
): number => {
  requireFinite(timeAxisHeight, 'timeAxisHeight')
  requireFinite(timeAxisScale, 'timeAxisScale')
  if (timeAxisHeight < 0)
    throw new RangeError('timeAxisHeight must not be negative.')
  if (timeAxisScale < 1)
    throw new RangeError('timeAxisScale must be at least 1.')
  return timeAxisHeight * timeAxisScale
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
  timeAxisScale = 1,
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
      height: timestampToVisualHeight(
        time,
        extent,
        timeAxisHeight,
        timeAxisScale,
      ),
      label: formatUtcTick(time, extent),
    }
  })
}

const toEarthCartesian = (
  position: Position,
): readonly [number, number, number] => {
  const longitude = (position.longitude * Math.PI) / 180
  const latitude = (position.latitude * Math.PI) / 180
  const latitudeRadius = EARTH_RADIUS_METERS * Math.cos(latitude)
  return [
    latitudeRadius * Math.cos(longitude),
    latitudeRadius * Math.sin(longitude),
    EARTH_RADIUS_METERS * Math.sin(latitude),
  ]
}

const geometrySamplePositions = (
  segment: TemporalGeometry,
  sampleIndex: number,
): readonly Position[] => {
  const sample = segment.samples[sampleIndex]
  if (!sample) return []
  if (segment.type === 'MovingPoint') return [segment.samples[sampleIndex]!]
  if (segment.type === 'MovingLineString')
    return segment.samples[sampleIndex]!.positions
  return segment.samples[sampleIndex]!.rings.flat()
}

const geometrySizeMeters = (positions: readonly Position[]): number => {
  if (positions.length < 2) return 0
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (const position of positions) {
    const [x, y, z] = toEarthCartesian(position)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  return Math.hypot(maxX - minX, maxY - minY, maxZ - minZ)
}

const nextSupportedScale = (minimum: number): ManualTimeAxisScale =>
  TIME_AXIS_SCALE_VALUES.find((scale) => scale >= minimum) ?? 16

/**
 * Chooses enough vertical separation for the densest rendered LineString or
 * Polygon slices. Geometry size is measured in Earth-centered meters so it is
 * comparable with Cesium height; MovingPoint alone therefore remains at 1x.
 */
export const calculateAutoTimeAxisScale = (
  features: readonly MovingFeature[],
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): ManualTimeAxisScale => {
  const duration = extent.maxTime - extent.minTime
  if (!(duration > 0) || !(timeAxisHeight > 0)) return 1
  let requiredScale = 1
  for (const feature of features) {
    for (const segment of feature.temporalGeometry.segments) {
      if (segment.type === 'MovingPoint' || segment.samples.length < 2) continue
      const sampleSizes = segment.samples.map((_, index) =>
        geometrySizeMeters(geometrySamplePositions(segment, index)),
      )
      const averageSize =
        sampleSizes.reduce((total, size) => total + size, 0) /
        sampleSizes.length
      const displayTimes = geometryTrailSampleTimes(segment)
      let minimumGap = Number.POSITIVE_INFINITY
      for (let index = 1; index < displayTimes.length; index += 1) {
        const gap = displayTimes[index]! - displayTimes[index - 1]!
        if (gap > 0) minimumGap = Math.min(minimumGap, gap)
      }
      if (!Number.isFinite(minimumGap)) continue
      const unscaledGap = (minimumGap / duration) * timeAxisHeight
      const desiredGap = Math.max(
        AUTO_MINIMUM_SLICE_SEPARATION_METERS,
        averageSize * AUTO_GEOMETRY_SEPARATION_RATIO,
      )
      requiredScale = Math.max(requiredScale, desiredGap / unscaledGap)
    }
  }
  return nextSupportedScale(requiredScale)
}

export const resolveTimeAxisScale = (
  scale: TimeAxisScale,
  features: readonly MovingFeature[],
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
): ManualTimeAxisScale =>
  scale === 'auto'
    ? calculateAutoTimeAxisScale(features, extent, timeAxisHeight)
    : scale

const toPosition = (
  position: Position,
  time: Timestamp,
  extent: TemporalExtent,
  height: number,
  scale: number,
): SpaceTimePosition => ({
  longitude: position.longitude,
  latitude: position.latitude,
  visualHeight: timestampToVisualHeight(time, extent, height, scale),
})

const sameSpatialPosition = (
  first: SpaceTimePosition,
  second: SpaceTimePosition,
): boolean =>
  first.longitude === second.longitude && first.latitude === second.latitude

const ringVertices = (
  ring: readonly SpaceTimePosition[],
): readonly SpaceTimePosition[] => {
  if (
    ring.length < 3 ||
    ring.some(
      ({ longitude, latitude, visualHeight }) =>
        !Number.isFinite(longitude) ||
        !Number.isFinite(latitude) ||
        !Number.isFinite(visualHeight),
    )
  )
    return []
  return sameSpatialPosition(ring[0]!, ring.at(-1)!) ? ring.slice(0, -1) : ring
}

const compatiblePolygonSlices = (
  first: SpaceTimePolygonSlice,
  second: SpaceTimePolygonSlice,
): boolean =>
  first.rings.length > 0 &&
  first.rings.length === second.rings.length &&
  first.rings.every((ring, ringIndex) => {
    const firstVertices = ringVertices(ring)
    const secondVertices = ringVertices(second.rings[ringIndex] ?? [])
    return (
      firstVertices.length >= 3 &&
      firstVertices.length === secondVertices.length
    )
  })

const createPolygonSurfaces = (
  slices: readonly SpaceTimePolygonSlice[],
  step: boolean,
): readonly SpaceTimePolygonSurface[] => {
  const surfaces: SpaceTimePolygonSurface[] = []
  for (let sliceIndex = 0; sliceIndex < slices.length - 1; sliceIndex += 1) {
    const first = slices[sliceIndex]!
    const second = slices[sliceIndex + 1]!
    if (second.time <= first.time || !compatiblePolygonSlices(first, second))
      continue
    first.rings.forEach((ring, ringIndex) => {
      const lower = ringVertices(ring)
      const evaluatedUpper = ringVertices(second.rings[ringIndex]!)
      const upperHeight = evaluatedUpper[0]!.visualHeight
      for (let edgeIndex = 0; edgeIndex < lower.length; edgeIndex += 1) {
        const nextIndex = (edgeIndex + 1) % lower.length
        const lowerFirst = lower[edgeIndex]!
        const lowerSecond = lower[nextIndex]!
        const upperFirst = step
          ? { ...lowerFirst, visualHeight: upperHeight }
          : evaluatedUpper[edgeIndex]!
        const upperSecond = step
          ? { ...lowerSecond, visualHeight: upperHeight }
          : evaluatedUpper[nextIndex]!
        surfaces.push({
          startTime: first.time,
          endTime: second.time,
          ringIndex,
          edgeIndex,
          positions: [lowerFirst, upperFirst, upperSecond, lowerSecond],
        })
      }
    })
  }
  return surfaces
}

const createLineStringSurfaces = (
  slices: readonly SpaceTimeLineStringSlice[],
  step: boolean,
): readonly SpaceTimeLineStringSurface[] => {
  const surfaces: SpaceTimeLineStringSurface[] = []
  for (let sliceIndex = 0; sliceIndex < slices.length - 1; sliceIndex += 1) {
    const first = slices[sliceIndex]!
    const second = slices[sliceIndex + 1]!
    if (
      second.time <= first.time ||
      first.positions.length < 2 ||
      first.positions.length !== second.positions.length
    )
      continue
    for (
      let edgeIndex = 0;
      edgeIndex < first.positions.length - 1;
      edgeIndex += 1
    ) {
      const lowerFirst = first.positions[edgeIndex]!
      const lowerSecond = first.positions[edgeIndex + 1]!
      const upperHeight = second.positions[0]!.visualHeight
      const upperFirst = step
        ? { ...lowerFirst, visualHeight: upperHeight }
        : second.positions[edgeIndex]!
      const upperSecond = step
        ? { ...lowerSecond, visualHeight: upperHeight }
        : second.positions[edgeIndex + 1]!
      surfaces.push({
        startTime: first.time,
        endTime: second.time,
        edgeIndex,
        positions: [lowerFirst, upperFirst, upperSecond, lowerSecond],
      })
    }
  }
  return surfaces
}

const sourcePolygonSlices = (
  segment: Extract<TemporalGeometry, { readonly type: 'MovingPolygon' }>,
  extent: TemporalExtent,
  height: number,
  scale: number,
): readonly SpaceTimePolygonSlice[] =>
  segment.samples.map((sample) => ({
    time: sample.time,
    rings: sample.rings.map((ring) =>
      ring.map((position) =>
        toPosition(position, sample.time, extent, height, scale),
      ),
    ),
  }))

const transformSegment = (
  segment: TemporalGeometry,
  segmentIndex: number,
  extent: TemporalExtent,
  height: number,
  scale: number,
): SpaceTimeSegment => {
  const times = geometryTrailSampleTimes(segment)
  if (segment.type === 'MovingPoint') {
    const points = segment.samples.map((sample) => ({
      time: sample.time,
      ...toPosition(sample, sample.time, extent, height, scale),
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
        paths: segment.samples.slice(0, -1).map((sample, index) => [
          points[index]!,
          {
            time: segment.samples[index + 1]!.time,
            ...toPosition(
              sample,
              segment.samples[index + 1]!.time,
              extent,
              height,
              scale,
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
                  ...toPosition(
                    evaluated.position,
                    time,
                    extent,
                    height,
                    scale,
                  ),
                },
              ]
            : []
        }),
      ],
    }
  }
  if (segment.type === 'MovingLineString') {
    if (!movingLineStringTopologyCompatible(segment))
      return {
        type: segment.type,
        interpolation: segment.interpolation,
        segmentIndex,
        slices: segment.samples.map((sample) => ({
          time: sample.time,
          positions: sample.positions.map((position) =>
            toPosition(position, sample.time, extent, height, scale),
          ),
        })),
        surfaces: [],
      }
    const slices = times.flatMap((time) => {
      const evaluated = geometryAtTime(segment, time)
      return evaluated?.type === 'MovingLineString'
        ? [
            {
              time,
              positions: evaluated.positions.map((position) =>
                toPosition(position, time, extent, height, scale),
              ),
            },
          ]
        : []
    })
    return {
      type: segment.type,
      interpolation: segment.interpolation,
      segmentIndex,
      slices,
      surfaces:
        segment.interpolation === 'Discrete'
          ? []
          : createLineStringSurfaces(slices, segment.interpolation === 'Step'),
    }
  }
  const sourceSlices = sourcePolygonSlices(segment, extent, height, scale)
  if (segment.interpolation === 'Discrete')
    return {
      type: segment.type,
      interpolation: segment.interpolation,
      segmentIndex,
      slices: sourceSlices,
      surfaces: [],
    }
  if (segment.interpolation === 'Step')
    return {
      type: segment.type,
      interpolation: segment.interpolation,
      segmentIndex,
      slices: sourceSlices,
      surfaces: createPolygonSurfaces(sourceSlices, true),
    }
  if (!movingPolygonTopologyCompatible(segment))
    return {
      type: segment.type,
      interpolation: segment.interpolation,
      segmentIndex,
      slices: sourceSlices,
      surfaces: [],
    }
  const slices = times.flatMap((time): readonly SpaceTimePolygonSlice[] => {
    const evaluated = geometryAtTime(segment, time)
    return evaluated?.type === 'MovingPolygon'
      ? [
          {
            time,
            rings: evaluated.rings.map((ring) =>
              ring.map((position) =>
                toPosition(position, time, extent, height, scale),
              ),
            ),
          },
        ]
      : []
  })
  return {
    type: segment.type,
    interpolation: segment.interpolation,
    segmentIndex,
    slices,
    surfaces: createPolygonSurfaces(slices, false),
  }
}

export const transformSpaceTimeFeatures = (
  features: readonly MovingFeature[],
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
  timeAxisScale = 1,
): readonly SpaceTimeFeature[] =>
  features.map((feature) => ({
    id: feature.id,
    segments: feature.temporalGeometry.segments.map((segment, index) =>
      transformSegment(segment, index, extent, timeAxisHeight, timeAxisScale),
    ),
  }))

export const getSpaceTimeGeometryAtTime = (
  segment: TemporalGeometry,
  time: Timestamp,
  extent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
  timeAxisScale = 1,
) => {
  requireFinite(time, 'timestamp')
  if (
    (segment.type === 'MovingLineString' &&
      !movingLineStringTopologyCompatible(segment)) ||
    (segment.type === 'MovingPolygon' &&
      !movingPolygonTopologyCompatible(segment))
  )
    return undefined
  const evaluated = geometryAtTime(segment, time)
  if (!evaluated) return undefined
  if (evaluated.type === 'MovingPoint')
    return {
      type: evaluated.type,
      position: toPosition(
        evaluated.position,
        time,
        extent,
        timeAxisHeight,
        timeAxisScale,
      ),
    } as const
  if (evaluated.type === 'MovingLineString')
    return {
      type: evaluated.type,
      positions: evaluated.positions.map((position) =>
        toPosition(position, time, extent, timeAxisHeight, timeAxisScale),
      ),
    } as const
  return {
    type: evaluated.type,
    rings: evaluated.rings.map((ring) =>
      ring.map((position) =>
        toPosition(position, time, extent, timeAxisHeight, timeAxisScale),
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
  timeAxisScale = 1,
): SpaceTimeSample | undefined => {
  for (const segment of feature.temporalGeometry.segments) {
    if (segment.type !== 'MovingPoint') continue
    const evaluated = getSpaceTimeGeometryAtTime(
      segment,
      time,
      extent,
      timeAxisHeight,
      timeAxisScale,
    )
    if (evaluated?.type === 'MovingPoint')
      return { time, ...evaluated.position }
  }
  return undefined
}
