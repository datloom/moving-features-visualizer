import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature, TemporalProperty } from '../../mfjson/types'

vi.mock('./MeasurePropertyChart', () => ({
  MeasurePropertyChart: ({ property }: { property: { name: string } }) => (
    <div data-testid="measure-chart">{property.name}</div>
  ),
}))

import { TemporalPropertiesPanel } from './TemporalPropertiesPanel'

const featureWith = (
  temporalProperties: readonly TemporalProperty[],
): MovingFeature => ({
  id: 'feature',
  type: 'MovingFeature',
  temporalGeometry: { segments: [] },
  temporalProperties,
  properties: {},
})

describe('TemporalPropertiesPanel', () => {
  afterEach(cleanup)

  it('keeps Measure properties routed to the existing chart', () => {
    render(
      <TemporalPropertiesPanel
        feature={featureWith([
          {
            type: 'Measure',
            name: 'speed',
            interpolation: 'Linear',
            samples: [],
          },
        ])}
      />,
    )

    expect(screen.getByTestId('measure-chart')).toHaveTextContent('speed')
  })

  it('shows the future renderer state without interpreting IMAGE content', () => {
    const payload = 'data:image/png;base64,untrusted-payload'
    render(
      <TemporalPropertiesPanel
        feature={featureWith([
          {
            type: 'IMAGE',
            name: 'camera',
            interpolation: 'Step',
            samples: [{ time: 1_000, value: payload }],
          },
        ])}
      />,
    )

    expect(
      screen.getByText('IMAGE rendering is not implemented yet.'),
    ).toBeInTheDocument()
    expect(screen.queryByText(payload)).not.toBeInTheDocument()
  })
})
