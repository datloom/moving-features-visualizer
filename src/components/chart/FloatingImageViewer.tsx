import {
  useLayoutEffect,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react'

import { normalizeImageSource } from '../../mfjson/imageSource'
import {
  anchoredViewerPosition,
  clampViewerPosition,
  clampViewerSize,
  defaultViewerPosition,
  type ViewerPosition,
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
export function FloatingImageViewer({
  selectedFeatureRef,
}: {
  /** The rendered Selected Feature panel to anchor below — see App.tsx/MapWorkspace. */
  readonly selectedFeatureRef: RefObject<HTMLElement | null>
}) {
  const propertyName = useImageViewerStore((state) => state.propertyName)
  const properties = useImageViewerStore((state) => state.properties)
  const positionMode = useImageViewerStore((state) => state.positionMode)
  const manualPosition = useImageViewerStore((state) => state.manualPosition)
  const size = useImageViewerStore((state) => state.size)
  const currentTime = useTimeStore((state) => state.currentTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)

  const isOpen = propertyName !== undefined
  const currentSample = isOpen
    ? resolveImageSample(properties, currentTime, playbackRate)
    : undefined

  const [anchoredPosition, setAnchoredPosition] = useState<
    ViewerPosition | undefined
  >(undefined)

  // While anchored, track the Selected Feature panel's *actual* rendered
  // bounds — never a hard-coded offset — so a taller server-loaded panel is
  // respected automatically. Stops entirely once the user drags (manual).
  useLayoutEffect(() => {
    if (!isOpen || positionMode !== 'anchored') return undefined

    const anchorElement = selectedFeatureRef.current
    const recompute = () => {
      const currentSize = useImageViewerStore.getState().size
      const rect = anchorElement?.getBoundingClientRect()
      setAnchoredPosition(
        rect
          ? anchoredViewerPosition(rect, currentSize, viewportSize())
          : defaultViewerPosition(currentSize, viewportSize()),
      )
    }
    recompute()

    const resizeObserver = anchorElement
      ? new ResizeObserver(recompute)
      : undefined
    if (anchorElement && resizeObserver) resizeObserver.observe(anchorElement)
    window.addEventListener('resize', recompute)
    return () => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', recompute)
    }
  }, [isOpen, positionMode, selectedFeatureRef])

  // A manual position must never strand the window off-screen if the
  // browser is resized while it's open (anchored positioning re-derives
  // itself above, so this only matters once positionMode is 'manual').
  useLayoutEffect(() => {
    if (!isOpen) return undefined
    const handleResize = () =>
      useImageViewerStore.getState().clampToViewport(viewportSize())
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isOpen])

  const resolvedPosition =
    positionMode === 'manual'
      ? clampViewerPosition(
          manualPosition ?? defaultViewerPosition(size, viewportSize()),
          size,
          viewportSize(),
        )
      : (anchoredPosition ?? defaultViewerPosition(size, viewportSize()))

  const startDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    let last = { x: event.clientX, y: event.clientY }
    let basis = resolvedPosition
    const handleMove = (moveEvent: PointerEvent) => {
      const store = useImageViewerStore.getState()
      const dx = moveEvent.clientX - last.x
      const dy = moveEvent.clientY - last.y
      last = { x: moveEvent.clientX, y: moveEvent.clientY }
      basis = { x: basis.x + dx, y: basis.y + dy }
      // Any actual movement is an intentional drag — switches to manual
      // positioning from here on, per setManualPosition.
      store.setManualPosition(
        clampViewerPosition(basis, store.size, viewportSize()),
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
