import { describe, expect, it } from 'vitest'

import {
  sampleRailPosition,
  selectRepresentativeSamples,
  slotIndexForTime,
  THUMBNAIL_SLOT_PX,
} from './imageTimelineWindow'

const domain = { start: 0, end: 1_000 }
const trackWidth = 800

describe('sampleRailPosition', () => {
  it('maps the range start to x = 0', () => {
    expect(sampleRailPosition(domain.start, domain, trackWidth)).toBe(0)
  })

  it('maps the range end to x = trackWidth', () => {
    expect(sampleRailPosition(domain.end, domain, trackWidth)).toBe(trackWidth)
  })

  it('maps the midpoint to the middle of the track', () => {
    const mid = (domain.start + domain.end) / 2
    expect(sampleRailPosition(mid, domain, trackWidth)).toBe(trackWidth / 2)
  })

  it('never depends on how many other samples exist — only on domain/trackWidth', () => {
    // Same timestamp, same domain, same trackWidth => identical position,
    // regardless of anything about a surrounding sample list.
    const a = sampleRailPosition(250, domain, trackWidth)
    const b = sampleRailPosition(250, domain, trackWidth)
    expect(a).toBe(b)
  })
})

describe('selectRepresentativeSamples', () => {
  it('returns nothing for an empty sample list', () => {
    expect(selectRepresentativeSamples([], domain, trackWidth)).toEqual([])
  })

  it('bounds the number of representative samples to roughly trackWidth / slotWidth, regardless of sample count', () => {
    const oneHundred = Array.from({ length: 100 }, (_, index) => ({
      time: (index / 99) * domain.end,
    }))
    const oneThousand = Array.from({ length: 1_000 }, (_, index) => ({
      time: (index / 999) * domain.end,
    }))
    const maxSlots = Math.ceil(trackWidth / THUMBNAIL_SLOT_PX) + 1

    const fromHundred = selectRepresentativeSamples(oneHundred, domain, trackWidth)
    const fromThousand = selectRepresentativeSamples(
      oneThousand,
      domain,
      trackWidth,
    )

    expect(fromHundred.length).toBeLessThanOrEqual(maxSlots)
    expect(fromThousand.length).toBeLessThanOrEqual(maxSlots)
    // The key property under test: 10x more logical samples over the same
    // range does not roughly-10x the number of rendered thumbnails.
    expect(fromThousand.length).toBeLessThan(oneThousand.length / 5)
  })

  it('preserves chronological order in its output', () => {
    const samples = Array.from({ length: 50 }, (_, index) => ({
      time: (index / 49) * domain.end,
    }))
    const representative = selectRepresentativeSamples(samples, domain, trackWidth)
    const times = representative.map((entry) => entry.sample.time)
    expect(times).toEqual([...times].sort((a, b) => a - b))
  })

  it('keeps the exact sample object identity (no synthesized/merged samples)', () => {
    const samples = [{ time: 100, value: 'a' }, { time: 500, value: 'b' }]
    const representative = selectRepresentativeSamples(samples, domain, trackWidth)
    for (const entry of representative) {
      expect(samples).toContain(entry.sample)
    }
  })

  it('a single sample per slot is still represented (no accidental dropping)', () => {
    // Three samples far enough apart in time to land in distinct slots.
    const samples = [{ time: 0 }, { time: 500 }, { time: 1_000 }]
    const representative = selectRepresentativeSamples(samples, domain, trackWidth)
    expect(representative.map((entry) => entry.sample.time)).toEqual([
      0, 500, 1_000,
    ])
  })
})

describe('slotIndexForTime', () => {
  it('agrees with the slot a representative sample at the same time would occupy', () => {
    const samples = [{ time: 500 }]
    const representative = selectRepresentativeSamples(samples, domain, trackWidth)
    expect(slotIndexForTime(500, domain, trackWidth)).toBe(
      representative[0]!.slotIndex,
    )
  })

  it('is stable for the same inputs regardless of other samples', () => {
    expect(slotIndexForTime(250, domain, trackWidth)).toBe(
      slotIndexForTime(250, domain, trackWidth),
    )
  })
})
