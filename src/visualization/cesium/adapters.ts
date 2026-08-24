import {
  Cartesian3,
  CallbackPositionProperty,
  CallbackProperty,
  Color,
  Entity,
  JulianDate,
  LinearApproximation,
  SampledPositionProperty,
  TimeInterval,
  TimeIntervalCollection,
} from 'cesium'

import { geometryAtTime } from '../../mfjson/geometryAtTime'
import type {
  MovingFeature,
  PositionSample,
  TemporalGeometry,
  Timestamp,
} from '../../mfjson/types'

export const timestampToJulianDate = (timestamp: Timestamp): JulianDate => {
  if (!Number.isFinite(timestamp)) {
    throw new RangeError('timestamp must be a finite number.')
  }

  return JulianDate.fromDate(new Date(timestamp))
}

export const coordinateToCartesian3 = (
  coordinate: Pick<PositionSample, 'longitude' | 'latitude' | 'height'>,
): Cartesian3 => {
  const { longitude, latitude, height = 0 } = coordinate

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(height)
  ) {
    throw new RangeError('coordinate values must be finite numbers.')
  }

  return Cartesian3.fromDegrees(longitude, latitude, height)
}

export const samplesToPositionProperty = (
  samples: readonly PositionSample[],
): SampledPositionProperty => {
  const property = new SampledPositionProperty()
  property.setInterpolationOptions({
    interpolationAlgorithm: LinearApproximation,
    interpolationDegree: 1,
  })

  for (const sample of samples) {
    property.addSample(
      timestampToJulianDate(sample.time),
      coordinateToCartesian3(sample),
    )
  }

  return property
}

export interface FeatureTimeRange {
  readonly startTime: Timestamp
  readonly endTime: Timestamp
}

export const getFeatureTimeRange = (
  feature: MovingFeature,
): FeatureTimeRange => {
  let firstTime: Timestamp | undefined
  let lastTime: Timestamp | undefined
  for (const segment of feature.temporalGeometry.segments) {
    for (const sample of segment.samples) {
      if (firstTime === undefined || sample.time < firstTime)
        firstTime = sample.time
      if (lastTime === undefined || sample.time > lastTime)
        lastTime = sample.time
    }
  }

  if (firstTime === undefined || lastTime === undefined) {
    throw new RangeError('Temporal geometry must contain samples.')
  }

  return { startTime: firstTime, endTime: lastTime }
}

export const movingFeatureToEntity = (feature: MovingFeature): Entity => {
  const entity = movingFeatureToEntities(feature)[0]
  if (!entity) throw new RangeError('Temporal geometry must contain samples.')
  return entity
}

export const geometrySegmentEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
): string =>
  `${featureId}--geometry--${segment.id ? encodeURIComponent(segment.id) : segmentIndex + 1}`

export const geometrySegmentTrajectoryEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--trajectory`

export const geometrySegmentPositionEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--position`

export const movingFeatureEntityIds = (
  feature: MovingFeature,
  options: { readonly selected?: boolean } = {},
): readonly string[] =>
  feature.temporalGeometry.segments.flatMap((segment, index) =>
    segment.type === 'MovingPoint' && options.selected
      ? [
          geometrySegmentTrajectoryEntityId(feature.id, segment, index),
          geometrySegmentPositionEntityId(feature.id, segment, index),
        ]
      : [geometrySegmentEntityId(feature.id, segment, index)],
  )

export const movingFeatureToEntities = (
  feature: MovingFeature,
  options: {
    readonly selected?: boolean
    readonly getCurrentTime?: () => Timestamp
  } = {},
): readonly Entity[] =>
  feature.temporalGeometry.segments
    .map((segment, index) => {
      const samples = segment.samples
      const first = samples[0]
      const last = samples.at(-1)
      if (!first || !last) {
        throw new RangeError('Temporal geometry must contain samples.')
      }
      const startTime = first.time
      const endTime = last.time
      const color = Color.fromCssColorString(
        options.selected ? '#f3b85b' : '#35d4c7',
      )
      const availability = new TimeIntervalCollection([
        new TimeInterval({
          start: timestampToJulianDate(startTime),
          stop: timestampToJulianDate(endTime),
        }),
      ])

      if (segment.type === 'MovingLineString') {
        const getCurrentTime = options.getCurrentTime ?? (() => startTime)
        return [
          new Entity({
            id: geometrySegmentEntityId(feature.id, segment, index),
            name: feature.id,
            availability,
            polyline: {
              positions: new CallbackProperty(() => {
                const evaluated = geometryAtTime(segment, getCurrentTime())
                return evaluated?.type === 'MovingLineString'
                  ? evaluated.positions.map(coordinateToCartesian3)
                  : undefined
              }, false),
              material: color.withAlpha(options.selected ? 0.95 : 0.75),
              width: options.selected ? 5 : 3,
            },
          }),
        ]
      }

      const pointSamples = segment.samples
      const motionCurvePosition = new CallbackPositionProperty((time) => {
        if (!time) return undefined
        const evaluated = geometryAtTime(
          segment,
          JulianDate.toDate(time).getTime(),
        )
        return evaluated?.type === 'MovingPoint'
          ? coordinateToCartesian3(evaluated.position)
          : undefined
      }, false)

      if (options.selected) {
        return [
          new Entity({
            id: geometrySegmentTrajectoryEntityId(feature.id, segment, index),
            name: feature.id,
            polyline: {
              positions: pointSamples.map(coordinateToCartesian3),
              material: color.withAlpha(0.75),
              width: 4,
            },
          }),
          new Entity({
            id: geometrySegmentPositionEntityId(feature.id, segment, index),
            name: feature.id,
            availability,
            position: motionCurvePosition,
            point: {
              color,
              outlineColor: Color.fromCssColorString('#071b1c'),
              outlineWidth: 4,
              pixelSize: 15,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }),
        ]
      }

      const durationSeconds = Math.max((endTime - startTime) / 1_000, 1)

      return [
        new Entity({
          id: geometrySegmentEntityId(feature.id, segment, index),
          name: feature.id,
          availability,
          position: motionCurvePosition,
          point: {
            color,
            outlineColor: Color.fromCssColorString('#071b1c'),
            outlineWidth: 3,
            pixelSize: 11,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          path: {
            leadTime: durationSeconds,
            trailTime: durationSeconds,
            material: color.withAlpha(0.75),
            width: 2,
          },
        }),
      ]
    })
    .flat()
