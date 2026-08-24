import type { MovingFeature } from '../../mfjson/types'
import { getPropertyRendererStrategy } from '../../visualization/chart/temporalPropertyRendererStrategy'
import { MeasurePropertyChart } from './MeasurePropertyChart'

export function TemporalPropertiesPanel({
  feature,
}: {
  readonly feature: MovingFeature
}) {
  const strategies = feature.temporalProperties.map(getPropertyRendererStrategy)
  const renderable = strategies.find(
    (strategy) => strategy.renderer === 'measure-chart',
  )
  const unavailable = strategies[0]

  return (
    <section aria-label="Temporal Properties" className="temporal-panel">
      <header className="temporal-panel-heading">
        <div>
          <h2>Temporal Properties</h2>
          <span>Selected feature telemetry</span>
        </div>
        <span>{feature.temporalProperties.length} properties</span>
      </header>
      {renderable?.renderer === 'measure-chart' ? (
        <MeasurePropertyChart property={renderable.property} />
      ) : (
        <p className="compact-empty">
          {unavailable?.unavailableReason ??
            'No temporal properties are available.'}
        </p>
      )}
    </section>
  )
}
