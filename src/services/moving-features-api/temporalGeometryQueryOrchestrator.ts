import type { TemporalGeometryQueryDescriptor } from '../../mfjson/computeQuery'
import type { MovingFeaturesApiClient } from './MovingFeaturesApiClient'
import {
  DEFAULT_FEATURE_CONCURRENCY,
  type TemporalGeometryMetric,
  type TemporalGeometryMetricResponse,
} from './types'

/**
 * Runs one TemporalGeometryQuery metric across one or more TemporalGeometry
 * segments of a MovingFeature — "one selected TemporalGeometry" is just a
 * `geometries` array of length 1, "All Temporal Geometries" is the feature's
 * full queryable set. The caller decides which; this module stays agnostic
 * of that selection UI concept (`ALL_TEMPORAL_GEOMETRIES` etc. live in
 * `mfjson/computeQuery.ts`).
 *
 * This does NOT merge results into the application's TemporalProperty
 * model or touch any store/UI state — see `TemporalGeometryQueryOutcome`.
 */

export interface DatetimeIntersection {
  readonly start: number
  readonly end: number
}

/**
 * Intersects the user-selected query window with one TemporalGeometry's own
 * source extent: `requestStart = max(userStart, tgStart)`,
 * `requestEnd = min(userEnd, tgEnd)`. Returns undefined when there is no
 * overlap — the server's datetime interval is inclusive at both ends (see
 * `serializeDateTimeInterval`), so `start === end` is still a valid,
 * non-empty single-instant request.
 */
export const intersectDatetimeRange = (
  userStart: number,
  userEnd: number,
  tgStart: number,
  tgEnd: number,
): DatetimeIntersection | undefined => {
  const start = Math.max(userStart, tgStart)
  const end = Math.min(userEnd, tgEnd)
  return start <= end ? { start, end } : undefined
}

export interface TemporalGeometryMetricResult {
  readonly tGeometryId: string
  readonly requestedStart: number
  readonly requestedEnd: number
  readonly response: TemporalGeometryMetricResponse
}

export interface TemporalGeometryMetricFailure {
  readonly tGeometryId: string
  readonly message: string
}

export interface TemporalGeometryQueryOutcome {
  readonly metric: TemporalGeometryMetric
  /** In normalized feature segment order — never network-completion order. */
  readonly results: readonly TemporalGeometryMetricResult[]
  readonly failures: readonly TemporalGeometryMetricFailure[]
  /**
   * True when `isStale()` reported this query obsolete (feature/collection
   * changed, another compute started, etc.) either before or during
   * execution. Callers must discard the whole outcome rather than apply any
   * part of it when this is true — `results`/`failures` may be incomplete.
   */
  readonly stale: boolean
}

export interface TemporalGeometryQueryOrchestrationRequest {
  readonly collectionId: string
  readonly mFeatureId: string
  readonly metric: TemporalGeometryMetric
  readonly geometries: readonly TemporalGeometryQueryDescriptor[]
  readonly userStart: number
  readonly userEnd: number
}

export interface TemporalGeometryQueryOrchestrationOptions {
  /** Bounded concurrency, mirroring `MovingFeaturesApiAssembler`'s worker pool. */
  readonly concurrency?: number
  /**
   * Checked before starting each request and again before recording its
   * result. There is no AbortController in this API layer to reuse (see
   * `MovingFeaturesApiClient`), so this mirrors the project's existing
   * stale-request strategy instead — a caller-owned generation/queryKey
   * comparison, the same shape used in `featureTemporalPaginationStore`.
   * Defaults to never-stale.
   */
  readonly isStale?: () => boolean
}

const eligibleRequests = (
  geometries: readonly TemporalGeometryQueryDescriptor[],
  userStart: number,
  userEnd: number,
): readonly {
  readonly geometry: TemporalGeometryQueryDescriptor
  readonly window: DatetimeIntersection
}[] =>
  geometries.flatMap((geometry) => {
    const window = intersectDatetimeRange(
      userStart,
      userEnd,
      geometry.startTime,
      geometry.endTime,
    )
    // No overlap: skip this TemporalGeometry entirely — never an empty/failed request.
    return window ? [{ geometry, window }] : []
  })

export const runTemporalGeometryQuery = async (
  client: MovingFeaturesApiClient,
  request: TemporalGeometryQueryOrchestrationRequest,
  options: TemporalGeometryQueryOrchestrationOptions = {},
): Promise<TemporalGeometryQueryOutcome> => {
  const concurrency = options.concurrency ?? DEFAULT_FEATURE_CONCURRENCY
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(
      'Temporal geometry query concurrency must be a positive integer.',
    )
  }
  const isStale = options.isStale ?? (() => false)

  const eligible = eligibleRequests(
    request.geometries,
    request.userStart,
    request.userEnd,
  )

  // Pre-allocated by index (segment order) so completion order — whichever
  // request happens to resolve first — never affects the returned order.
  const resultSlots = Array.from<TemporalGeometryMetricResult | undefined>({
    length: eligible.length,
  })
  const failureSlots = Array.from<TemporalGeometryMetricFailure | undefined>({
    length: eligible.length,
  })
  let cursor = 0

  const loadNext = async (): Promise<void> => {
    while (cursor < eligible.length) {
      if (isStale()) return
      const index = cursor++
      const { geometry, window } = eligible[index]!
      try {
        const response = await client.getTemporalGeometryMetric({
          collectionId: request.collectionId,
          mFeatureId: request.mFeatureId,
          tGeometryId: geometry.tGeometryId,
          metric: request.metric,
          startTime: window.start,
          endTime: window.end,
        })
        if (isStale()) return
        resultSlots[index] = {
          tGeometryId: geometry.tGeometryId,
          requestedStart: window.start,
          requestedEnd: window.end,
          response,
        }
      } catch (error) {
        if (isStale()) return
        failureSlots[index] = {
          tGeometryId: geometry.tGeometryId,
          message:
            error instanceof Error
              ? error.message
              : 'Temporal geometry metric query failed.',
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, eligible.length) }, () =>
      loadNext(),
    ),
  )

  return {
    metric: request.metric,
    results: resultSlots.filter(
      (slot): slot is TemporalGeometryMetricResult => slot !== undefined,
    ),
    failures: failureSlots.filter(
      (slot): slot is TemporalGeometryMetricFailure => slot !== undefined,
    ),
    stale: isStale(),
  }
}
