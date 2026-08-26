import type { TemporalPropertyType } from './types'

/**
 * Canonicalizes a raw MF-JSON TemporalProperty `type` value case-insensitively
 * (e.g. "IMAGE", "image", "Image" all resolve to the canonical "Image").
 * This is the single place that interprets the raw casing — validation and
 * normalization both call it rather than re-deriving their own rules, and
 * everything past this boundary (including renderer dispatch) only ever
 * sees the canonical "Measure" | "Text" | "Image" values.
 *
 * Returns undefined for anything unsupported (including non-string values)
 * — callers must not silently map an unrecognized type to a canonical one.
 */
export const normalizeTemporalPropertyType = (
  value: unknown,
): TemporalPropertyType | undefined => {
  if (typeof value !== 'string') return undefined
  switch (value.toLowerCase()) {
    case 'measure':
      return 'Measure'
    case 'text':
      return 'Text'
    case 'image':
      return 'Image'
    default:
      return undefined
  }
}
