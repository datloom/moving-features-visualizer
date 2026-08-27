import { describe, expect, it } from 'vitest'

import { formatUtcDateTimeLocal, parseUtcDateTimeLocal } from './utcDateTimeLocal'

describe('formatUtcDateTimeLocal / parseUtcDateTimeLocal', () => {
  it('round-trips a UTC timestamp losslessly, regardless of host timezone', () => {
    const timestamp = Date.parse('2023-11-20T13:30:00.000Z')

    const input = formatUtcDateTimeLocal(timestamp)
    expect(input).toBe('2023-11-20T13:30')

    const restored = parseUtcDateTimeLocal(input)
    expect(restored).toBe(timestamp)
  })

  it('never shifts by the host UTC offset (this is what JST would break with local-time parsing)', () => {
    // If this were parsed as local time on a UTC+9 host, it would resolve to
    // 2023-11-20T04:30:00.000Z instead — 9 hours off.
    expect(parseUtcDateTimeLocal('2023-11-20T13:30')).toBe(
      Date.parse('2023-11-20T13:30:00.000Z'),
    )
  })

  it('formats midnight and end-of-year boundaries correctly in UTC', () => {
    expect(formatUtcDateTimeLocal(Date.parse('2023-12-31T23:59:00.000Z'))).toBe(
      '2023-12-31T23:59',
    )
    expect(parseUtcDateTimeLocal('2023-12-31T23:59')).toBe(
      Date.parse('2023-12-31T23:59:00.000Z'),
    )
  })

  it('returns NaN for a malformed value instead of guessing', () => {
    expect(Number.isNaN(parseUtcDateTimeLocal(''))).toBe(true)
    expect(Number.isNaN(parseUtcDateTimeLocal('not-a-date'))).toBe(true)
    expect(Number.isNaN(parseUtcDateTimeLocal('2023-11-20T13:30:00Z'))).toBe(
      true,
    )
  })
})
