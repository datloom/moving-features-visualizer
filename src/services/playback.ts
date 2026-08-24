export const advancePlaybackTime = (
  currentTime: number,
  elapsedMilliseconds: number,
  playbackRate: number,
  endTime: number,
): number => Math.min(currentTime + elapsedMilliseconds * playbackRate, endTime)
