import {
  Cartesian3,
  Cartographic,
  Color,
  JulianDate,
  PolygonHierarchy,
} from 'cesium'
import { describe, expect, it } from 'vitest'

import type { MovingFeature } from '../../mfjson/types'
import { CURRENT_OBJECT_COLOR } from '../cesium/style'
import {
  buildSpaceTimeCesiumEntities,
  featureIdFromSpaceTimeEntityId,
  spaceTimeSampleToCartesian,
} from './cesiumAdapter'
import { getSpaceTimeGeometryAtTime } from './transform'

const movingFeature: MovingFeature = {
  id: 'vehicle:one',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          { time: 1_000, longitude: 139.7, latitude: 35.6, height: 9_999 },
          { time: 2_000, longitude: 139.8, latitude: 35.7, height: 8_888 },
        ],
      },
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [{ time: 3_000, longitude: 139.9, latitude: 35.8 }],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
}

const expectColor = (actual: unknown, expected: Color): void => {
  expect(actual).toBeInstanceOf(Color)
  if (actual instanceof Color) expect(Color.equals(actual, expected)).toBe(true)
}

const materialColor = (
  material: { readonly getValue: (time: JulianDate) => unknown } | undefined,
): unknown => {
  const value = material?.getValue(JulianDate.now())
  return typeof value === 'object' && value !== null && 'color' in value
    ? value.color
    : undefined
}

