import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { normalizeImageSource } from '../../mfjson/imageSource'
import type { TemporalWindow } from '../../mfjson/temporalWindow'
import type { ImageTemporalProperty } from '../../mfjson/types'
import { useImageViewerStore } from '../../store/imageViewerStore'
import { useTimeStore } from '../../store/timeStore'
import {
  getVisibleImageSamples,
  resolveImageSample,
  type ImageSample,
} from '../../visualization/chart/imageChartAdapter'
import {
  computeRailWidth,
  computeVisibleSampleRange,
  sampleRailPosition,
} from '../../visualization/chart/imageTimelineWindow'
import { Icon } from '../ui/Icon'
import { PropertyChartHeader } from './PropertyChartHeader'

const formatTimestamp = (time: number): string =>
  `${new Date(time).toISOString().slice(0, 19).replace('T', ' ')} UTC`

type FrameStatus = 'loading' | 'loaded' | 'error'

/** One clickable image button that tracks its own load state independently. */
function ImageFrame({
  className,
  label,
  onActivate,
  src,
}: {
  readonly className: string
  readonly label: string
  readonly onActivate: () => void
  readonly src: string
}) {
  const [status, setStatus] = useState<FrameStatus>('loading')

  useEffect(() => setStatus('loading'), [src])

  const normalized = normalizeImageSource(src)

  return (
    <button
      aria-label={label}
      className={className}
      onClick={onActivate}
      type="button"
    >
      {normalized ? (
        <img
          alt=""
          aria-hidden="true"
          className={status === 'loaded' ? 'is-loaded' : 'is-hidden'}
          decoding="async"
          loading="lazy"
          onError={() => setStatus('error')}
          onLoad={() => setStatus('loaded')}
          src={normalized.src}
        />
      ) : null}
      {normalized && status === 'loading' ? (
        <span className="image-frame-status">
          <span className="loading-spinner" />
          Loading image…
        </span>
      ) : null}
      {!normalized || status === 'error' ? (
        <span className="image-frame-status image-frame-error">
          <Icon name="alert" size={14} />
          Image unavailable
        </span>
      ) : null}
    </button>
  )
}

/**
 * Current-time-dependent header actions (time readout + View Image),
 * isolated into their own component so a playback tick only re-renders this
 * small subtree — never the (potentially large) thumbnail strip below.
 */
function ImageTimelineHeaderActions({
  propertyName,
  properties,
}: {
  readonly propertyName: string
  readonly properties: readonly ImageTemporalProperty[]
}) {
  const currentTime = useTimeStore((state) => state.currentTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)
  const currentSample = resolveImageSample(properties, currentTime, playbackRate)

  return (
    <div className="image-header-actions">
      <time
        className="image-current-time"
        dateTime={new Date(currentTime).toISOString()}
      >
        {formatTimestamp(currentTime)}
      </time>
      <button
        aria-label={
          currentSample
            ? `View image: ${propertyName} at ${formatTimestamp(currentSample.time)}`
            : 'View image'
        }
        className="image-view-trigger"
        disabled={!currentSample}
        onClick={() =>
          useImageViewerStore.getState().open(propertyName, properties)
        }
        title={currentSample ? undefined : 'No image at current time'}
        type="button"
      >
        <Icon name="search" size={13} />
        View Image
      </button>
    </div>
  )
}

/**
 * The thumbnail rail: virtualized so only samples within the scrolled
 * viewport (plus a small overscan) get a real `<img>` in the DOM — a
 * property with thousands of samples still only ever mounts a bounded
 * number of thumbnails. Positions stay proportional to each sample's real
 * timestamp (`sampleRailPosition`), never to its index, so temporal
 * spacing is preserved exactly regardless of which slice is rendered.
 */
