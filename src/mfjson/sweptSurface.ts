import type { Timestamp } from './types'

/**
 * Shared swept-surface topology for MovingLineString and MovingPolygon.
 *
 * Both the 2D/3D map and the Space-Time view connect corresponding edges of
 * consecutive evaluated geometry slices into quads; they differ only in how
 * a position's vertical component is read/written (real altitude vs.
 * temporal height), which callers supply via `SweptSurfaceAdapter`.
 */

export interface LonLat {
  readonly longitude: number
  readonly latitude: number
}

export interface TimedPositions<P extends LonLat> {
  readonly time: Timestamp
  readonly positions: readonly P[]
}

export interface TimedRings<P extends LonLat> {
  readonly time: Timestamp
  readonly rings: readonly (readonly P[])[]
}

export interface SweptQuad<P extends LonLat> {
  readonly startTime: Timestamp
  readonly endTime: Timestamp
  readonly edgeIndex: number
  readonly positions: readonly [P, P, P, P]
}

export interface PolygonSweptQuad<P extends LonLat> extends SweptQuad<P> {
  readonly ringIndex: number
}

export interface SweptSurfaceAdapter<P extends LonLat> {
  /** Reads the vertical component (real altitude or temporal height). */
  readonly heightOf: (position: P) => number
  /** Returns a copy of `position` with its vertical component replaced. */
  readonly withHeight: (position: P, height: number) => P
}

const samePlanarPosition = <P extends LonLat>(first: P, second: P): boolean =>
  first.longitude === second.longitude && first.latitude === second.latitude

/**
 * Drops a ring's closing duplicate vertex (if present) and rejects rings
 * that are too short or carry non-finite coordinates.
 */
export const ringVertices = <P extends LonLat>(
  ring: readonly P[],
  adapter: SweptSurfaceAdapter<P>,
): readonly P[] => {
  if (
    ring.length < 3 ||
    ring.some(
      (position) =>
        !Number.isFinite(position.longitude) ||
        !Number.isFinite(position.latitude) ||
        !Number.isFinite(adapter.heightOf(position)),
    )
  )
    return []
  return samePlanarPosition(ring[0]!, ring.at(-1)!) ? ring.slice(0, -1) : ring
}

export const compatibleRingSlices = <P extends LonLat>(
  first: readonly (readonly P[])[],
  second: readonly (readonly P[])[],
  adapter: SweptSurfaceAdapter<P>,
): boolean =>
  first.length > 0 &&
  first.length === second.length &&
  first.every((ring, ringIndex) => {
    const firstVertices = ringVertices(ring, adapter)
    const secondVertices = ringVertices(second[ringIndex] ?? [], adapter)
    return (
      firstVertices.length >= 3 &&
      firstVertices.length === secondVertices.length
    )
  })

/**
 * Connects corresponding edges of consecutive LineString slices into quads.
 * When `step` is true, the upper edge holds the lower slice's planar
 * position and only rises to the next slice's vertical component, matching
 * Step interpolation's "freeze, then jump" semantics.
 */
export const buildLineStringSweptQuads = <P extends LonLat>(
  slices: readonly TimedPositions<P>[],
  step: boolean,
  adapter: SweptSurfaceAdapter<P>,
): readonly SweptQuad<P>[] => {
  const quads: SweptQuad<P>[] = []
  for (let sliceIndex = 0; sliceIndex < slices.length - 1; sliceIndex += 1) {
    const first = slices[sliceIndex]!
    const second = slices[sliceIndex + 1]!
    if (
      second.time <= first.time ||
      first.positions.length < 2 ||
      first.positions.length !== second.positions.length
    )
      continue
    for (
      let edgeIndex = 0;
      edgeIndex < first.positions.length - 1;
      edgeIndex += 1
    ) {
      const lowerFirst = first.positions[edgeIndex]!
      const lowerSecond = first.positions[edgeIndex + 1]!
      const upperHeight = adapter.heightOf(second.positions[0]!)
      const upperFirst = step
        ? adapter.withHeight(lowerFirst, upperHeight)
        : second.positions[edgeIndex]!
      const upperSecond = step
        ? adapter.withHeight(lowerSecond, upperHeight)
        : second.positions[edgeIndex + 1]!
      quads.push({
        startTime: first.time,
        endTime: second.time,
        edgeIndex,
        positions: [lowerFirst, upperFirst, upperSecond, lowerSecond],
      })
    }
  }
  return quads
}

/** Connects corresponding boundary edges of consecutive Polygon slices into quads. */
export const buildPolygonSweptQuads = <P extends LonLat>(
  slices: readonly TimedRings<P>[],
  step: boolean,
  adapter: SweptSurfaceAdapter<P>,
): readonly PolygonSweptQuad<P>[] => {
  const quads: PolygonSweptQuad<P>[] = []
  for (let sliceIndex = 0; sliceIndex < slices.length - 1; sliceIndex += 1) {
    const first = slices[sliceIndex]!
    const second = slices[sliceIndex + 1]!
    if (
      second.time <= first.time ||
      !compatibleRingSlices(first.rings, second.rings, adapter)
    )
      continue
    first.rings.forEach((ring, ringIndex) => {
      const lower = ringVertices(ring, adapter)
      const evaluatedUpper = ringVertices(second.rings[ringIndex]!, adapter)
      const upperHeight = adapter.heightOf(evaluatedUpper[0]!)
      for (let edgeIndex = 0; edgeIndex < lower.length; edgeIndex += 1) {
        const nextIndex = (edgeIndex + 1) % lower.length
        const lowerFirst = lower[edgeIndex]!
        const lowerSecond = lower[nextIndex]!
        const upperFirst = step
          ? adapter.withHeight(lowerFirst, upperHeight)
          : evaluatedUpper[edgeIndex]!
        const upperSecond = step
          ? adapter.withHeight(lowerSecond, upperHeight)
          : evaluatedUpper[nextIndex]!
        quads.push({
          startTime: first.time,
          endTime: second.time,
          ringIndex,
          edgeIndex,
          positions: [lowerFirst, upperFirst, upperSecond, lowerSecond],
        })
      }
    })
  }
  return quads
}
