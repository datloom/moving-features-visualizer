import { useState, type RefObject } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import {
  TIME_AXIS_SCALE_VALUES,
  type TimeAxisScale,
} from '../../visualization/space-time/transform'
import { SelectedFeatureInfo } from '../feature/SelectedFeatureInfo'
import { Icon } from '../ui/Icon'
import { CesiumMap, type MapMode } from './CesiumMap'
import { SpaceTimeMap } from './SpaceTimeMap'

type VisualizationMode = 'map' | 'space-time'

export function MapWorkspace({
  feature,
  features,
  showFeatureExplorer,
  onToggleFeatureExplorer,
  showTemporalProperties,
  onToggleTemporalProperties,
  selectedFeatureRef,
}: {
  readonly feature: MovingFeature
  readonly features: readonly MovingFeature[]
  readonly showFeatureExplorer: boolean
  readonly onToggleFeatureExplorer: () => void
  readonly showTemporalProperties: boolean
  readonly onToggleTemporalProperties: () => void
  /** Forwarded to SelectedFeatureInfo so the floating Image viewer can anchor below its actual rendered bounds. */
  readonly selectedFeatureRef: RefObject<HTMLElement | null>
}) {
  const [focusRevision, setFocusRevision] = useState(0)
  const [mapMode, setMapMode] = useState<MapMode>('3d')
  const [visualizationMode, setVisualizationMode] =
    useState<VisualizationMode>('map')
  const [timeAxisScale, setTimeAxisScale] = useState<TimeAxisScale>('auto')
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
        <SpaceTimeMap timeAxisScale={timeAxisScale} />
      )}
      <SelectedFeatureInfo feature={feature} ref={selectedFeatureRef} />
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
        <div aria-label="Workspace panels" className="panel-visibility-control" role="group">
          <button
            aria-label={
              showFeatureExplorer ? 'Hide Feature Explorer' : 'Show Feature Explorer'
            }
            aria-pressed={showFeatureExplorer}
            className={`map-tool-button ${showFeatureExplorer ? 'is-active' : ''}`}
            onClick={onToggleFeatureExplorer}
            title={
              showFeatureExplorer ? 'Hide Feature Explorer' : 'Show Feature Explorer'
            }
            type="button"
          >
            <Icon name="menu" />
          </button>
          <button
            aria-label={
              showTemporalProperties
                ? 'Hide Temporal Properties'
                : 'Show Temporal Properties'
            }
            aria-pressed={showTemporalProperties}
            className={`map-tool-button ${showTemporalProperties ? 'is-active' : ''}`}
            onClick={onToggleTemporalProperties}
            title={
              showTemporalProperties
                ? 'Hide Temporal Properties'
                : 'Show Temporal Properties'
            }
            type="button"
          >
            <Icon name="activity" />
          </button>
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
        ) : (
          <label className="time-axis-scale-control">
            <span>Time Axis Scale</span>
            <select
              aria-label="Time Axis Scale"
              onChange={(event) => {
                const value = event.currentTarget.value
                const manualScale = TIME_AXIS_SCALE_VALUES.find(
                  (scale) => String(scale) === value,
                )
                setTimeAxisScale(manualScale ?? 'auto')
              }}
              value={timeAxisScale}
            >
              <option value="auto">Auto</option>
              {TIME_AXIS_SCALE_VALUES.map((scale) => (
                <option key={scale} value={scale}>
                  {scale}×
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="map-attribution">
        {visualizationMode === 'map'
          ? `${mapMode.toUpperCase()} map · WGS 84`
          : 'Columbus View · time-height axis'}
      </div>
    </section>
  )
}
