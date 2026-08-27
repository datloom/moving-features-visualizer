import { useEffect, useMemo, useState } from 'react'

import { normalizeImageSource } from '../../mfjson/imageSource'
import type { ImageTemporalProperty } from '../../mfjson/types'
import { useTimeStore } from '../../store/timeStore'
import {
  getVisibleImageSamples,
  resolveImageSample,
  timeToDomainRatio,
  type ImageSample,
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

function ImagePreviewDialog({
  onClose,
  propertyName,
  sample,
}: {
  readonly onClose: () => void
  readonly propertyName: string
  readonly sample: ImageSample
}) {
  const normalized = normalizeImageSource(sample.value)
  return (
    <div
      className="image-preview-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        aria-labelledby="image-preview-title"
        aria-modal="true"
        className="image-preview-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="image-preview-header">
          <div>
            <span>{propertyName}</span>
            <h2 id="image-preview-title">{formatTimestamp(sample.time)}</h2>
          </div>
          <button
            aria-label="Close image preview"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>
        <div className="image-preview-body">
          {normalized ? (
            <img
              alt={`${propertyName} at ${formatTimestamp(sample.time)}`}
              src={normalized.src}
            />
          ) : (
            <span className="image-frame-status image-frame-error">
              <Icon name="alert" size={14} />
              Image unavailable
            </span>
          )}
        </div>
      </section>
    </div>
  )
}

export function ImagePropertyTimeline({
  propertyName,
  properties,
}: {
  readonly propertyName: string
  readonly properties: readonly ImageTemporalProperty[]
}) {
  const currentTime = useTimeStore((state) => state.currentTime)
  const domainStart = useTimeStore((state) => state.startTime)
  const domainEnd = useTimeStore((state) => state.endTime)
  const playbackRate = useTimeStore((state) => state.playbackRate)
  const [previewOpen, setPreviewOpen] = useState(false)

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

  useEffect(() => {
    setPreviewOpen(false)
  }, [propertyName])

  return (
    <section
      aria-labelledby={`image-${propertyName}`}
      className="measure-chart-panel image-timeline-panel"
    >
      <PropertyChartHeader
        properties={[{ name: propertyName, type: 'Image', interpolation }]}
        trailing={
          <time
            className="image-current-time"
            dateTime={new Date(currentTime).toISOString()}
          >
            {formatTimestamp(currentTime)}
          </time>
        }
      />
      <div className="image-timeline-body">
        <div className="image-current-frame-wrapper">
          {currentSample ? (
            <ImageFrame
              className="image-frame image-current-frame"
              label={`View larger image: ${propertyName} at ${formatTimestamp(currentSample.time)}`}
              onActivate={() => setPreviewOpen(true)}
              src={currentSample.value}
            />
          ) : (
            <p className="image-empty-state">No image at current time</p>
          )}
        </div>
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
      {previewOpen && currentSample ? (
        <ImagePreviewDialog
          onClose={() => setPreviewOpen(false)}
          propertyName={propertyName}
          sample={currentSample}
        />
      ) : null}
    </section>
  )
}
