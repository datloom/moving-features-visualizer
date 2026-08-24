/** Unix epoch time in milliseconds. */
export type Timestamp = number

export type GeometryInterpolation =
  'Discrete' | 'Step' | 'Linear' | 'Quadratic' | 'Cubic'

export type MeasureInterpolation = 'Discrete' | 'Step' | 'Linear' | 'Regression'
export type TextInterpolation = 'Discrete' | 'Step'
export type ImageInterpolation = 'Discrete' | 'Step'

export type TemporalPropertyType = 'Measure' | 'Text' | 'IMAGE'

export interface PositionSample {
  readonly time: Timestamp
  readonly longitude: number
  readonly latitude: number
  readonly height?: number
}

export interface MovingPoint {
  readonly id?: string
  readonly type: 'MovingPoint'
  readonly interpolation: GeometryInterpolation
  readonly samples: readonly PositionSample[]
}

export interface LineStringSample {
  readonly time: Timestamp
  readonly positions: readonly Omit<PositionSample, 'time'>[]
}

export interface MovingLineString {
  readonly id?: string
  readonly type: 'MovingLineString'
  readonly interpolation: GeometryInterpolation
  readonly samples: readonly LineStringSample[]
}

export interface PolygonSample {
  readonly time: Timestamp
  readonly rings: readonly (readonly Omit<PositionSample, 'time'>[])[]
}

export interface MovingPolygon {
  readonly id?: string
  readonly type: 'MovingPolygon'
  readonly interpolation: GeometryInterpolation
  readonly samples: readonly PolygonSample[]
}

/**
 * Union of normalized temporal geometries. Add future geometry variants here
 * while keeping consumers exhaustive through the `type` discriminator.
 */
export type TemporalGeometry = MovingPoint | MovingLineString | MovingPolygon

export interface TemporalGeometryTrack {
  readonly segments: readonly TemporalGeometry[]
}

export interface TemporalPropertySample<Value extends number | string> {
  readonly time: Timestamp
  readonly value: Value
}

export interface MeasureTemporalProperty {
  readonly type: 'Measure'
  readonly name: string
  readonly interpolation: MeasureInterpolation
  readonly unit?: string
  readonly form?: string
  readonly samples: readonly TemporalPropertySample<number>[]
}

export interface TextTemporalProperty {
  readonly type: 'Text'
  readonly name: string
  readonly interpolation: TextInterpolation
  readonly form?: string
  readonly samples: readonly TemporalPropertySample<string>[]
}

export interface ImageTemporalProperty {
  readonly type: 'IMAGE'
  readonly name: string
  readonly interpolation: ImageInterpolation
  readonly form?: string
  readonly samples: readonly TemporalPropertySample<string>[]
}

export type TemporalProperty =
  MeasureTemporalProperty | TextTemporalProperty | ImageTemporalProperty

export interface MovingFeature {
  readonly id: string
  readonly type: 'MovingFeature'
  readonly temporalGeometry: TemporalGeometryTrack
  readonly temporalProperties: readonly TemporalProperty[]
  readonly properties: Readonly<Record<string, unknown>>
}
