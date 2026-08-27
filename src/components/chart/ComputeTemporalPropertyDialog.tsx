import { useEffect, useMemo, useRef, useState } from 'react'

import {
  ALL_TEMPORAL_GEOMETRIES,
  COMPUTE_METRIC_LABELS,
  COMPUTE_METRICS,
  getComputeGeometryOptions,
  getComputeTimeRange,
  resolveTemporalGeometryQueryContext,
  type ComputeGeometrySelection,
  type ComputeMetric,
} from '../../mfjson/computeQuery'
import type { MovingFeature } from '../../mfjson/types'
import {
  formatUtcDateTimeLocal,
  parseUtcDateTimeLocal,
} from '../../mfjson/utcDateTimeLocal'
import { MovingFeaturesApiClient } from '../../services/moving-features-api/MovingFeaturesApiClient'
import { adaptTemporalGeometryQueryOutcome } from '../../services/moving-features-api/derivedMeasureProperty'
import { runTemporalGeometryQuery } from '../../services/moving-features-api/temporalGeometryQueryOrchestrator'
import { useFeatureStore } from '../../store/featureStore'
import { useServerCollectionStore } from '../../store/serverCollectionStore'
import { Icon } from '../ui/Icon'

const defaultGeometrySelection = (
  feature: MovingFeature,
): ComputeGeometrySelection => {
  const segments = feature.temporalGeometry.segments
  return segments.length === 1 && segments[0]?.id
    ? segments[0].id
    : ALL_TEMPORAL_GEOMETRIES
}

type ComputeRunState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'running'
      readonly completed: number
      readonly total: number
    }
  | {
      readonly kind: 'done-with-warnings'
      readonly metric: ComputeMetric
      readonly attempted: number
      readonly succeeded: number
      readonly incompatibleForms: readonly {
        readonly tGeometryId: string
        readonly form: string | undefined
      }[]
    }
  | { readonly kind: 'error'; readonly message: string }

