/** Unix epoch time in milliseconds. */
export type Timestamp = number

export type GeometryInterpolation = 'Linear'

export type PropertyInterpolation = 'Discrete' | 'Step' | 'Linear'

export type TemporalPropertyType = 'Measure' | 'Text'

export interface PositionSample {
  readonly time: Timestamp
  readonly longitude: number
  readonly latitude: number
  readonly height?: number
}

export interface MovingPoint {
  readonly type: 'MovingPoint'
  readonly interpolation: GeometryInterpolation
  readonly samples: readonly PositionSample[]
}

/**
 * Union of normalized temporal geometries. Add future geometry variants here
 * while keeping consumers exhaustive through the `type` discriminator.
 */
export type TemporalGeometry = MovingPoint

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

export type TemporalProperty =
  | MeasureTemporalProperty
  | TextTemporalProperty

export interface MovingFeature {
  readonly id: string
  readonly type: 'MovingFeature'
  readonly temporalGeometry: TemporalGeometry
  readonly temporalProperties: readonly TemporalProperty[]
  readonly properties: Readonly<Record<string, unknown>>
}
