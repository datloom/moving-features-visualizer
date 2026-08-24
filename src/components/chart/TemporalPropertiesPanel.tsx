import type { MeasureTemporalProperty, MovingFeature } from '../../mfjson/types'
import { MeasurePropertyChart } from './MeasurePropertyChart'

export function TemporalPropertiesPanel({
  feature,
}: {
  readonly feature: MovingFeature
}) {
  const measures = feature.temporalProperties.filter(
    (property): property is MeasureTemporalProperty =>
      property.type === 'Measure',
  )

  return (
    <section aria-label="Temporal Properties" className="temporal-panel">
      <header className="temporal-panel-heading">
        <div>
          <h2>Temporal Properties</h2>
          <span>Selected feature telemetry</span>
        </div>
        <span>{feature.temporalProperties.length} properties</span>
      </header>
      {measures[0] ? (
        <MeasurePropertyChart property={measures[0]} />
      ) : (
        <p className="compact-empty">No Measure properties are available.</p>
      )}
    </section>
  )
}
