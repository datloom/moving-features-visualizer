import { beforeEach, describe, expect, it } from 'vitest'

import { initialTimeState, useTimeStore } from './timeStore'

const state = () => useTimeStore.getState()

describe('useTimeStore', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
  })

  it('starts with a stopped, zero-length range at normal speed', () => {
    expect(state()).toMatchObject(initialTimeState)
  })

  it('sets a range and clamps the current time into it', () => {
    state().setRange(100, 200)

    expect(state()).toMatchObject({
      startTime: 100,
      endTime: 200,
      currentTime: 100,
    })

    state().setCurrentTime(150)
    state().setRange(160, 220)

    expect(state()).toMatchObject({
      startTime: 160,
      endTime: 220,
      currentTime: 160,
    })
  })

  it('clamps times before the start and after the end', () => {
    state().setRange(100, 200)

    state().setCurrentTime(50)
    expect(state().currentTime).toBe(100)

    state().setCurrentTime(250)
    expect(state().currentTime).toBe(200)
  })

  it('plays and pauses without changing the current time', () => {
    state().setRange(100, 200)
    state().setCurrentTime(150)
    state().play()

    expect(state()).toMatchObject({ currentTime: 150, playing: true })

    state().pause()
    expect(state()).toMatchObject({ currentTime: 150, playing: false })
  })

  it('stops when playback reaches or passes the end time', () => {
    state().setRange(100, 200)
    state().play()
    state().setCurrentTime(200)

    expect(state()).toMatchObject({ currentTime: 200, playing: false })

    state().setCurrentTime(150)
    state().play()
    state().setCurrentTime(250)

    expect(state()).toMatchObject({ currentTime: 200, playing: false })
  })

  it('does not start playback at the end or on a zero-length range', () => {
    state().play()
    expect(state().playing).toBe(false)

    state().setRange(100, 200)
    state().setCurrentTime(200)
    state().play()

    expect(state().playing).toBe(false)
  })

  it('keeps playback active when a new range still contains the current time', () => {
    state().setRange(100, 200)
    state().setCurrentTime(150)
    state().play()
    state().setRange(120, 180)

    expect(state()).toMatchObject({ currentTime: 150, playing: true })
  })

  it('updates playback rate without changing time or playback state', () => {
    state().setRange(100, 200)
    state().play()
    state().setPlaybackRate(2.5)

    expect(state()).toMatchObject({
      currentTime: 100,
      playing: true,
      playbackRate: 2.5,
    })
  })

  it.each([
    [200, 100],
    [Number.NaN, 100],
    [100, Number.POSITIVE_INFINITY],
  ])('rejects invalid ranges without changing state', (startTime, endTime) => {
    const before = state()

    expect(() => state().setRange(startTime, endTime)).toThrow(RangeError)
    expect(state()).toEqual(before)
  })

  it.each([Number.NaN, Number.NEGATIVE_INFINITY])(
    'rejects invalid current times without changing state',
    (currentTime) => {
      const before = state()

      expect(() => state().setCurrentTime(currentTime)).toThrow(RangeError)
      expect(state()).toEqual(before)
    },
  )

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid playback rates without changing state',
    (playbackRate) => {
      const before = state()

      expect(() => state().setPlaybackRate(playbackRate)).toThrow(RangeError)
      expect(state()).toEqual(before)
    },
  )
})

describe('Time Query', () => {
  beforeEach(() => {
    useTimeStore.setState(initialTimeState)
    state().setRange(0, 100)
  })

  it('narrows the active window without changing the full extent', () => {
    state().applyTimeQuery(30, 60)

    expect(state()).toMatchObject({
      startTime: 30,
      endTime: 60,
      currentTime: 30,
      fullStartTime: 0,
      fullEndTime: 100,
      queryActive: true,
    })
  })

  it('clamps a query that extends past the full extent', () => {
    state().applyTimeQuery(-50, 150)

    expect(state()).toMatchObject({ startTime: 0, endTime: 100 })
  })

  it('accepts an equal-range query spanning the full extent', () => {
    state().applyTimeQuery(0, 100)

    expect(state()).toMatchObject({
      startTime: 0,
      endTime: 100,
      queryActive: true,
    })
  })

  it('accepts a single-instant query', () => {
    state().applyTimeQuery(40, 40)

    expect(state()).toMatchObject({ startTime: 40, endTime: 40, currentTime: 40 })
  })

  it('rejects a reversed query without changing state', () => {
    const before = state()

    expect(() => state().applyTimeQuery(60, 30)).toThrow(RangeError)
    expect(state()).toEqual(before)
  })

  it('confines playback to the query window', () => {
    state().applyTimeQuery(30, 60)
    state().setCurrentTime(10)
    expect(state().currentTime).toBe(30)

    state().setCurrentTime(90)
    expect(state().currentTime).toBe(60)
  })

  it('restores the full extent on reset', () => {
    state().applyTimeQuery(30, 60)
    state().setCurrentTime(45)
    state().resetTimeQuery()

    expect(state()).toMatchObject({
      startTime: 0,
      endTime: 100,
      currentTime: 45,
      queryActive: false,
    })
  })

  it('preserves an active query when the dataset range is reloaded to an overlapping extent', () => {
    state().applyTimeQuery(30, 60)
    state().setRange(20, 120)

    expect(state()).toMatchObject({
      startTime: 30,
      endTime: 60,
      queryActive: true,
      fullStartTime: 20,
      fullEndTime: 120,
    })
  })

  it('clears a query that no longer overlaps a reloaded dataset range', () => {
    state().applyTimeQuery(30, 60)
    state().setRange(200, 300)

    expect(state()).toMatchObject({
      startTime: 200,
      endTime: 300,
      queryActive: false,
    })
  })

  it('clamps a preserved query into a shrunken dataset range', () => {
    state().applyTimeQuery(30, 60)
    state().setRange(0, 40)

    expect(state()).toMatchObject({
      startTime: 30,
      endTime: 40,
      queryActive: true,
    })
  })
})
