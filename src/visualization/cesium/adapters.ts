import {
  Cartesian3,
  CallbackPositionProperty,
  CallbackProperty,
  Color,
  Entity,
  JulianDate,
  LinearApproximation,
  PolygonHierarchy,
  SampledPositionProperty,
  TimeInterval,
  TimeIntervalCollection,
} from 'cesium'

import { geometryAtTime } from '../../mfjson/geometryAtTime'
import {
  buildMovingLineStringSurfaces,
  buildMovingLineStringTrail,
  buildMovingPointPath,
  geometryTrailSampleTimes,
  movingLineStringTopologyCompatible,
} from '../../mfjson/geometryTrail'
import {
  buildMovingPolygonBoundaryPaths,
  buildMovingPolygonSurfaces,
  buildMovingPolygonTrail,
  movingPolygonTopologyCompatible,
} from '../../mfjson/movingPolygonTrail'
import type {
  MovingFeature,
  PositionSample,
  TemporalGeometry,
  Timestamp,
} from '../../mfjson/types'
import { CURRENT_OBJECT_COLOR, featureColor } from './style'

export const temporalGeometryStyle = {
  point: {
    currentPixelSize: 11,
    selectedPixelSize: 15,
    samplePixelSize: 7,
    selectedSamplePixelSize: 9,
    sampleOpacity: 0.55,
    selectedSampleOpacity: 0.7,
    pathWidth: 2,
    selectedPathWidth: 4,
    pathOpacity: 0.5,
    selectedPathOpacity: 0.75,
  },
  lineString: {
    currentWidth: 4,
    selectedCurrentWidth: 6,
    trailWidth: 1.5,
    selectedTrailWidth: 2,
    currentOpacity: 0.85,
    selectedCurrentOpacity: 1,
    trailOpacity: 0.18,
    selectedTrailOpacity: 0.3,
    surfaceOpacity: 0.08,
    selectedSurfaceOpacity: 0.18,
  },
  polygon: {
    currentFillOpacity: 0.34,
    selectedCurrentFillOpacity: 0.5,
    trailFillOpacity: 0.045,
    selectedTrailFillOpacity: 0.08,
    currentOutlineWidth: 3,
    selectedCurrentOutlineWidth: 5,
    currentOutlineOpacity: 0.9,
    trailOutlineOpacity: 0.16,
    selectedTrailOutlineOpacity: 0.28,
    pathWidth: 1.5,
    selectedPathWidth: 2.5,
    pathOpacity: 0.3,
    selectedPathOpacity: 0.52,
    surfaceOpacity: 0.1,
    selectedSurfaceOpacity: 0.22,
  },
} as const

export const timestampToJulianDate = (timestamp: Timestamp): JulianDate => {
  if (!Number.isFinite(timestamp)) {
    throw new RangeError('timestamp must be a finite number.')
  }

  return JulianDate.fromDate(new Date(timestamp))
}

export const coordinateToCartesian3 = (
  coordinate: Pick<PositionSample, 'longitude' | 'latitude' | 'height'>,
): Cartesian3 => {
  const { longitude, latitude, height = 0 } = coordinate

  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(height)
  ) {
    throw new RangeError('coordinate values must be finite numbers.')
  }

  return Cartesian3.fromDegrees(longitude, latitude, height)
}

export const samplesToPositionProperty = (
  samples: readonly PositionSample[],
): SampledPositionProperty => {
  const property = new SampledPositionProperty()
  property.setInterpolationOptions({
    interpolationAlgorithm: LinearApproximation,
    interpolationDegree: 1,
  })

  for (const sample of samples) {
    property.addSample(
      timestampToJulianDate(sample.time),
      coordinateToCartesian3(sample),
    )
  }

  return property
}

export interface FeatureTimeRange {
  readonly startTime: Timestamp
  readonly endTime: Timestamp
}

export const getFeatureTimeRange = (
  feature: MovingFeature,
): FeatureTimeRange => {
  let firstTime: Timestamp | undefined
  let lastTime: Timestamp | undefined
  for (const segment of feature.temporalGeometry.segments) {
    for (const sample of segment.samples) {
      if (firstTime === undefined || sample.time < firstTime)
        firstTime = sample.time
      if (lastTime === undefined || sample.time > lastTime)
        lastTime = sample.time
    }
  }

  if (firstTime === undefined || lastTime === undefined) {
    throw new RangeError('Temporal geometry must contain samples.')
  }

  return { startTime: firstTime, endTime: lastTime }
}

export const movingFeatureToEntity = (feature: MovingFeature): Entity => {
  const entity = movingFeatureToEntities(feature)[0]
  if (!entity) throw new RangeError('Temporal geometry must contain samples.')
  return entity
}

