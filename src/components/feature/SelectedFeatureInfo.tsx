import type { MovingFeature } from '../../mfjson/types'
import { FeatureTemporalDataStatus } from './FeatureTemporalDataStatus'

const formatTime = (timestamp: number) =>
  new Date(timestamp).toISOString().slice(11, 19)

export function SelectedFeatureInfo({
  feature,
}: {
  readonly feature: MovingFeature
}) {
  const samples = feature.temporalGeometry.segments.flatMap(
    (segment) => segment.samples,
  )
  const first = samples[0]
  const last = samples.at(-1)
  const label =
    typeof feature.properties.label === 'string'
      ? feature.properties.label
      : feature.id

  return (
    <section
      aria-label="Selected feature information"
      className="selected-feature-overlay"
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
          <dd>MovingPoint</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{samples.length}</dd>
        </div>
        <div>
          <dt>Time range</dt>
          <dd>
            {first && last
              ? `${formatTime(first.time)}–${formatTime(last.time)}`
              : '—'}
          </dd>
        </div>
      </dl>
      <FeatureTemporalDataStatus featureId={feature.id} />
    </section>
  )
}
