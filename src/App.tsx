import { CesiumMap } from './components/map/CesiumMap'
import { PlaybackController } from './components/timeline/PlaybackController'
import { TimelineControls } from './components/timeline/TimelineControls'
import { sampleMovingFeature } from './services/sampleMovingFeature'

const FEATURES = [sampleMovingFeature]

export function App() {
  return (
    <main className="app-shell">
      <h1 className="visually-hidden">MF-JSON Visualizer</h1>
      <div className="map-workspace">
        <CesiumMap features={FEATURES} />
      </div>
      <TimelineControls />
      <PlaybackController />
    </main>
  )
}
