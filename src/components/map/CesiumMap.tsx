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
  movingFeatureEntityIds,
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
  readonly selectedFeatureId?: string
  readonly focusRevision?: number
  readonly mapMode?: MapMode
}

export function CesiumMap({
  features = EMPTY_FEATURES,
  selectedFeatureId,
  focusRevision = 0,
  mapMode = '3d',
}: CesiumMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const featureEntitiesRef = useRef<Map<string, Entity>>(new Map())
  const renderedSelectionRef = useRef<Map<string, boolean>>(new Map())
  const renderedFeatureIdsRef = useRef('')
  const previousMapModeRef = useRef(mapMode)
  const [imageryFailed, setImageryFailed] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const featureEntities = featureEntitiesRef.current
    const renderedSelection = renderedSelectionRef.current

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
      featureEntities.clear()
      renderedSelection.clear()
      if (!viewer.isDestroyed()) viewer.destroy()
    }
  }, [])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer) return

    const seenFeatureIds = new Set<string>()
    const uniqueFeatures = features.filter((feature) => {
      if (seenFeatureIds.has(feature.id)) return false
      seenFeatureIds.add(feature.id)
      return true
    })
    const desiredEntityIds = new Set<string>()
    const nextSelection = new Map<string, boolean>()
    for (const feature of uniqueFeatures) {
      const selected = feature.id === selectedFeatureId
      const selectionChanged =
        renderedSelectionRef.current.get(feature.id) !== selected
      const entityIds = movingFeatureEntityIds(feature, { selected })
      entityIds.forEach((id) => desiredEntityIds.add(id))
      if (selectionChanged) {
        for (const [id, existing] of featureEntitiesRef.current) {
          if (!id.startsWith(`${feature.id}--geometry--`)) continue
          viewer.entities.remove(existing)
          featureEntitiesRef.current.delete(id)
        }
      }
      for (const entity of movingFeatureToEntities(feature, { selected })) {
        const id = String(entity.id)
        if (!featureEntitiesRef.current.has(id)) {
          featureEntitiesRef.current.set(id, viewer.entities.add(entity))
        }
      }
      nextSelection.set(feature.id, selected)
    }
    for (const [id, entity] of featureEntitiesRef.current) {
      if (!desiredEntityIds.has(id)) {
        viewer.entities.remove(entity)
        featureEntitiesRef.current.delete(id)
      }
    }
    renderedSelectionRef.current = nextSelection
    const entities = [...featureEntitiesRef.current.values()]
    const featureIds = uniqueFeatures.map(({ id }) => id).join('\u0000')
    const featureSetChanged = renderedFeatureIdsRef.current !== featureIds
    renderedFeatureIdsRef.current = featureIds

    if (uniqueFeatures.length > 0) {
      const ranges = uniqueFeatures.map(getFeatureTimeRange)
      const startTime = Math.min(...ranges.map((range) => range.startTime))
      const endTime = Math.max(...ranges.map((range) => range.endTime))
      useTimeStore.getState().setRange(startTime, endTime)
      if (featureSetChanged) void viewer.zoomTo(entities)
    }
  }, [features, selectedFeatureId])

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
    if (focusRevision === 0 || featureEntitiesRef.current.size === 0) return
    const renderedEntities = [...featureEntitiesRef.current.values()]
    const selectedEntities = selectedFeatureId
      ? renderedEntities.filter((entity) => {
          const entityId = String(entity.id)
          return entityId.startsWith(`${selectedFeatureId}--geometry--`)
        })
      : renderedEntities
    void viewerRef.current?.zoomTo(selectedEntities)
  }, [focusRevision, selectedFeatureId])

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
