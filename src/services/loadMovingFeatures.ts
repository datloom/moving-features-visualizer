import { normalizeMovingFeature } from '../mfjson/normalizer'
import type { MovingFeature } from '../mfjson/types'
import { validateMfJson, type ValidationIssue } from '../mfjson/validator'
import { useFeatureStore } from '../store/featureStore'
import { useFeatureTemporalPaginationStore } from '../store/featureTemporalPaginationStore'
import { useTimeStore } from '../store/timeStore'
import {
  MovingFeatureDataSourceError,
  type MovingFeatureDataSource,
} from './data-source/MovingFeatureDataSource'
import { getDatasetTimeRange, type DatasetTimeRange } from './datasetTimeRange'

export type MovingFeatureLoadError =
  | { readonly type: 'data-source'; readonly message: string }
  | { readonly type: 'invalid-json'; readonly message: string }
  | {
      readonly type: 'validation'
      readonly message: string
      readonly issues: readonly ValidationIssue[]
    }
  | {
      readonly type: 'normalization'
      readonly message: string
      readonly issues: readonly ValidationIssue[]
    }
  | { readonly type: 'empty-dataset'; readonly message: string }

export type MovingFeatureLoadResult =
  | {
      readonly success: true
      readonly features: readonly MovingFeature[]
      readonly timeRange: DatasetTimeRange
    }
  | { readonly success: false; readonly error: MovingFeatureLoadError }

const asFeatureInputs = (input: unknown): readonly unknown[] => {
  if (Array.isArray(input)) return input
  if (
    typeof input === 'object' &&
    input !== null &&
    'type' in input &&
    input.type === 'FeatureCollection' &&
    'features' in input &&
    Array.isArray(input.features)
  ) {
    return input.features
  }
  return [input]
}

export const loadMovingFeatures = async (
  dataSource: MovingFeatureDataSource,
  options: { readonly mode?: 'replace' | 'append' } = {},
): Promise<MovingFeatureLoadResult> => {
  let rawData: unknown

  try {
    rawData = await dataSource.load()
  } catch (error) {
    if (error instanceof MovingFeatureDataSourceError) {
      return {
        success: false,
        error: { type: error.kind, message: error.message },
      }
    }

    return {
      success: false,
      error: {
        type: 'data-source',
        message: error instanceof Error ? error.message : 'Data source failed.',
      },
    }
  }

  const inputs = asFeatureInputs(rawData)
  if (inputs.length === 0) {
    if (options.mode === 'append') {
      const time = useTimeStore.getState()
      return {
        success: true,
        features: [],
        timeRange: { startTime: time.startTime, endTime: time.endTime },
      }
    }
    return {
      success: false,
      error: {
        type: 'empty-dataset',
        message: 'Dataset contains no features.',
      },
    }
  }

  const validationIssues = inputs.flatMap((input) => {
    const result = validateMfJson(input)
    return result.valid ? [] : result.issues
  })

  if (validationIssues.length > 0) {
    return {
      success: false,
      error: {
        type: 'validation',
        message: 'MF-JSON validation failed.',
        issues: validationIssues,
      },
    }
  }

  const features: MovingFeature[] = []
  for (const input of inputs) {
    const result = normalizeMovingFeature(input)
    if (!result.success) {
      return {
        success: false,
        error: {
          type: 'normalization',
          message: 'MF-JSON normalization failed.',
          issues: result.issues,
        },
      }
    }
    if (
      dataSource.origin?.type !== 'file' &&
      result.data.temporalGeometry.segments.some(
        (segment) =>
          segment.type === 'MovingLineString' ||
          segment.type === 'MovingPolygon',
      )
    ) {
      return {
        success: false,
        error: {
          type: 'validation',
          message: 'MF-JSON validation failed.',
          issues: [
            {
              path: '$.temporalGeometry.type',
              code: 'unsupported_value',
              message:
                'MovingLineString and MovingPolygon ingestion are currently supported only for local files.',
              expected: 'MovingPoint',
              actual: result.data.temporalGeometry.segments.find(
                (segment) => segment.type !== 'MovingPoint',
              )?.type,
            },
          ],
        },
      }
    }
    features.push(result.data)
  }

  const timeRange = getDatasetTimeRange(features)
  if (!timeRange) {
    return {
      success: false,
      error: {
        type: 'empty-dataset',
        message: 'Dataset contains no temporal samples.',
      },
    }
  }

  if (options.mode === 'append') {
    const featureStore = useFeatureStore.getState()
    featureStore.appendFeatures(features)
    const combinedRange = getDatasetTimeRange(
      useFeatureStore.getState().features,
    )
    if (combinedRange) {
      useTimeStore
        .getState()
        .setRange(combinedRange.startTime, combinedRange.endTime)
    }
  } else {
    useFeatureTemporalPaginationStore.getState().clear()
    useFeatureStore.getState().replaceFeatures(features)
    const timeStore = useTimeStore.getState()
    timeStore.pause()
    timeStore.setRange(timeRange.startTime, timeRange.endTime)
    useTimeStore.getState().setCurrentTime(timeRange.startTime)
  }

  return { success: true, features, timeRange }
}
