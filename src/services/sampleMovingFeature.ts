import type { MovingFeature } from '../mfjson/types'

export const sampleMovingFeature: MovingFeature = {
  id: 'tokyo-survey-01',
  type: 'MovingFeature',
  temporalGeometry: {
    type: 'MovingPoint',
    interpolation: 'Linear',
    samples: [
      {
        time: Date.parse('2026-08-24T09:00:00Z'),
        longitude: 139.7528,
        latitude: 35.6852,
        height: 80,
      },
      {
        time: Date.parse('2026-08-24T09:02:00Z'),
        longitude: 139.761,
        latitude: 35.6762,
        height: 140,
      },
      {
        time: Date.parse('2026-08-24T09:04:00Z'),
        longitude: 139.7708,
        latitude: 35.6809,
        height: 95,
      },
      {
        time: Date.parse('2026-08-24T09:06:00Z'),
        longitude: 139.7815,
        latitude: 35.6896,
        height: 180,
      },
    ],
  },
  temporalProperties: [],
  properties: { label: 'Tokyo survey route' },
}
