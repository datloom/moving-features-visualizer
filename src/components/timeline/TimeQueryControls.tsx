import { useEffect, useState } from 'react'

import { formatUtcDateTimeLocal, parseUtcDateTimeLocal } from '../../mfjson/utcDateTimeLocal'
import { useTimeStore } from '../../store/timeStore'

const formatDisplayTime = (timestamp: number): string =>
  `${new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')} UTC`

export function TimeQueryControls() {
  const fullStartTime = useTimeStore((state) => state.fullStartTime)
  const fullEndTime = useTimeStore((state) => state.fullEndTime)
  const startTime = useTimeStore((state) => state.startTime)
  const endTime = useTimeStore((state) => state.endTime)
  const queryActive = useTimeStore((state) => state.queryActive)
  const rangeIsEmpty = fullStartTime === fullEndTime

  const [fromInput, setFromInput] = useState(() => formatUtcDateTimeLocal(startTime))
  const [toInput, setToInput] = useState(() => formatUtcDateTimeLocal(endTime))

  // Re-sync the drafts whenever the active window itself changes (Apply,
  // Reset, or a newly loaded dataset) — not on every keystroke.
  useEffect(() => {
    setFromInput(formatUtcDateTimeLocal(startTime))
    setToInput(formatUtcDateTimeLocal(endTime))
  }, [startTime, endTime])

  const parsedFrom = parseUtcDateTimeLocal(fromInput)
  const parsedTo = parseUtcDateTimeLocal(toInput)
  const inputIsValid =
    Number.isFinite(parsedFrom) &&
    Number.isFinite(parsedTo) &&
    parsedFrom <= parsedTo

  return (
    <section aria-label="Time Query" className="time-query-panel">
      <h3 className="time-query-heading">Time Query</h3>
      <p className="time-query-available-range">
        <span>Available Range</span>
        {rangeIsEmpty ? (
          <span>No data loaded</span>
        ) : (
          <span>
            {formatDisplayTime(fullStartTime)} – {formatDisplayTime(fullEndTime)}
          </span>
        )}
      </p>
      <div className="time-query-fields">
        <label className="time-query-field">
          <span>From (UTC)</span>
          <input
            disabled={rangeIsEmpty}
            max={formatUtcDateTimeLocal(fullEndTime)}
            min={formatUtcDateTimeLocal(fullStartTime)}
            onChange={(event) => setFromInput(event.currentTarget.value)}
            step="1"
            type="datetime-local"
            value={fromInput}
          />
        </label>
        <label className="time-query-field">
          <span>To (UTC)</span>
          <input
            disabled={rangeIsEmpty}
            max={formatUtcDateTimeLocal(fullEndTime)}
            min={formatUtcDateTimeLocal(fullStartTime)}
            onChange={(event) => setToInput(event.currentTarget.value)}
            step="1"
            type="datetime-local"
            value={toInput}
          />
        </label>
      </div>
      {!inputIsValid ? (
        <p className="time-query-error" role="alert">
          From must be on or before To.
        </p>
      ) : null}
      <div className="time-query-actions">
        <button
          className="time-query-apply"
          disabled={rangeIsEmpty || !inputIsValid}
          onClick={() =>
            useTimeStore.getState().applyTimeQuery(parsedFrom, parsedTo)
          }
          type="button"
        >
          Apply
        </button>
        <button
          disabled={!queryActive}
          onClick={() => useTimeStore.getState().resetTimeQuery()}
          type="button"
        >
          Reset
        </button>
      </div>
    </section>
  )
}
