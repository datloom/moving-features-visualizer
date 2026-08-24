import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { normalizeTemporalProperties } from './normalizer'
import { parseMovingPoint } from './parser'
import { validateMfJson } from './validator'

const loadSample = (filename: string): unknown =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'samples', filename), 'utf8'),
  )

describe('sample MF-JSON datasets', () => {
  it.each([
    ['moving-point-2d-speed.json', false, ['speed']],
    ['moving-point-3d-speed-status.json', true, ['speed', 'status']],
  ] as const)(
    'validates and normalizes %s',
    (filename, expectsHeight, propertyNames) => {
      const sample = loadSample(filename)
      const geometry = parseMovingPoint(sample)
      const properties = normalizeTemporalProperties(sample)

      expect(validateMfJson(sample)).toEqual({ valid: true, issues: [] })
      expect(geometry.success).toBe(true)
      expect(properties.success).toBe(true)

      if (!geometry.success || !properties.success) {
        throw new Error(`Expected ${filename} to normalize successfully`)
      }

      expect(geometry.data.samples).toHaveLength(10)
      expect(
        geometry.data.samples.some((position) => position.height !== undefined),
      ).toBe(expectsHeight)
      expect(properties.data.map((property) => property.name)).toEqual(
        propertyNames,
      )
    },
  )

  it('keeps the malformed sample invalid for validation UI testing', () => {
    const sample = loadSample('invalid-moving-feature.json')
    const result = validateMfJson(sample)

    expect(result.valid).toBe(false)
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported_value' }),
        expect.objectContaining({ code: 'invalid_datetime' }),
        expect.objectContaining({ code: 'invalid_coordinate' }),
        expect.objectContaining({ code: 'count_mismatch' }),
      ]),
    )
  })
})
