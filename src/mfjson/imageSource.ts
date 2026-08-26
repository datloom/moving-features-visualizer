/**
 * A raw ImageTemporalProperty sample value normalized into one shape. This is
 * the single place that inspects the raw string form — validators and
 * renderers both call `normalizeImageSource` rather than re-detecting
 * URL/data-URL shapes themselves.
 */
export type NormalizedImageValue =
  | { readonly kind: 'url'; readonly src: string }
  | { readonly kind: 'data-url'; readonly src: string }

const HTTP_URL_PATTERN = /^https?:\/\//i
const DATA_IMAGE_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;/i

/**
 * Normalizes a raw Image temporal-property value into a supported
 * representation. Returns undefined for anything else (including bare
 * base64 payloads, which are not a supported representation).
 */
export const normalizeImageSource = (
  raw: string,
): NormalizedImageValue | undefined => {
  const trimmed = raw.trim()
  if (HTTP_URL_PATTERN.test(trimmed)) return { kind: 'url', src: trimmed }
  if (DATA_IMAGE_URL_PATTERN.test(trimmed))
    return { kind: 'data-url', src: trimmed }
  return undefined
}
