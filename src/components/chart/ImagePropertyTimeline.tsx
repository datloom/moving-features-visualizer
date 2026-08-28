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
  sampleRailPosition,
  selectRepresentativeSamples,
  slotIndexForTime,
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
 * The thumbnail track: a FIXED width matching the same active temporal range
 * as the Measure/Text graphs — never `sampleCount * thumbnailWidth` — so an
 * Image property with thousands of samples takes up the same horizontal
 * space as one with a handful, over the same range.
 *
 * Every sample gets a lightweight, always-clickable tick at its exact
 * timestamp position (no image, negligible DOM/decode cost, so full
 * navigability never depends on how dense the samples are). A bounded
 * subset — one representative per occupied pixel "slot" — additionally
 * gets a real thumbnail `<img>`, capping active image decodes to roughly
 * `trackWidth / slotWidth` regardless of sample count. That selection is
 * memoized independent of currentTime, so a playback tick never rebuilds
 * it; only the (O(1)) "which slot is current" comparison below does.
 */
function ImageThumbnailStrip({
  propertyName,
  samples,
  domain,
}: {
  readonly propertyName: string
  readonly samples: readonly ImageSample[]
  readonly domain: TemporalWindow
}) {
  const currentTime = useTimeStore((state) => state.currentTime)

  const containerRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)

  // Measured before paint to avoid a one-frame flash of the wrong layout,
  // then kept in sync via the same ResizeObserver pattern used elsewhere in
  // this app (e.g. CesiumMap) — recalculates when Temporal Properties is
  // collapsed/reopened, the Feature Explorer toggles, or the browser resizes.
  useLayoutEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    setTrackWidth(container.clientWidth)
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setTrackWidth(entry.contentRect.width)
    })
    resizeObserver.observe(container)
    return () => resizeObserver.disconnect()
  }, [])

  const representativeSamples = useMemo(
    () => selectRepresentativeSamples(samples, domain, trackWidth),
    [samples, domain, trackWidth],
  )
  const currentSlotIndex =
    trackWidth > 0 ? slotIndexForTime(currentTime, domain, trackWidth) : undefined

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
        <div className="image-thumbnail-rail">
          {samples.map((sample) => (
            <button
              aria-label={`Jump to ${propertyName} at ${formatTimestamp(sample.time)}`}
              className="image-sample-tick"
              key={sample.time}
              onClick={() => useTimeStore.getState().setCurrentTime(sample.time)}
              style={{ left: sampleRailPosition(sample.time, domain, trackWidth) }}
              type="button"
            />
          ))}
          {representativeSamples.map(({ slotIndex, sample }) => (
            <div
              className="image-thumbnail-slot"
              key={sample.time}
              style={{ left: sampleRailPosition(sample.time, domain, trackWidth) }}
            >
              <ImageFrame
                className={`image-frame image-thumbnail ${
                  slotIndex === currentSlotIndex ? 'is-current' : ''
                }`}
                label={`Preview ${propertyName} near ${formatTimestamp(sample.time)}`}
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
            style={{ left: sampleRailPosition(currentTime, domain, trackWidth) }}
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
            propertyName={propertyName}
            samples={visibleSamples}
          />
        </div>
      </div>
    </section>
  )
}
