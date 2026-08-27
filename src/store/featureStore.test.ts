import { beforeEach, describe, expect, it } from 'vitest'

import type { MovingFeature } from '../mfjson/types'
import type { DerivedMeasureSegment } from '../services/moving-features-api/derivedMeasureProperty'
import { initialFeatureState, useFeatureStore } from './featureStore'

const derivedSegment = (
  tGeometryId: string,
  value: number,
): DerivedMeasureSegment => ({
  type: 'Measure',
  name: 'velocity',
  interpolation: 'Linear',
  samples: [{ time: 1, value }],
  source: 'derived-server',
  sourceTemporalGeometryId: tGeometryId,
  metric: 'velocity',
})

const feature = (id: string): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [{ time: 1, longitude: 0, latitude: 0 }],
      },
    ],
  },
  temporalProperties: [],
  properties: {},
})

describe('useFeatureStore', () => {
  beforeEach(() => useFeatureStore.setState(initialFeatureState))

  it('replaces features and selects the first replacement', () => {
    useFeatureStore.getState().replaceFeatures([feature('one'), feature('two')])
    useFeatureStore.getState().selectFeature('two')
    useFeatureStore.getState().replaceFeatures([feature('replacement')])

    expect(useFeatureStore.getState()).toMatchObject({
      features: [expect.objectContaining({ id: 'replacement' })],
      selectedFeatureId: 'replacement',
    })
  })

  it('clears selection when replacing with an empty dataset', () => {
    useFeatureStore.getState().replaceFeatures([feature('one')])
    useFeatureStore.getState().replaceFeatures([])

    expect(useFeatureStore.getState()).toMatchObject(initialFeatureState)
  })

  it('appends unique Features and preserves selection and existing duplicates', () => {
    const original = feature('one')
    useFeatureStore.getState().replaceFeatures([original, feature('two')])
    useFeatureStore.getState().selectFeature('two')
    useFeatureStore
      .getState()
      .appendFeatures([feature('one'), feature('three')])

    expect(useFeatureStore.getState().features.map(({ id }) => id)).toEqual([
      'one',
      'two',
      'three',
    ])
    expect(useFeatureStore.getState().features[0]).toBe(original)
    expect(useFeatureStore.getState().selectedFeatureId).toBe('two')
  })

  it('appends temporal segments to one Feature and removes exact duplicates', () => {
    const original = feature('one')
    const geometry = original.temporalGeometry.segments[0]!
    const property = {
      type: 'Measure' as const,
      name: 'speed',
      interpolation: 'Linear' as const,
      samples: [{ time: 2, value: 10 }],
    }
    useFeatureStore.getState().replaceFeatures([original, feature('two')])
    useFeatureStore
      .getState()
      .appendTemporalData('one', [geometry, geometry], [property, property])

    expect(useFeatureStore.getState().features).toHaveLength(2)
    expect(
      useFeatureStore.getState().features[0]?.temporalGeometry.segments,
    ).toHaveLength(1)
    expect(useFeatureStore.getState().features[0]?.temporalProperties).toEqual([
      property,
    ])
  })

  it('adds all All-mode derived segments for one metric', () => {
    useFeatureStore.getState().replaceFeatures([feature('one')])
    const segments = [
      derivedSegment('tg-1', 1),
      derivedSegment('tg-2', 2),
      derivedSegment('tg-3', 3),
    ]
    useFeatureStore
      .getState()
      .setDerivedMeasureSegments('one', 'velocity', segments)

    expect(useFeatureStore.getState().features[0]?.temporalProperties).toEqual(
      segments,
    )
  })

  it('replaces (does not duplicate) a previous derived result on recompute', () => {
    useFeatureStore.getState().replaceFeatures([feature('one')])
    useFeatureStore
      .getState()
      .setDerivedMeasureSegments('one', 'velocity', [derivedSegment('tg-1', 1)])
    useFeatureStore
      .getState()
      .setDerivedMeasureSegments('one', 'velocity', [
        derivedSegment('tg-1', 99),
      ])

    const properties =
      useFeatureStore.getState().features[0]?.temporalProperties
    expect(properties).toHaveLength(1)
    expect(properties?.[0]).toMatchObject({ name: 'velocity' })
    expect((properties?.[0] as DerivedMeasureSegment).samples[0]?.value).toBe(
      99,
    )
  })

  it('never removes a source property that happens to share the derived metric name', () => {
    const sourceVelocity = {
      type: 'Measure' as const,
      name: 'velocity',
      interpolation: 'Linear' as const,
      samples: [{ time: 5, value: 42 }],
    }
    useFeatureStore
      .getState()
      .replaceFeatures([
        { ...feature('one'), temporalProperties: [sourceVelocity] },
      ])
    useFeatureStore
      .getState()
      .setDerivedMeasureSegments('one', 'velocity', [derivedSegment('tg-1', 1)])

    const properties =
      useFeatureStore.getState().features[0]?.temporalProperties
    expect(properties).toContainEqual(sourceVelocity)
    expect(properties).toHaveLength(2)
  })

  it('scopes derived segments to the target Feature only', () => {
    useFeatureStore.getState().replaceFeatures([feature('one'), feature('two')])
    useFeatureStore
      .getState()
      .setDerivedMeasureSegments('one', 'velocity', [derivedSegment('tg-1', 1)])

    expect(
      useFeatureStore.getState().features[0]?.temporalProperties,
    ).toHaveLength(1)
    expect(useFeatureStore.getState().features[1]?.temporalProperties).toEqual(
      [],
    )
  })
})
