import { useEffect, useMemo, useState } from 'react'

import { normalizeImageSource } from '../../mfjson/imageSource'
import type { ImageTemporalProperty } from '../../mfjson/types'
import { useImageViewerStore } from '../../store/imageViewerStore'
import { useTimeStore } from '../../store/timeStore'
import {
  getVisibleImageSamples,
  resolveImageSample,
  timeToDomainRatio,
} from '../../visualization/chart/imageChartAdapter'
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
  const currentTime = useTimeStore((state) => state.currentTime)
  const domainStart = useTimeStore((state) => state.startTime)
  const domainEnd = useTimeStore((state) => state.endTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)

  // Recomputed only when the property data or active window changes — not on
  // every currentTime tick, which only needs to resolve the current sample.
  // Thumbnails are unaffected by the Discrete visual window: they always
  // list every real source sample, independent of the current value.
  const domain = useMemo(
    () => ({ start: domainStart, end: domainEnd }),
    [domainStart, domainEnd],
  )
  const visibleSamples = useMemo(
    () => getVisibleImageSamples(properties, domain),
    [properties, domain],
  )
  const currentSample = resolveImageSample(properties, currentTime, playbackRate)
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
        }
      />
      <div className="image-timeline-body">
        <div className="image-thumbnail-section">
          <div
            aria-label={`${propertyName} thumbnail timeline`}
            className="image-thumbnail-track"
          >
            {visibleSamples.length === 0 ? (
              <p className="image-empty-state image-empty-state-compact">
                No image samples in the selected range
              </p>
            ) : (
              <div className="image-thumbnail-rail">
                {visibleSamples.map((sample) => (
                  <div
                    className="image-thumbnail-slot"
                    key={sample.time}
                    style={{
                      left: `${timeToDomainRatio(sample.time, domain) * 100}%`,
                    }}
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
                  style={{
                    left: `${timeToDomainRatio(currentTime, domain) * 100}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
