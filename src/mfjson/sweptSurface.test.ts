import { describe, expect, it } from 'vitest'

import {
  buildLineStringSweptQuads,
  buildPolygonSweptQuads,
  compatibleRingSlices,
  ringVertices,
  type SweptSurfaceAdapter,
} from './sweptSurface'

interface P {
  readonly longitude: number
  readonly latitude: number
  readonly z: number
}

const adapter: SweptSurfaceAdapter<P> = {
  heightOf: (p) => p.z,
  withHeight: (p, z) => ({ ...p, z }),
}

const p = (longitude: number, latitude: number, z: number): P => ({
  longitude,
  latitude,
  z,
})

describe('ringVertices', () => {
  it('drops a closing duplicate vertex', () => {
    const ring = [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0), p(0, 0, 0)]
    expect(ringVertices(ring, adapter)).toEqual(ring.slice(0, -1))
  })

  it('keeps an open ring unchanged', () => {
    const ring = [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]
    expect(ringVertices(ring, adapter)).toEqual(ring)
  })

  it('rejects rings shorter than a triangle or with non-finite coordinates', () => {
    expect(ringVertices([p(0, 0, 0), p(1, 0, 0)], adapter)).toEqual([])
    expect(
      ringVertices([p(0, 0, 0), p(1, 0, 0), p(NaN, 1, 0)], adapter),
    ).toEqual([])
  })
})

describe('compatibleRingSlices', () => {
  const triangle = [p(0, 0, 0), p(1, 0, 0), p(1, 1, 0)]

  it('accepts equal ring counts with matching vertex counts', () => {
    expect(compatibleRingSlices([triangle], [triangle], adapter)).toBe(true)
  })

  it('rejects mismatched ring counts or vertex counts', () => {
    expect(compatibleRingSlices([triangle], [], adapter)).toBe(false)
    expect(
      compatibleRingSlices([triangle], [[p(0, 0, 0), p(1, 0, 0)]], adapter),
    ).toBe(false)
  })

  it('rejects an empty set of rings', () => {
    expect(compatibleRingSlices([], [], adapter)).toBe(false)
  })
})

describe('buildLineStringSweptQuads', () => {
  const twoVertexSlice = (time: number, offset: number) => ({
    time,
    positions: [p(offset, 0, offset), p(offset + 1, 1, offset)],
  })

  it('connects one quad per edge between consecutive slices', () => {
    const quads = buildLineStringSweptQuads(
      [twoVertexSlice(0, 0), twoVertexSlice(10, 10)],
      false,
      adapter,
    )
    expect(quads).toHaveLength(1)
    expect(quads[0]).toEqual({
      startTime: 0,
      endTime: 10,
      edgeIndex: 0,
      positions: [
        p(0, 0, 0),
        p(10, 0, 10),
        p(11, 1, 10),
        p(1, 1, 0),
      ],
    })
  })

  it('chains quads across three or more slices', () => {
    const quads = buildLineStringSweptQuads(
      [twoVertexSlice(0, 0), twoVertexSlice(10, 10), twoVertexSlice(20, 20)],
      false,
      adapter,
    )
    expect(quads.map(({ startTime, endTime }) => [startTime, endTime])).toEqual(
      [
        [0, 10],
        [10, 20],
      ],
    )
  })

  it('holds the lower planar position and only raises height for Step', () => {
    const quads = buildLineStringSweptQuads(
      [twoVertexSlice(0, 0), twoVertexSlice(10, 10)],
      true,
      adapter,
    )
    const [quad] = quads
    // upperFirst/upperSecond keep the lower slice's longitude/latitude.
    expect(quad?.positions[1]).toEqual(p(0, 0, 10))
    expect(quad?.positions[2]).toEqual(p(1, 1, 10))
  })

  it('skips slices with mismatched or insufficient vertex counts', () => {
    expect(
      buildLineStringSweptQuads(
        [
          { time: 0, positions: [p(0, 0, 0)] },
          { time: 10, positions: [p(1, 0, 0)] },
        ],
        false,
        adapter,
      ),
    ).toEqual([])
    expect(
      buildLineStringSweptQuads(
        [
          twoVertexSlice(0, 0),
          { time: 10, positions: [p(1, 0, 0)] },
        ],
        false,
        adapter,
      ),
    ).toEqual([])
  })

  it('skips non-increasing slice time pairs', () => {
    expect(
      buildLineStringSweptQuads(
        [twoVertexSlice(10, 0), twoVertexSlice(0, 10)],
        false,
        adapter,
      ),
    ).toEqual([])
  })
})

describe('buildPolygonSweptQuads', () => {
  const triangleSlice = (time: number, offset: number) => ({
    time,
    rings: [
      [
        p(offset, 0, offset),
        p(offset + 2, 0, offset),
        p(offset + 2, 2, offset),
        p(offset, 0, offset),
      ],
    ],
  })

  it('connects one quad per boundary edge, wrapping around the ring', () => {
    const quads = buildPolygonSweptQuads(
      [triangleSlice(0, 0), triangleSlice(10, 10)],
      false,
      adapter,
    )
    expect(quads).toHaveLength(3)
    expect(quads.every(({ ringIndex }) => ringIndex === 0)).toBe(true)
    // The wraparound edge connects the last vertex back to the first.
    const wraparound = quads[2]!
    expect(wraparound.positions[0]).toEqual(p(2, 2, 0))
    expect(wraparound.positions[3]).toEqual(p(0, 0, 0))
  })

  it('produces independent quads per ring for polygons with holes', () => {
    const hole = (offset: number) => [
      p(offset + 0.5, 0.5, offset),
      p(offset + 1, 0.5, offset),
      p(offset + 0.5, 1, offset),
      p(offset + 0.5, 0.5, offset),
    ]
    const withHole = (time: number, offset: number) => ({
      time,
      rings: [...triangleSlice(time, offset).rings, hole(offset)],
    })
    const quads = buildPolygonSweptQuads(
      [withHole(0, 0), withHole(10, 10)],
      false,
      adapter,
    )
    expect(quads.filter(({ ringIndex }) => ringIndex === 0)).toHaveLength(3)
    expect(quads.filter(({ ringIndex }) => ringIndex === 1)).toHaveLength(3)
  })

  it('holds the lower planar position and only raises height for Step', () => {
    const quads = buildPolygonSweptQuads(
      [triangleSlice(0, 0), triangleSlice(10, 10)],
      true,
      adapter,
    )
    expect(quads[0]?.positions[1]).toEqual(p(0, 0, 10))
    expect(quads[0]?.positions[2]).toEqual(p(2, 0, 10))
  })

  it('falls back safely for incompatible ring topology', () => {
    expect(
      buildPolygonSweptQuads(
        [
          triangleSlice(0, 0),
          { time: 10, rings: [[p(0, 0, 0), p(1, 0, 0)]] },
        ],
        false,
        adapter,
      ),
    ).toEqual([])
  })
})
