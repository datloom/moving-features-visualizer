import { create } from 'zustand'

export interface TimeState {
  /** Active playback/display window start — the full extent unless a Time Query is applied. */
  readonly startTime: number
  /** Active playback/display window end — the full extent unless a Time Query is applied. */
  readonly endTime: number
  /** The loaded dataset's full temporal extent. Never mutated by a Time Query. */
  readonly fullStartTime: number
  readonly fullEndTime: number
  /** Whether `startTime`/`endTime` currently reflect an applied Time Query. */
  readonly queryActive: boolean
  readonly currentTime: number
  readonly playing: boolean
  readonly playbackRate: number
}

export interface TimeActions {
  /** Sets the dataset's full temporal extent (e.g. on load). */
  setRange: (startTime: number, endTime: number) => void
  /** Applies a Time Query, restricting playback/display to [start, end]. */
  applyTimeQuery: (start: number, end: number) => void
  /** Restores the active window to the dataset's full temporal extent. */
  resetTimeQuery: () => void
  setCurrentTime: (currentTime: number) => void
  play: () => void
  pause: () => void
  setPlaybackRate: (playbackRate: number) => void
}

export type TimeStore = TimeState & TimeActions

export const initialTimeState: TimeState = {
  startTime: 0,
  endTime: 0,
  fullStartTime: 0,
  fullEndTime: 0,
  queryActive: false,
  currentTime: 0,
  playing: false,
  playbackRate: 1,
}

const requireFinite = (value: number, name: string): void => {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`)
  }
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(Math.max(value, minimum), maximum)

/** Sets the active window and re-clamps current time/playback into it. */
export const setTimeRange = (
  state: TimeState,
  startTime: number,
  endTime: number,
): TimeState => {
  requireFinite(startTime, 'startTime')
  requireFinite(endTime, 'endTime')

  if (startTime > endTime) {
    throw new RangeError('startTime must be less than or equal to endTime.')
  }

  const currentTime = clamp(state.currentTime, startTime, endTime)

  return {
    ...state,
    startTime,
    endTime,
    currentTime,
    playing: state.playing && currentTime < endTime,
  }
}

/**
 * Sets the dataset's full temporal extent (called on load, or whenever the
 * set of loaded Features changes). When no Time Query is active this also
 * becomes the active playback window, matching the pre-Time-Query behavior
 * exactly. An active query's bounds are preserved — clamped to the new
 * extent, or cleared only if they no longer overlap it at all — rather than
 * being silently reset by unrelated data changes.
 */
export const setDatasetRange = (
  state: TimeState,
  fullStartTime: number,
  fullEndTime: number,
): TimeState => {
  requireFinite(fullStartTime, 'startTime')
  requireFinite(fullEndTime, 'endTime')

  if (fullStartTime > fullEndTime) {
    throw new RangeError('startTime must be less than or equal to endTime.')
  }

  const withFullRange = { ...state, fullStartTime, fullEndTime }
  if (!state.queryActive) {
    return setTimeRange(withFullRange, fullStartTime, fullEndTime)
  }

  const queryOverlapsNewExtent =
    state.startTime <= fullEndTime && state.endTime >= fullStartTime
  if (!queryOverlapsNewExtent) {
    return setTimeRange(
      { ...withFullRange, queryActive: false },
      fullStartTime,
      fullEndTime,
    )
  }

  return setTimeRange(
    withFullRange,
    clamp(state.startTime, fullStartTime, fullEndTime),
    clamp(state.endTime, fullStartTime, fullEndTime),
  )
}

/**
 * Applies a Time Query: the active window becomes [start, end], clamped to
 * the dataset's full extent. The full extent itself is never mutated, so
 * `resetTimeQuery` can always restore it exactly.
 */
export const applyTimeQuery = (
  state: TimeState,
  start: number,
  end: number,
): TimeState => {
  requireFinite(start, 'start')
  requireFinite(end, 'end')

  if (start > end) {
    throw new RangeError('start must be less than or equal to end.')
  }

  const clampedStart = clamp(start, state.fullStartTime, state.fullEndTime)
  const clampedEnd = clamp(end, state.fullStartTime, state.fullEndTime)

  return setTimeRange({ ...state, queryActive: true }, clampedStart, clampedEnd)
}

/** Restores the active window to the dataset's full temporal extent. */
export const resetTimeQuery = (state: TimeState): TimeState =>
  setTimeRange(
    { ...state, queryActive: false },
    state.fullStartTime,
    state.fullEndTime,
  )

export const setTime = (state: TimeState, currentTime: number): TimeState => {
  requireFinite(currentTime, 'currentTime')
  const clampedTime = clamp(currentTime, state.startTime, state.endTime)

  return {
    ...state,
    currentTime: clampedTime,
    playing: state.playing && clampedTime < state.endTime,
  }
}

export const startPlayback = (state: TimeState): TimeState => ({
  ...state,
  playing: state.currentTime < state.endTime,
})

export const stopPlayback = (state: TimeState): TimeState => ({
  ...state,
  playing: false,
})

export const changePlaybackRate = (
  state: TimeState,
  playbackRate: number,
): TimeState => {
  requireFinite(playbackRate, 'playbackRate')

  if (playbackRate <= 0) {
    throw new RangeError('playbackRate must be greater than zero.')
  }

  return { ...state, playbackRate }
}

export const useTimeStore = create<TimeStore>((set) => ({
  ...initialTimeState,
  setRange: (startTime, endTime) =>
    set((state) => setDatasetRange(state, startTime, endTime)),
  applyTimeQuery: (start, end) =>
    set((state) => applyTimeQuery(state, start, end)),
  resetTimeQuery: () => set(resetTimeQuery),
  setCurrentTime: (currentTime) => set((state) => setTime(state, currentTime)),
  play: () => set(startPlayback),
  pause: () => set(stopPlayback),
  setPlaybackRate: (playbackRate) =>
    set((state) => changePlaybackRate(state, playbackRate)),
}))
