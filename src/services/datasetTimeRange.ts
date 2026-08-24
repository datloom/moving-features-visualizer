import type { MovingFeature } from '../mfjson/types'

export interface DatasetTimeRange {
  readonly startTime: number
  readonly endTime: number
}

export const getDatasetTimeRange = (
  features: readonly MovingFeature[],
): DatasetTimeRange | undefined => {
  let startTime = Number.POSITIVE_INFINITY
  let endTime = Number.NEGATIVE_INFINITY

  for (const feature of features) {
    const sampleGroups = [
      ...feature.temporalGeometry.segments.map((segment) => segment.samples),
      ...feature.temporalProperties.map((property) => property.samples),
    ]

    for (const samples of sampleGroups) {
      for (const sample of samples) {
        startTime = Math.min(startTime, sample.time)
        endTime = Math.max(endTime, sample.time)
      }
    }
  }

  return Number.isFinite(startTime) && Number.isFinite(endTime)
    ? { startTime, endTime }
    : undefined
}
