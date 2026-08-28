import type { Ref } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import { FeatureTemporalDataStatus } from './FeatureTemporalDataStatus'

const formatTime = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(11, 19)

export function SelectedFeatureInfo({
  feature,
  ref,
}: {
  readonly feature: MovingFeature
  /** Exposes the panel's rendered bounds — e.g. so the floating Image viewer can anchor directly below it. */
  readonly ref?: Ref<HTMLElement>
}) {
  const sampleTimes = feature.temporalGeometry.segments.flatMap((segment) =>
    segment.samples.map((sample) => sample.time),
  )
  const first = sampleTimes.length > 0 ? Math.min(...sampleTimes) : undefined
  const last = sampleTimes.length > 0 ? Math.max(...sampleTimes) : undefined
  const geometryTypes = [
    ...new Set(
      feature.temporalGeometry.segments.map((segment) => segment.type),
    ),
  ].join(', ')
  const label =
    typeof feature.properties.label === 'string'
      ? feature.properties.label
      : feature.id

  return (
    <section
      aria-label="Selected feature information"
      className="selected-feature-overlay"
      ref={ref}
    >
      <div className="selection-kicker">
        <span />
        Selected feature
      </div>
      <h2>{label}</h2>
      <p>{feature.id}</p>
      <dl>
        <div>
          <dt>Geometry</dt>
          <dd>{geometryTypes || '—'}</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{sampleTimes.length}</dd>
        </div>
        <div>
          <dt>Time range</dt>
          <dd>
            {first !== undefined && last !== undefined
              ? `${formatTime(first)}–${formatTime(last)}`
              : '—'}
          </dd>
        </div>
      </dl>
      <FeatureTemporalDataStatus featureId={feature.id} />
    </section>
  )
}
