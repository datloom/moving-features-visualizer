import { useMemo, useState } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import { SelectedFeatureInfo } from '../feature/SelectedFeatureInfo'
import { Icon } from '../ui/Icon'
import { CesiumMap } from './CesiumMap'

export function MapWorkspace({ feature }: { readonly feature: MovingFeature }) {
  const [focusRevision, setFocusRevision] = useState(0)
  const features = useMemo(() => [feature], [feature])
  return (
    <section aria-label="Primary map workspace" className="map-workspace">
      <CesiumMap features={features} focusRevision={focusRevision} />
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
      </div>
      <div className="map-attribution">3D globe · WGS 84</div>
    </section>
  )
}
