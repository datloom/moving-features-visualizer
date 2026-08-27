import { describe, expect, it, vi } from 'vitest'

import type { TemporalGeometryQueryDescriptor } from '../../mfjson/computeQuery'
import type { MovingFeaturesApiClient } from './MovingFeaturesApiClient'
import {
  intersectDatetimeRange,
  runTemporalGeometryQuery,
} from './temporalGeometryQueryOrchestrator'
import type { TemporalGeometryMetricResponse } from './types'

const geometry = (
  tGeometryId: string,
  startTime: number,
  endTime: number,
): TemporalGeometryQueryDescriptor => ({
  tGeometryId,
  type: 'MovingPoint',
  startTime,
  endTime,
  sampleCount: 2,
})

const metricResponse = (name: string): TemporalGeometryMetricResponse => ({
  name,
  type: 'TReal',
  form: 'KMH',
  valueSequence: [
    {
      datetimes: ['2026-01-01T10:00:00Z'],
      values: [1],
      interpolation: 'Linear',
    },
  ],
})

/**
 * Returns the client alongside its raw spy — asserting against the spy
 * directly (rather than `client.getTemporalGeometryMetric`) avoids
 * `@typescript-eslint/unbound-method`, matching how
 * `MovingFeaturesApiAssembler.test.ts` keeps its mocks.
 */
const fakeClient = (
  impl: (request: {
    readonly tGeometryId: string
    readonly startTime: number
    readonly endTime: number
  }) => Promise<TemporalGeometryMetricResponse>,
) => {
  const getTemporalGeometryMetric = vi.fn(impl)
  const client = {
    getTemporalGeometryMetric,
  } as unknown as MovingFeaturesApiClient
  return { client, getTemporalGeometryMetric }
}

const baseRequest = {
  collectionId: 'routes',
  mFeatureId: 'mf-1',
  metric: 'velocity' as const,
}

describe('intersectDatetimeRange', () => {
  it('computes max(start)/min(end) when the ranges overlap', () => {
    expect(intersectDatetimeRange(1_000, 5_000, 2_000, 9_000)).toEqual({
      start: 2_000,
      end: 5_000,
    })
  })

  it('returns undefined when there is no overlap', () => {
    expect(intersectDatetimeRange(1_000, 2_000, 3_000, 4_000)).toBeUndefined()
  })

  it('treats a single shared instant as a valid (inclusive) intersection', () => {
    expect(intersectDatetimeRange(1_000, 3_000, 3_000, 5_000)).toEqual({
      start: 3_000,
      end: 3_000,
    })
  })

  it('is queryable when the user window is fully nested inside the geometry extent, even with no sample at those exact instants', () => {
    const tgStart = Date.parse('2023-11-20T13:00:00Z')
    const tgEnd = Date.parse('2023-11-20T14:00:00Z')
    const userStart = Date.parse('2023-11-20T13:30:00Z')
    const userEnd = Date.parse('2023-11-20T13:33:00Z')
    expect(
      intersectDatetimeRange(userStart, userEnd, tgStart, tgEnd),
    ).toEqual({ start: userStart, end: userEnd })
  })

  it('is not queryable when the user window falls entirely outside the geometry extent', () => {
    const tgStart = Date.parse('2023-11-20T13:00:00Z')
    const tgEnd = Date.parse('2023-11-20T14:00:00Z')
    const userStart = Date.parse('2023-11-20T15:00:00Z')
    const userEnd = Date.parse('2023-11-20T15:10:00Z')
    expect(
      intersectDatetimeRange(userStart, userEnd, tgStart, tgEnd),
    ).toBeUndefined()
  })
})

