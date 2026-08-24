import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as normalizer from '../mfjson/normalizer'
import type { MovingFeatureDataSource } from './data-source/MovingFeatureDataSource'
import { MovingFeatureDataSourceError } from './data-source/MovingFeatureDataSource'
import { initialFeatureState, useFeatureStore } from '../store/featureStore'
import { initialTimeState, useTimeStore } from '../store/timeStore'
import { loadMovingFeatures } from './loadMovingFeatures'

const rawFeature = (
  id: string,
  start = '2026-01-01T10:00:00Z',
  end = '2026-01-01T10:05:00Z',
) => ({
  type: 'Feature',
  id,
  properties: { label: id },
  temporalGeometry: {
    type: 'MovingPoint',
    datetimes: [start, end],
    coordinates: [
      [139.7, 35.6],
      [139.8, 35.7],
    ],
  },
  temporalProperties: [
    {
      datetimes: [start, end],
      speed: {
        type: 'Measure',
        values: [10, 20],
        interpolation: 'Linear',
        unit: 'km/h',
      },
    },
  ],
})

const source = (value: unknown): MovingFeatureDataSource => ({
  load: vi.fn().mockResolvedValue(value),
})

describe('loadMovingFeatures', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    useFeatureStore.setState(initialFeatureState)
    useTimeStore.setState(initialTimeState)
  })

  it('loads, validates, normalizes, and installs a dataset', async () => {
    const result = await loadMovingFeatures(source(rawFeature('vehicle-1')))
    const startTime = Date.parse('2026-01-01T10:00:00Z')
    const endTime = Date.parse('2026-01-01T10:05:00Z')

    expect(result).toEqual({
      success: true,
      features: [expect.objectContaining({ id: 'vehicle-1' })],
      timeRange: { startTime, endTime },
    })
    expect(useFeatureStore.getState()).toMatchObject({
      features: [expect.objectContaining({ id: 'vehicle-1' })],
      selectedFeatureId: 'vehicle-1',
    })
    expect(useTimeStore.getState()).toMatchObject({
      startTime,
      endTime,
      currentTime: startTime,
      playing: false,
    })
  })

  it('replaces the previous dataset and resets active playback', async () => {
    await loadMovingFeatures(source(rawFeature('old')))
    useTimeStore.getState().play()
    useTimeStore.getState().setCurrentTime(Date.parse('2026-01-01T10:03:00Z'))

    await loadMovingFeatures(
      source(
        rawFeature(
          'replacement',
          '2026-02-02T12:00:00Z',
          '2026-02-02T12:10:00Z',
        ),
      ),
    )

    const replacementStart = Date.parse('2026-02-02T12:00:00Z')
    expect(useFeatureStore.getState().features.map(({ id }) => id)).toEqual([
      'replacement',
    ])
    expect(useTimeStore.getState()).toMatchObject({
      startTime: replacementStart,
      currentTime: replacementStart,
      playing: false,
    })
  })

  it('returns structured validation issues without replacing state', async () => {
    await loadMovingFeatures(source(rawFeature('existing')))
    const beforeFeatures = useFeatureStore.getState().features
    const beforeTime = useTimeStore.getState().currentTime

    const result = await loadMovingFeatures(
      source({ ...rawFeature('invalid'), temporalGeometry: undefined }),
    )

    expect(result).toMatchObject({
      success: false,
      error: {
        type: 'validation',
        issues: [expect.objectContaining({ code: 'required' })],
      },
    })
    expect(useFeatureStore.getState().features).toBe(beforeFeatures)
    expect(useTimeStore.getState().currentTime).toBe(beforeTime)
  })

  it('distinguishes invalid JSON and other data-source failures', async () => {
    const invalidJsonSource: MovingFeatureDataSource = {
      load: vi
        .fn()
        .mockRejectedValue(
          new MovingFeatureDataSourceError('invalid-json', 'Malformed JSON.'),
        ),
    }
    const failedSource: MovingFeatureDataSource = {
      load: vi.fn().mockRejectedValue(new Error('Offline.')),
    }

    await expect(loadMovingFeatures(invalidJsonSource)).resolves.toMatchObject({
      success: false,
      error: { type: 'invalid-json', message: 'Malformed JSON.' },
    })
    await expect(loadMovingFeatures(failedSource)).resolves.toMatchObject({
      success: false,
      error: { type: 'data-source', message: 'Offline.' },
    })
  })

  it('rejects an empty dataset without clearing the current dataset', async () => {
    await loadMovingFeatures(source(rawFeature('existing')))

    const result = await loadMovingFeatures(source([]))

    expect(result).toMatchObject({
      success: false,
      error: { type: 'empty-dataset' },
    })
    expect(useFeatureStore.getState().features[0]?.id).toBe('existing')
  })

  it('reports a post-validation normalization failure', async () => {
    vi.spyOn(normalizer, 'normalizeMovingFeature').mockReturnValue({
      success: false,
      issues: [
        {
          path: '$.temporalGeometry',
          code: 'invalid_type',
          message: 'Could not normalize geometry.',
        },
      ],
    })

    const result = await loadMovingFeatures(source(rawFeature('vehicle-1')))

    expect(result).toMatchObject({
      success: false,
      error: {
        type: 'normalization',
        issues: [expect.objectContaining({ path: '$.temporalGeometry' })],
      },
    })
    expect(useFeatureStore.getState().features).toEqual([])
  })
})
