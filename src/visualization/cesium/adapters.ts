import { Cartesian3, JulianDate, SampledPositionProperty } from 'cesium'

import type { PositionSample, Timestamp } from '../../mfjson/types'

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

  for (const sample of samples) {
    property.addSample(
      timestampToJulianDate(sample.time),
      coordinateToCartesian3(sample),
    )
  }

  return property
}
