import { useEffect, useMemo, useRef, useState } from 'react'
import {
  type Entity,
  ImageryLayer,
  OpenStreetMapImageryProvider,
  SceneMode,
  Viewer,
} from 'cesium'

import { useFeatureStore } from '../../store/featureStore'
import { useTimeStore } from '../../store/timeStore'
import {
  buildSpaceTimeCesiumEntities,
  type CurrentSpaceTimeEntity,
  updateCurrentSpaceTimeEntities,
} from '../../visualization/space-time/cesiumAdapter'
import {
  DEFAULT_TIME_AXIS_HEIGHT,
  DEFAULT_TIME_TICK_COUNT,
  resolveTemporalExtent,
} from '../../visualization/space-time/transform'

const OPEN_STREET_MAP_URL = 'https://tile.openstreetmap.org/'

export interface SpaceTimeMapProps {
  readonly tickCount?: number
  readonly timeAxisHeight?: number
}

export function SpaceTimeMap({
  tickCount = DEFAULT_TIME_TICK_COUNT,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
}: SpaceTimeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<Viewer | null>(null)
  const entitiesRef = useRef<readonly Entity[]>([])
  const currentEntitiesRef = useRef<readonly CurrentSpaceTimeEntity[]>([])
  const [imageryFailed, setImageryFailed] = useState(false)
  const features = useFeatureStore((state) => state.features)
  const selectedFeatureId = useFeatureStore((state) => state.selectedFeatureId)
  const startTime = useTimeStore((state) => state.startTime)
  const endTime = useTimeStore((state) => state.endTime)
  const temporalExtent = useMemo(
    () =>
      resolveTemporalExtent(features, {
        minTime: startTime,
        maxTime: endTime,
      }),
    [endTime, features, startTime],
  )
  const hasTemporalExtent = temporalExtent !== undefined

  useEffect(() => {
    if (!hasTemporalExtent) return
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
      sceneMode: SceneMode.COLUMBUS_VIEW,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
    })
    viewerRef.current = viewer

    return () => {
      removeImageryErrorListener()
      viewerRef.current = null
      if (!viewer.isDestroyed()) viewer.destroy()
    }
  }, [hasTemporalExtent])

  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !temporalExtent) return
    for (const entity of entitiesRef.current) viewer.entities.remove(entity)

    const collection = buildSpaceTimeCesiumEntities(features, temporalExtent, {
      currentTime: useTimeStore.getState().currentTime,
      selectedFeatureId,
      tickCount,
      timeAxisHeight,
    })
    const entities = collection.entities.map((entity) =>
      viewer.entities.add(entity),
    )
    entitiesRef.current = entities
    currentEntitiesRef.current = collection.currentGeometryEntities
    if (entities.length > 0) void viewer.zoomTo(entities)

    return () => {
      if (!viewer.isDestroyed()) {
        for (const entity of entities) viewer.entities.remove(entity)
      }
      entitiesRef.current = []
      currentEntitiesRef.current = []
    }
  }, [features, selectedFeatureId, temporalExtent, tickCount, timeAxisHeight])

  useEffect(() => {
    if (!temporalExtent) return
    return useTimeStore.subscribe((state, previousState) => {
      if (state.currentTime === previousState.currentTime) return
      updateCurrentSpaceTimeEntities(
        currentEntitiesRef.current,
        state.currentTime,
        temporalExtent,
        timeAxisHeight,
      )
    })
  }, [features, temporalExtent, timeAxisHeight])

  if (!temporalExtent) {
    return (
      <div className="space-time-empty" role="status">
        Space-Time view requires temporal geometry samples.
      </div>
    )
  }

  return (
    <>
      <div
        aria-label="Space-Time moving features visualization"
        className="cesium-map"
        ref={containerRef}
        role="application"
      />
      <div className="space-time-legend">
        <strong>Space-Time</strong>
        <span>Vertical axis: UTC time</span>
      </div>
      {imageryFailed ? (
        <div className="map-imagery-error" role="status">
          OpenStreetMap imagery is temporarily unavailable.
        </div>
      ) : null}
    </>
  )
}
