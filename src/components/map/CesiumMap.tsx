import { useEffect, useRef, useState } from 'react'
import {
  Cartesian3,
  type Entity,
  ImageryLayer,
  OpenStreetMapImageryProvider,
  Viewer,
} from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'

import type { MovingFeature } from '../../mfjson/types'
import { useTimeStore } from '../../store/timeStore'
import {
  getFeatureTimeRange,
  movingFeatureToEntities,
  timestampToJulianDate,
} from '../../visualization/cesium/adapters'

const INITIAL_CAMERA = Cartesian3.fromDegrees(0, 20, 20_000_000)
const OPEN_STREET_MAP_URL = 'https://tile.openstreetmap.org/'
const EMPTY_FEATURES: readonly MovingFeature[] = []
const SCENE_MORPH_DURATION_SECONDS = 0.5

export type MapMode = '2d' | '3d'

export interface CesiumMapProps {
  readonly features?: readonly MovingFeature[]
  readonly focusRevision?: number
  readonly mapMode?: MapMode
}

export function CesiumMap({
  features = EMPTY_FEATURES,
  focusRevision = 0,
  mapMode = '3d',
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const featureEntitiesRef = useRef<Entity[]>([])
  const previousMapModeRef = useRef(mapMode)
  const [imageryFailed, setImageryFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const imageryProvider = new OpenStreetMapImageryProvider({
      url: OPEN_STREET_MAP_URL,
    })
    const removeImageryErrorListener =
      imageryProvider.errorEvent.addEventListener(() => setImageryFailed(true))
    const viewer = new Viewer(container, {
      animation: false,
      baseLayer: new ImageryLayer(imageryProvider),
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
      removeImageryErrorListener()
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

    const entities = features.flatMap((feature) =>
      movingFeatureToEntities(feature).map((entity) =>
        viewer.entities.add(entity),
      ),
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
    if (previousMapModeRef.current === mapMode) return
    previousMapModeRef.current = mapMode

    const scene = viewerRef.current?.scene
    if (!scene) return
    if (mapMode === '2d') {
      scene.morphTo2D(SCENE_MORPH_DURATION_SECONDS)
    } else {
      scene.morphTo3D(SCENE_MORPH_DURATION_SECONDS)
    }
  }, [mapMode])

  useEffect(() => {
    if (focusRevision === 0 || featureEntitiesRef.current.length === 0) return
    void viewerRef.current?.zoomTo(featureEntitiesRef.current)
  }, [focusRevision])

  return (
    <>
      <div
        aria-label="Moving features map"
        className="cesium-map"
        ref={containerRef}
        role="application"
      />
      {imageryFailed ? (
        <div className="map-imagery-error" role="status">
          OpenStreetMap imagery is temporarily unavailable.
        </div>
      ) : null}
    </>
  )
}
