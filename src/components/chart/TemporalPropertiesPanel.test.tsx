import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MovingFeature, TemporalProperty } from '../../mfjson/types'
import { initialFeatureState, useFeatureStore } from '../../store/featureStore'

vi.mock('./MeasureComparisonChart', () => ({
  MeasureComparisonChart: ({
    group,
  }: {
    group: { series: { label: string }[] }
  }) => (
    <div data-testid="comparison-chart">
      {group.series.map(({ label }) => label).join(',')}
    </div>
  ),
}))

vi.mock('./TextPropertyChart', () => ({
  TextPropertyChart: ({
    propertyName,
    properties,
  }: {
    propertyName: string
    properties: { samples: unknown[] }[]
  }) => (
    <div data-testid="text-chart">
      {propertyName}:{properties.length}
    </div>
  ),
}))

vi.mock('./ImagePropertyTimeline', () => ({
  ImagePropertyTimeline: ({
    propertyName,
    properties,
  }: {
    propertyName: string
    properties: { samples: unknown[] }[]
  }) => (
    <div data-testid="image-timeline">
      {propertyName}:{properties.length}
    </div>
  ),
}))

vi.mock('./ComputeTemporalPropertyDialog', () => ({
  ComputeTemporalPropertyDialog: ({
    onComputed,
  }: {
    onComputed: (key: string) => void
  }) => (
    <div aria-label="Compute Temporal Property" role="dialog">
      <button onClick={() => onComputed('Measure:velocity')} type="button">
        simulate successful compute
      </button>
    </div>
  ),
}))

import { TemporalPropertiesPanel } from './TemporalPropertiesPanel'

const featureWith = (
  id: string,
  temporalProperties: readonly TemporalProperty[],
): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: { segments: [] },
  temporalProperties,
  properties: {},
})

const speed = (name = 'speed'): TemporalProperty => ({
  type: 'Measure',
  name,
  interpolation: 'Linear',
  unit: 'KMH',
  samples: [{ time: 1_000, value: 10 }],
})

const derivedVelocity: TemporalProperty = {
  type: 'Measure',
  name: 'velocity',
  interpolation: 'Linear',
  form: 'KMH',
  samples: [{ time: 1_000, value: 10 }],
  // Extra provenance fields beyond the base TemporalProperty shape — see
  // `DerivedMeasureSegment` in services/moving-features-api.
  ...({
    source: 'derived-server',
    sourceTemporalGeometryId: 'tg-1',
    metric: 'velocity',
  } as Record<string, unknown>),
}

