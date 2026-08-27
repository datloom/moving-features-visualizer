import type { MovingFeature, TemporalGeometry, Timestamp } from './types'

/**
 * Canonical metrics computable from TemporalGeometry, server-side. Kept as a
 * closed set so the UI (and, later, the request payload) can never send an
 * arbitrary metric string.
 */
export const COMPUTE_METRICS = ['velocity', 'acceleration', 'distance'] as const
export type ComputeMetric = (typeof COMPUTE_METRICS)[number]

export const COMPUTE_METRIC_LABELS: Readonly<Record<ComputeMetric, string>> = {
  velocity: 'Velocity',
  acceleration: 'Acceleration',
  distance: 'Distance',
}

/** Sentinel `ComputeGeometrySelection` meaning every TemporalGeometry segment of the feature. */
export const ALL_TEMPORAL_GEOMETRIES = 'all'

/** Either `ALL_TEMPORAL_GEOMETRIES`, or a TemporalGeometry segment's own `id`. */
export type ComputeGeometrySelection = string

export interface ComputeGeometryOption {
  readonly value: ComputeGeometrySelection
  readonly label: string
  /**
   * True when this option cannot be selected yet — currently only the case
   * for an individual TemporalGeometry with no `id`. The normalized model
   * only retains an `id` when the source MF-JSON supplied one (see
   * `TemporalGeometry.id` in `types.ts`); none of the bundled sample
   * datasets do, so this is expected to be common until the server assigns
   * (or the parser is taught to synthesize) stable geometry identifiers.
   */
  readonly disabled: boolean
  readonly diagnostic?: string
}

export interface ComputeTimeRange {
  readonly start: Timestamp
  readonly end: Timestamp
}

const sampleCount = (segment: TemporalGeometry): number =>
  segment.samples.length

const segmentTimeRange = (
  segment: TemporalGeometry,
): ComputeTimeRange | undefined => {
  const first = segment.samples[0]
  const last = segment.samples.at(-1)
  return first && last ? { start: first.time, end: last.time } : undefined
}

const segmentLabel = (segment: TemporalGeometry): string =>
  `${segment.type} · ${sampleCount(segment)} sample${sampleCount(segment) === 1 ? '' : 's'}`

/**
 * Builds the "Temporal Geometry" selector options for the Compute dialog:
 * always "All Temporal Geometries", plus one entry per segment. A segment
 * without a retained `id` is included for visibility but marked disabled —
 * we never fabricate an identifier the server hasn't assigned.
 */
export const getComputeGeometryOptions = (
  feature: MovingFeature,
): readonly ComputeGeometryOption[] => [
  {
    value: ALL_TEMPORAL_GEOMETRIES,
    label: 'All Temporal Geometries',
    disabled: false,
  },
  ...feature.temporalGeometry.segments.map((segment, index) => {
    if (segment.id) {
      return {
        value: segment.id,
        label: `${segment.id} · ${segmentLabel(segment)}`,
        disabled: false,
      }
    }
    return {
      value: `__no-id-${index}`,
      label: `Segment ${index + 1} · ${segmentLabel(segment)}`,
      disabled: true,
      diagnostic: 'No server geometry ID available for this segment yet',
    }
  }),
]

/**
 * Default Start/End for the selected geometry: the earliest/latest sample
 * timestamp across the relevant segment(s). Returns undefined only when
 * there is no usable sample data to derive a range from.
 */
export const getComputeTimeRange = (
  feature: MovingFeature,
  selection: ComputeGeometrySelection,
): ComputeTimeRange | undefined => {
  const segments =
    selection === ALL_TEMPORAL_GEOMETRIES
      ? feature.temporalGeometry.segments
      : feature.temporalGeometry.segments.filter(
          (segment) => segment.id === selection,
        )
  const ranges = segments
    .map(segmentTimeRange)
    .filter((range): range is ComputeTimeRange => range !== undefined)
  if (ranges.length === 0) return undefined
  return {
    start: Math.min(...ranges.map((range) => range.start)),
    end: Math.max(...ranges.map((range) => range.end)),
  }
}

/** One queryable TemporalGeometry: a segment that has a server-assigned `id`. */
export interface TemporalGeometryQueryDescriptor {
  readonly tGeometryId: string
  readonly type: TemporalGeometry['type']
  readonly startTime: Timestamp
  readonly endTime: Timestamp
  readonly sampleCount: number
}

/**
 * The TemporalGeometry segments of `feature` that a TemporalGeometryQuery
 * can actually target — i.e. those with a retained `id`. Segments without
 * one are simply omitted here (never fabricated); `getComputeGeometryOptions`
 * above is the place that still surfaces them, disabled, for UI visibility.
 */
export const getQueryableGeometries = (
  feature: MovingFeature,
): readonly TemporalGeometryQueryDescriptor[] =>
  feature.temporalGeometry.segments.flatMap((segment) => {
    const { id } = segment
    const range = id ? segmentTimeRange(segment) : undefined
    if (!id || !range) return []
    return [
      {
        tGeometryId: id,
        type: segment.type,
        startTime: range.start,
        endTime: range.end,
        sampleCount: sampleCount(segment),
      },
    ]
  })

export const LOCAL_FEATURE_COMPUTE_REASON =
  'Server-derived properties are available for server-loaded features.'

export interface ServerTemporalGeometryQueryContext {
  readonly source: 'server'
  readonly collectionId: string
  readonly mFeatureId: string
  readonly geometries: readonly TemporalGeometryQueryDescriptor[]
}

export interface LocalFeatureQueryContext {
  readonly source: 'local'
  readonly mFeatureId: string
  readonly reason: string
}

export type TemporalGeometryQueryContext =
  ServerTemporalGeometryQueryContext | LocalFeatureQueryContext

/**
 * Resolves the full context a TemporalGeometryQuery needs: `collectionId`,
 * `mFeatureId` (the same id used for feature selection/visibility
 * elsewhere), and the queryable geometries with their `tGeometryId`s and
 * time ranges.
 *
 * `serverCollectionId` is supplied by the caller rather than looked up
 * here — `mfjson/*` stays free of any store/React dependency (see the
 * project's architecture rules); the active server collection, if any,
 * lives in `useServerCollectionStore`. `undefined` means the currently
 * loaded features did not come from a server collection (a local file, or
 * nothing loaded yet) — TemporalGeometryQuery is server-only, so that
 * yields a `'local'` context explaining why Compute is unavailable rather
 * than a guessed/derived collection id.
 */
export const resolveTemporalGeometryQueryContext = (
  feature: MovingFeature,
  serverCollectionId: string | undefined,
): TemporalGeometryQueryContext =>
  serverCollectionId === undefined
    ? {
        source: 'local',
        mFeatureId: feature.id,
        reason: LOCAL_FEATURE_COMPUTE_REASON,
      }
    : {
        source: 'server',
        collectionId: serverCollectionId,
        mFeatureId: feature.id,
        geometries: getQueryableGeometries(feature),
      }
