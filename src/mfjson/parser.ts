import { z } from 'zod'

import type { MovingPoint, PositionSample } from './types'
import {
  validateMfJson,
  type ValidationIssue,
} from './validator'

const positionSchema = z.union([
  z.tuple([z.number(), z.number()]),
  z.tuple([z.number(), z.number(), z.number()]),
])

const movingPointFeatureSchema = z.object({
  temporalGeometry: z.object({
    type: z.literal('MovingPoint'),
    datetimes: z.array(z.string()),
    coordinates: z.array(positionSchema),
    interpolation: z.literal('Linear').optional(),
  }),
})

export type MovingPointParseResult =
  | { readonly success: true; readonly data: MovingPoint }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] }

const schemaIssue = (path: PropertyKey[], actual: unknown): ValidationIssue => ({
  path: `$.${path.map(String).join('.')}`,
  code: 'invalid_type',
  message: 'Validated MovingPoint input could not be narrowed for parsing.',
  actual,
})

export const parseMovingPoint = (input: unknown): MovingPointParseResult => {
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

  const geometry = parsedFeature.data.temporalGeometry
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
    success: true,
    data: {
      type: 'MovingPoint',
      interpolation: geometry.interpolation ?? 'Linear',
      samples,
    },
  }
}
