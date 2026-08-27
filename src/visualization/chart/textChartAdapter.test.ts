import { describe, expect, it } from 'vitest'

import type { TextTemporalProperty } from '../../mfjson/types'
import {
  buildTextChartOption,
  getTextCategories,
  resolveTextValue,
} from './textChartAdapter'

const segment = (
  interpolation: TextTemporalProperty['interpolation'],
  samples: TextTemporalProperty['samples'],
): TextTemporalProperty => ({
  type: 'Text',
  name: 'status',
  interpolation,
  samples,
})

describe('Text chart adapter', () => {
  it('keeps categories in first-appearance order when segments are appended', () => {
    expect(
      getTextCategories([
        segment('Step', [
          { time: 1, value: 'moving' },
          { time: 2, value: 'stopped' },
        ]),
        segment('Step', [
          { time: 3, value: 'idle' },
          { time: 4, value: 'moving' },
        ]),
      ]),
    ).toEqual(['moving', 'stopped', 'idle'])
  })

  it('uses independent series for temporal segments without bridging a gap', () => {
    const properties = [
      segment('Step', [
        { time: 0, value: 'moving' },
        { time: 10, value: 'stopped' },
      ]),
      segment('Step', [
        { time: 30, value: 'stopped' },
        { time: 40, value: 'moving' },
      ]),
    ]
    const option = buildTextChartOption('mf-1', 'status', properties, 5)

    expect(option.yAxis).toMatchObject({
      type: 'category',
      data: ['moving', 'stopped'],
    })
    expect(option.series).toHaveLength(2)
    expect(option.series).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'line',
          step: 'end',
          data: [
            [0, 'moving'],
            [10, 'stopped'],
          ],
        }),
        expect.objectContaining({
          type: 'line',
          step: 'end',
          data: [
            [30, 'stopped'],
            [40, 'moving'],
          ],
        }),
      ]),
    )
    expect(resolveTextValue(properties, 20)).toBeUndefined()
  })

  it('keeps Discrete values at exact samples only and renders them as scatter points', () => {
    const property = segment('Discrete', [
      { time: 10, value: 'moving' },
      { time: 20, value: 'idle' },
    ])
    const option = buildTextChartOption('mf-1', 'status', [property], 15)

    expect(option.series).toEqual([
      expect.objectContaining({
        type: 'scatter',
        data: [
          [10, 'moving'],
          [20, 'idle'],
        ],
      }),
    ])
    expect(resolveTextValue([property], 10)).toBe('moving')
    expect(resolveTextValue([property], 15)).toBeUndefined()
  })

  it('stays perceptible during playback via the shared Discrete visual window, without becoming Step', () => {
    // Irregular spacing: 10s, 20s, 5s, 5s gaps.
    const property = segment('Discrete', [
      { time: 0, value: 'human' },
      { time: 10_000, value: 'car' },
      { time: 30_000, value: 'human' },
      { time: 35_000, value: 'car' },
      { time: 40_000, value: 'car' },
    ])
    // Exactly at t1.
    expect(resolveTextValue([property], 10_000)).toBe('car')
    // Shortly after t1, inside its visual window.
    expect(resolveTextValue([property], 10_000 + 1)).toBe('car')
    // After the window closes but well before t2 (30s later): "No Data",
    // not held — this is what distinguishes it from Step.
    expect(resolveTextValue([property], 20_000)).toBeUndefined()
    // The next sample only becomes visible at its own timestamp.
    expect(resolveTextValue([property], 30_000)).toBe('human')
  })

  it('clips the x-axis domain to a Time Query window when provided', () => {
    const property = segment('Discrete', [
      { time: 10, value: 'moving' },
      { time: 20, value: 'idle' },
    ])
    const option = buildTextChartOption('mf-1', 'status', [property], 15, 12, 18)
    expect(option.xAxis).toMatchObject({ min: 12, max: 18 })
  })

  it('leaves the x-axis domain unbounded without a window', () => {
    const property = segment('Discrete', [{ time: 10, value: 'moving' }])
    const option = buildTextChartOption('mf-1', 'status', [property], 10)
    expect(option.xAxis).toMatchObject({ min: undefined, max: undefined })
  })
})