describe('Space-Time Cesium adapter', () => {
  it('uses visual time height instead of the MF-JSON coordinate height', () => {
    expect(
      Cartesian3.equals(
        spaceTimeSampleToCartesian({
          longitude: 139.7,
          latitude: 35.6,
          visualHeight: 500,
        }),
        Cartesian3.fromDegrees(139.7, 35.6, 500),
      ),
    ).toBe(true)
  })

  it('creates separate identity-preserving entities for every segment', () => {
    const result = buildSpaceTimeCesiumEntities(
      [movingFeature],
      { minTime: 1_000, maxTime: 3_000 },
      {
        currentTime: 2_000,
        selectedFeatureId: movingFeature.id,
        tickCount: 3,
        timeAxisHeight: 1_000,
      },
    )
    const segmentEntities = result.entities.filter(
      (entity) =>
        entity.id.includes(':segment:') && !entity.id.endsWith(':current'),
    )

    expect(
      segmentEntities.map(({ id }) => featureIdFromSpaceTimeEntityId(id)),
    ).toEqual(segmentEntities.map(() => movingFeature.id))
    expect(
      segmentEntities.some(
        ({ polyline }) => polyline?.width?.getValue(JulianDate.now()) === 4,
      ),
    ).toBe(true)
    expect(result.currentGeometryEntities).toHaveLength(2)
    expect(result.currentPositionEntities.has(movingFeature.id)).toBe(true)
    expect(result.entities.some(({ id }) => id === 'space-time:axis')).toBe(
      true,
    )
    expect(
      result.entities.filter(({ id }) => id.startsWith('space-time:tick:')),
    ).toHaveLength(3)
  })

  it('renders MovingPolygon boundary surfaces as translucent-height polygons', () => {
    const polygon: MovingFeature = {
      id: 'storm',
      type: 'MovingFeature',
      temporalGeometry: {
        segments: [
          {
            type: 'MovingPolygon',
            interpolation: 'Linear',
            samples: [0, 10].map((time, offset) => ({
              time,
              rings: [
                [
                  { longitude: offset, latitude: 0 },
                  { longitude: 1 + offset, latitude: 0 },
                  { longitude: 1 + offset, latitude: 1 },
                  { longitude: offset, latitude: 1 },
                  { longitude: offset, latitude: 0 },
                ],
              ],
            })),
          },
        ],
      },
      temporalProperties: [],
      properties: {},
    }
    const result = buildSpaceTimeCesiumEntities(
      [polygon],
      { minTime: 0, maxTime: 10 },
      { selectedFeatureId: polygon.id, timeAxisHeight: 100, timeAxisScale: 8 },
    )
    const surfaces = result.entities.filter(({ id }) =>
      id.includes(':surface:'),
    )
    expect(surfaces).toHaveLength(16)
    expect(
      surfaces.every(
        ({ polygon: surface }) =>
          surface?.perPositionHeight?.getValue(JulianDate.now()) === true &&
          surface.outline?.getValue(JulianDate.now()) === false,
      ),
    ).toBe(true)
  })

  it('uses red current geometry and feature-colored historical geometry for every type', () => {
    const geometries: MovingFeature = {
      id: 'all-types',
      type: 'MovingFeature',
      temporalGeometry: {
        segments: [
          {
            type: 'MovingPoint',
            interpolation: 'Linear',
            samples: [
              { time: 0, longitude: 0, latitude: 0 },
              { time: 10, longitude: 1, latitude: 1 },
            ],
          },
          {
            type: 'MovingLineString',
            interpolation: 'Linear',
            samples: [0, 10].map((time) => ({
              time,
              positions: [
                { longitude: time, latitude: 0 },
                { longitude: time + 1, latitude: 1 },
              ],
            })),
          },
          {
            type: 'MovingPolygon',
            interpolation: 'Linear',
            samples: [0, 10].map((time) => ({
              time,
              rings: [
                [
                  { longitude: time, latitude: 0 },
                  { longitude: time + 1, latitude: 0 },
                  { longitude: time + 1, latitude: 1 },
                  { longitude: time, latitude: 0 },
                ],
              ],
            })),
          },
        ],
      },
      temporalProperties: [],
      properties: {},
    }
    const result = buildSpaceTimeCesiumEntities(
      [geometries],
      { minTime: 0, maxTime: 10 },
      { currentTime: 5, selectedFeatureId: geometries.id },
    )
    const [point, line, polygon] = result.currentGeometryEntities.map(
      ({ entity }) => entity,
    )
    expectColor(
      point?.point?.color?.getValue(JulianDate.now()),
      CURRENT_OBJECT_COLOR,
    )
    expectColor(materialColor(line?.polyline?.material), CURRENT_OBJECT_COLOR)
    expectColor(
      materialColor(polygon?.polygon?.material),
      CURRENT_OBJECT_COLOR.withAlpha(0.52),
    )
    expectColor(
      polygon?.polygon?.outlineColor?.getValue(JulianDate.now()),
      CURRENT_OBJECT_COLOR,
    )

    const historical = result.entities.filter(
      ({ id }) => !id.endsWith(':current') && id.includes(':segment:'),
    )
    const historicalColors: Color[] = []
    for (const entity of historical) {
      const colors: unknown[] = [
        entity.point?.color?.getValue(JulianDate.now()),
        materialColor(entity.polyline?.material),
        materialColor(entity.polygon?.material),
      ]
      for (const color of colors)
        if (color instanceof Color) historicalColors.push(color)
    }
    expect(historicalColors.length).toBeGreaterThan(0)
    expect(
      historicalColors.every(
        (color) => !Color.equals(color.withAlpha(1), CURRENT_OBJECT_COLOR),
      ),
    ).toBe(true)
  })

  it('animates the current MovingLineString with the shared Quadratic evaluator on manual time changes', () => {
    const segment = {
      type: 'MovingLineString' as const,
      interpolation: 'Quadratic' as const,
      samples: [
        {
          time: 0,
          positions: [
            { longitude: 0, latitude: 0, height: 0 },
            { longitude: 10, latitude: 10, height: 10 },
          ],
        },
        {
          time: 10,
          positions: [
            { longitude: 10, latitude: 10, height: 10 },
            { longitude: 20, latitude: 20, height: 20 },
          ],
        },
        {
          time: 20,
          positions: [
            { longitude: 0, latitude: 0, height: 0 },
            { longitude: 10, latitude: 10, height: 10 },
          ],
        },
      ],
    }
    const feature: MovingFeature = {
      id: 'quadratic-line',
      type: 'MovingFeature',
      temporalGeometry: { segments: [segment] },
      temporalProperties: [],
      properties: {},
    }
    const extent = { minTime: 0, maxTime: 20 }
    const timeAxisHeight = 100
    const timeAxisScale = 4
    let currentTime = 0
    const result = buildSpaceTimeCesiumEntities([feature], extent, {
      getCurrentTime: () => currentTime,
      timeAxisHeight,
      timeAxisScale,
    })
    const [binding] = result.currentGeometryEntities
    const entity = binding!.entity

    const expectedCartesians = (time: number): readonly Cartesian3[] => {
      const evaluated = getSpaceTimeGeometryAtTime(
        segment,
        time,
        extent,
        timeAxisHeight,
        timeAxisScale,
      )
      if (evaluated?.type !== 'MovingLineString') {
        throw new Error('expected a MovingLineString evaluation')
      }
      return evaluated.positions.map(spaceTimeSampleToCartesian)
    }

    const readPositions = (): readonly Cartesian3[] =>
      entity.polyline!.positions!.getValue(JulianDate.now()) as Cartesian3[]

    // t0: reproduces the first sample exactly (no rebuild between reads).
    const atStart = readPositions()
    expect(
      atStart.every((position, index) =>
        Cartesian3.equals(position, expectedCartesians(0)[index]),
      ),
    ).toBe(true)

    // Manual scrub to a non-sample time: the shared Quadratic evaluator moves it.
    currentTime = 15
    const atIntermediate = readPositions()
    expect(
      atIntermediate.every((position, index) =>
        Cartesian3.equals(position, expectedCartesians(15)[index]),
      ),
    ).toBe(true)
    expect(Cartesian3.equals(atIntermediate[0], atStart[0])).toBe(false)

    // Manual scrub to t1: reproduces the last sample exactly.
    currentTime = 20
    const atEnd = readPositions()
    expect(
      atEnd.every((position, index) =>
        Cartesian3.equals(position, expectedCartesians(20)[index]),
      ),
    ).toBe(true)
    expect(Cartesian3.equals(atEnd[0], atIntermediate[0])).toBe(false)
  })

  it('scales the current MovingLineString temporal height with the Time Axis Scale', () => {
    const segment = {
      type: 'MovingLineString' as const,
      interpolation: 'Linear' as const,
      samples: [
        {
          time: 0,
          positions: [
            { longitude: 0, latitude: 0 },
            { longitude: 1, latitude: 0 },
          ],
        },
        {
          time: 10,
          positions: [
            { longitude: 10, latitude: 10 },
            { longitude: 11, latitude: 10 },
          ],
        },
      ],
    }
    const buildAt = (timeAxisScale: number) => {
      const feature: MovingFeature = {
        id: 'scaled-line',
        type: 'MovingFeature',
        temporalGeometry: { segments: [segment] },
        temporalProperties: [],
        properties: {},
      }
      const result = buildSpaceTimeCesiumEntities(
        [feature],
        { minTime: 0, maxTime: 10 },
        { getCurrentTime: () => 5, timeAxisHeight: 100, timeAxisScale },
      )
      const entity = result.currentGeometryEntities[0]!.entity
      const [position] = entity.polyline!.positions!.getValue(
        JulianDate.now(),
      ) as Cartesian3[]
      return Cartographic.fromCartesian(position!).height
    }
    const heightAt1x = buildAt(1)
    const heightAt4x = buildAt(4)
    expect(heightAt4x).toBeCloseTo(heightAt1x * 4, 6)
  })

  it('animates the current MovingPolygon with the shared Quadratic evaluator on manual time changes', () => {
    const segment = {
      type: 'MovingPolygon' as const,
      interpolation: 'Quadratic' as const,
      samples: [
        {
          time: 0,
          rings: [
            [
              { longitude: 0, latitude: 0, height: 0 },
              { longitude: 2, latitude: 0, height: 0 },
              { longitude: 2, latitude: 2, height: 0 },
              { longitude: 0, latitude: 0, height: 0 },
            ],
          ],
        },
        {
          time: 10,
          rings: [
            [
              { longitude: 10, latitude: 10, height: 10 },
              { longitude: 12, latitude: 10, height: 10 },
              { longitude: 12, latitude: 12, height: 10 },
              { longitude: 10, latitude: 10, height: 10 },
            ],
          ],
        },
        {
          time: 20,
          rings: [
            [
              { longitude: 0, latitude: 0, height: 0 },
              { longitude: 2, latitude: 0, height: 0 },
              { longitude: 2, latitude: 2, height: 0 },
              { longitude: 0, latitude: 0, height: 0 },
            ],
          ],
        },
      ],
    }
    const feature: MovingFeature = {
      id: 'quadratic-polygon',
      type: 'MovingFeature',
      temporalGeometry: { segments: [segment] },
      temporalProperties: [],
      properties: {},
    }
    const extent = { minTime: 0, maxTime: 20 }
    const timeAxisHeight = 100
    const timeAxisScale = 2
    let currentTime = 0
    const result = buildSpaceTimeCesiumEntities([feature], extent, {
      getCurrentTime: () => currentTime,
      timeAxisHeight,
      timeAxisScale,
    })
    const entity = result.currentGeometryEntities[0]!.entity

    const expectedPositions = (time: number) => {
      const evaluated = getSpaceTimeGeometryAtTime(
        segment,
        time,
        extent,
        timeAxisHeight,
        timeAxisScale,
      )
      if (evaluated?.type !== 'MovingPolygon') {
        throw new Error('expected a MovingPolygon evaluation')
      }
      return evaluated.rings[0]!.map(spaceTimeSampleToCartesian)
    }

    const readHierarchy = (): PolygonHierarchy => {
      const value: unknown = entity.polygon?.hierarchy?.getValue(
        JulianDate.now(),
      )
      if (!(value instanceof PolygonHierarchy)) {
        throw new Error('expected a PolygonHierarchy value')
      }
      return value
    }

    const atStart = readHierarchy().positions
    expect(atStart).toHaveLength(4)
    expect(
      atStart.every((position, index) =>
        Cartesian3.equals(position, expectedPositions(0)[index]),
      ),
    ).toBe(true)

    currentTime = 15
    const atIntermediate = readHierarchy().positions
    expect(
      atIntermediate.every((position, index) =>
        Cartesian3.equals(position, expectedPositions(15)[index]),
      ),
    ).toBe(true)
    expect(Cartesian3.equals(atIntermediate[0], atStart[0])).toBe(false)

    currentTime = 20
    const atEnd = readHierarchy().positions
    expect(
      atEnd.every((position, index) =>
        Cartesian3.equals(position, expectedPositions(20)[index]),
      ),
    ).toBe(true)
    expect(Cartesian3.equals(atEnd[0], atIntermediate[0])).toBe(false)

    expect(readHierarchy().holes).toEqual([])
  })
})
