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
})
