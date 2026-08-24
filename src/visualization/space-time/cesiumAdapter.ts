import {
  Cartesian2,
  Cartesian3,
  Color,
  Entity,
  HorizontalOrigin,
  LabelStyle,
  VerticalOrigin,
} from 'cesium'

import type { MovingFeature } from '../../mfjson/types'
import {
  DEFAULT_TIME_AXIS_HEIGHT,
  DEFAULT_TIME_TICK_COUNT,
  generateTimeTicks,
  getSpatialExtent,
  getSpaceTimePositionAtTime,
  transformSpaceTimeFeatures,
  type SpaceTimeSample,
  type TemporalExtent,
} from './transform'

const PRIMARY = Color.fromCssColorString('#46c9bb')
const MUTED = Color.fromCssColorString('#87979f')
const AXIS = Color.fromCssColorString('#e7ae55')
const LABEL = Color.fromCssColorString('#e7edef')
const OUTLINE = Color.fromCssColorString('#090d10')

export interface SpaceTimeCesiumOptions {
  readonly timeAxisHeight?: number
  readonly tickCount?: number
  readonly selectedFeatureId?: string
  readonly currentTime?: number
}

export interface SpaceTimeCesiumEntities {
  readonly entities: readonly Entity[]
  readonly currentPositionEntities: ReadonlyMap<string, Entity>
}

export const spaceTimeSampleToCartesian = (
  sample: Pick<SpaceTimeSample, 'longitude' | 'latitude' | 'visualHeight'>,
): Cartesian3 =>
  Cartesian3.fromDegrees(sample.longitude, sample.latitude, sample.visualHeight)

const trajectoryEntityId = (featureId: string, segmentIndex: number): string =>
  `space-time:${encodeURIComponent(featureId)}:segment:${segmentIndex}`

export const featureIdFromSpaceTimeEntityId = (
  entityId: string,
): string | undefined => {
  const match = /^space-time:([^:]+):segment:\d+$/.exec(entityId)
  return match ? decodeURIComponent(match[1]!) : undefined
}

export const buildSpaceTimeCesiumEntities = (
  features: readonly MovingFeature[],
  temporalExtent: TemporalExtent,
  options: SpaceTimeCesiumOptions = {},
): SpaceTimeCesiumEntities => {
  const timeAxisHeight = options.timeAxisHeight ?? DEFAULT_TIME_AXIS_HEIGHT
  const tickCount = options.tickCount ?? DEFAULT_TIME_TICK_COUNT
  const transformed = transformSpaceTimeFeatures(
    features,
    temporalExtent,
    timeAxisHeight,
  )
  const entities: Entity[] = []
  const currentPositionEntities = new Map<string, Entity>()

  for (const feature of transformed) {
    const selected = feature.id === options.selectedFeatureId
    feature.segments.forEach((segment, segmentIndex) => {
      if (segment.samples.length === 0) return
      entities.push(
        new Entity({
          id: trajectoryEntityId(feature.id, segmentIndex),
          name: feature.id,
          polyline: {
            positions: segment.samples.map(spaceTimeSampleToCartesian),
            width: selected ? 5 : 3,
            material: selected ? PRIMARY : MUTED.withAlpha(0.78),
          },
          properties: {
            featureId: feature.id,
            interpolation: segment.interpolation,
          },
        }),
      )
    })

    if (options.currentTime !== undefined) {
      const sourceFeature = features.find(({ id }) => id === feature.id)
      const position = sourceFeature
        ? getSpaceTimePositionAtTime(
            sourceFeature,
            options.currentTime,
            temporalExtent,
            timeAxisHeight,
          )
        : undefined
      const entity = new Entity({
        id: `space-time:${encodeURIComponent(feature.id)}:current`,
        name: `${feature.id} current position`,
        position: position ? spaceTimeSampleToCartesian(position) : undefined,
        show: position !== undefined,
        point: {
          color: selected ? AXIS : PRIMARY,
          outlineColor: OUTLINE,
          outlineWidth: 2,
          pixelSize: selected ? 11 : 8,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      })
      entities.push(entity)
      currentPositionEntities.set(feature.id, entity)
    }
  }

  const spatialExtent = getSpatialExtent(features)
  if (!spatialExtent) return { entities, currentPositionEntities }

  const longitudeSpan = spatialExtent.maxLongitude - spatialExtent.minLongitude
  const latitudeSpan = spatialExtent.maxLatitude - spatialExtent.minLatitude
  const longitudePadding = Math.max(longitudeSpan * 0.08, 0.001)
  const latitudePadding = Math.max(latitudeSpan * 0.08, 0.001)
  const axisLongitude = spatialExtent.minLongitude - longitudePadding
  const axisLatitude = spatialExtent.minLatitude - latitudePadding
  const ticks = generateTimeTicks(temporalExtent, tickCount, timeAxisHeight)

  entities.push(
    new Entity({
      id: 'space-time:axis',
      polyline: {
        positions: [
          Cartesian3.fromDegrees(axisLongitude, axisLatitude, 0),
          Cartesian3.fromDegrees(axisLongitude, axisLatitude, timeAxisHeight),
        ],
        width: 2,
        material: AXIS,
      },
    }),
  )

  for (const [index, tick] of ticks.entries()) {
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

    if (spatialExtent.maxLongitude !== spatialExtent.minLongitude) {
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
    }
  }

  return { entities, currentPositionEntities }
}
