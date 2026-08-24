import { describe, expect, it } from 'vitest'

import type { TemporalProperty } from '../../mfjson/types'
import { getPropertyRendererStrategy } from './temporalPropertyRendererStrategy'

const property = (
  type: TemporalProperty['type'],
  interpolation: 'Discrete' | 'Step' | 'Linear' | 'Regression',
): TemporalProperty => {
  if (type === 'Measure') {
    return { type, name: 'speed', interpolation, samples: [] }
  }
  if (type === 'Text') {
    if (interpolation === 'Linear' || interpolation === 'Regression') {
      throw new Error(
        'Text + Linear cannot be represented by the domain model.',
      )
    }
    return { type, name: 'status', interpolation, samples: [] }
  }
  if (interpolation === 'Linear' || interpolation === 'Regression') {
    throw new Error(
      'IMAGE + continuous numeric interpolation cannot be represented by the domain model.',
    )
  }
  return { type, name: 'camera', interpolation, samples: [] }
}

describe('temporal property renderer strategy', () => {
  it.each([
    ['Discrete', 'sample-only'],
    ['Linear', 'linear-numeric'],
    ['Step', 'previous-value'],
    ['Regression', 'regression-numeric'],
  ] as const)('classifies Measure + %s', (interpolation, behavior) => {
    expect(
      getPropertyRendererStrategy(property('Measure', interpolation)),
    ).toMatchObject({
      renderer: 'measure-chart',
      interpolationBehavior: behavior,
      renderable: true,
    })
  })

  it.each([
    ['Discrete', 'sample-only'],
    ['Step', 'previous-value'],
  ] as const)('classifies Text + %s', (interpolation, behavior) => {
    expect(
      getPropertyRendererStrategy(property('Text', interpolation)),
    ).toMatchObject({
      renderer: 'text-timeline',
      interpolationBehavior: behavior,
      renderable: true,
    })
  })

  it.each([
    ['Discrete', 'sample-only'],
    ['Step', 'previous-value'],
  ] as const)('classifies IMAGE + %s', (interpolation, behavior) => {
    expect(
      getPropertyRendererStrategy(property('IMAGE', interpolation)),
    ).toMatchObject({
      renderer: 'image-viewer',
      interpolationBehavior: behavior,
      renderable: false,
      unavailableReason: 'IMAGE rendering is not implemented yet.',
    })
  })
})
