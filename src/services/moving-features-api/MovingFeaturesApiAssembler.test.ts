import { describe, expect, it, vi } from 'vitest'

import { normalizeMovingFeature } from '../../mfjson/normalizer'
import { MovingFeaturesApiAssembler } from './MovingFeaturesApiAssembler'
import type { MovingFeaturesApiClient } from './MovingFeaturesApiClient'

const metadata = (id: string) => ({
  id,
  type: 'Feature' as const,
  geometry: { type: 'LineString', coordinates: [] },
  properties: { label: id },
  bbox: [1, 2, 3, 4],
  time: ['2011-07-14T22:01:01Z', '2011-07-15T01:11:22Z'] as const,
})
const segment = (offset = 0) => ({
  id: `tg-${offset}`,
  type: 'MovingPoint',
  datetimes: [
    `2011-07-14T22:01:0${2 + offset}Z`,
    `2011-07-14T22:01:0${3 + offset}Z`,
  ],
  coordinates: [
    [139.7 + offset, 35.6],
    [139.8 + offset, 35.7],
  ],
  interpolation: 'Linear',
})

const client = (overrides: Partial<MovingFeaturesApiClient> = {}) =>
  ({
    getFeatures: vi.fn().mockResolvedValue({
      type: 'FeatureCollection',
      features: [metadata('one')],
      numberMatched: 2,
      numberReturned: 1,
      links: [{ rel: 'next', href: '/next' }],
    }),
    getTemporalGeometry: vi.fn().mockResolvedValue({
      type: 'TemporalGeometrySequence',
      geometrySequence: [segment()],
    }),
    getTemporalProperties: vi
      .fn()
      .mockResolvedValue({ temporalProperties: [] }),
    ...overrides,
  }) as unknown as MovingFeaturesApiClient

const mocks = (api: MovingFeaturesApiClient) =>
  api as unknown as {
    readonly getTemporalGeometry: ReturnType<typeof vi.fn>
    readonly getTemporalProperties: ReturnType<typeof vi.fn>
  }

describe('MovingFeaturesApiAssembler', () => {
  it('assembles metadata, every geometry segment, empty properties, and pagination', async () => {
    const api = client({
      getTemporalGeometry: vi.fn().mockResolvedValue({
        type: 'TemporalGeometrySequence',
        geometrySequence: [segment(), segment(2)],
      }),
      getTemporalProperties: vi.fn().mockResolvedValue({
        temporalProperties: [
          {
            datetimes: ['2011-07-14T22:01:06Z', '2011-07-14T22:01:07Z'],
            speed: {
              type: 'Measure',
              form: 'KMH',
              values: [65, 70],
              interpolation: 'Linear',
            },
            status: {
              type: 'Text',
              values: ['ok', 'warn'],
              interpolation: 'Step',
            },
          },
        ],
      }),
    })
    const result = await new MovingFeaturesApiAssembler(api).loadCollection(
      'routes',
      { limit: 100 },
    )
    expect(result.features).toHaveLength(1)
    const normalized = normalizeMovingFeature(result.features[0])
    expect(normalized.success).toBe(true)
    if (normalized.success) {
      expect(normalized.data.temporalGeometry.segments).toHaveLength(2)
      expect(
        normalized.data.temporalProperties.map(({ name }) => name),
      ).toEqual(['speed', 'status'])
      expect(normalized.data.properties).toEqual({ label: 'one' })
    }
    expect(result.pagination).toMatchObject({
      truncated: true,
      numberMatched: 2,
      numberReturned: 1,
    })
    expect(mocks(api).getTemporalGeometry).toHaveBeenCalledWith(
      'routes',
      'one',
      expect.objectContaining({
        datetime: {
          start: metadata('one').time[0],
          end: metadata('one').time[1],
        },
      }),
    )
    expect(mocks(api).getTemporalProperties).toHaveBeenCalledWith(
      'routes',
      'one',
      expect.objectContaining({
        datetime: {
          start: metadata('one').time[0],
          end: metadata('one').time[1],
        },
      }),
    )
  })

  it('treats missing geometry as invalid but retains geometry on property request failure', async () => {
    const api = client({
      getFeatures: vi.fn().mockResolvedValue({
        type: 'FeatureCollection',
        features: [metadata('bad'), metadata('good')],
      }),
      getTemporalGeometry: vi.fn().mockImplementation((_collection, id) =>
        id === 'bad'
          ? Promise.reject(new Error('tg failed'))
          : Promise.resolve({
              type: 'TemporalGeometrySequence',
              geometrySequence: [segment()],
            }),
      ),
      getTemporalProperties: vi
        .fn()
        .mockRejectedValue(new Error('properties failed')),
    })
    const result = await new MovingFeaturesApiAssembler(api).loadCollection(
      'routes',
      { limit: 2 },
    )
    expect(result.features).toHaveLength(1)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          featureId: 'bad',
          stage: 'temporal-geometry',
          retained: false,
        }),
        expect.objectContaining({
          featureId: 'good',
          stage: 'temporal-properties',
          retained: true,
        }),
      ]),
    )
  })

  it('does not exceed configured feature concurrency', async () => {
    let active = 0
    let maximum = 0
    const features = Array.from({ length: 20 }, (_, index) =>
      metadata(String(index)),
    )
    const api = client({
      getFeatures: vi
        .fn()
        .mockResolvedValue({ type: 'FeatureCollection', features }),
      getTemporalGeometry: vi.fn().mockImplementation(async () => {
        active += 1
        maximum = Math.max(maximum, active)
        await new Promise((resolve) => setTimeout(resolve, 2))
        active -= 1
        return {
          type: 'TemporalGeometrySequence',
          geometrySequence: [segment()],
        }
      }),
    })
    await new MovingFeaturesApiAssembler(api, 4).loadCollection('routes', {
      limit: 20,
    })
    expect(maximum).toBeLessThanOrEqual(4)
  })

  it('reports item request failure without child requests', async () => {
    const api = client({
      getFeatures: vi.fn().mockRejectedValue(new Error('items failed')),
    })
    await expect(
      new MovingFeaturesApiAssembler(api).loadCollection('routes', {
        limit: 10,
      }),
    ).rejects.toThrow('items failed')
    expect(mocks(api).getTemporalGeometry).not.toHaveBeenCalled()
  })
})