describe('TemporalPropertiesPanel', () => {
  beforeEach(() => useFeatureStore.setState(initialFeatureState))
  afterEach(cleanup)

  it('opens the Compute dialog from the header action', () => {
    const one = featureWith('one', [speed('speed')])
    useFeatureStore.getState().replaceFeatures([one])
    render(<TemporalPropertiesPanel feature={one} />)
    expect(
      screen.queryByRole('dialog', { name: /compute temporal property/i }),
    ).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /compute/i }))
    expect(
      screen.getByRole('dialog', { name: /compute temporal property/i }),
    ).toBeInTheDocument()
  })

  it('auto-selects the derived property and shows its graph once Compute reports success', () => {
    const one = featureWith('one', [speed('speed'), derivedVelocity])
    useFeatureStore.getState().replaceFeatures([one])
    render(<TemporalPropertiesPanel feature={one} />)

    fireEvent.click(screen.getByRole('button', { name: /compute/i }))
    fireEvent.click(
      screen.getByRole('button', { name: 'simulate successful compute' }),
    )

    // Property Comparison mode, "velocity" checked, its chart rendered.
    expect(
      screen.getByRole('button', { name: 'Property Comparison' }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('checkbox', { name: /^velocity/ })).toBeChecked()
    expect(screen.getByTestId('comparison-chart')).toHaveTextContent('velocity')
  })

  it('shows a "Derived" badge for a fully server-derived Measure property', () => {
    const one = featureWith('one', [derivedVelocity])
    useFeatureStore.getState().replaceFeatures([one])
    render(<TemporalPropertiesPanel feature={one} />)

    expect(screen.getByText('Derived')).toBeInTheDocument()
  })

  it('shows a "Source + Derived" badge when a source property shares the derived metric name', () => {
    const one = featureWith('one', [speed('velocity'), derivedVelocity])
    useFeatureStore.getState().replaceFeatures([one])
    render(<TemporalPropertiesPanel feature={one} />)

    expect(screen.getByText('Source + Derived')).toBeInTheDocument()
  })

  it('defaults to selected-feature Property Comparison and updates with Feature Store selection', () => {
    const one = featureWith('one', [speed('speed')])
    const two = featureWith('two', [speed('velocity')])
    useFeatureStore.getState().replaceFeatures([one, two])
    const view = render(<TemporalPropertiesPanel feature={one} />)
    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.getByTestId('comparison-chart')).toHaveTextContent('speed')

    useFeatureStore.getState().selectFeature('two')
    view.rerender(<TemporalPropertiesPanel feature={two} />)
    expect(screen.getByText('two')).toBeInTheDocument()
    expect(screen.getByTestId('comparison-chart')).toHaveTextContent('velocity')
  })

  it('compares an explicitly selected property across checked Features', () => {
    const one = featureWith('one', [speed()])
    const two = featureWith('two', [speed()])
    useFeatureStore.getState().replaceFeatures([one, two])
    render(<TemporalPropertiesPanel feature={one} />)
    fireEvent.click(screen.getByRole('button', { name: 'Feature Comparison' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'two' }))
    expect(screen.getByTestId('comparison-chart')).toHaveTextContent('one,two')
  })

  it('supports a Text-only Feature in Property Comparison', () => {
    const imageOnly = featureWith('camera-feature', [
      { type: 'Image', name: 'camera', interpolation: 'Step', samples: [] },
      { type: 'Text', name: 'state', interpolation: 'Step', samples: [] },
    ])
    useFeatureStore.getState().replaceFeatures([imageOnly])
    render(<TemporalPropertiesPanel feature={imageOnly} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'state · Text' }))
    expect(screen.getByTestId('text-chart')).toHaveTextContent('state:1')
    expect(screen.queryByTestId('comparison-chart')).not.toBeInTheDocument()
  })

  it('renders all logical Text property segments in Property Comparison', () => {
    const textSegments: TemporalProperty[] = [
      {
        type: 'Text',
        name: 'status',
        interpolation: 'Step',
        samples: [{ time: 1, value: 'moving' }],
      },
      {
        type: 'Text',
        name: 'status',
        interpolation: 'Step',
        samples: [{ time: 10, value: 'stopped' }],
      },
    ]
    const localFeature = featureWith('local', textSegments)
    useFeatureStore.getState().replaceFeatures([localFeature])
    render(<TemporalPropertiesPanel feature={localFeature} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'status · Text' }))
    expect(screen.getByTestId('text-chart')).toHaveTextContent('status:2')
  })

  it('renders selected Measure and Text properties together', () => {
    const mixed = featureWith('mixed', [
      speed(),
      { type: 'Text', name: 'status', interpolation: 'Step', samples: [] },
    ])
    useFeatureStore.getState().replaceFeatures([mixed])
    render(<TemporalPropertiesPanel feature={mixed} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'status · Text' }))

    expect(screen.getByTestId('comparison-chart')).toHaveTextContent('speed')
    expect(screen.getByTestId('text-chart')).toHaveTextContent('status:1')
    expect(screen.queryByRole('button', { name: 'Text Timeline' })).toBeNull()
  })

  it('renders a selected Image property via the Image renderer', () => {
    const withCamera = featureWith('camera-feature', [
      {
        type: 'Image',
        name: 'camera',
        interpolation: 'Step',
        samples: [{ time: 1_000, value: 'https://example.test/frame.png' }],
      },
    ])
    useFeatureStore.getState().replaceFeatures([withCamera])
    render(<TemporalPropertiesPanel feature={withCamera} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'camera · Image' }))
    expect(screen.getByTestId('image-timeline')).toHaveTextContent('camera:1')
    expect(screen.queryByTestId('comparison-chart')).not.toBeInTheDocument()
  })

  it('renders and removes a Text chart immediately from its checkbox', () => {
    const mixed = featureWith('mixed', [
      speed(),
      { type: 'Text', name: 'status', interpolation: 'Step', samples: [] },
    ])
    useFeatureStore.getState().replaceFeatures([mixed])
    render(<TemporalPropertiesPanel feature={mixed} />)

    fireEvent.click(
      screen.getByRole('checkbox', { name: 'speed (KMH) · Measure' }),
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'status · Text' }))
    expect(screen.getByTestId('text-chart')).toHaveTextContent('status:1')

    fireEvent.click(screen.getByRole('checkbox', { name: 'status · Text' }))
    expect(screen.queryByTestId('text-chart')).toBeNull()
  })

  it('collapses without losing selected-property state, and restores visibly', () => {
    const mixed = featureWith('mixed', [
      speed(),
      { type: 'Text', name: 'status', interpolation: 'Step', samples: [] },
    ])
    useFeatureStore.getState().replaceFeatures([mixed])
    const view = render(<TemporalPropertiesPanel feature={mixed} />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'status · Text' }))
    expect(
      screen.getByRole('checkbox', { name: 'status · Text' }),
    ).toBeChecked()

    view.rerender(<TemporalPropertiesPanel collapsed feature={mixed} />)
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'true',
    )

    view.rerender(<TemporalPropertiesPanel feature={mixed} />)
    expect(screen.getByLabelText('Temporal Properties')).toHaveAttribute(
      'aria-hidden',
      'false',
    )
    // The checked property survived collapsing — proof the panel stayed
    // mounted (its local selection state intact) rather than being torn down.
    expect(
      screen.getByRole('checkbox', { name: 'status · Text' }),
    ).toBeChecked()
  })
})
