import { useMemo, useState } from 'react'

import {
  ALL_TEMPORAL_GEOMETRIES,
  COMPUTE_METRIC_LABELS,
  COMPUTE_METRICS,
  getComputeGeometryOptions,
  getComputeTimeRange,
  type ComputeGeometrySelection,
  type ComputeMetric,
} from '../../mfjson/computeQuery'
import type { MovingFeature } from '../../mfjson/types'
import { Icon } from '../ui/Icon'

const pad = (value: number): string => String(value).padStart(2, '0')

/** `datetime-local` inputs need local wall-clock time with no timezone suffix. */
const toLocalInputValue = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const parseLocalInputValue = (value: string): number =>
  new Date(value).getTime()

const defaultGeometrySelection = (
  feature: MovingFeature,
): ComputeGeometrySelection => {
  const segments = feature.temporalGeometry.segments
  return segments.length === 1 && segments[0]?.id
    ? segments[0].id
    : ALL_TEMPORAL_GEOMETRIES
}

export function ComputeTemporalPropertyDialog({
  feature,
  onClose,
}: {
  readonly feature: MovingFeature
  readonly onClose: () => void
}) {
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
    timeRange ? toLocalInputValue(timeRange.start) : '',
  )
  const [endInput, setEndInput] = useState(() =>
    timeRange ? toLocalInputValue(timeRange.end) : '',
  )
  const [submittedQuery, setSubmittedQuery] = useState<{
    readonly metric: ComputeMetric
    readonly geometry: ComputeGeometrySelection
    readonly start: number
    readonly end: number
  } | null>(null)

  const selectGeometry = (selection: ComputeGeometrySelection) => {
    setGeometrySelection(selection)
    setSubmittedQuery(null)
    const range = getComputeTimeRange(feature, selection)
    setStartInput(range ? toLocalInputValue(range.start) : '')
    setEndInput(range ? toLocalInputValue(range.end) : '')
  }

  const selectedOption = geometryOptions.find(
    (option) => option.value === geometrySelection,
  )
  const parsedStart = startInput ? parseLocalInputValue(startInput) : NaN
  const parsedEnd = endInput ? parseLocalInputValue(endInput) : NaN
  const rangeIsValid =
    Number.isFinite(parsedStart) &&
    Number.isFinite(parsedEnd) &&
    parsedStart < parsedEnd

  const disabledReason =
    feature.temporalGeometry.segments.length === 0
      ? 'This Feature has no TemporalGeometry to compute from.'
      : !metric
        ? 'Select a metric to continue.'
        : selectedOption?.disabled
          ? (selectedOption.diagnostic ?? 'This geometry is unavailable.')
          : !rangeIsValid
            ? 'Start must be before End.'
            : undefined

  const canCompute = disabledReason === undefined

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
          <label className="comparison-field">
            Metric
            <select
              onChange={(event) => {
                setMetric(event.target.value as ComputeMetric)
                setSubmittedQuery(null)
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
              Start
              <input
                onChange={(event) => {
                  setStartInput(event.target.value)
                  setSubmittedQuery(null)
                }}
                type="datetime-local"
                value={startInput}
              />
            </label>
            <label className="comparison-field">
              End
              <input
                onChange={(event) => {
                  setEndInput(event.target.value)
                  setSubmittedQuery(null)
                }}
                type="datetime-local"
                value={endInput}
              />
            </label>
          </div>
          {disabledReason ? (
            <p className="compute-reason" role="status">
              {disabledReason}
            </p>
          ) : null}
          {submittedQuery ? (
            <div className="compute-debug" role="status">
              <p>
                Query built locally — server integration is not implemented yet.
              </p>
              <dl>
                <dt>Metric</dt>
                <dd>{COMPUTE_METRIC_LABELS[submittedQuery.metric]}</dd>
                <dt>Temporal Geometry</dt>
                <dd>
                  {submittedQuery.geometry === ALL_TEMPORAL_GEOMETRIES
                    ? 'All Temporal Geometries'
                    : submittedQuery.geometry}
                </dd>
                <dt>Start</dt>
                <dd>{new Date(submittedQuery.start).toISOString()}</dd>
                <dt>End</dt>
                <dd>{new Date(submittedQuery.end).toISOString()}</dd>
              </dl>
            </div>
          ) : null}
        </div>
        <footer className="compute-dialog-actions">
          <button onClick={onClose} type="button">
            Cancel
          </button>
          <button
            className="compute-submit"
            disabled={!canCompute}
            onClick={() => {
              if (!canCompute || !metric) return
              setSubmittedQuery({
                metric,
                geometry: geometrySelection,
                start: parsedStart,
                end: parsedEnd,
              })
            }}
            type="button"
          >
            Compute
          </button>
        </footer>
      </section>
    </div>
  )
}
