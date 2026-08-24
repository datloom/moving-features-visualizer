import {
  Cartesian3,
  Color,
  Entity,
  JulianDate,
  LinearApproximation,
  SampledPositionProperty,
  TimeInterval,
  TimeIntervalCollection,
} from 'cesium'

import type {
  MovingFeature,
  PositionSample,
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
  const samples = feature.temporalGeometry.samples
  const firstSample = samples[0]
  const lastSample = samples.at(-1)

  if (!firstSample || !lastSample) {
    throw new RangeError('MovingPoint geometry must contain position samples.')
  }

  return { startTime: firstSample.time, endTime: lastSample.time }
}

export const movingFeatureToEntity = (feature: MovingFeature): Entity => {
  const samples = feature.temporalGeometry.samples
  const { startTime, endTime } = getFeatureTimeRange(feature)
  const durationSeconds = Math.max((endTime - startTime) / 1_000, 1)

  return new Entity({
    id: feature.id,
    name: feature.id,
    availability: new TimeIntervalCollection([
      new TimeInterval({
        start: timestampToJulianDate(startTime),
        stop: timestampToJulianDate(endTime),
      }),
    ]),
    position: samplesToPositionProperty(samples),
    point: {
      color: Color.fromCssColorString('#35d4c7'),
      outlineColor: Color.fromCssColorString('#071b1c'),
      outlineWidth: 3,
      pixelSize: 12,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    path: {
      leadTime: durationSeconds,
      trailTime: durationSeconds,
      material: Color.fromCssColorString('#35d4c7').withAlpha(0.75),
      width: 3,
    },
  })
}
