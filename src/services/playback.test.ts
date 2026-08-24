import { describe, expect, it } from 'vitest'

import { advancePlaybackTime } from './playback'

describe('advancePlaybackTime', () => {
  it.each([
    { rate: 0.5, expected: 1_500 },
    { rate: 1, expected: 2_000 },
    { rate: 2, expected: 3_000 },
    { rate: 4, expected: 5_000 },
    { rate: 10, expected: 11_000 },
  ])('advances elapsed time at $rate x', ({ rate, expected }) => {
    expect(advancePlaybackTime(1_000, 1_000, rate, 20_000)).toBe(expected)
  })

  it('clamps playback at the configured end time', () => {
    expect(advancePlaybackTime(9_500, 1_000, 4, 10_000)).toBe(10_000)
  })
})
