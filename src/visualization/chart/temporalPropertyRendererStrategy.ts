import type {
  ImageTemporalProperty,
  MeasureTemporalProperty,
  TemporalProperty,
  TextTemporalProperty,
} from '../../mfjson/types'

export type PropertyInterpolationBehavior =
  | 'sample-only'
  | 'linear-numeric'
  | 'previous-value'
  | 'continuous-image-transition'

interface StrategyBase {
  readonly interpolationBehavior: PropertyInterpolationBehavior
  readonly renderable: boolean
  readonly unavailableReason?: string
}

export interface MeasureRendererStrategy extends StrategyBase {
  readonly renderer: 'measure-chart'
  readonly property: MeasureTemporalProperty
  readonly renderable: true
}

export interface TextRendererStrategy extends StrategyBase {
  readonly renderer: 'text-timeline'
  readonly property: TextTemporalProperty
  readonly renderable: true
}

export interface ImageRendererStrategy extends StrategyBase {
  readonly renderer: 'image-viewer'
  readonly property: ImageTemporalProperty
  readonly renderable: false
  readonly unavailableReason: 'IMAGE rendering is not implemented yet.'
}

export type PropertyRendererStrategy =
  MeasureRendererStrategy | TextRendererStrategy | ImageRendererStrategy

const measureBehavior = (
  property: MeasureTemporalProperty,
): PropertyInterpolationBehavior => {
  if (property.interpolation === 'Discrete') return 'sample-only'
  if (property.interpolation === 'Step') return 'previous-value'
  return 'linear-numeric'
}

const textBehavior = (
  property: TextTemporalProperty,
): PropertyInterpolationBehavior =>
  property.interpolation === 'Discrete' ? 'sample-only' : 'previous-value'

const imageBehavior = (
  property: ImageTemporalProperty,
): PropertyInterpolationBehavior => {
  if (property.interpolation === 'Discrete') return 'sample-only'
  if (property.interpolation === 'Step') return 'previous-value'
  return 'continuous-image-transition'
}

export const getPropertyRendererStrategy = (
  property: TemporalProperty,
): PropertyRendererStrategy => {
  switch (property.type) {
    case 'Measure':
      return {
        renderer: 'measure-chart',
        property,
        interpolationBehavior: measureBehavior(property),
        renderable: true,
      }
    case 'Text':
      return {
        renderer: 'text-timeline',
        property,
        interpolationBehavior: textBehavior(property),
        renderable: true,
      }
    case 'IMAGE':
      return {
        renderer: 'image-viewer',
        property,
        interpolationBehavior: imageBehavior(property),
        renderable: false,
        unavailableReason: 'IMAGE rendering is not implemented yet.',
      }
  }
}
