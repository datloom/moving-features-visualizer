import { z } from 'zod'

import { parseTemporalGeometryTrack } from './parser'
import type {
  MovingFeature,
  TemporalProperty,
  TemporalPropertySample,
} from './types'
import { validateMfJson, type ValidationIssue } from './validator'

const measurePropertySchema = z.object({
  type: z.literal('Measure'),
  values: z.array(z.number()),
  interpolation: z
    .enum(['Discrete', 'Step', 'Linear', 'Regression'])
    .default('Discrete'),
  unit: z.string().optional(),
  form: z.string().optional(),
})

const textPropertySchema = z.object({
  type: z.literal('Text'),
  values: z.array(z.string()),
  interpolation: z.enum(['Discrete', 'Step']).default('Discrete'),
  form: z.string().optional(),
})

const imagePropertySchema = z.object({
  type: z.literal('IMAGE'),
  values: z.array(z.string()),
  interpolation: z.enum(['Discrete', 'Step']).default('Discrete'),
  form: z.string().optional(),
})

const propertyDefinitionSchema = z.discriminatedUnion('type', [
  measurePropertySchema,
  textPropertySchema,
  imagePropertySchema,
])

const temporalPropertyGroupSchema = z
  .object({ datetimes: z.array(z.string()) })
  .loose()

const featurePropertiesSchema = z.object({
  temporalProperties: z.array(temporalPropertyGroupSchema).optional(),
})

export type TemporalPropertiesNormalizationResult =
  | { readonly success: true; readonly data: readonly TemporalProperty[] }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] }

export type MovingFeatureNormalizationResult =
  | { readonly success: true; readonly data: MovingFeature }
  | { readonly success: false; readonly issues: readonly ValidationIssue[] }

const schemaIssue = (
  path: PropertyKey[],
  actual: unknown,
): ValidationIssue => ({
  path: `$.${path.map(String).join('.')}`,
  code: 'invalid_type',
  message: 'Validated temporal property input could not be narrowed.',
  actual,
})

const createSamples = <Value extends number | string>(
  datetimes: readonly string[],
  values: readonly Value[],
): TemporalPropertySample<Value>[] =>
  values.map((value, index) => ({
    time: Date.parse(datetimes[index]!),
    value,
  }))

export const normalizeTemporalProperties = (
  input: unknown,
): TemporalPropertiesNormalizationResult => {
  const validation = validateMfJson(input)
  if (!validation.valid) {
    return { success: false, issues: validation.issues }
  }

  const parsedFeature = featurePropertiesSchema.safeParse(input)
  if (!parsedFeature.success) {
    return {
      success: false,
      issues: parsedFeature.error.issues.map((issue) =>
        schemaIssue(issue.path, issue.input),
      ),
    }
  }

  const properties: TemporalProperty[] = []

  for (const [groupIndex, group] of (
    parsedFeature.data.temporalProperties ?? []
  ).entries()) {
    for (const [name, rawDefinition] of Object.entries(group)) {
      if (name === 'datetimes') continue

      const parsedDefinition = propertyDefinitionSchema.safeParse(rawDefinition)
      if (!parsedDefinition.success) {
        return {
          success: false,
          issues: parsedDefinition.error.issues.map((issue) =>
            schemaIssue(
              ['temporalProperties', groupIndex, name, ...issue.path],
              issue.input,
            ),
          ),
        }
      }

      const definition = parsedDefinition.data

      if (definition.type === 'Measure') {
        properties.push({
          type: definition.type,
          name,
          interpolation: definition.interpolation,
          unit: definition.unit,
          form: definition.form,
          samples: createSamples(group.datetimes, definition.values),
        })
      } else if (definition.type === 'Text') {
        properties.push({
          type: definition.type,
          name,
          interpolation: definition.interpolation,
          form: definition.form,
          samples: createSamples(group.datetimes, definition.values),
        })
      } else {
        properties.push({
          type: definition.type,
          name,
          interpolation: definition.interpolation,
          form: definition.form,
          samples: createSamples(group.datetimes, definition.values),
        })
      }
    }
  }

  return { success: true, data: properties }
}

export const normalizeMovingFeature = (
  input: unknown,
): MovingFeatureNormalizationResult => {
  const geometry = parseTemporalGeometryTrack(input)
  if (!geometry.success) return geometry

  const temporalProperties = normalizeTemporalProperties(input)
  if (!temporalProperties.success) return temporalProperties

  const feature = z
    .object({
      id: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
    })
    .safeParse(input)

  if (!feature.success) {
    return {
      success: false,
      issues: feature.error.issues.map((issue) =>
        schemaIssue(issue.path, issue.input),
      ),
    }
  }

  return {
    success: true,
    data: {
      id: feature.data.id ?? '',
      type: 'MovingFeature',
      temporalGeometry: geometry.data,
      temporalProperties: temporalProperties.data,
      properties: feature.data.properties ?? {},
    },
  }
}
