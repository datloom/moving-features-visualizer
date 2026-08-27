import { MovingFeaturesApiError } from './errors'
import type {
  TemporalGeometryMetricResponse,
  TemporalGeometryMetricValueSequence,
} from './types'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** Value types recognized for a numeric TemporalGeometryQuery metric (velocity/acceleration/distance). */
const RECOGNIZED_VALUE_TYPES = ['TReal', 'TInteger'] as const

/**
 * Interpolation modes recognized in a TemporalGeometryMetric value sequence.
 * Exported so the Measure adapter (`derivedMeasureProperty.ts`) can map
 * these onto `MeasureInterpolation` without re-declaring the same list.
 */
export const RECOGNIZED_INTERPOLATIONS = ['Discrete', 'Step', 'Linear'] as const

const invalid = (message: string): never => {
  throw new MovingFeaturesApiError(
    'invalid-response',
    `TemporalGeometryMetric response is malformed: ${message}`,
  )
}

const validateValueSequence = (
  value: unknown,
  index: number,
): TemporalGeometryMetricValueSequence => {
  if (!isRecord(value)) {
    return invalid(`valueSequence[${index}] must be an object.`)
  }
  if (
    !Array.isArray(value.datetimes) ||
    value.datetimes.some((entry) => typeof entry !== 'string')
  ) {
    return invalid(`valueSequence[${index}].datetimes must be a string array.`)
  }
  if (
    !Array.isArray(value.values) ||
    value.values.some(
      (entry) => typeof entry !== 'number' || !Number.isFinite(entry),
    )
  ) {
    return invalid(
      `valueSequence[${index}].values must be a finite number array.`,
    )
  }
  if (value.datetimes.length !== value.values.length) {
    return invalid(
      `valueSequence[${index}] datetimes and values must have matching lengths.`,
    )
  }
  if (
    typeof value.interpolation !== 'string' ||
    !RECOGNIZED_INTERPOLATIONS.includes(
      value.interpolation as (typeof RECOGNIZED_INTERPOLATIONS)[number],
    )
  ) {
    return invalid(
      `valueSequence[${index}].interpolation must be one of ${RECOGNIZED_INTERPOLATIONS.join(', ')}.`,
    )
  }
  return {
    datetimes: value.datetimes,
    values: value.values,
    interpolation: value.interpolation,
  }
}

/**
 * Validates a raw TemporalGeometryQuery metric response (velocity/
 * acceleration/distance) before it is trusted anywhere in the app. This is
 * the external API's own DTO shape — never coerced into the application's
 * `MeasureTemporalProperty` here; that normalization, if/when it happens,
 * is a separate step at the point of use.
 */
export const validateTemporalGeometryMetricResponse = (
  value: unknown,
): TemporalGeometryMetricResponse => {
  if (!isRecord(value)) return invalid('response must be an object.')
  if (typeof value.name !== 'string') return invalid('name must be a string.')
  if (
    typeof value.type !== 'string' ||
    !RECOGNIZED_VALUE_TYPES.includes(
      value.type as (typeof RECOGNIZED_VALUE_TYPES)[number],
    )
  ) {
    return invalid(`type must be one of ${RECOGNIZED_VALUE_TYPES.join(', ')}.`)
  }
  if (value.form !== undefined && typeof value.form !== 'string') {
    return invalid('form must be a string when present.')
  }
  if (!Array.isArray(value.valueSequence)) {
    return invalid('valueSequence must be an array.')
  }
  return {
    name: value.name,
    type: value.type,
    form: value.form,
    valueSequence: value.valueSequence.map((entry, index) =>
      validateValueSequence(entry, index),
    ),
  }
}
