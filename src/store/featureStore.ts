import { create } from 'zustand'

import type { MovingFeature } from '../mfjson/types'

export interface FeatureState {
  readonly features: readonly MovingFeature[]
  readonly selectedFeatureId?: string
}

export interface FeatureActions {
  replaceFeatures: (features: readonly MovingFeature[]) => void
  selectFeature: (featureId: string | undefined) => void
}

export type FeatureStore = FeatureState & FeatureActions

export const initialFeatureState: FeatureState = {
  features: [],
  selectedFeatureId: undefined,
}

export const useFeatureStore = create<FeatureStore>((set) => ({
  ...initialFeatureState,
  replaceFeatures: (features) =>
    set({
      features: [...features],
      selectedFeatureId: features[0]?.id,
    }),
  selectFeature: (selectedFeatureId) => set({ selectedFeatureId }),
}))
