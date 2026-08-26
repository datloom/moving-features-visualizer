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

  it('rejects a bare base64 payload with no scheme', () => {
    expect(normalizeImageSource('iVBORw0KGgoAAAANSUhEUg==')).toBeUndefined()
  })

  it('rejects an unsupported scheme or an arbitrary string', () => {
    expect(normalizeImageSource('ftp://example.test/frame.png')).toBeUndefined()
    expect(normalizeImageSource('not-a-url')).toBeUndefined()
    expect(normalizeImageSource('data:text/plain,hello')).toBeUndefined()
    expect(normalizeImageSource('')).toBeUndefined()
  })
})
