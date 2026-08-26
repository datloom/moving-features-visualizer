import {
  Cartesian2,
  Cartesian3,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  HorizontalOrigin,
  LabelStyle,
  PolygonHierarchy,
  VerticalOrigin,
} from 'cesium'

import type {
  MovingFeature,
  TemporalGeometry,
  Timestamp,
} from '../../mfjson/types'
import {
  DEFAULT_TIME_AXIS_HEIGHT,
  DEFAULT_TIME_TICK_COUNT,
  generateTimeTicks,
  getSpaceTimeGeometryAtTime,
  getSpatialExtent,
  scaledTimeAxisHeight,
  transformSpaceTimeFeatures,
  type SpaceTimePosition,
  type TemporalExtent,
} from './transform'

const PRIMARY = Color.fromCssColorString('#46c9bb')
const MUTED = Color.fromCssColorString('#87979f')
const AXIS = Color.fromCssColorString('#e7ae55')
const LABEL = Color.fromCssColorString('#e7edef')
const OUTLINE = Color.fromCssColorString('#090d10')

export interface SpaceTimeCesiumOptions {
  readonly timeAxisHeight?: number
  readonly timeAxisScale?: number
  readonly tickCount?: number
  readonly selectedFeatureId?: string
  readonly currentTime?: number
}

export interface CurrentSpaceTimeEntity {
  readonly entity: Entity
  readonly segment: TemporalGeometry
}

export interface SpaceTimeCesiumEntities {
  readonly entities: readonly Entity[]
  readonly currentGeometryEntities: readonly CurrentSpaceTimeEntity[]
  /** Retained for compatibility with the original MovingPoint adapter. */
  readonly currentPositionEntities: ReadonlyMap<string, Entity>
}

export const spaceTimeSampleToCartesian = (
  sample: Pick<SpaceTimePosition, 'longitude' | 'latitude' | 'visualHeight'>,
): Cartesian3 =>
  Cartesian3.fromDegrees(sample.longitude, sample.latitude, sample.visualHeight)

const hierarchy = (
  rings: readonly (readonly SpaceTimePosition[])[],
): PolygonHierarchy | undefined => {
  const outer = rings[0]
  if (!outer) return undefined
  return new PolygonHierarchy(
    outer.map(spaceTimeSampleToCartesian),
    rings
      .slice(1)
      .map(
        (ring) => new PolygonHierarchy(ring.map(spaceTimeSampleToCartesian)),
      ),
  )
}

const entityBaseId = (featureId: string, segmentIndex: number): string =>
  `space-time:${encodeURIComponent(featureId)}:segment:${segmentIndex}`

export const featureIdFromSpaceTimeEntityId = (
  entityId: string,
): string | undefined => {
  const match = /^space-time:([^:]+):segment:\d+(?::|$)/.exec(entityId)
  return match ? decodeURIComponent(match[1]!) : undefined
}

const sliceColor = (selected: boolean): Color =>
  selected ? PRIMARY.withAlpha(0.55) : MUTED.withAlpha(0.36)

const createCurrentEntity = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
  selected: boolean,
): Entity => {
  const id = `${entityBaseId(featureId, segmentIndex)}:current`
  if (segment.type === 'MovingPoint')
    return new Entity({
      id,
      name: `${featureId} current position`,
      show: false,
      point: {
        color: selected ? AXIS : PRIMARY,
        outlineColor: OUTLINE,
        outlineWidth: 2,
        pixelSize: selected ? 12 : 9,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      },
    })
  if (segment.type === 'MovingLineString')
    return new Entity({
      id,
      name: `${featureId} current LineString`,
      show: false,
      polyline: {
        positions: [],
        material: selected ? AXIS : PRIMARY,
        width: selected ? 6 : 4,
      },
    })
  return new Entity({
    id,
    name: `${featureId} current Polygon`,
    show: false,
    polygon: {
      hierarchy: new PolygonHierarchy([]),
      material: (selected ? AXIS : PRIMARY).withAlpha(selected ? 0.52 : 0.4),
      outline: true,
      outlineColor: selected ? AXIS : PRIMARY,
      perPositionHeight: true,
    },
  })
}

