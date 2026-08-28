import { useState } from 'react'

import {
  formatUtcDateTimeLocal,
  parseUtcDateTimeLocal,
} from '../../mfjson/utcDateTimeLocal'
import { useTimeStore } from '../../store/timeStore'

interface TimeQueryPopoverProps {
  onClose: () => void
}

export function TimeQueryPopover({ onClose }: TimeQueryPopoverProps) {
  const startTime = useTimeStore((state) => state.startTime)
  const endTime = useTimeStore((state) => state.endTime)
  const fullStartTime = useTimeStore((state) => state.fullStartTime)
  const fullEndTime = useTimeStore((state) => state.fullEndTime)
  const rangeIsEmpty = fullStartTime === fullEndTime

  // This component is only ever mounted while the popover is open, so these
  // initializers run fresh every time it opens — seeding the draft from the
  // *active* range (not the full extent) without a resync effect.
  const [fromInput, setFromInput] = useState(() =>
    formatUtcDateTimeLocal(startTime),
  )
  const [toInput, setToInput] = useState(() => formatUtcDateTimeLocal(endTime))

  const parsedFrom = parseUtcDateTimeLocal(fromInput)
  const parsedTo = parseUtcDateTimeLocal(toInput)
  const inputIsValid =
    Number.isFinite(parsedFrom) &&
    Number.isFinite(parsedTo) &&
    parsedFrom <= parsedTo

  // Resets the draft only — the active range is untouched until Apply.
  const handleReset = () => {
    setFromInput(formatUtcDateTimeLocal(fullStartTime))
    setToInput(formatUtcDateTimeLocal(fullEndTime))
  }

  const handleApply = () => {
    if (!inputIsValid) return
    useTimeStore.getState().applyTimeQuery(parsedFrom, parsedTo)
    onClose()
  }

  return (
    <div aria-label="Time Query" className="time-query-panel" role="dialog">
      <h3 className="time-query-heading">Time Query</h3>
      <div className="time-query-fields">
        <label className="time-query-field">
          <span>Start (UTC)</span>
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
          <span>End (UTC)</span>
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
          Start must be on or before End.
        </p>
      ) : null}
      <div className="time-query-actions">
        <button disabled={rangeIsEmpty} onClick={handleReset} type="button">
          Reset
        </button>
        <button onClick={onClose} type="button">
          Cancel
        </button>
        <button
          className="time-query-apply"
          disabled={rangeIsEmpty || !inputIsValid}
          onClick={handleApply}
          type="button"
        >
          Apply
        </button>
      </div>
    </div>
  )
}
