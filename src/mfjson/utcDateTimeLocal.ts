/**
 * `<input type="datetime-local">` values are inherently timezone-less
 * (`"YYYY-MM-DDTHH:mm"`), and `Date`'s own parser treats a string in that
 * shape as *local* wall-clock time per the ECMA-262 Date Time String
 * grammar — `new Date(value)` / `Date.parse(value)` would silently shift a
 * value by the host machine's UTC offset (e.g. 9 hours in JST).
 *
 * These helpers instead treat the datetime-local value as canonical UTC —
 * required wherever it becomes a literal server query parameter (e.g. the
 * TemporalGeometryQuery `datetime` interval), as opposed to a purely local
 * display convenience like `TimeQueryControls`'s own (intentionally local)
 * formatting, which is unrelated and untouched.
 */

const pad = (value: number): string => String(value).padStart(2, '0')

/** Formats an epoch-ms timestamp as a `datetime-local` value representing that same instant in UTC. */
export const formatUtcDateTimeLocal = (timestamp: number): string => {
  const date = new Date(timestamp)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

const DATETIME_LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Parses a `datetime-local` value as UTC, returning epoch ms (or `NaN` if malformed). */
export const parseUtcDateTimeLocal = (value: string): number => {
  const match = DATETIME_LOCAL_PATTERN.exec(value)
  if (!match) return NaN
  const [, year, month, day, hour, minute] = match
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  )
}
