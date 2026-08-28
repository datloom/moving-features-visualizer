import { describe, expect, it } from 'vitest'

import {
  computeRailWidth,
  computeVisibleSampleRange,
  MIN_THUMBNAIL_SPACING_PX,
  sampleRailPosition,
} from './imageTimelineWindow'

const domain = { start: 0, end: 1_000 }

describe('computeRailWidth', () => {
  it('uses the container width when samples are sparse', () => {
    expect(computeRailWidth(5, 800)).toBe(800)
  })

  it('grows past the container width once samples are dense', () => {
    expect(computeRailWidth(1_000, 800)).toBe(1_000 * MIN_THUMBNAIL_SPACING_PX)
  })
})

describe('computeVisibleSampleRange', () => {
  // 1000 samples evenly spread across the domain — a lightweight synthetic
  // large-dataset fixture (no real images/Base64 involved).
  const samples = Array.from({ length: 1_000 }, (_, index) => ({
    time: (index / 999) * domain.end,
  }))
  const railWidth = computeRailWidth(samples.length, 800)

  it('returns an empty range for an empty sample list', () => {
    expect(computeVisibleSampleRange([], domain, railWidth, 0, 800)).toEqual({
      startIndex: 0,
      endIndex: 0,
    })
  })

  it('selects only a small bounded window out of 1000 logical samples', () => {
    const range = computeVisibleSampleRange(samples, domain, railWidth, 0, 800, 320)
    const count = range.endIndex - range.startIndex
    // Viewport + overscan covers (800 + 2*320) px out of a much wider rail —
    // nowhere near all 1000 samples should fall inside it.
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThan(samples.length)
  })

  it('every selected sample truly falls within the viewport + overscan bounds', () => {
    const scrollLeft = 5_000
    const viewportWidth = 800
    const overscanPx = 320
    const range = computeVisibleSampleRange(
      samples,
      domain,
      railWidth,
      scrollLeft,
      viewportWidth,
      overscanPx,
    )
    const lower = scrollLeft - overscanPx
    const upper = scrollLeft + viewportWidth + overscanPx
    for (let index = range.startIndex; index < range.endIndex; index += 1) {
      const x = sampleRailPosition(samples[index]!.time, domain, railWidth)
      expect(x).toBeGreaterThanOrEqual(lower)
      expect(x).toBeLessThanOrEqual(upper)
    }
  })

  it('excludes samples just outside the window on both sides', () => {
    const scrollLeft = 5_000
    const viewportWidth = 800
    const overscanPx = 320
    const range = computeVisibleSampleRange(
      samples,
      domain,
      railWidth,
      scrollLeft,
      viewportWidth,
      overscanPx,
    )
    if (range.startIndex > 0) {
      const beforeX = sampleRailPosition(
        samples[range.startIndex - 1]!.time,
        domain,
        railWidth,
      )
      expect(beforeX).toBeLessThan(scrollLeft - overscanPx)
    }
    if (range.endIndex < samples.length) {
      const afterX = sampleRailPosition(
        samples[range.endIndex]!.time,
        domain,
        railWidth,
      )
      expect(afterX).toBeGreaterThan(scrollLeft + viewportWidth + overscanPx)
    }
  })

  it('scrolling right shifts the visible index range forward', () => {
    const atStart = computeVisibleSampleRange(samples, domain, railWidth, 0, 800)
    const scrolled = computeVisibleSampleRange(
      samples,
      domain,
      railWidth,
      railWidth - 800,
      800,
    )
    expect(scrolled.startIndex).toBeGreaterThan(atStart.startIndex)
  })

  it('covers the full sample list when the rail fits entirely in the viewport', () => {
    const smallRailWidth = computeRailWidth(samples.length, 100_000)
    const range = computeVisibleSampleRange(
      samples,
      domain,
      smallRailWidth,
      0,
      100_000,
      0,
    )
    expect(range).toEqual({ startIndex: 0, endIndex: samples.length })
  })
})
