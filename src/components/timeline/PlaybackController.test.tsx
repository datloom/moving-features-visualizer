import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { initialTimeState, useTimeStore } from '../../store/timeStore'
import { PlaybackController } from './PlaybackController'

describe('PlaybackController', () => {
  const callbacks = new Map<number, FrameRequestCallback>()
  let nextFrameId = 1

  const runNextFrame = (timestamp: number) => {
    const nextFrame = callbacks.entries().next().value
    if (!nextFrame) throw new Error('Expected a pending animation frame')

    const [frameId, callback] = nextFrame
    callbacks.delete(frameId)
    callback(timestamp)
  }

  beforeEach(() => {
    callbacks.clear()
    nextFrameId = 1
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const frameId = nextFrameId++
        callbacks.set(frameId, callback)
        return frameId
      }),
    )
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((frameId: number) => callbacks.delete(frameId)),
    )
    useTimeStore.setState(initialTimeState)
    useTimeStore.getState().setRange(1_000, 10_000)
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('advances store time using the latest playback rate', () => {
    render(<PlaybackController />)

    act(() => useTimeStore.getState().play())
    act(() => runNextFrame(0))
    act(() => runNextFrame(1_000))
    expect(useTimeStore.getState().currentTime).toBe(2_000)

    act(() => useTimeStore.getState().setPlaybackRate(2))
    act(() => runNextFrame(1_500))
    expect(useTimeStore.getState().currentTime).toBe(3_000)
  })

  it('stops scheduling frames when playback reaches the end', () => {
    useTimeStore.getState().setCurrentTime(9_500)
    useTimeStore.getState().setPlaybackRate(2)
    render(<PlaybackController />)

    act(() => useTimeStore.getState().play())
    act(() => runNextFrame(0))
    act(() => runNextFrame(1_000))

    expect(useTimeStore.getState()).toMatchObject({
      currentTime: 10_000,
      playing: false,
    })
    expect(callbacks).toHaveLength(0)
  })
})
