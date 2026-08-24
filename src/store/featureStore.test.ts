import { beforeEach, describe, expect, it } from 'vitest'

import type { MovingFeature } from '../mfjson/types'
import { initialFeatureState, useFeatureStore } from './featureStore'

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
})
