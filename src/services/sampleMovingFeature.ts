import type {
  MeasureTemporalProperty,
  MovingFeature,
  TextTemporalProperty,
} from '../mfjson/types'

export const sampleSpeedProperty: MeasureTemporalProperty = {
  type: 'Measure',
  name: 'Speed',
  unit: 'km/h',
  interpolation: 'Linear',
  samples: [
    { time: Date.parse('2026-08-24T09:00:00Z'), value: 18 },
    { time: Date.parse('2026-08-24T09:02:00Z'), value: 31 },
    { time: Date.parse('2026-08-24T09:04:00Z'), value: 24 },
    { time: Date.parse('2026-08-24T09:06:00Z'), value: 42 },
  ],
}

export const sampleMovingFeature: MovingFeature = {
  id: 'tokyo-survey-01',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
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
    ],
  },
  temporalProperties: [sampleSpeedProperty],
  properties: { label: 'Tokyo survey route' },
}

const harborSpeedProperty: MeasureTemporalProperty = {
  type: 'Measure',
  name: 'Speed',
  unit: 'km/h',
  interpolation: 'Step',
  samples: [
    { time: Date.parse('2026-08-24T09:00:00Z'), value: 0 },
    { time: Date.parse('2026-08-24T09:02:00Z'), value: 14 },
    { time: Date.parse('2026-08-24T09:04:00Z'), value: 8 },
    { time: Date.parse('2026-08-24T09:06:00Z'), value: 0 },
  ],
}

const harborStatusProperty: TextTemporalProperty = {
  type: 'Text',
  name: 'Status',
  interpolation: 'Step',
  samples: [
    { time: Date.parse('2026-08-24T09:00:00Z'), value: 'stopped' },
    { time: Date.parse('2026-08-24T09:02:00Z'), value: 'in-transit' },
    { time: Date.parse('2026-08-24T09:04:00Z'), value: 'inspecting' },
    { time: Date.parse('2026-08-24T09:06:00Z'), value: 'complete' },
  ],
}

export const harborMovingFeature: MovingFeature = {
  id: 'yokohama-inspection-02',
  type: 'MovingFeature',
  temporalGeometry: {
    segments: [
      {
        type: 'MovingPoint',
        interpolation: 'Linear',
        samples: [
          {
            time: Date.parse('2026-08-24T09:00:00Z'),
            longitude: 139.638,
            latitude: 35.452,
            height: 12,
          },
          {
            time: Date.parse('2026-08-24T09:02:00Z'),
            longitude: 139.648,
            latitude: 35.447,
            height: 18,
          },
          {
            time: Date.parse('2026-08-24T09:04:00Z'),
            longitude: 139.659,
            latitude: 35.455,
            height: 15,
          },
          {
            time: Date.parse('2026-08-24T09:06:00Z'),
            longitude: 139.67,
            latitude: 35.462,
            height: 10,
          },
        ],
      },
    ],
  },
  temporalProperties: [harborSpeedProperty, harborStatusProperty],
  properties: { label: 'Yokohama inspection' },
}