export const geometrySegmentEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
): string =>
  `${featureId}--geometry--${segment.id ? encodeURIComponent(segment.id) : segmentIndex + 1}`

export const geometrySegmentTrajectoryEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--trajectory`

export const geometrySegmentPositionEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--position`

export const geometrySegmentTrailEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
  timestamp: Timestamp,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--trail--${timestamp}`

export const geometrySegmentOutlineEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
  ringIndex: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--outline--${ringIndex}`

export const geometrySegmentBoundaryPathEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
  ringIndex: number,
  vertexIndex: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--boundary-path--${ringIndex}--${vertexIndex}`

/** Identifies one swept-surface quad connecting consecutive evaluated slices. */
export const geometrySegmentSurfaceEntityId = (
  featureId: string,
  segment: TemporalGeometry,
  segmentIndex: number,
  startTime: Timestamp,
  edgeIndex: number,
  ringIndex?: number,
): string =>
  `${geometrySegmentEntityId(featureId, segment, segmentIndex)}--surface--${
    ringIndex === undefined ? '' : `${ringIndex}--`
  }${startTime}--${edgeIndex}`

const ringsToPolygonHierarchy = (
  rings: readonly (readonly Pick<
    PositionSample,
    'longitude' | 'latitude' | 'height'
  >[])[],
): PolygonHierarchy | undefined => {
  const outer = rings[0]
  if (!outer) return undefined
  return new PolygonHierarchy(
    outer.map(coordinateToCartesian3),
    rings
      .slice(1)
      .map((hole) => new PolygonHierarchy(hole.map(coordinateToCartesian3))),
  )
}

export const movingFeatureEntityIds = (
  feature: MovingFeature,
  options: { readonly selected?: boolean } = {},
): readonly string[] => {
  void options
  return feature.temporalGeometry.segments.flatMap((segment, index) => {
    if (segment.type === 'MovingPoint') {
      return [
        geometrySegmentEntityId(feature.id, segment, index),
        ...(segment.interpolation === 'Discrete' ||
        segment.interpolation === 'Step'
          ? geometryTrailSampleTimes(segment).map((time) =>
              geometrySegmentTrailEntityId(feature.id, segment, index, time),
            )
          : [geometrySegmentTrajectoryEntityId(feature.id, segment, index)]),
      ]
    }
    if (segment.type === 'MovingLineString') {
      return [
        geometrySegmentEntityId(feature.id, segment, index),
        ...geometryTrailSampleTimes(segment).map((time) =>
          geometrySegmentTrailEntityId(feature.id, segment, index, time),
        ),
        ...buildMovingLineStringSurfaces(segment).map((quad) =>
          geometrySegmentSurfaceEntityId(
            feature.id,
            segment,
            index,
            quad.startTime,
            quad.edgeIndex,
          ),
        ),
      ]
    }
    if (segment.type === 'MovingPolygon') {
      return [
        geometrySegmentEntityId(feature.id, segment, index),
        ...segment.samples[0]!.rings.map((_, ringIndex) =>
          geometrySegmentOutlineEntityId(feature.id, segment, index, ringIndex),
        ),
        ...buildMovingPolygonTrail(segment).map(({ time }) =>
          geometrySegmentTrailEntityId(feature.id, segment, index, time),
        ),
        ...buildMovingPolygonBoundaryPaths(segment).map(
          ({ ringIndex, vertexIndex }) =>
            geometrySegmentBoundaryPathEntityId(
              feature.id,
              segment,
              index,
              ringIndex,
              vertexIndex,
            ),
        ),
        ...buildMovingPolygonSurfaces(segment).map((quad) =>
          geometrySegmentSurfaceEntityId(
            feature.id,
            segment,
            index,
            quad.startTime,
            quad.edgeIndex,
            quad.ringIndex,
          ),
        ),
      ]
    }
    return [geometrySegmentEntityId(feature.id, segment, index)]
  })
}

export const movingFeatureToEntities = (
  feature: MovingFeature,
  options: {
    readonly selected?: boolean
    readonly getCurrentTime?: () => Timestamp
  } = {},
): readonly Entity[] =>
  feature.temporalGeometry.segments.flatMap(
    (segment, index): readonly Entity[] => {
      const samples = segment.samples
      const first = samples[0]
      const last = samples.at(-1)
      if (!first || !last) {
        throw new RangeError('Temporal geometry must contain samples.')
      }
      const startTime = first.time
      const endTime = last.time
      const trailColor = featureColor(options.selected === true)
      const availability = new TimeIntervalCollection([
        new TimeInterval({
          start: timestampToJulianDate(startTime),
          stop: timestampToJulianDate(endTime),
        }),
      ])

      if (segment.type === 'MovingLineString') {
        const getCurrentTime = options.getCurrentTime ?? (() => startTime)
        const trail = buildMovingLineStringTrail(segment)
        const topologyCompatible = movingLineStringTopologyCompatible(segment)
        return [
          new Entity({
            id: geometrySegmentEntityId(feature.id, segment, index),
            name: feature.id,
            availability,
            polyline: {
              positions: new CallbackProperty(() => {
                if (!topologyCompatible) return undefined
                const evaluated = geometryAtTime(segment, getCurrentTime())
                return evaluated?.type === 'MovingLineString'
                  ? evaluated.positions.map(coordinateToCartesian3)
                  : undefined
              }, false),
              material: CURRENT_OBJECT_COLOR.withAlpha(
                options.selected
                  ? temporalGeometryStyle.lineString.selectedCurrentOpacity
                  : temporalGeometryStyle.lineString.currentOpacity,
              ),
              width: options.selected
                ? temporalGeometryStyle.lineString.selectedCurrentWidth
                : temporalGeometryStyle.lineString.currentWidth,
            },
          }),
          ...trail.map(
            (snapshot) =>
              new Entity({
                id: geometrySegmentTrailEntityId(
                  feature.id,
                  segment,
                  index,
                  snapshot.time,
                ),
                name: feature.id,
                polyline: {
                  positions: snapshot.positions.map(coordinateToCartesian3),
                  material: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.lineString.selectedTrailOpacity
                      : temporalGeometryStyle.lineString.trailOpacity,
                  ),
                  width: options.selected
                    ? temporalGeometryStyle.lineString.selectedTrailWidth
                    : temporalGeometryStyle.lineString.trailWidth,
                },
              }),
          ),
          ...buildMovingLineStringSurfaces(segment).map(
            (quad) =>
              new Entity({
                id: geometrySegmentSurfaceEntityId(
                  feature.id,
                  segment,
                  index,
                  quad.startTime,
                  quad.edgeIndex,
                ),
                name: feature.id,
                polygon: {
                  hierarchy: new PolygonHierarchy(
                    quad.positions.map(coordinateToCartesian3),
                  ),
                  material: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.lineString.selectedSurfaceOpacity
                      : temporalGeometryStyle.lineString.surfaceOpacity,
                  ),
                  outline: false,
                  perPositionHeight: true,
                },
              }),
          ),
        ]
      }

      if (segment.type === 'MovingPolygon') {
        const getCurrentTime = options.getCurrentTime ?? (() => startTime)
        const trail = buildMovingPolygonTrail(segment)
        const boundaryPaths = buildMovingPolygonBoundaryPaths(segment)
        const topologyCompatible = movingPolygonTopologyCompatible(segment)
        const polygonFirst = segment.samples[0]!
        return [
          new Entity({
            id: geometrySegmentEntityId(feature.id, segment, index),
            name: feature.id,
            availability,
            polygon: {
              hierarchy: new CallbackProperty(() => {
                if (!topologyCompatible) return undefined
                const evaluated = geometryAtTime(segment, getCurrentTime())
                return evaluated?.type === 'MovingPolygon'
                  ? ringsToPolygonHierarchy(evaluated.rings)
                  : undefined
              }, false),
              material: CURRENT_OBJECT_COLOR.withAlpha(
                options.selected
                  ? temporalGeometryStyle.polygon.selectedCurrentFillOpacity
                  : temporalGeometryStyle.polygon.currentFillOpacity,
              ),
              outline: false,
              perPositionHeight: true,
            },
          }),
          ...polygonFirst.rings.map(
            (_, ringIndex) =>
              new Entity({
                id: geometrySegmentOutlineEntityId(
                  feature.id,
                  segment,
                  index,
                  ringIndex,
                ),
                name: feature.id,
                availability,
                polyline: {
                  positions: new CallbackProperty(() => {
                    if (!topologyCompatible) return undefined
                    const evaluated = geometryAtTime(segment, getCurrentTime())
                    return evaluated?.type === 'MovingPolygon'
                      ? evaluated.rings[ringIndex]?.map(coordinateToCartesian3)
                      : undefined
                  }, false),
                  material: CURRENT_OBJECT_COLOR.withAlpha(
                    temporalGeometryStyle.polygon.currentOutlineOpacity,
                  ),
                  width: options.selected
                    ? temporalGeometryStyle.polygon.selectedCurrentOutlineWidth
                    : temporalGeometryStyle.polygon.currentOutlineWidth,
                },
              }),
          ),
          ...trail.map(
            (snapshot) =>
              new Entity({
                id: geometrySegmentTrailEntityId(
                  feature.id,
                  segment,
                  index,
                  snapshot.time,
                ),
                name: feature.id,
                polygon: {
                  hierarchy: ringsToPolygonHierarchy(snapshot.rings),
                  material: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.polygon.selectedTrailFillOpacity
                      : temporalGeometryStyle.polygon.trailFillOpacity,
                  ),
                  outline: true,
                  outlineColor: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.polygon
                          .selectedTrailOutlineOpacity
                      : temporalGeometryStyle.polygon.trailOutlineOpacity,
                  ),
                  perPositionHeight: true,
                },
              }),
          ),
          ...boundaryPaths.map(
            (path) =>
              new Entity({
                id: geometrySegmentBoundaryPathEntityId(
                  feature.id,
                  segment,
                  index,
                  path.ringIndex,
                  path.vertexIndex,
                ),
                name: feature.id,
                polyline: {
                  positions: path.positions.map(coordinateToCartesian3),
                  material: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.polygon.selectedPathOpacity
                      : temporalGeometryStyle.polygon.pathOpacity,
                  ),
                  width: options.selected
                    ? temporalGeometryStyle.polygon.selectedPathWidth
                    : temporalGeometryStyle.polygon.pathWidth,
                },
              }),
          ),
          ...buildMovingPolygonSurfaces(segment).map(
            (quad) =>
              new Entity({
                id: geometrySegmentSurfaceEntityId(
                  feature.id,
                  segment,
                  index,
                  quad.startTime,
                  quad.edgeIndex,
                  quad.ringIndex,
                ),
                name: feature.id,
                polygon: {
                  hierarchy: new PolygonHierarchy(
                    quad.positions.map(coordinateToCartesian3),
                  ),
                  material: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.polygon.selectedSurfaceOpacity
                      : temporalGeometryStyle.polygon.surfaceOpacity,
                  ),
                  outline: false,
                  perPositionHeight: true,
                },
              }),
          ),
        ]
      }

      const pointSamples = segment.samples
      const motionCurvePosition = new CallbackPositionProperty((time) => {
        if (!time) return undefined
        const evaluated = geometryAtTime(
          segment,
          JulianDate.toDate(time).getTime(),
        )
        return evaluated?.type === 'MovingPoint'
          ? coordinateToCartesian3(evaluated.position)
          : undefined
      }, false)

      return [
        new Entity({
          id: geometrySegmentEntityId(feature.id, segment, index),
          name: feature.id,
          availability,
          position: motionCurvePosition,
          point: {
            color: CURRENT_OBJECT_COLOR,
            outlineColor: Color.fromCssColorString('#071b1c'),
            outlineWidth: options.selected ? 4 : 3,
            pixelSize: options.selected
              ? temporalGeometryStyle.point.selectedPixelSize
              : temporalGeometryStyle.point.currentPixelSize,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        }),
        ...(segment.interpolation === 'Discrete' ||
        segment.interpolation === 'Step'
          ? geometryTrailSampleTimes(segment).map((time) => {
              const sample = pointSamples.find(
                (candidate) => candidate.time === time,
              )!
              return new Entity({
                id: geometrySegmentTrailEntityId(
                  feature.id,
                  segment,
                  index,
                  time,
                ),
                name: feature.id,
                position: coordinateToCartesian3(sample),
                point: {
                  color: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.point.selectedSampleOpacity
                      : temporalGeometryStyle.point.sampleOpacity,
                  ),
                  outlineColor: Color.fromCssColorString('#071b1c'),
                  outlineWidth: 2,
                  pixelSize: options.selected
                    ? temporalGeometryStyle.point.selectedSamplePixelSize
                    : temporalGeometryStyle.point.samplePixelSize,
                  disableDepthTestDistance: Number.POSITIVE_INFINITY,
                },
              })
            })
          : [
              new Entity({
                id: geometrySegmentTrajectoryEntityId(
                  feature.id,
                  segment,
                  index,
                ),
                name: feature.id,
                polyline: {
                  positions: buildMovingPointPath(segment).map(
                    coordinateToCartesian3,
                  ),
                  material: trailColor.withAlpha(
                    options.selected
                      ? temporalGeometryStyle.point.selectedPathOpacity
                      : temporalGeometryStyle.point.pathOpacity,
                  ),
                  width: options.selected
                    ? temporalGeometryStyle.point.selectedPathWidth
                    : temporalGeometryStyle.point.pathWidth,
                },
              }),
            ]),
      ]
    },
  )
