import { useEffect, useRef } from 'react'
import { Cartesian3, Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

const INITIAL_CAMERA = Cartesian3.fromDegrees(0, 20, 20_000_000)

export function CesiumMap() {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const viewer = new Viewer(container, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
    })

    viewer.camera.setView({ destination: INITIAL_CAMERA })

    return () => {
      if (!viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  return (
    <div
      aria-label="Moving features map"
      className="cesium-map"
      ref={containerRef}
      role="application"
    />
  )
}
