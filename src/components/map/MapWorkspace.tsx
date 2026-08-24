import { useMemo, useState } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import { SelectedFeatureInfo } from '../feature/SelectedFeatureInfo'
import { Icon } from '../ui/Icon'
import { CesiumMap, type MapMode } from './CesiumMap'

export function MapWorkspace({ feature }: { readonly feature: MovingFeature }) {
  const [focusRevision, setFocusRevision] = useState(0)
  const [mapMode, setMapMode] = useState<MapMode>('3d')
  const features = useMemo(() => [feature], [feature])
  return (
    <section aria-label="Primary map workspace" className="map-workspace">
      <CesiumMap
        features={features}
        focusRevision={focusRevision}
        mapMode={mapMode}
      />
      <SelectedFeatureInfo feature={feature} />
      <div className="map-toolbar">
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
        <div aria-label="Map mode" className="map-mode-control" role="group">
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
      </div>
      <div className="map-attribution">
        {mapMode.toUpperCase()} map · WGS 84
      </div>
    </section>
  )
}
