/**
 * A raw ImageTemporalProperty sample value normalized into one shape. This is
 * the single place that inspects the raw string form — validators and
 * renderers both call `normalizeImageSource` rather than re-detecting
 * URL/data-URL/base64 shapes themselves.
 */
export type NormalizedImageValue =
  | { readonly kind: 'url'; readonly src: string }
  | { readonly kind: 'data-url'; readonly src: string }

const HTTP_URL_PATTERN = /^https?:\/\//i
const DATA_IMAGE_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;/i

/**
 * Base64 encodings of each format's leading magic bytes. Matching against
 * these prefixes identifies the MIME type from the first few characters of
 * the base64 string alone, without decoding the (potentially large) payload.
 */
const BASE64_IMAGE_SIGNATURES: readonly {
  readonly prefix: string
  readonly mimeType: string
}[] = [
  { prefix: '/9j/', mimeType: 'image/jpeg' },
  { prefix: 'iVBORw0KGgo', mimeType: 'image/png' },
  { prefix: 'R0lGOD', mimeType: 'image/gif' },
  { prefix: 'UklGR', mimeType: 'image/webp' },
]

/** A plausible base64 payload: base64 alphabet only, with padding at the end. */
const BASE64_CHARSET_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/

const detectBase64ImageMimeType = (trimmed: string): string | undefined => {
  const signature = BASE64_IMAGE_SIGNATURES.find(({ prefix }) =>
    trimmed.startsWith(prefix),
  )
  if (!signature) return undefined
  if (!BASE64_CHARSET_PATTERN.test(trimmed)) return undefined
  return signature.mimeType
}

/**
 * Normalizes a raw Image temporal-property value into a supported
 * representation: an http(s) URL, a data:image/... URL, or a raw base64
 * image payload (converted into a data:image/...;base64,... URL). Returns
 * undefined for anything else, including strings that merely look like
 * filenames or bare words.
 */
export const normalizeImageSource = (
  raw: string,
): NormalizedImageValue | undefined => {
  const trimmed = raw.trim()
  if (HTTP_URL_PATTERN.test(trimmed)) return { kind: 'url', src: trimmed }
  if (DATA_IMAGE_URL_PATTERN.test(trimmed))
    return { kind: 'data-url', src: trimmed }

  const mimeType = detectBase64ImageMimeType(trimmed)
  if (mimeType)
    return { kind: 'data-url', src: `data:${mimeType};base64,${trimmed}` }

  return undefined
}
