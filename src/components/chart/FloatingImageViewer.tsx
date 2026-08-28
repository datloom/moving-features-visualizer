import { useEffect, type PointerEvent as ReactPointerEvent } from 'react'

import { normalizeImageSource } from '../../mfjson/imageSource'
import {
  clampViewerPosition,
  clampViewerSize,
  defaultViewerPosition,
} from '../../services/imageViewerGeometry'
import { useImageViewerStore } from '../../store/imageViewerStore'
import { useTimeStore } from '../../store/timeStore'
import { resolveImageSample } from '../../visualization/chart/imageChartAdapter'
import { Icon } from '../ui/Icon'

const formatTimestamp = (time: number): string =>
  `${new Date(time).toISOString().slice(0, 19).replace('T', ' ')} UTC`

const viewportSize = () => ({
  width: window.innerWidth,
  height: window.innerHeight,
})

/**
 * A modeless, draggable, resizable window showing the CURRENT evaluated
 * Image TemporalProperty — reopened live from `TimeStore.currentTime` via
 * the same `resolveImageSample` evaluator the (now-removed) permanent
 * current-frame preview used, so Discrete/Step semantics are unchanged.
 * Rendered at the workspace level (see App.tsx), not inside
 * TemporalPropertiesPanel, so it keeps working while that panel is
 * collapsed — no separate timer, no backdrop, no focus trap.
 */
export function FloatingImageViewer() {
  const propertyName = useImageViewerStore((state) => state.propertyName)
  const properties = useImageViewerStore((state) => state.properties)
  const position = useImageViewerStore((state) => state.position)
  const size = useImageViewerStore((state) => state.size)
  const currentTime = useTimeStore((state) => state.currentTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)

  const isOpen = propertyName !== undefined
  const currentSample = isOpen
    ? resolveImageSample(properties, currentTime, playbackRate)
    : undefined

  // First-ever open: place it in an unobtrusive corner rather than (0, 0).
  useEffect(() => {
    if (!isOpen || position) return
    useImageViewerStore
      .getState()
      .setPosition(defaultViewerPosition(size, viewportSize()))
  }, [isOpen, position, size])

  // A saved position/size must never strand the window off-screen if the
  // browser is resized while it's open.
  useEffect(() => {
    if (!isOpen) return undefined
    const handleResize = () =>
      useImageViewerStore.getState().clampToViewport(viewportSize())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen])

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    let last = { x: event.clientX, y: event.clientY }
    const handleMove = (moveEvent: PointerEvent) => {
      const store = useImageViewerStore.getState()
      const current = store.position ?? { x: 0, y: 0 }
      const dx = moveEvent.clientX - last.x
      const dy = moveEvent.clientY - last.y
      last = { x: moveEvent.clientX, y: moveEvent.clientY }
      store.setPosition(
        clampViewerPosition(
          { x: current.x + dx, y: current.y + dy },
          store.size,
          viewportSize(),
        ),
      )
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  const startResize = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    event.stopPropagation()
    let last = { x: event.clientX, y: event.clientY }
    const handleMove = (moveEvent: PointerEvent) => {
      const store = useImageViewerStore.getState()
      const dx = moveEvent.clientX - last.x
      const dy = moveEvent.clientY - last.y
      last = { x: moveEvent.clientX, y: moveEvent.clientY }
      store.setSize(
        clampViewerSize(
          { width: store.size.width + dx, height: store.size.height + dy },
          viewportSize(),
        ),
      )
    }
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
    }
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
  }

  if (!isOpen) return null

  const normalized = currentSample
    ? normalizeImageSource(currentSample.value)
    : undefined
  const resolvedPosition = position ?? defaultViewerPosition(size, viewportSize())

  return (
    <div
      aria-label={`${propertyName} image viewer`}
      className="image-floating-viewer"
      role="dialog"
      style={{
        left: resolvedPosition.x,
        top: resolvedPosition.y,
        width: size.width,
        height: size.height,
      }}
    >
      <header
        className="image-floating-viewer-header"
        onPointerDown={startDrag}
      >
        <div>
          <span>{propertyName}</span>
          {currentSample ? <h2>{formatTimestamp(currentSample.time)}</h2> : null}
        </div>
        <button
          aria-label="Close image viewer"
          className="icon-button"
          onClick={() => useImageViewerStore.getState().close()}
          onPointerDown={(event) => event.stopPropagation()}
          type="button"
        >
          <Icon name="x" />
        </button>
      </header>
      <div className="image-floating-viewer-body">
        {currentSample ? (
          normalized ? (
            <img
              alt={`${propertyName} at ${formatTimestamp(currentSample.time)}`}
              src={normalized.src}
            />
          ) : (
            <span className="image-frame-status image-frame-error">
              <Icon name="alert" size={14} />
              Image unavailable
            </span>
          )
        ) : (
          <p className="image-empty-state">No image at current time</p>
        )}
      </div>
      <div
        aria-hidden="true"
        className="image-floating-viewer-resize-handle"
        onPointerDown={startResize}
      />
    </div>
  )
}
