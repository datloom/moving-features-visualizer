import { create } from 'zustand'

export interface TimeState {
  readonly startTime: number
  readonly endTime: number
  readonly currentTime: number
  readonly playing: boolean
  readonly playbackRate: number
}

export interface TimeActions {
  setRange: (startTime: number, endTime: number) => void
  setCurrentTime: (currentTime: number) => void
  play: () => void
  pause: () => void
  setPlaybackRate: (playbackRate: number) => void
}

export type TimeStore = TimeState & TimeActions

export const initialTimeState: TimeState = {
  startTime: 0,
  endTime: 0,
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
    set((state) => setTimeRange(state, startTime, endTime)),
  setCurrentTime: (currentTime) => set((state) => setTime(state, currentTime)),
  play: () => set(startPlayback),
  pause: () => set(stopPlayback),
  setPlaybackRate: (playbackRate) =>
    set((state) => changePlaybackRate(state, playbackRate)),
}))
