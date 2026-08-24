/** Unix epoch time in milliseconds. */
export type Timestamp = number

export type GeometryInterpolation =
  | 'Discrete'
  | 'Step'
  | 'Linear'
  | 'Quadratic'
  | 'Cubic'

export type PropertyInterpolation = 'Discrete' | 'Step' | 'Linear'

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

/**
 * Union of normalized temporal geometries. Add future geometry variants here
 * while keeping consumers exhaustive through the `type` discriminator.
 */
export type TemporalGeometry = MovingPoint | MovingLineString

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
  readonly interpolation: PropertyInterpolation
  readonly unit?: string
  readonly form?: string
  readonly samples: readonly TemporalPropertySample<number>[]
}

export interface TextTemporalProperty {
  readonly type: 'Text'
  readonly name: string
  readonly interpolation: Exclude<PropertyInterpolation, 'Linear'>
  readonly form?: string
  readonly samples: readonly TemporalPropertySample<string>[]
}

export interface ImageTemporalProperty {
  readonly type: 'IMAGE'
  readonly name: string
  readonly interpolation: PropertyInterpolation
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
