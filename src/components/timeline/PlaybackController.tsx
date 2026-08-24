import { useEffect } from 'react'

import { advancePlaybackTime } from '../../services/playback'
import { useTimeStore } from '../../store/timeStore'

export function PlaybackController() {
  useEffect(() => {
    let animationFrame: number | null = null
    let previousTimestamp: number | null = null

    const stopAnimation = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame)
      animationFrame = null
      previousTimestamp = null
    }

    const updateTime = (timestamp: number) => {
      animationFrame = null
      const state = useTimeStore.getState()

      if (!state.playing) {
        previousTimestamp = null
        return
      }

      if (previousTimestamp !== null) {
        state.setCurrentTime(
          advancePlaybackTime(
            state.currentTime,
            timestamp - previousTimestamp,
            state.playbackRate,
            state.endTime,
          ),
        )
      }
      previousTimestamp = timestamp

      if (useTimeStore.getState().playing) {
        animationFrame = requestAnimationFrame(updateTime)
      } else {
        previousTimestamp = null
      }
    }

    const startAnimation = () => {
      if (animationFrame === null) {
        animationFrame = requestAnimationFrame(updateTime)
      }
    }

    const unsubscribe = useTimeStore.subscribe((state, previousState) => {
      if (state.playing && !previousState.playing) startAnimation()
      if (!state.playing && previousState.playing) stopAnimation()
    })

    if (useTimeStore.getState().playing) startAnimation()

    return () => {
      unsubscribe()
      stopAnimation()
    }
  }, [])

  return null
}
