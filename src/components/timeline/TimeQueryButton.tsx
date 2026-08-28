import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { useFeatureStore } from '../../store/featureStore'
import { useTimeStore } from '../../store/timeStore'
import { TimeQueryPopover } from './TimeQueryPopover'

/** Gap between the trigger button and the popover, and viewport-edge breathing room. */
const GAP = 8
const VIEWPORT_PADDING = 12
/** Below this much room above the button, prefer flipping below if that side genuinely has more space. */
const MIN_PREFERRED_SPACE = 160

interface Placement {
  side: 'above' | 'below'
  maxHeight: number
}

const computePlacement = (anchorRect: DOMRect): Placement => {
  const spaceAbove = anchorRect.top - GAP - VIEWPORT_PADDING
  const spaceBelow =
    window.innerHeight - anchorRect.bottom - GAP - VIEWPORT_PADDING

  const side =
    spaceAbove >= MIN_PREFERRED_SPACE || spaceAbove >= spaceBelow
      ? 'above'
      : 'below'

  return { side, maxHeight: Math.max(side === 'above' ? spaceAbove : spaceBelow, 120) }
}

export function TimeQueryButton() {
  const [isOpen, setIsOpen] = useState(false)
  const [placement, setPlacement] = useState<Placement>({
    side: 'above',
    maxHeight: 480,
  })
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

  // Positioned before paint so the panel never visibly flashes on the wrong
  // side, and recomputed on resize so it stays reachable if the viewport
  // shrinks while it's open.
  useLayoutEffect(() => {
    if (!isOpen) return undefined

    const updatePlacement = () => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect) setPlacement(computePlacement(rect))
    }

    updatePlacement()
    window.addEventListener('resize', updatePlacement)
    return () => window.removeEventListener('resize', updatePlacement)
  }, [isOpen])

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
      {isOpen ? (
        <TimeQueryPopover
          maxHeight={placement.maxHeight}
          onClose={() => setIsOpen(false)}
          placement={placement.side}
        />
      ) : null}
    </div>
  )
}
