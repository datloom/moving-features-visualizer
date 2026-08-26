import { describe, expect, it } from 'vitest'

import { normalizeTemporalPropertyType } from './temporalPropertyType'

describe('normalizeTemporalPropertyType', () => {
  it.each([
    ['Measure', 'Measure'],
    ['measure', 'Measure'],
    ['MEASURE', 'Measure'],
    ['Text', 'Text'],
    ['text', 'Text'],
    ['TEXT', 'Text'],
    ['Image', 'Image'],
    ['image', 'Image'],
    ['IMAGE', 'Image'],
  ] as const)('normalizes %s to %s', (input, expected) => {
    expect(normalizeTemporalPropertyType(input)).toBe(expected)
  })

  it('rejects an unsupported type', () => {
    expect(normalizeTemporalPropertyType('Video')).toBeUndefined()
  })

  it('rejects non-string values', () => {
    expect(normalizeTemporalPropertyType(undefined)).toBeUndefined()
    expect(normalizeTemporalPropertyType(42)).toBeUndefined()
  })
})
