import { describe, expect, it } from 'vitest'

import type { MovingLineString } from './types'
import { geometryAtTime } from './geometryAtTime'

const line: MovingLineString = {
  type: 'MovingLineString',
  interpolation: 'Linear',
  samples: [
    {
      time: 0,
      positions: [
        { longitude: 0, latitude: 0, height: 0 },
        { longitude: 10, latitude: 10, height: 10 },
      ],
    },
    {
      time: 10,
      positions: [
        { longitude: 10, latitude: 10, height: 10 },
        { longitude: 20, latitude: 20, height: 20 },
      ],
    },
  ],
}

describe('geometryAtTime', () => {
  it('interpolates MovingLineString vertices by timestamp', () => {
    expect(geometryAtTime(line, 5)).toEqual({
      type: 'MovingLineString',
      positions: [
        { longitude: 5, latitude: 5, height: 5 },
        { longitude: 15, latitude: 15, height: 15 },
      ],
    })
  })

  it('returns no geometry outside a segment and therefore does not bridge gaps', () => {
    expect(geometryAtTime(line, 20)).toBeUndefined()
    expect(
      geometryAtTime(
        {
          ...line,
          samples: line.samples.map((sample) => ({
            ...sample,
            time: sample.time + 30,
          })),
        },
        20,
      ),
    ).toBeUndefined()
  })

  it('refuses incompatible vertex topology', () => {
    expect(() =>
      geometryAtTime(
        {
          ...line,
          samples: [
            line.samples[0]!,
            { ...line.samples[1]!, positions: [{ longitude: 1, latitude: 1 }] },
          ],
        },
        5,
      ),
    ).toThrow(/matching vertex counts/)
  })
})
