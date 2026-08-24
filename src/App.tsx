import { CesiumMap } from './components/map/CesiumMap'
import { sampleMovingFeature } from './services/sampleMovingFeature'

const FEATURES = [sampleMovingFeature]

export function App() {
  return (
    <main className="app-shell">
      <h1 className="visually-hidden">MF-JSON Visualizer</h1>
      <CesiumMap features={FEATURES} />
    </main>
  )
}