describe('runTemporalGeometryQuery', () => {
  it('issues exactly one request for one selected TemporalGeometry', async () => {
    const { client, getTemporalGeometryMetric } = fakeClient(() =>
      Promise.resolve(metricResponse('velocity')),
    )
    const outcome = await runTemporalGeometryQuery(client, {
      ...baseRequest,
      geometries: [geometry('tg-1', 0, 10_000)],
      userStart: 0,
      userEnd: 10_000,
    })

    expect(getTemporalGeometryMetric).toHaveBeenCalledTimes(1)
    expect(getTemporalGeometryMetric).toHaveBeenCalledWith({
      collectionId: 'routes',
      mFeatureId: 'mf-1',
      tGeometryId: 'tg-1',
      metric: 'velocity',
      startTime: 0,
      endTime: 10_000,
    })
    expect(outcome.results).toHaveLength(1)
    expect(outcome.results[0]?.tGeometryId).toBe('tg-1')
    expect(outcome.stale).toBe(false)
  })

  it('runs the same metric for every eligible TemporalGeometry when given "All"', async () => {
    const { client, getTemporalGeometryMetric } = fakeClient(() =>
      Promise.resolve(metricResponse('velocity')),
    )
    const geometries = [
      geometry('tg-1', 0, 1_000),
      geometry('tg-2', 1_000, 2_000),
      geometry('tg-3', 2_000, 3_000),
    ]
    const outcome = await runTemporalGeometryQuery(client, {
      ...baseRequest,
      geometries,
      userStart: 0,
      userEnd: 3_000,
    })

    expect(getTemporalGeometryMetric).toHaveBeenCalledTimes(3)
    expect(outcome.results.map((result) => result.tGeometryId)).toEqual([
      'tg-1',
      'tg-2',
      'tg-3',
    ])
  })

  it('requests requestStart/requestEnd as the intersection of the user window and each geometry extent', async () => {
    const { client, getTemporalGeometryMetric } = fakeClient(() =>
      Promise.resolve(metricResponse('velocity')),
    )
    await runTemporalGeometryQuery(client, {
      ...baseRequest,
      geometries: [geometry('tg-1', 500, 5_000)],
      userStart: 1_000,
      userEnd: 2_000,
    })

    expect(getTemporalGeometryMetric).toHaveBeenCalledWith(
      expect.objectContaining({ startTime: 1_000, endTime: 2_000 }),
    )
  })

  it('skips a TemporalGeometry with no overlap instead of issuing an empty/failed request', async () => {
    const { client, getTemporalGeometryMetric } = fakeClient(() =>
      Promise.resolve(metricResponse('velocity')),
    )
    const outcome = await runTemporalGeometryQuery(client, {
      ...baseRequest,
      geometries: [
        geometry('tg-1', 0, 1_000),
        geometry('tg-2', 5_000, 6_000), // outside the user window entirely
      ],
      userStart: 0,
      userEnd: 1_000,
    })

    expect(getTemporalGeometryMetric).toHaveBeenCalledTimes(1)
    expect(getTemporalGeometryMetric).toHaveBeenCalledWith(
      expect.objectContaining({ tGeometryId: 'tg-1' }),
    )
    expect(outcome.results).toHaveLength(1)
    expect(outcome.failures).toHaveLength(0)
  })

  it('returns results in normalized segment order regardless of network completion order', async () => {
    // tg-3 resolves first, tg-1 resolves last — order must still be tg-1, tg-2, tg-3.
    const delays: Record<string, number> = { 'tg-1': 30, 'tg-2': 15, 'tg-3': 0 }
    const { client } = fakeClient(
      ({ tGeometryId }) =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve(metricResponse(tGeometryId)),
            delays[tGeometryId] ?? 0,
          ),
        ),
    )
    const geometries = [
      geometry('tg-1', 0, 1_000),
      geometry('tg-2', 1_000, 2_000),
      geometry('tg-3', 2_000, 3_000),
    ]
    const outcome = await runTemporalGeometryQuery(
      client,
      { ...baseRequest, geometries, userStart: 0, userEnd: 3_000 },
      { concurrency: 3 },
    )

    expect(outcome.results.map((result) => result.tGeometryId)).toEqual([
      'tg-1',
      'tg-2',
      'tg-3',
    ])
  })

  it('keeps successful results when one TemporalGeometry fails (partial success)', async () => {
    const { client } = fakeClient(({ tGeometryId }) => {
      if (tGeometryId === 'tg-2')
        return Promise.reject(new Error('server error'))
      return Promise.resolve(metricResponse(tGeometryId))
    })
    const geometries = [
      geometry('tg-1', 0, 1_000),
      geometry('tg-2', 1_000, 2_000),
      geometry('tg-3', 2_000, 3_000),
    ]
    const outcome = await runTemporalGeometryQuery(client, {
      ...baseRequest,
      geometries,
      userStart: 0,
      userEnd: 3_000,
    })

    expect(outcome.results.map((result) => result.tGeometryId)).toEqual([
      'tg-1',
      'tg-3',
    ])
    expect(outcome.failures).toEqual([
      { tGeometryId: 'tg-2', message: 'server error' },
    ])
  })

  it('does not apply results once the query is already known stale before it starts', async () => {
    const { client, getTemporalGeometryMetric } = fakeClient(() =>
      Promise.resolve(metricResponse('velocity')),
    )
    const outcome = await runTemporalGeometryQuery(
      client,
      {
        ...baseRequest,
        geometries: [
          geometry('tg-1', 0, 1_000),
          geometry('tg-2', 1_000, 2_000),
        ],
        userStart: 0,
        userEnd: 2_000,
      },
      { isStale: () => true },
    )

    expect(getTemporalGeometryMetric).not.toHaveBeenCalled()
    expect(outcome.results).toEqual([])
    expect(outcome.failures).toEqual([])
    expect(outcome.stale).toBe(true)
  })

  it('stops issuing further requests and discards the in-flight result once the query goes stale mid-flight', async () => {
    let staleAfterFirstResponse = false
    const { client, getTemporalGeometryMetric } = fakeClient(
      ({ tGeometryId }) => {
        if (tGeometryId === 'tg-1') staleAfterFirstResponse = true
        return Promise.resolve(metricResponse(tGeometryId))
      },
    )
    const geometries = [
      geometry('tg-1', 0, 1_000),
      geometry('tg-2', 1_000, 2_000),
      geometry('tg-3', 2_000, 3_000),
    ]
    const outcome = await runTemporalGeometryQuery(
      client,
      { ...baseRequest, geometries, userStart: 0, userEnd: 3_000 },
      { concurrency: 1, isStale: () => staleAfterFirstResponse },
    )

    // Only tg-1's request was ever issued — the loop stopped before tg-2/tg-3.
    expect(getTemporalGeometryMetric).toHaveBeenCalledTimes(1)
    // Even tg-1's own (now-stale) result was not applied.
    expect(outcome.results).toEqual([])
    expect(outcome.stale).toBe(true)
  })

  it('reports progress after each request settles, for a compact "Computing N / M" indicator', async () => {
    const { client } = fakeClient(() =>
      Promise.resolve(metricResponse('velocity')),
    )
    const geometries = [
      geometry('tg-1', 0, 1_000),
      geometry('tg-2', 1_000, 2_000),
      geometry('tg-3', 2_000, 3_000),
    ]
    const onProgress = vi.fn()
    await runTemporalGeometryQuery(
      client,
      { ...baseRequest, geometries, userStart: 0, userEnd: 3_000 },
      { concurrency: 1, onProgress },
    )

    expect(onProgress).toHaveBeenCalledTimes(3)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 3)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 3)
    expect(onProgress).toHaveBeenNthCalledWith(3, 3, 3)
  })
})
