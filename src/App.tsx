import { CesiumMap } from './components/map/CesiumMap'

export function App() {
  return (
    <main className="app-shell">
      <h1 className="visually-hidden">MF-JSON Visualizer</h1>
      <CesiumMap />
    </main>
  )
}
