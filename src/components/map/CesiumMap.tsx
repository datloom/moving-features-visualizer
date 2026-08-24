import { useEffect, useRef } from 'react'
import { Cartesian3, type Entity, Viewer } from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import type { MovingFeature } from '../../mfjson/types'
import { useTimeStore } from '../../store/timeStore'
import {
  getFeatureTimeRange,
  movingFeatureToEntity,
  timestampToJulianDate,
} from '../../visualization/cesium/adapters'

const INITIAL_CAMERA = Cartesian3.fromDegrees(0, 20, 20_000_000)
const EMPTY_FEATURES: readonly MovingFeature[] = []

export interface CesiumMapProps {
  readonly features?: readonly MovingFeature[]
  readonly focusRevision?: number
}

export function CesiumMap({
  features = EMPTY_FEATURES,
  focusRevision = 0,
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const featureEntitiesRef = useRef<Entity[]>([])

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

    viewerRef.current = viewer
    viewer.camera.setView({ destination: INITIAL_CAMERA })
    viewer.clock.currentTime = timestampToJulianDate(
      useTimeStore.getState().currentTime,
    )

    const unsubscribe = useTimeStore.subscribe((state) => {
      viewer.clock.currentTime = timestampToJulianDate(state.currentTime)
    })

    return () => {
      unsubscribe()
      viewerRef.current = null
      if (!viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    for (const entity of featureEntitiesRef.current) {
      viewer.entities.remove(entity)
    }

    const entities = features.map((feature) =>
      viewer.entities.add(movingFeatureToEntity(feature)),
    )
    featureEntitiesRef.current = entities

    if (features.length > 0) {
      const ranges = features.map(getFeatureTimeRange)
      const startTime = Math.min(...ranges.map((range) => range.startTime))
      const endTime = Math.max(...ranges.map((range) => range.endTime))
      useTimeStore.getState().setRange(startTime, endTime)
      void viewer.zoomTo(entities)
    }

    return () => {
      if (!viewer.isDestroyed()) {
        for (const entity of entities) viewer.entities.remove(entity)
      }
      featureEntitiesRef.current = []
    }
  }, [features])

  useEffect(() => {
    if (focusRevision === 0 || featureEntitiesRef.current.length === 0) return
    void viewerRef.current?.zoomTo(featureEntitiesRef.current)
  }, [focusRevision])

  return (
    <div
      aria-label="Moving features map"
      className="cesium-map"
      ref={containerRef}
      role="application"
    />
  )
}
