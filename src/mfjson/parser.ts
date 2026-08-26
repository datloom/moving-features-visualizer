import { z } from 'zod'

import { normalizeGeometryInterpolation } from './geometryInterpolation'
import type {
  MovingPoint,
  MovingLineString,
  MovingPolygon,
  PositionSample,
  TemporalGeometryTrack,
} from './types'
import { validateMfJson, type ValidationIssue } from './validator'

const positionSchema = z.union([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
])

const geometryInterpolationSchema = z.preprocess(
  normalizeGeometryInterpolation,
  z.enum(['Discrete', 'Step', 'Linear', 'Quadratic', 'Cubic']),
)

const movingPointSchema = z.object({
  id: z.string().optional(),
  type: z.literal('MovingPoint'),
  datetimes: z.array(z.string()),
  coordinates: z.array(positionSchema),
  interpolation: geometryInterpolationSchema.optional(),
})

const movingLineStringSchema = z.object({
  id: z.string().optional(),
  type: z.literal('MovingLineString'),
  datetimes: z.array(z.string()),
  coordinates: z.array(z.array(positionSchema)),
  interpolation: geometryInterpolationSchema.optional(),
})

const movingPolygonSchema = z.object({
  id: z.string().optional(),
  type: z.literal('MovingPolygon'),
  datetimes: z.array(z.string()),
  coordinates: z.array(z.array(z.array(positionSchema))),
  interpolation: geometryInterpolationSchema.optional(),
})

const temporalGeometrySchema = z.discriminatedUnion('type', [
  movingPointSchema,
  movingLineStringSchema,
  movingPolygonSchema,
])

const movingPointFeatureSchema = z.object({
  temporalGeometry: z.union([
    temporalGeometrySchema,
    z.array(temporalGeometrySchema).min(1),
  ]),
})

export type MovingPointParseResult =
  | { readonly success: true; readonly data: MovingPoint }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] }

export type TemporalGeometryTrackParseResult =
  | { readonly success: true; readonly data: TemporalGeometryTrack }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] }

const schemaIssue = (
  path: PropertyKey[],
  actual: unknown,
): ValidationIssue => ({
  path: `$.${path.map(String).join('.')}`,
  code: 'invalid_type',
  message: 'Validated MovingPoint input could not be narrowed for parsing.',
  actual,
})

export const parseTemporalGeometryTrack = (
  input: unknown,
): TemporalGeometryTrackParseResult => {
  const validation = validateMfJson(input)
  if (!validation.valid) {
    return { success: false, issues: validation.issues }
  }

  const parsedFeature = movingPointFeatureSchema.safeParse(input)
  if (!parsedFeature.success) {
    return {
      success: false,
      issues: parsedFeature.error.issues.map((issue) =>
        schemaIssue(issue.path, issue.input),
      ),
    }
  }

  const geometries = Array.isArray(parsedFeature.data.temporalGeometry)
    ? parsedFeature.data.temporalGeometry
    : [parsedFeature.data.temporalGeometry]
  const segments = geometries.map(
    (geometry): MovingPoint | MovingLineString | MovingPolygon => {
      if (geometry.type === 'MovingPolygon') {
        return {
          id: geometry.id,
          type: geometry.type,
          interpolation: geometry.interpolation ?? 'Linear',
          samples: geometry.datetimes.map((datetime, index) => ({
            time: Date.parse(datetime),
            rings: geometry.coordinates[index]!.map((ring) =>
              ring.map((coordinate) => ({
                longitude: coordinate[0],
                latitude: coordinate[1],
                ...(coordinate.length === 3 ? { height: coordinate[2] } : {}),
              })),
            ),
          })),
        }
      }
      if (geometry.type === 'MovingLineString') {
        return {
          id: geometry.id,
          type: geometry.type,
          interpolation: geometry.interpolation ?? 'Linear',
          samples: geometry.datetimes.map((datetime, index) => ({
            time: Date.parse(datetime),
            positions: geometry.coordinates[index]!.map((coordinate) => ({
              longitude: coordinate[0],
              latitude: coordinate[1],
              ...(coordinate.length === 3 ? { height: coordinate[2] } : {}),
            })),
          })),
        }
      }
      const samples: PositionSample[] = geometry.datetimes.map(
        (datetime, index) => {
          const coordinate = geometry.coordinates[index]!
          const sample: PositionSample = {
            time: Date.parse(datetime),
            longitude: coordinate[0],
            latitude: coordinate[1],
          }

          return coordinate.length === 3
            ? { ...sample, height: coordinate[2] }
            : sample
        },
      )

      return {
        id: geometry.id,
        type: 'MovingPoint',
        interpolation: geometry.interpolation ?? 'Linear',
        samples,
      }
    },
  )

  return {
    success: true,
    data: { segments },
  }
}

export const parseMovingPoint = (input: unknown): MovingPointParseResult => {
  const result = parseTemporalGeometryTrack(input)
  if (!result.success) return result
  const segment = result.data.segments[0]
  return segment?.type === 'MovingPoint'
    ? { success: true, data: segment }
    : {
        success: false,
        issues: [schemaIssue(['temporalGeometry', 'type'], segment?.type)],
      }
}
