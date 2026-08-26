import { describe, expect, it } from 'vitest'

import { normalizeImageSource } from './imageSource'

describe('normalizeImageSource', () => {
  it('recognizes an http(s) URL', () => {
    expect(normalizeImageSource('https://example.test/frame.png')).toEqual({
      kind: 'url',
      src: 'https://example.test/frame.png',
    })
    expect(normalizeImageSource('http://example.test/frame.png')).toEqual({
      kind: 'url',
      src: 'http://example.test/frame.png',
    })
  })

  it('recognizes a data:image/... URL', () => {
    expect(
      normalizeImageSource('data:image/png;base64,opaque-payload'),
    ).toEqual({
      kind: 'data-url',
      src: 'data:image/png;base64,opaque-payload',
    })
  })

  it('trims surrounding whitespace before classifying', () => {
    expect(normalizeImageSource('  https://example.test/frame.png  ')).toEqual(
      { kind: 'url', src: 'https://example.test/frame.png' },
    )
  })

  it('converts a raw base64 image payload into a data URL', () => {
    // A real, tiny (1x1) GIF, encoded as base64 with no scheme prefix.
    const rawBase64 =
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7'
    expect(normalizeImageSource(rawBase64)).toEqual({
      kind: 'data-url',
      src: `data:image/gif;base64,${rawBase64}`,
    })
  })

  it('rejects an unsupported scheme or an arbitrary string', () => {
    expect(normalizeImageSource('ftp://example.test/frame.png')).toBeUndefined()
    expect(normalizeImageSource('not-a-url')).toBeUndefined()
    expect(normalizeImageSource('data:text/plain,hello')).toBeUndefined()
    expect(normalizeImageSource('')).toBeUndefined()
    expect(normalizeImageSource('foo.jpg')).toBeUndefined()
    expect(normalizeImageSource('camera-frame')).toBeUndefined()
    expect(normalizeImageSource('hello')).toBeUndefined()
  })
})
