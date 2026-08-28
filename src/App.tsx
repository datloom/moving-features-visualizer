import { useState } from 'react'

import { FloatingImageViewer } from './components/chart/FloatingImageViewer'
import { TemporalPropertiesPanel } from './components/chart/TemporalPropertiesPanel'
import { LocalFileLoader } from './components/data/LocalFileLoader'
import { FeatureExplorer } from './components/feature/FeatureExplorer'
import { AppHeader, type WorkspaceMode } from './components/layout/AppHeader'
import { WorkspaceState } from './components/layout/WorkspaceState'
import { MapWorkspace } from './components/map/MapWorkspace'
import { PlaybackController } from './components/timeline/PlaybackController'
import { TimelineControls } from './components/timeline/TimelineControls'
import { useFeatureStore } from './store/featureStore'
import {
  harborMovingFeature,
  sampleMovingFeature,
} from './services/sampleMovingFeature'

const FEATURES = [sampleMovingFeature, harborMovingFeature]

if (useFeatureStore.getState().features.length === 0) {
  useFeatureStore.getState().replaceFeatures(FEATURES)
}

export function App() {
  const [mode, setMode] = useState<WorkspaceMode>('demo')
  const [datasetName, setDatasetName] = useState('Tokyo field survey')
  const [explorerOpen, setExplorerOpen] = useState(false)
  const [fileLoaderOpen, setFileLoaderOpen] = useState(false)
  const [showFeatureExplorer, setShowFeatureExplorer] = useState(true)
  const [showTemporalProperties, setShowTemporalProperties] = useState(true)
  const features = useFeatureStore((state) => state.features)
  const selectedFeatureId = useFeatureStore((state) => state.selectedFeatureId)
  const selectedFeature =
    features.find((feature) => feature.id === selectedFeatureId) ??
    sampleMovingFeature

  return (
    <main className="app-shell">
      <AppHeader
        datasetName={datasetName}
        explorerOpen={explorerOpen}
        mode={mode}
        onModeChange={setMode}
        onOpenData={() => setFileLoaderOpen(true)}
        onToggleExplorer={() => setExplorerOpen((open) => !open)}
      />
      <div
        className={`workspace-shell ${!showFeatureExplorer ? 'explorer-collapsed' : ''}`}
      >
        <FeatureExplorer
          collapsed={!showFeatureExplorer}
          features={features}
          onClose={() => setExplorerOpen(false)}
          onSelect={(featureId) => {
            useFeatureStore.getState().selectFeature(featureId)
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
        <div
          className={`primary-workspace ${!showTemporalProperties ? 'temporal-collapsed' : ''}`}
        >
          {mode === 'demo' ? (
            <>
              <MapWorkspace
                feature={selectedFeature}
                features={features}
                onToggleFeatureExplorer={() =>
                  setShowFeatureExplorer((visible) => !visible)
                }
                onToggleTemporalProperties={() =>
                  setShowTemporalProperties((visible) => !visible)
                }
                showFeatureExplorer={showFeatureExplorer}
                showTemporalProperties={showTemporalProperties}
              />
              <TemporalPropertiesPanel
                collapsed={!showTemporalProperties}
                feature={selectedFeature}
              />
            </>
          ) : (
            <WorkspaceState kind={mode} />
          )}
        </div>
      </div>
      <FloatingImageViewer />
      <TimelineControls />
      <PlaybackController />
      <LocalFileLoader
        onClose={() => setFileLoaderOpen(false)}
        onLoaded={(filename) => {
          setDatasetName(filename)
          setMode('demo')
          setFileLoaderOpen(false)
        }}
        open={fileLoaderOpen}
      />
    </main>
  )
}
