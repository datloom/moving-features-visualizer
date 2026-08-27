import type {
  MeasureInterpolation,
  MeasureTemporalProperty,
} from '../../mfjson/types'
import { RECOGNIZED_INTERPOLATIONS } from './temporalGeometryMetricResponse'
import type { TemporalGeometryQueryOutcome } from './temporalGeometryQueryOrchestrator'
import type { TemporalGeometryMetric } from './types'

/**
 * Adapts TemporalGeometryQuery results (velocity/acceleration/distance) into
 * the application's existing normalized Measure TemporalProperty model —
 * `TReal → Measure` — so no new renderer is needed; the existing Measure
 * chart/comparison components can consume `segments` unchanged.
 *
 * ONE logical property, MANY internal segments: every response's
 * `valueSequence` entry becomes its own independent `DerivedMeasureSegment`
 * (never flattened into one continuous samples array, never bridged across
 * a TemporalGeometry or valueSequence boundary), but all segments share the
 * same logical `name` (e.g. "velocity") — exactly the existing convention
 * already used for Text/Image TemporalProperties, where a logical property
 * is a same-named array of independent segments, not one merged object.
 */

/** A Measure TemporalProperty segment derived from one server valueSequence entry, never exposed as a raw API DTO. */
export interface DerivedMeasureSegment extends MeasureTemporalProperty {
  readonly source: 'derived-server'
  readonly sourceTemporalGeometryId: string
  readonly metric: TemporalGeometryMetric
}

export interface IncompatibleFormSegment {
  readonly tGeometryId: string
  readonly form: string | undefined
}

export interface DerivedMeasurePropertyResult {
  readonly name: TemporalGeometryMetric
  /** Deterministically ordered: by first-sample time, then by source TemporalGeometry/sequence index. */
  readonly segments: readonly DerivedMeasureSegment[]
  /**
   * TemporalGeometry results whose `form` didn't match the first-seen
   * (canonical) form for this metric — excluded from `segments` rather than
   * silently combined into one nominally-homogeneous property. Detected,
   * never unit-converted (no such infrastructure exists).
   */
  readonly incompatibleForms: readonly IncompatibleFormSegment[]
}

const mapMeasureInterpolation = (
  value: string,
  tGeometryId: string,
): MeasureInterpolation => {
  if (
    !RECOGNIZED_INTERPOLATIONS.includes(
      value as (typeof RECOGNIZED_INTERPOLATIONS)[number],
    )
  ) {
    throw new RangeError(
      `TemporalGeometry ${tGeometryId}: unrecognized valueSequence interpolation "${value}".`,
    )
  }
  // MeasureInterpolation's own literal set ('Discrete' | 'Step' | 'Linear' |
  // 'Regression') is a strict superset of the server's recognized values —
  // preserved as-is, never derived from the source geometry's MotionCurve.
  return value as MeasureInterpolation
}

/**
 * Converts one TemporalGeometryQuery outcome (already scoped to one metric,
 * across one selected geometry or "All") into the segments of one logical
 * derived Measure property. Failed TemporalGeometry requests (from
 * `outcome.failures`) are simply absent — this only adapts what actually
 * succeeded; the caller already has `outcome.failures` for reporting.
 */
export const adaptTemporalGeometryQueryOutcome = (
  outcome: TemporalGeometryQueryOutcome,
): DerivedMeasurePropertyResult => {
  let canonicalForm: string | undefined
  let canonicalFormSeen = false
  const incompatibleForms: IncompatibleFormSegment[] = []
  const segments: DerivedMeasureSegment[] = []

  for (const result of outcome.results) {
    const { form } = result.response
    if (!canonicalFormSeen) {
      canonicalForm = form
      canonicalFormSeen = true
    } else if (form !== canonicalForm) {
      incompatibleForms.push({ tGeometryId: result.tGeometryId, form })
      continue
    }

    for (const sequence of result.response.valueSequence) {
      segments.push({
        type: 'Measure',
        name: outcome.metric,
        interpolation: mapMeasureInterpolation(
          sequence.interpolation,
          result.tGeometryId,
        ),
        form,
        samples: sequence.datetimes.map((datetime, index) => ({
          time: Date.parse(datetime),
          value: sequence.values[index]!,
        })),
        source: 'derived-server',
        sourceTemporalGeometryId: result.tGeometryId,
        metric: outcome.metric,
      })
    }
  }

  segments.sort((a, b) => {
    const aTime = a.samples[0]?.time ?? Number.POSITIVE_INFINITY
    const bTime = b.samples[0]?.time ?? Number.POSITIVE_INFINITY
    if (aTime !== bTime) return aTime - bTime
    return a.sourceTemporalGeometryId.localeCompare(b.sourceTemporalGeometryId)
  })

  return { name: outcome.metric, segments, incompatibleForms }
}
