import { useState } from 'react'

import { TemporalPropertiesPanel } from './components/chart/TemporalPropertiesPanel'
import { FeatureExplorer } from './components/feature/FeatureExplorer'
import { AppHeader, type WorkspaceMode } from './components/layout/AppHeader'
import { WorkspaceState } from './components/layout/WorkspaceState'
import { MapWorkspace } from './components/map/MapWorkspace'
import { PlaybackController } from './components/timeline/PlaybackController'
import { TimelineControls } from './components/timeline/TimelineControls'
import {
  harborMovingFeature,
  sampleMovingFeature,
} from './services/sampleMovingFeature'

const FEATURES = [sampleMovingFeature, harborMovingFeature]

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>('demo')
  const [selectedFeatureId, setSelectedFeatureId] = useState(
    sampleMovingFeature.id,
  )
  const [explorerOpen, setExplorerOpen] = useState(false)
  const selectedFeature =
    FEATURES.find((feature) => feature.id === selectedFeatureId) ??
    sampleMovingFeature

  return (
    <main className="app-shell">
      <AppHeader
        explorerOpen={explorerOpen}
        mode={mode}
        onModeChange={setMode}
        onToggleExplorer={() => setExplorerOpen((open) => !open)}
      />
      <div className="workspace-shell">
        <FeatureExplorer
          features={FEATURES}
          onClose={() => setExplorerOpen(false)}
          onSelect={(featureId) => {
            setSelectedFeatureId(featureId)
            setExplorerOpen(false)
          }}
          open={explorerOpen}
          selectedFeatureId={selectedFeatureId}
        />
        {explorerOpen ? (
          <button
            aria-label="Close feature explorer"
            className="explorer-scrim"
            onClick={() => setExplorerOpen(false)}
            type="button"
          />
        ) : null}
        <div className="primary-workspace">
          {mode === 'demo' ? (
            <>
              <MapWorkspace feature={selectedFeature} />
              <TemporalPropertiesPanel feature={selectedFeature} />
            </>
          ) : (
            <WorkspaceState kind={mode} />
          )}
        </div>
      </div>
      <TimelineControls />
      <PlaybackController />
    </main>
  )
}