export const updateCurrentSpaceTimeEntities = (
  bindings: readonly CurrentSpaceTimeEntity[],
  currentTime: Timestamp,
  temporalExtent: TemporalExtent,
  timeAxisHeight = DEFAULT_TIME_AXIS_HEIGHT,
  timeAxisScale = 1,
): void => {
  for (const { entity, segment } of bindings) {
    const evaluated = getSpaceTimeGeometryAtTime(
      segment,
      currentTime,
      temporalExtent,
      timeAxisHeight,
      timeAxisScale,
    )
    entity.show = evaluated !== undefined
    if (!evaluated) continue
    if (evaluated.type === 'MovingPoint') {
      entity.position = new ConstantPositionProperty(
        spaceTimeSampleToCartesian(evaluated.position),
      )
    } else if (evaluated.type === 'MovingLineString') {
      entity.polyline!.positions = new ConstantProperty(
        evaluated.positions.map(spaceTimeSampleToCartesian),
      )
    } else {
      entity.polygon!.hierarchy = new ConstantProperty(
        hierarchy(evaluated.rings),
      )
    }
  }
}

export const buildSpaceTimeCesiumEntities = (
  features: readonly MovingFeature[],
  temporalExtent: TemporalExtent,
  options: SpaceTimeCesiumOptions = {},
): SpaceTimeCesiumEntities => {
  const timeAxisHeight = options.timeAxisHeight ?? DEFAULT_TIME_AXIS_HEIGHT
  const timeAxisScale = options.timeAxisScale ?? 1
  const tickCount = options.tickCount ?? DEFAULT_TIME_TICK_COUNT
  const transformed = transformSpaceTimeFeatures(
    features,
    temporalExtent,
    timeAxisHeight,
    timeAxisScale,
  )
  const entities: Entity[] = []
  const currentGeometryEntities: CurrentSpaceTimeEntity[] = []
  const currentPositionEntities = new Map<string, Entity>()

  transformed.forEach((feature, featureIndex) => {
    const selected = feature.id === options.selectedFeatureId
    const sourceFeature = features[featureIndex]!
    feature.segments.forEach((segment) => {
      const baseId = entityBaseId(feature.id, segment.segmentIndex)
      if (segment.type === 'MovingPoint') {
        segment.points.forEach((point, index) =>
          entities.push(
            new Entity({
              id: `${baseId}:sample:${index}`,
              name: feature.id,
              position: spaceTimeSampleToCartesian(point),
              point: {
                color: selected ? AXIS.withAlpha(0.72) : MUTED.withAlpha(0.72),
                pixelSize: selected ? 7 : 5,
                outlineColor: OUTLINE,
                outlineWidth: 1,
              },
              properties: {
                featureId: feature.id,
                interpolation: segment.interpolation,
              },
            }),
          ),
        )
        segment.paths.forEach((path, index) => {
          if (path.length < 2) return
          entities.push(
            new Entity({
              id: `${baseId}:path:${index}`,
              name: feature.id,
              polyline: {
                positions: path.map(spaceTimeSampleToCartesian),
                width: selected ? 4 : 2.5,
                material: sliceColor(selected),
              },
              properties: {
                featureId: feature.id,
                interpolation: segment.interpolation,
              },
            }),
          )
        })
      } else if (segment.type === 'MovingLineString') {
        segment.slices.forEach((slice, index) =>
          entities.push(
            new Entity({
              id: `${baseId}:slice:${index}`,
              name: feature.id,
              polyline: {
                positions: slice.positions.map(spaceTimeSampleToCartesian),
                width: selected ? 2.5 : 1.5,
                material: sliceColor(selected),
              },
              properties: {
                featureId: feature.id,
                interpolation: segment.interpolation,
                time: slice.time,
              },
            }),
          ),
        )
      } else {
        segment.surfaces.forEach((surface, index) =>
          entities.push(
            new Entity({
              id: `${baseId}:surface:${index}`,
              name: `${feature.id} temporal surface`,
              polygon: {
                hierarchy: new PolygonHierarchy(
                  surface.positions.map(spaceTimeSampleToCartesian),
                ),
                material: (selected ? PRIMARY : MUTED).withAlpha(
                  selected ? 0.22 : 0.1,
                ),
                outline: false,
                perPositionHeight: true,
              },
              properties: {
                featureId: feature.id,
                interpolation: segment.interpolation,
                startTime: surface.startTime,
                endTime: surface.endTime,
                ringIndex: surface.ringIndex,
                edgeIndex: surface.edgeIndex,
              },
            }),
          ),
        )
        segment.slices.forEach((slice, index) =>
          entities.push(
            new Entity({
              id: `${baseId}:slice:${index}`,
              name: feature.id,
              polygon: {
                hierarchy: hierarchy(slice.rings),
                material: sliceColor(selected).withAlpha(
                  selected ? 0.16 : 0.08,
                ),
                outline: true,
                outlineColor: sliceColor(selected),
                perPositionHeight: true,
              },
              properties: {
                featureId: feature.id,
                interpolation: segment.interpolation,
                time: slice.time,
              },
            }),
          ),
        )
      }

      const sourceSegment =
        sourceFeature.temporalGeometry.segments[segment.segmentIndex]!
      const current = createCurrentEntity(
        feature.id,
        sourceSegment,
        segment.segmentIndex,
        selected,
      )
      entities.push(current)
      currentGeometryEntities.push({ entity: current, segment: sourceSegment })
      if (
        sourceSegment.type === 'MovingPoint' &&
        !currentPositionEntities.has(feature.id)
      )
        currentPositionEntities.set(feature.id, current)
    })
  })

  if (options.currentTime !== undefined)
    updateCurrentSpaceTimeEntities(
      currentGeometryEntities,
      options.currentTime,
      temporalExtent,
      timeAxisHeight,
      timeAxisScale,
    )

  const spatialExtent = getSpatialExtent(features)
  if (!spatialExtent)
    return { entities, currentGeometryEntities, currentPositionEntities }
  const longitudePadding = Math.max(
    (spatialExtent.maxLongitude - spatialExtent.minLongitude) * 0.08,
    0.001,
  )
  const latitudePadding = Math.max(
    (spatialExtent.maxLatitude - spatialExtent.minLatitude) * 0.08,
    0.001,
  )
  const axisLongitude = spatialExtent.minLongitude - longitudePadding
  const axisLatitude = spatialExtent.minLatitude - latitudePadding
  const visualAxisHeight = scaledTimeAxisHeight(timeAxisHeight, timeAxisScale)
  const ticks = generateTimeTicks(
    temporalExtent,
    tickCount,
    timeAxisHeight,
    timeAxisScale,
  )

  entities.push(
    new Entity({
      id: 'space-time:axis',
      polyline: {
        positions: [
          Cartesian3.fromDegrees(axisLongitude, axisLatitude, 0),
          Cartesian3.fromDegrees(axisLongitude, axisLatitude, visualAxisHeight),
        ],
        width: 2,
        material: AXIS,
      },
    }),
  )
  ticks.forEach((tick, index) => {
    const tickLongitude = axisLongitude + longitudePadding * 0.4
    entities.push(
      new Entity({
        id: `space-time:tick:${index}`,
        position: Cartesian3.fromDegrees(
          tickLongitude + longitudePadding * 0.15,
          axisLatitude,
          tick.height,
        ),
        label: {
          text: tick.label,
          font: '12px ui-monospace, monospace',
          fillColor: LABEL,
          outlineColor: OUTLINE,
          outlineWidth: 3,
          style: LabelStyle.FILL_AND_OUTLINE,
          horizontalOrigin: HorizontalOrigin.LEFT,
          verticalOrigin: VerticalOrigin.CENTER,
          pixelOffset: new Cartesian2(5, 0),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        polyline: {
          positions: [
            Cartesian3.fromDegrees(axisLongitude, axisLatitude, tick.height),
            Cartesian3.fromDegrees(tickLongitude, axisLatitude, tick.height),
          ],
          width: 1,
          material: AXIS,
        },
      }),
    )
    if (spatialExtent.maxLongitude !== spatialExtent.minLongitude)
      entities.push(
        new Entity({
          id: `space-time:guide:${index}`,
          polyline: {
            positions: [
              Cartesian3.fromDegrees(
                spatialExtent.minLongitude,
                spatialExtent.minLatitude,
                tick.height,
              ),
              Cartesian3.fromDegrees(
                spatialExtent.maxLongitude,
                spatialExtent.minLatitude,
                tick.height,
              ),
            ],
            width: 1,
            material: MUTED.withAlpha(0.22),
          },
        }),
      )
  })
  return { entities, currentGeometryEntities, currentPositionEntities }
}
