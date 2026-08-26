import { z } from 'zod'

import {
  GEOMETRY_INTERPOLATIONS,
  normalizeGeometryInterpolation,
} from './geometryInterpolation'

const recordSchema = z.record(z.string(), z.unknown())

export type ValidationIssueCode =
  | 'count_mismatch'
  | 'empty_array'
  | 'invalid_coordinate'
  | 'invalid_datetime'
  | 'invalid_type'
  | 'invalid_value'
  | 'not_ordered'
  | 'out_of_range'
  | 'required'
  | 'unsupported_value'

export interface ValidationIssue {
  readonly path: string
  readonly code: ValidationIssueCode
  readonly message: string
  readonly expected?: unknown
  readonly actual?: unknown
  readonly featureId?: string
}

export type ValidationResult =
  | { readonly valid: true; readonly issues: readonly [] }
  | { readonly valid: false; readonly issues: readonly ValidationIssue[] }

interface ValidationContext {
  readonly featureId?: string
  readonly issues: ValidationIssue[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  recordSchema.safeParse(value).success

const isUnknownArray = (value: unknown): value is unknown[] =>
  Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const geometrySampleMinimums = {
  Discrete: 1,
  Step: 2,
  Linear: 2,
  Quadratic: 3,
  Cubic: 4,
} as const

const addIssue = (
  context: ValidationContext,
  issue: Omit<ValidationIssue, 'featureId'>,
) => {
  context.issues.push({ ...issue, featureId: context.featureId })
}

const validateDatetimes = (
  value: unknown,
  path: string,
  context: ValidationContext,
): readonly string[] | undefined => {
  if (!isUnknownArray(value)) {
    addIssue(context, {
      path,
      code: value === undefined ? 'required' : 'invalid_type',
      message: 'Datetimes must be an array of ISO 8601 strings.',
      expected: 'string[]',
      actual: value,
    })
    return undefined
  }

  if (value.length === 0) {
    addIssue(context, {
      path,
      code: 'empty_array',
      message: 'At least one datetime is required.',
      expected: 'non-empty array',
      actual: value,
    })
  }

  const validDatetimes: string[] = []
  let previousTime: number | undefined

  value.forEach((datetime, index) => {
    const itemPath = `${path}[${index}]`

    if (typeof datetime !== 'string') {
      addIssue(context, {
        path: itemPath,
        code: 'invalid_datetime',
        message: 'Datetime must be a valid ISO 8601 date-time string.',
        expected: 'ISO 8601 date-time string',
        actual: datetime,
      })
      return
    }

    const parsedTime = Date.parse(datetime)
    if (!Number.isFinite(parsedTime)) {
      addIssue(context, {
        path: itemPath,
        code: 'invalid_datetime',
        message: 'Datetime must be a valid ISO 8601 date-time string.',
        expected: 'ISO 8601 date-time string',
        actual: datetime,
      })
      return
    }

    if (previousTime !== undefined && parsedTime <= previousTime) {
      addIssue(context, {
        path: itemPath,
        code: 'not_ordered',
        message: 'Datetimes must be strictly increasing.',
        expected: `timestamp greater than ${previousTime}`,
        actual: parsedTime,
      })
    }

    previousTime = parsedTime
    validDatetimes.push(datetime)
  })

  return validDatetimes
}

const validateCoordinates = (
  value: unknown,
  path: string,
  context: ValidationContext,
): readonly (readonly number[])[] | undefined => {
  if (!isUnknownArray(value)) {
    addIssue(context, {
      path,
      code: value === undefined ? 'required' : 'invalid_type',
      message: 'Coordinates must be an array of positions.',
      expected: 'number[][]',
      actual: value,
    })
    return undefined
  }

  if (value.length === 0) {
    addIssue(context, {
      path,
      code: 'empty_array',
      message: 'At least one coordinate is required.',
      expected: 'non-empty array',
      actual: value,
    })
  }

  value.forEach((coordinate, index) => {
    const itemPath = `${path}[${index}]`

    if (!isUnknownArray(coordinate) || ![2, 3].includes(coordinate.length)) {
      addIssue(context, {
        path: itemPath,
        code: 'invalid_coordinate',
        message:
          'A position must contain longitude, latitude, and optional height.',
        expected: '[longitude, latitude] or [longitude, latitude, height]',
        actual: coordinate,
      })
      return
    }

    if (!coordinate.every(isFiniteNumber)) {
      addIssue(context, {
        path: itemPath,
        code: 'invalid_coordinate',
        message: 'Coordinate components must be finite numbers.',
        expected: 'finite numbers',
        actual: coordinate,
      })
      return
    }

    const [longitude, latitude] = coordinate

    if (longitude! < -180 || longitude! > 180) {
      addIssue(context, {
        path: `${itemPath}[0]`,
        code: 'out_of_range',
        message: 'Longitude must be between -180 and 180 degrees.',
        expected: '[-180, 180]',
        actual: longitude,
      })
    }

    if (latitude! < -90 || latitude! > 90) {
      addIssue(context, {
        path: `${itemPath}[1]`,
        code: 'out_of_range',
        message: 'Latitude must be between -90 and 90 degrees.',
        expected: '[-90, 90]',
        actual: latitude,
      })
    }
  })

  return value as readonly (readonly number[])[]
}

const validateTemporalGeometrySegment = (
  value: unknown,
  path: string,
  context: ValidationContext,
) => {
  if (!isRecord(value)) {
    addIssue(context, {
      path,
      code: value === undefined ? 'required' : 'invalid_type',
      message: 'A temporal geometry object is required.',
      expected: 'object',
      actual: value,
    })
    return
  }

  if (
    value.type !== 'MovingPoint' &&
    value.type !== 'MovingLineString' &&
    value.type !== 'MovingPolygon'
  ) {
    addIssue(context, {
      path: `${path}.type`,
      code: value.type === undefined ? 'required' : 'unsupported_value',
      message: 'Temporal geometry type is not currently supported.',
      expected: ['MovingPoint', 'MovingLineString', 'MovingPolygon'],
      actual: value.type,
    })
  }

  const interpolation =
    value.interpolation === undefined
      ? 'Linear'
      : normalizeGeometryInterpolation(value.interpolation)
  if (interpolation === undefined) {
    addIssue(context, {
      path: `${path}.interpolation`,
      code: 'unsupported_value',
      message: 'Temporal geometry interpolation is not currently supported.',
      expected: [...GEOMETRY_INTERPOLATIONS, 'Stepwise'],
      actual: value.interpolation,
    })
  }

  validateDatetimes(value.datetimes, `${path}.datetimes`, context)
  if (
    interpolation !== undefined &&
    isUnknownArray(value.datetimes) &&
    value.datetimes.length < geometrySampleMinimums[interpolation]
  ) {
    addIssue(context, {
      path: `${path}.datetimes`,
      code: 'count_mismatch',
      message: `${interpolation} interpolation requires at least ${geometrySampleMinimums[interpolation]} temporal samples.`,
      expected: `at least ${geometrySampleMinimums[interpolation]} samples`,
      actual: value.datetimes.length,
    })
  }
  if (value.type === 'MovingPolygon') {
    if (!isUnknownArray(value.coordinates)) {
      addIssue(context, {
        path: `${path}.coordinates`,
        code: 'invalid_type',
        message: 'MovingPolygon coordinates must be an array of Polygons.',
        expected: 'number[][][][]',
        actual: value.coordinates,
      })
    } else {
      let expectedRingCounts: readonly number[] | undefined
      let expectedDimension: number | undefined
      value.coordinates.forEach((polygon, polygonIndex) => {
        const polygonPath = `${path}.coordinates[${polygonIndex}]`
        if (!isUnknownArray(polygon) || polygon.length === 0) {
          addIssue(context, {
            path: polygonPath,
            code: isUnknownArray(polygon) ? 'empty_array' : 'invalid_type',
            message: 'A Polygon must contain at least one ring.',
            expected: 'non-empty array of rings',
            actual: polygon,
          })
          return
        }
        const ringCounts: number[] = []
        polygon.forEach((ring, ringIndex) => {
          const ringPath = `${polygonPath}[${ringIndex}]`
          const positions = validateCoordinates(ring, ringPath, context)
          if (!positions) return
          ringCounts.push(positions.length)
          if (positions.length < 4) {
            addIssue(context, {
              path: ringPath,
              code: 'invalid_coordinate',
              message: 'A Polygon ring must contain at least four positions.',
              expected: 'at least four positions',
              actual: positions.length,
            })
          }
          const first = positions[0]
          const last = positions.at(-1)
          if (
            first &&
            last &&
            (first.length !== last.length ||
              first.some((component, index) => component !== last[index]))
          ) {
            addIssue(context, {
              path: ringPath,
              code: 'invalid_coordinate',
              message: 'A Polygon ring must be closed.',
              expected: 'first and last positions equal',
              actual: [first, last],
            })
          }
          const dimensions = new Set(
            positions.map((position) => position.length),
          )
          if (dimensions.size !== 1) {
            addIssue(context, {
              path: ringPath,
              code: 'count_mismatch',
              message: 'Polygon positions must use one coordinate dimension.',
              expected: 'consistent 2D or 3D positions',
              actual: [...dimensions],
            })
          }
          expectedDimension ??= first?.length
          if (first && first.length !== expectedDimension) {
            addIssue(context, {
              path: ringPath,
              code: 'count_mismatch',
              message: 'MovingPolygon samples require compatible dimensions.',
              expected: `${expectedDimension}D positions`,
              actual: `${first.length}D positions`,
            })
          }
        })
        expectedRingCounts ??= ringCounts
        if (
          ringCounts.length !== expectedRingCounts.length ||
          ringCounts.some(
            (count, index) => count !== expectedRingCounts![index],
          )
        ) {
          addIssue(context, {
            path: polygonPath,
            code: 'count_mismatch',
            message: 'MovingPolygon samples require compatible ring structure.',
            expected: expectedRingCounts,
            actual: ringCounts,
          })
        }
      })
    }
  } else if (value.type === 'MovingLineString') {
    if (!isUnknownArray(value.coordinates)) {
      addIssue(context, {
        path: `${path}.coordinates`,
        code: 'invalid_type',
        message:
          'MovingLineString coordinates must be an array of LineStrings.',
        expected: 'number[][][]',
        actual: value.coordinates,
      })
    } else {
      let expectedVertexCount: number | undefined
      let expectedDimension: number | undefined
      value.coordinates.forEach((line, index) => {
        const linePath = `${path}.coordinates[${index}]`
        const positions = validateCoordinates(line, linePath, context)
        if (positions && positions.length < 2) {
          addIssue(context, {
            path: linePath,
            code: 'invalid_coordinate',
            message: 'A LineString must contain at least two positions.',
            expected: 'at least two positions',
            actual: positions.length,
          })
        }
        if (!positions?.[0]) return
        const dimensions = new Set(positions.map((position) => position.length))
        if (dimensions.size !== 1) {
          addIssue(context, {
            path: linePath,
            code: 'count_mismatch',
            message: 'LineString positions must use one coordinate dimension.',
            expected: 'consistent 2D or 3D positions',
            actual: [...dimensions],
          })
        }
        expectedVertexCount ??= positions.length
        expectedDimension ??= positions[0].length
        if (
          positions.length !== expectedVertexCount ||
          positions[0].length !== expectedDimension
        ) {
          addIssue(context, {
            path: linePath,
            code: 'count_mismatch',
            message: 'MovingLineString samples require compatible vertices.',
            expected: `${expectedVertexCount} vertices of dimension ${expectedDimension}`,
            actual: `${positions.length} vertices of dimension ${positions[0].length}`,
          })
        }
      })
    }
  } else {
    const positions = validateCoordinates(
      value.coordinates,
      `${path}.coordinates`,
      context,
    )
    if (positions?.[0]) {
      const dimensions = new Set(positions.map((position) => position.length))
      if (dimensions.size !== 1) {
        addIssue(context, {
          path: `${path}.coordinates`,
          code: 'count_mismatch',
          message: 'MovingPoint samples must use one coordinate dimension.',
          expected: 'consistent 2D or 3D positions',
          actual: [...dimensions],
        })
      }
    }
  }

  if (
    isUnknownArray(value.datetimes) &&
    isUnknownArray(value.coordinates) &&
    value.datetimes.length !== value.coordinates.length
  ) {
    addIssue(context, {
      path,
      code: 'count_mismatch',
      message: 'Temporal geometry must have one geometry per datetime.',
      expected: value.datetimes.length,
      actual: value.coordinates.length,
    })
  }
}

const validateTemporalGeometry = (
  value: unknown,
  context: ValidationContext,
) => {
  const path = '$.temporalGeometry'
  if (Array.isArray(value)) {
    if (value.length === 0) {
      addIssue(context, {
        path,
        code: 'empty_array',
        message: 'At least one temporal geometry segment is required.',
        expected: 'non-empty array',
        actual: value,
      })
      return
    }
    value.forEach((segment, index) =>
      validateTemporalGeometrySegment(segment, `${path}[${index}]`, context),
    )
    return
  }
  validateTemporalGeometrySegment(value, path, context)
}

const validatePropertyDefinition = (
  value: unknown,
  path: string,
  datetimeCount: number | undefined,
  context: ValidationContext,
) => {
  if (!isRecord(value)) {
    addIssue(context, {
      path,
      code: 'invalid_type',
      message: 'A temporal property definition must be an object.',
      expected: 'object',
      actual: value,
    })
    return
  }

  const propertyType = value.type
  if (
    propertyType !== 'Measure' &&
    propertyType !== 'Text' &&
    propertyType !== 'IMAGE'
  ) {
    addIssue(context, {
      path: `${path}.type`,
      code: propertyType === undefined ? 'required' : 'unsupported_value',
      message: 'Temporal property type must be Measure, Text, or IMAGE.',
      expected: ['Measure', 'Text', 'IMAGE'],
      actual: propertyType,
    })
  }

  const allowedInterpolations =
    propertyType === 'Measure'
      ? ['Discrete', 'Step', 'Linear', 'Regression']
      : ['Discrete', 'Step']
  const interpolation = value.interpolation
  if (
    interpolation !== undefined &&
    (typeof interpolation !== 'string' ||
      !allowedInterpolations.includes(interpolation))
  ) {
    addIssue(context, {
      path: `${path}.interpolation`,
      code: 'unsupported_value',
      message: 'Interpolation is not supported for this property type.',
      expected: allowedInterpolations,
      actual: interpolation,
    })
  }

  if (
    propertyType === 'Measure' &&
    interpolation === 'Regression' &&
    datetimeCount !== undefined &&
    datetimeCount < 2
  ) {
    addIssue(context, {
      path,
      code: 'count_mismatch',
      message: 'Regression Measure properties require at least two samples.',
      expected: 'at least 2 samples',
      actual: datetimeCount,
    })
  }

  for (const metadataName of ['unit', 'form'] as const) {
    const metadata = value[metadataName]
    if (metadata !== undefined && typeof metadata !== 'string') {
      addIssue(context, {
        path: `${path}.${metadataName}`,
        code: 'invalid_type',
        message: `Temporal property ${metadataName} must be a string when provided.`,
        expected: 'string',
        actual: metadata,
      })
    }
  }

  if (!isUnknownArray(value.values)) {
    addIssue(context, {
      path: `${path}.values`,
      code: value.values === undefined ? 'required' : 'invalid_type',
      message: 'Temporal property values must be an array.',
      expected: 'array',
      actual: value.values,
    })
    return
  }

  if (datetimeCount !== undefined && value.values.length !== datetimeCount) {
    addIssue(context, {
      path,
      code: 'count_mismatch',
      message: 'Temporal property must have one value per datetime.',
      expected: datetimeCount,
      actual: value.values.length,
    })
  }

  value.values.forEach((propertyValue, index) => {
    const hasValidType =
      (propertyType === 'Measure' &&
        typeof propertyValue === 'number' &&
        Number.isFinite(propertyValue)) ||
      ((propertyType === 'Text' || propertyType === 'IMAGE') &&
        typeof propertyValue === 'string')

    if (
      !hasValidType &&
      (propertyType === 'Measure' ||
        propertyType === 'Text' ||
        propertyType === 'IMAGE')
    ) {
      addIssue(context, {
        path: `${path}.values[${index}]`,
        code: 'invalid_value',
        message: `A ${propertyType} value has the wrong type.`,
        expected: propertyType === 'Measure' ? 'finite number' : 'string',
        actual: propertyValue,
      })
    }
  })
}

const validateTemporalProperties = (
  value: unknown,
  context: ValidationContext,
) => {
  const path = '$.temporalProperties'
  if (value === undefined) return

  if (!isUnknownArray(value)) {
    addIssue(context, {
      path,
      code: 'invalid_type',
      message: 'Temporal properties must be an array.',
      expected: 'array',
      actual: value,
    })
    return
  }

  value.forEach((group, groupIndex) => {
    const groupPath = `${path}[${groupIndex}]`
    if (!isRecord(group)) {
      addIssue(context, {
        path: groupPath,
        code: 'invalid_type',
        message: 'A temporal property group must be an object.',
        expected: 'object',
        actual: group,
      })
      return
    }

    validateDatetimes(group.datetimes, `${groupPath}.datetimes`, context)
    const definitions = Object.entries(group).filter(
      ([name]) => name !== 'datetimes',
    )

    if (definitions.length === 0) {
      addIssue(context, {
        path: groupPath,
        code: 'required',
        message: 'A temporal property group must define at least one property.',
        expected: 'named property definition',
        actual: group,
      })
    }

    definitions.forEach(([name, definition]) =>
      validatePropertyDefinition(
        definition,
        `${groupPath}.${name}`,
        isUnknownArray(group.datetimes) ? group.datetimes.length : undefined,
        context,
      ),
    )
  })
}

export const validateMfJson = (input: unknown): ValidationResult => {
  if (!isRecord(input)) {
    return {
      valid: false,
      issues: [
        {
          path: '$',
          code: 'invalid_type',
          message: 'MF-JSON root must be an object.',
          expected: 'object',
          actual: input,
        },
      ],
    }
  }

  const featureId = typeof input.id === 'string' ? input.id : undefined
  const context: ValidationContext = { featureId, issues: [] }

  if (input.type !== 'Feature') {
    addIssue(context, {
      path: '$.type',
      code: input.type === undefined ? 'required' : 'unsupported_value',
      message: 'MF-JSON root type must be Feature.',
      expected: 'Feature',
      actual: input.type,
    })
  }

  if (input.id !== undefined && typeof input.id !== 'string') {
    addIssue(context, {
      path: '$.id',
      code: 'invalid_type',
      message: 'Feature ID must be a string when provided.',
      expected: 'string',
      actual: input.id,
    })
  }

  validateTemporalGeometry(input.temporalGeometry, context)
  validateTemporalProperties(input.temporalProperties, context)

  return context.issues.length === 0
    ? { valid: true, issues: [] }
    : { valid: false, issues: context.issues }
}
