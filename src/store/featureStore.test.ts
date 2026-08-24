import { beforeEach, describe, expect, it } from 'vitest'

import type { MovingFeature } from '../mfjson/types'
import { initialFeatureState, useFeatureStore } from './featureStore'

const feature = (id: string): MovingFeature => ({
  id,
  type: 'MovingFeature',
  temporalGeometry: {
    type: 'MovingPoint',
    interpolation: 'Linear',
    samples: [{ time: 1, longitude: 0, latitude: 0 }],
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
})
