import { describe, expect, it } from 'vitest'

import type { MovingLineString, MovingPoint, MovingPolygon } from './types'
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

  it('uses the shared nonlinear engine for MovingPoint', () => {
    const point: MovingPoint = {
      type: 'MovingPoint',
      interpolation: 'Quadratic',
      samples: [
        { time: 0, longitude: 0, latitude: 0 },
        { time: 10, longitude: 10, latitude: 10 },
        { time: 20, longitude: 0, latitude: 0 },
      ],
    }
    expect(geometryAtTime(point, 15)).toEqual({
      type: 'MovingPoint',
      position: { longitude: 10, latitude: 10 },
    })
  })

  it('reconstructs a nonlinear MovingLineString from vertex trajectories', () => {
    const quadratic: MovingLineString = {
      ...line,
      interpolation: 'Quadratic',
      samples: [
        line.samples[0]!,
        line.samples[1]!,
        {
          time: 20,
          positions: [
            { longitude: 0, latitude: 0, height: 0 },
            { longitude: 10, latitude: 10, height: 10 },
          ],
        },
      ],
    }
    expect(geometryAtTime(quadratic, 15)).toEqual({
      type: 'MovingLineString',
      positions: [
        { longitude: 10, latitude: 10, height: 10 },
        { longitude: 20, latitude: 20, height: 20 },
      ],
    })
  })

  it('interpolates corresponding MovingPolygon vertices and preserves closure', () => {
    const polygon: MovingPolygon = {
      type: 'MovingPolygon',
      interpolation: 'Linear',
      samples: [
        {
          time: 0,
          rings: [
            [
              { longitude: 0, latitude: 0, height: 0 },
              { longitude: 2, latitude: 0, height: 0 },
              { longitude: 2, latitude: 2, height: 0 },
              { longitude: 0, latitude: 0, height: 0 },
            ],
          ],
        },
        {
          time: 10,
          rings: [
            [
              { longitude: 10, latitude: 10, height: 10 },
              { longitude: 12, latitude: 10, height: 10 },
              { longitude: 12, latitude: 12, height: 10 },
              { longitude: 10, latitude: 10, height: 10 },
            ],
          ],
        },
      ],
    }
    const evaluated = geometryAtTime(polygon, 5)
    expect(evaluated?.type).toBe('MovingPolygon')
    if (evaluated?.type !== 'MovingPolygon') return
    expect(evaluated.rings[0]?.slice(0, 2)).toEqual([
      { longitude: 5, latitude: 5, height: 5 },
      { longitude: 7, latitude: 5, height: 5 },
    ])
    expect(evaluated.rings[0]?.at(-1)).toBe(evaluated.rings[0]?.[0])
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
    ).toThrow(/matching structure/)
  })
})
