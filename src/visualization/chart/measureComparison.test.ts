import { describe, expect, it } from 'vitest'

import type { MeasureTemporalProperty, MovingFeature } from '../../mfjson/types'
import {
  createFeatureComparisonSeries,
  createPropertyComparisonSeries,
  getAvailableMeasurePropertyNames,
  getFeaturesWithMeasureProperty,
  groupPropertyComparisonSeries,
  reconcileSelection,
} from './measureComparison'

const measure = (
  name: string,
  unit: string | undefined,
  interpolation: MeasureTemporalProperty['interpolation'] = 'Linear',
  offset = 0,
): MeasureTemporalProperty => ({
  type: 'Measure',
  name,
  unit,
  interpolation,
  samples: [
    { time: 1_000 + offset, value: 1 },
    { time: 2_000 + offset, value: 2 },
  ],
})

const feature = (
  id: string,
  temporalProperties: MovingFeature['temporalProperties'],
): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: { segments: [] },
  temporalProperties,
  properties: {},
})

describe('Measure comparison transformations', () => {
  it('discovers Measure names across features and excludes other property types', () => {
    const features = [
      feature('one', [measure('speed', 'KMH')]),
      feature('two', [
        measure('length', 'm'),
        { type: 'Text', name: 'state', interpolation: 'Step', samples: [] },
      ]),
    ]
    expect(getAvailableMeasurePropertyNames(features)).toEqual([
      'length',
      'speed',
    ])
  })

  it('builds independent feature series without padding a missing property', () => {
    const features = [
      feature('one', [measure('speed', 'KMH', 'Linear')]),
      feature('two', [measure('speed', 'KMH', 'Step', 250)]),
      feature('three', [measure('length', 'm')]),
    ]
    expect(
      getFeaturesWithMeasureProperty(features, 'speed').map(({ id }) => id),
    ).toEqual(['one', 'two'])
    const series = createFeatureComparisonSeries(
      features,
      'speed',
      new Set(['one', 'two', 'three']),
      'two',
    )
    expect(series).toHaveLength(2)
    expect(series[0]?.property.samples[0]?.time).toBe(1_000)
    expect(series[1]?.property.samples[0]?.time).toBe(1_250)
    expect(series[1]?.focused).toBe(true)
  })

  it('builds selected property series with their own interpolation and timestamps', () => {
    const selected = feature('one', [
      measure('speed', 'KMH', 'Discrete'),
      measure('velocity', 'KMH', 'Step', 500),
      measure('length', 'm'),
    ])
    const series = createPropertyComparisonSeries(
      selected,
      new Set(['speed', 'velocity']),
    )
    expect(series.map(({ property }) => property.interpolation)).toEqual([
      'Discrete',
      'Step',
    ])
    expect(series[1]?.property.samples[0]?.time).toBe(1_500)
  })

  it('keeps repeated logical properties as separate gap-preserving series', () => {
    const selected = feature('one', [
      measure('speed', 'KMH', 'Linear'),
      measure('speed', 'KMH', 'Linear', 10_000),
    ])
    const series = createPropertyComparisonSeries(selected, new Set(['speed']))

    expect(series).toHaveLength(2)
    expect(new Set(series.map(({ id }) => id)).size).toBe(2)
    expect(series.map(({ label }) => label)).toEqual(['speed', 'speed'])
    expect(series[0]?.property.samples.at(-1)?.time).toBeLessThan(
      series[1]?.property.samples[0]?.time ?? 0,
    )
  })

  it('groups matching explicit units and separates incompatible units', () => {
    const selected = feature('one', [
      measure('speed', 'KMH'),
      measure('velocity', ' kmh '),
      measure('length', 'm'),
    ])
    const groups = groupPropertyComparisonSeries(
      createPropertyComparisonSeries(
        selected,
        new Set(['speed', 'velocity', 'length']),
      ),
    )
    expect(
      groups.map(({ series }) =>
        series.map(({ propertyName }) => propertyName),
      ),
    ).toEqual([['speed', 'velocity'], ['length']])
  })

  it('treats the same normalized form and unit label as compatible', () => {
    const withForm = { ...measure('speed', undefined), form: 'KMH' }
    const selected = feature('one', [withForm, measure('velocity', 'kmh')])
    expect(
      groupPropertyComparisonSeries(
        createPropertyComparisonSeries(
          selected,
          new Set(['speed', 'velocity']),
        ),
      ),
    ).toHaveLength(1)
  })

  it('keeps unitless properties separate unless they share a name', () => {
    const selected = feature('one', [
      measure('alpha', undefined),
      measure('beta', undefined),
    ])
    expect(
      groupPropertyComparisonSeries(
        createPropertyComparisonSeries(selected, new Set(['alpha', 'beta'])),
      ),
    ).toHaveLength(2)
  })

  it('preserves valid selections during append and prunes them on replacement', () => {
    expect([
      ...reconcileSelection(new Set(['one']), ['one', 'two'], 'two'),
    ]).toEqual(['one'])
    expect([
      ...reconcileSelection(new Set(['missing']), ['two'], 'two'),
    ]).toEqual(['two'])
  })
})
