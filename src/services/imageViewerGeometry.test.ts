import { describe, expect, it } from 'vitest'

import {
  clampViewerPosition,
  clampViewerSize,
  defaultViewerPosition,
  IMAGE_VIEWER_MIN_HEIGHT,
  IMAGE_VIEWER_MIN_WIDTH,
} from './imageViewerGeometry'

const viewport = { width: 1200, height: 800 }

describe('clampViewerSize', () => {
  it('leaves an in-range size untouched', () => {
    expect(clampViewerSize({ width: 400, height: 300 }, viewport)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('grows a too-small size up to the minimum', () => {
    expect(clampViewerSize({ width: 10, height: 5 }, viewport)).toEqual({
      width: IMAGE_VIEWER_MIN_WIDTH,
      height: IMAGE_VIEWER_MIN_HEIGHT,
    })
  })

  it('shrinks an oversized window down to the viewport', () => {
    expect(
      clampViewerSize({ width: 5_000, height: 4_000 }, viewport),
    ).toEqual({ width: viewport.width, height: viewport.height })
  })
})

describe('clampViewerPosition', () => {
  const size = { width: 300, height: 200 }

  it('leaves an in-bounds position untouched', () => {
    expect(clampViewerPosition({ x: 100, y: 50 }, size, viewport)).toEqual({
      x: 100,
      y: 50,
    })
  })

  it('pulls a negative position back to the viewport edge', () => {
    expect(clampViewerPosition({ x: -50, y: -20 }, size, viewport)).toEqual({
      x: 0,
      y: 0,
    })
  })

  it('keeps the whole window inside the viewport on the far edge', () => {
    expect(
      clampViewerPosition({ x: 5_000, y: 5_000 }, size, viewport),
    ).toEqual({
      x: viewport.width - size.width,
      y: viewport.height - size.height,
    })
  })

  it('never places the window outside the viewport, so the title bar stays reachable', () => {
    const clamped = clampViewerPosition({ x: -999, y: 999_999 }, size, viewport)
    expect(clamped.x).toBeGreaterThanOrEqual(0)
    expect(clamped.x + size.width).toBeLessThanOrEqual(viewport.width)
    expect(clamped.y).toBeGreaterThanOrEqual(0)
    expect(clamped.y + size.height).toBeLessThanOrEqual(viewport.height)
  })
})

describe('defaultViewerPosition', () => {
  it('places the window in an unobtrusive corner, not centered', () => {
    const size = { width: 320, height: 260 }
    const position = defaultViewerPosition(size, viewport)

    // Near the right edge...
    expect(position.x).toBeGreaterThan(viewport.width / 2)
    // ...and clear of the app header, not flush against the top.
    expect(position.y).toBeGreaterThan(0)
    expect(position.x + size.width).toBeLessThanOrEqual(viewport.width)
    expect(position.y + size.height).toBeLessThanOrEqual(viewport.height)
  })

  it('stays inside a small viewport rather than overflowing it', () => {
    const size = { width: 320, height: 260 }
    const smallViewport = { width: 360, height: 300 }
    const position = defaultViewerPosition(size, smallViewport)

    expect(position.x).toBeGreaterThanOrEqual(0)
    expect(position.x + size.width).toBeLessThanOrEqual(smallViewport.width)
    expect(position.y).toBeGreaterThanOrEqual(0)
    expect(position.y + size.height).toBeLessThanOrEqual(smallViewport.height)
  })
})
