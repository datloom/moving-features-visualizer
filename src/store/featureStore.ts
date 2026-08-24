import { create } from 'zustand'

import type {
  MovingFeature,
  TemporalGeometry,
  TemporalProperty,
} from '../mfjson/types'

export interface FeatureState {
  readonly features: readonly MovingFeature[]
  readonly selectedFeatureId?: string
}

export interface FeatureActions {
  replaceFeatures: (features: readonly MovingFeature[]) => void
  appendFeatures: (features: readonly MovingFeature[]) => void
  appendTemporalData: (
    featureId: string,
    geometry: readonly TemporalGeometry[],
    properties: readonly TemporalProperty[],
  ) => void
  selectFeature: (featureId: string | undefined) => void
}

export type FeatureStore = FeatureState & FeatureActions

export const initialFeatureState: FeatureState = {
  features: [],
  selectedFeatureId: undefined,
}

const geometryFingerprint = (segment: TemporalGeometry): string =>
  JSON.stringify([
    segment.id,
    segment.type,
    segment.interpolation,
    segment.samples,
  ])

const propertyFingerprint = (property: TemporalProperty): string =>
  JSON.stringify([
    property.type,
    property.name,
    property.interpolation,
    property.form,
    property.type === 'Measure' ? property.unit : undefined,
    property.samples,
  ])

const uniqueAdditions = <Value>(
  existingKeys: Set<string>,
  values: readonly Value[],
  fingerprint: (value: Value) => string,
): Value[] => {
  const additions: Value[] = []
  for (const value of values) {
    const key = fingerprint(value)
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    additions.push(value)
  }
  return additions
}

export const useFeatureStore = create<FeatureStore>((set) => ({
  ...initialFeatureState,
  replaceFeatures: (features) =>
    set({
      features: [...features],
      selectedFeatureId: features[0]?.id,
    }),
  appendFeatures: (features) =>
    set((state) => {
      const existingIds = new Set(state.features.map(({ id }) => id))
      const additions = features.filter(({ id }) => !existingIds.has(id))
      return additions.length === 0
        ? state
        : { ...state, features: [...state.features, ...additions] }
    }),
  appendTemporalData: (featureId, geometry, properties) =>
    set((state) => ({
      ...state,
      features: state.features.map((feature) => {
        if (feature.id !== featureId) return feature
        const geometryKeys = new Set(
          feature.temporalGeometry.segments.map(geometryFingerprint),
        )
        const propertyKeys = new Set(
          feature.temporalProperties.map(propertyFingerprint),
        )
        const newGeometry = uniqueAdditions(
          geometryKeys,
          geometry,
          geometryFingerprint,
        )
        const newProperties = uniqueAdditions(
          propertyKeys,
          properties,
          propertyFingerprint,
        )
        if (newGeometry.length === 0 && newProperties.length === 0)
          return feature
        return {
          ...feature,
          temporalGeometry: {
            segments: [...feature.temporalGeometry.segments, ...newGeometry],
          },
          temporalProperties: [...feature.temporalProperties, ...newProperties],
        }
      }),
    })),
  selectFeature: (selectedFeatureId) => set({ selectedFeatureId }),
}))
