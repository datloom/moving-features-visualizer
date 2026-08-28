import { useEffect, useRef, useState } from 'react'

import { useFeatureStore } from '../../store/featureStore'
import { useTimeStore } from '../../store/timeStore'
import { TimeQueryPopover } from './TimeQueryPopover'

export function TimeQueryButton() {
  const [isOpen, setIsOpen] = useState(false)
  const anchorRef = useRef<HTMLDivElement>(null)

  const startTime = useTimeStore((state) => state.startTime)
  const endTime = useTimeStore((state) => state.endTime)
  const fullStartTime = useTimeStore((state) => state.fullStartTime)
  const fullEndTime = useTimeStore((state) => state.fullEndTime)
  const selectedFeatureId = useFeatureStore((state) => state.selectedFeatureId)

  const isFiltered = startTime > fullStartTime || endTime < fullEndTime

  // A stale draft for a previously selected feature must never be applied to
  // a newly selected one, so close (and discard) rather than carry it over.
  useEffect(() => {
    setIsOpen(false)
  }, [selectedFeatureId])

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event: MouseEvent) => {
      if (!anchorRef.current?.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  return (
    <div className="time-query-anchor" ref={anchorRef}>
      <button
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        className="transport-button time-query-trigger"
        data-active={isFiltered ? 'true' : undefined}
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        Time Query
        {isFiltered ? (
          <>
            <span aria-hidden="true" className="time-query-indicator" />
            <span className="visually-hidden"> (range filtered)</span>
          </>
        ) : null}
      </button>
      {isOpen ? <TimeQueryPopover onClose={() => setIsOpen(false)} /> : null}
    </div>
  )
}
