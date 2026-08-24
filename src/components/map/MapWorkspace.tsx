import { useState } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import { SelectedFeatureInfo } from '../feature/SelectedFeatureInfo'
import { Icon } from '../ui/Icon'
import { CesiumMap, type MapMode } from './CesiumMap'
import { SpaceTimeMap } from './SpaceTimeMap'

type VisualizationMode = 'map' | 'space-time'

export function MapWorkspace({
  feature,
  features,
}: {
  readonly feature: MovingFeature
  readonly features: readonly MovingFeature[]
}) {
  const [focusRevision, setFocusRevision] = useState(0)
  const [mapMode, setMapMode] = useState<MapMode>('3d')
  const [visualizationMode, setVisualizationMode] =
    useState<VisualizationMode>('map')
  return (
    <section aria-label="Primary map workspace" className="map-workspace">
      {visualizationMode === 'map' ? (
        <CesiumMap
          features={features}
          focusRevision={focusRevision}
          mapMode={mapMode}
          selectedFeatureId={feature.id}
        />
      ) : (
        <SpaceTimeMap />
      )}
      <SelectedFeatureInfo feature={feature} />
      <div className="map-toolbar">
        <div
          aria-label="Visualization"
          className="visualization-mode-control"
          role="group"
        >
          {(['map', 'space-time'] as const).map((mode) => (
            <button
              aria-pressed={visualizationMode === mode}
              className={visualizationMode === mode ? 'is-active' : ''}
              key={mode}
              onClick={() => setVisualizationMode(mode)}
              type="button"
            >
              {mode === 'map' ? 'Map' : 'Space-Time'}
            </button>
          ))}
        </div>
        {visualizationMode === 'map' ? (
          <>
            <button
              aria-label="Fit selected trajectory"
              className="map-tool-button"
              onClick={() => setFocusRevision((value) => value + 1)}
              title="Fit selected trajectory"
              type="button"
            >
              <Icon name="crosshair" />
            </button>
            <button
              aria-label="Trajectory layer is visible"
              aria-pressed="true"
              className="map-tool-button is-active"
              title="Trajectory layer"
              type="button"
            >
              <Icon name="layers" />
            </button>
            <div
              aria-label="Map mode"
              className="map-mode-control"
              role="group"
            >
              {(['2d', '3d'] as const).map((mode) => (
                <button
                  aria-pressed={mapMode === mode}
                  className={mapMode === mode ? 'is-active' : ''}
                  key={mode}
                  onClick={() => setMapMode(mode)}
                  type="button"
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
      <div className="map-attribution">
        {visualizationMode === 'map'
          ? `${mapMode.toUpperCase()} map · WGS 84`
          : 'Columbus View · time-height axis'}
      </div>
    </section>
  )
}