function ImageThumbnailStrip({
  propertyName,
  properties,
  samples,
  domain,
}: {
  readonly propertyName: string
  readonly properties: readonly ImageTemporalProperty[]
  readonly samples: readonly ImageSample[]
  readonly domain: TemporalWindow
}) {
  const currentTime = useTimeStore((state) => state.currentTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)
  const currentSample = resolveImageSample(properties, currentTime, playbackRate)

  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [scrollLeft, setScrollLeft] = useState(0)

  // Measured before paint to avoid a one-frame flash of the wrong window,
  // then kept in sync via the same ResizeObserver pattern used elsewhere in
  // this app (e.g. CesiumMap) — recalculates when Temporal Properties is
  // collapsed/reopened, the Feature Explorer toggles, or the browser resizes.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    setContainerWidth(container.clientWidth)
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setContainerWidth(entry.contentRect.width)
    })
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  // rAF-throttled: scroll fires far more often than a frame can usefully
  // apply a new virtualized window.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    let frame = 0
    const handleScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        setScrollLeft(container.scrollLeft)
      })
    }
    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  const railWidth = computeRailWidth(samples.length, containerWidth)
  // The expensive part (a binary search that scales with sample count) is
  // memoized independent of currentTime, so a playback tick never
  // recomputes it — only the cheap current-sample comparison below does.
  const visibleRange = useMemo(
    () =>
      computeVisibleSampleRange(
        samples,
        domain,
        railWidth,
        scrollLeft,
        containerWidth,
      ),
    [samples, domain, railWidth, scrollLeft, containerWidth],
  )
  const visibleWindow = samples.slice(
    visibleRange.startIndex,
    visibleRange.endIndex,
  )

  return (
    <div
      aria-label={`${propertyName} thumbnail timeline`}
      className="image-thumbnail-track"
      ref={containerRef}
    >
      {samples.length === 0 ? (
        <p className="image-empty-state image-empty-state-compact">
          No image samples in the selected range
        </p>
      ) : (
        <div className="image-thumbnail-rail" style={{ width: railWidth }}>
          {visibleWindow.map((sample) => (
            <div
              className="image-thumbnail-slot"
              key={sample.time}
              style={{ left: sampleRailPosition(sample.time, domain, railWidth) }}
            >
              <ImageFrame
                className={`image-frame image-thumbnail ${
                  currentSample?.time === sample.time ? 'is-current' : ''
                }`}
                label={`Jump to ${propertyName} at ${formatTimestamp(sample.time)}`}
                onActivate={() =>
                  useTimeStore.getState().setCurrentTime(sample.time)
                }
                src={sample.value}
              />
            </div>
          ))}
          <div
            aria-hidden="true"
            className="image-current-cursor"
            style={{ left: sampleRailPosition(currentTime, domain, railWidth) }}
          />
        </div>
      )}
    </div>
  )
}

export function ImagePropertyTimeline({
  propertyName,
  properties,
  featureId,
}: {
  readonly propertyName: string
  readonly properties: readonly ImageTemporalProperty[]
  /** Identifies which MovingFeature these samples belong to, so the shared floating viewer closes rather than silently re-attributing itself if this changes. */
  readonly featureId: string
}) {
  const domainStart = useTimeStore((state) => state.startTime)
  const domainEnd = useTimeStore((state) => state.endTime)

  // Recomputed only when the property data or active window changes — not on
  // every currentTime tick. Thumbnails are unaffected by the Discrete visual
  // window: they always list every real source sample, independent of the
  // current value.
  const domain = useMemo(
    () => ({ start: domainStart, end: domainEnd }),
    [domainStart, domainEnd],
  )
  const visibleSamples = useMemo(
    () => getVisibleImageSamples(properties, domain),
    [properties, domain],
  )
  const interpolation = properties[0]?.interpolation ?? 'Discrete'

  // The floating viewer is a single shared window owned by imageViewerStore,
  // not this component — so if it's showing *this* property and either the
  // property or its owning Feature goes away (unmount) or changes identity
  // (a same-named property from a newly selected Feature), close it rather
  // than let it silently keep showing stale/misattributed content.
  useEffect(() => {
    return () => useImageViewerStore.getState().closeIfShowing(propertyName)
  }, [propertyName, featureId])

  return (
    <section
      aria-labelledby={`image-${propertyName}`}
      className="measure-chart-panel image-timeline-panel"
    >
      <PropertyChartHeader
        properties={[{ name: propertyName, type: 'Image', interpolation }]}
        trailing={
          <ImageTimelineHeaderActions
            properties={properties}
            propertyName={propertyName}
          />
        }
      />
      <div className="image-timeline-body">
        <div className="image-thumbnail-section">
          <ImageThumbnailStrip
            domain={domain}
            properties={properties}
            propertyName={propertyName}
            samples={visibleSamples}
          />
        </div>
      </div>
    </section>
  )
}