export function ComputeTemporalPropertyDialog({
  feature,
  onClose,
  onComputed,
}: {
  readonly feature: MovingFeature
  readonly onClose: () => void
  /** Called with the logical property key (e.g. "Measure:velocity") once a compute run adds/updates at least one segment. */
  readonly onComputed: (propertyKey: string) => void
}) {
  // TemporalGeometryQuery is server-only: the active server session (if any)
  // is the sole source of `collectionId`/`baseUrl` — never derived from UI
  // labels or guessed for local-file features.
  const session = useServerCollectionStore((state) => state.session)
  const queryContext = useMemo(
    () => resolveTemporalGeometryQueryContext(feature, session?.collectionId),
    [feature, session?.collectionId],
  )
  const geometryOptions = useMemo(
    () => getComputeGeometryOptions(feature),
    [feature],
  )
  const [metric, setMetric] = useState<ComputeMetric | ''>('')
  const [geometrySelection, setGeometrySelection] =
    useState<ComputeGeometrySelection>(() => defaultGeometrySelection(feature))
  const timeRange = useMemo(
    () => getComputeTimeRange(feature, geometrySelection),
    [feature, geometrySelection],
  )
  const [startInput, setStartInput] = useState(() =>
    timeRange ? formatUtcDateTimeLocal(timeRange.start) : '',
  )
  const [endInput, setEndInput] = useState(() =>
    timeRange ? formatUtcDateTimeLocal(timeRange.end) : '',
  )
  const [runState, setRunState] = useState<ComputeRunState>({ kind: 'idle' })

  // Stale-request protection (see `temporalGeometryQueryOrchestrator`'s
  // `isStale`): once this dialog instance is closed/unmounted mid-request —
  // the user cancelled, or reopened Compute for a different feature — its
  // in-flight result must never be applied.
  const activeRef = useRef(true)
  useEffect(
    () => () => {
      activeRef.current = false
    },
    [],
  )

  const selectGeometry = (selection: ComputeGeometrySelection) => {
    setGeometrySelection(selection)
    setRunState({ kind: 'idle' })
    const range = getComputeTimeRange(feature, selection)
    setStartInput(range ? formatUtcDateTimeLocal(range.start) : '')
    setEndInput(range ? formatUtcDateTimeLocal(range.end) : '')
  }

  const selectedOption = geometryOptions.find(
    (option) => option.value === geometrySelection,
  )
  const parsedStart = startInput ? parseUtcDateTimeLocal(startInput) : NaN
  const parsedEnd = endInput ? parseUtcDateTimeLocal(endInput) : NaN
  const rangeIsValid =
    Number.isFinite(parsedStart) &&
    Number.isFinite(parsedEnd) &&
    parsedStart < parsedEnd
  const isRunning = runState.kind === 'running'

  const disabledReason =
    queryContext.source === 'local'
      ? queryContext.reason
      : feature.temporalGeometry.segments.length === 0
        ? 'This Feature has no TemporalGeometry to compute from.'
        : !metric
          ? 'Select a metric to continue.'
          : selectedOption?.disabled
            ? (selectedOption.diagnostic ?? 'This geometry is unavailable.')
            : !rangeIsValid
              ? 'Start must be before End.'
              : isRunning
                ? 'A compute request is already running.'
                : undefined

  const canCompute = disabledReason === undefined

  const handleCompute = async () => {
    if (!canCompute || !metric || queryContext.source !== 'server' || !session)
      return
    const geometries =
      geometrySelection === ALL_TEMPORAL_GEOMETRIES
        ? queryContext.geometries
        : queryContext.geometries.filter(
            (candidate) => candidate.tGeometryId === geometrySelection,
          )
    if (geometries.length === 0) {
      setRunState({
        kind: 'error',
        message: 'No queryable TemporalGeometry is selected.',
      })
      return
    }

    setRunState({ kind: 'running', completed: 0, total: geometries.length })
    try {
      const client = new MovingFeaturesApiClient(session.baseUrl)
      const outcome = await runTemporalGeometryQuery(
        client,
        {
          collectionId: queryContext.collectionId,
          mFeatureId: queryContext.mFeatureId,
          metric,
          geometries,
          userStart: parsedStart,
          userEnd: parsedEnd,
        },
        {
          isStale: () => !activeRef.current,
          onProgress: (completed, total) => {
            if (!activeRef.current) return
            setRunState({ kind: 'running', completed, total })
          },
        },
      )
      if (!activeRef.current || outcome.stale) return

      const attempted = outcome.results.length + outcome.failures.length
      if (attempted === 0) {
        // Every selected geometry was skipped — none overlapped the
        // requested time range. Nothing to add/replace; say so rather than
        // silently closing as if the (nonexistent) computation succeeded.
        setRunState({
          kind: 'error',
          message:
            'No TemporalGeometry overlaps the selected time range — nothing was computed.',
        })
        return
      }

      const adapted = adaptTemporalGeometryQueryOutcome(outcome)
      if (adapted.segments.length > 0) {
        useFeatureStore
          .getState()
          .setDerivedMeasureSegments(feature.id, metric, adapted.segments)
        onComputed(`Measure:${metric}`)
      }

      const fullySucceeded =
        outcome.failures.length === 0 && adapted.incompatibleForms.length === 0
      if (fullySucceeded) {
        onClose()
        return
      }
      setRunState({
        kind: 'done-with-warnings',
        metric,
        attempted: outcome.results.length + outcome.failures.length,
        succeeded: new Set(
          adapted.segments.map((segment) => segment.sourceTemporalGeometryId),
        ).size,
        incompatibleForms: adapted.incompatibleForms,
      })
    } catch (error) {
      if (!activeRef.current) return
      setRunState({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Temporal geometry metric query failed.',
      })
    }
  }

  return (
    <div className="compute-backdrop" onClick={onClose} role="presentation">
      <section
        aria-labelledby="compute-dialog-title"
        aria-modal="true"
        className="compute-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="compute-dialog-header">
          <h2 id="compute-dialog-title">Compute Temporal Property</h2>
          <button
            aria-label="Close compute dialog"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="compute-dialog-body">
          {queryContext.source === 'local' ? (
            <p className="compute-reason" role="status">
              {queryContext.reason}
            </p>
          ) : (
            <>
              <label className="comparison-field">
                Metric
                <select
                  disabled={isRunning}
                  onChange={(event) => {
                    setMetric(event.target.value as ComputeMetric)
                    setRunState({ kind: 'idle' })
                  }}
                  value={metric}
                >
                  <option disabled value="">
                    Select a metric…
                  </option>
                  {COMPUTE_METRICS.map((option) => (
                    <option key={option} value={option}>
                      {COMPUTE_METRIC_LABELS[option]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="comparison-field">
                Temporal Geometry
                <select
                  disabled={isRunning}
                  onChange={(event) => selectGeometry(event.target.value)}
                  value={geometrySelection}
                >
                  {geometryOptions.map((option) => (
                    <option
                      disabled={option.disabled}
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                      {option.diagnostic ? ` (${option.diagnostic})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <div className="compute-time-range">
                <label className="comparison-field">
                  Start (UTC)
                  <input
                    disabled={isRunning}
                    onChange={(event) => {
                      setStartInput(event.target.value)
                      setRunState({ kind: 'idle' })
                    }}
                    type="datetime-local"
                    value={startInput}
                  />
                </label>
                <label className="comparison-field">
                  End (UTC)
                  <input
                    disabled={isRunning}
                    onChange={(event) => {
                      setEndInput(event.target.value)
                      setRunState({ kind: 'idle' })
                    }}
                    type="datetime-local"
                    value={endInput}
                  />
                </label>
              </div>
              {disabledReason && !isRunning ? (
                <p className="compute-reason" role="status">
                  {disabledReason}
                </p>
              ) : null}
              {runState.kind === 'running' ? (
                <p className="compute-reason" role="status">
                  {runState.total > 1
                    ? `Computing ${runState.completed} / ${runState.total}…`
                    : 'Computing…'}
                </p>
              ) : null}
              {runState.kind === 'error' ? (
                <p className="compute-reason" role="alert">
                  {runState.message}
                </p>
              ) : null}
              {runState.kind === 'done-with-warnings' ? (
                <div className="compute-debug" role="status">
                  {runState.succeeded < runState.attempted ? (
                    <p>
                      {COMPUTE_METRIC_LABELS[runState.metric]} computed for{' '}
                      {runState.succeeded} of {runState.attempted}{' '}
                      TemporalGeometry segments. You can retry later — a
                      recompute replaces this result.
                    </p>
                  ) : null}
                  {runState.incompatibleForms.length > 0 ? (
                    <p>
                      {runState.incompatibleForms.length} segment
                      {runState.incompatibleForms.length === 1 ? '' : 's'}{' '}
                      excluded: incompatible form (
                      {runState.incompatibleForms
                        .map(
                          (entry) =>
                            `${entry.tGeometryId}: ${entry.form ?? 'none'}`,
                        )
                        .join(', ')}
                      ).
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
        <footer className="compute-dialog-actions">
          <button onClick={onClose} type="button">
            {queryContext.source === 'local' ? 'Close' : 'Cancel'}
          </button>
          {queryContext.source === 'local' ? null : (
            <button
              className="compute-submit"
              disabled={!canCompute}
              onClick={() => void handleCompute()}
              type="button"
            >
              {isRunning ? 'Computing…' : 'Compute'}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
