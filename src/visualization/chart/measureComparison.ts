import type { MeasureTemporalProperty, MovingFeature } from '../../mfjson/types'

export type MeasureComparisonMode = 'features' | 'properties'

export interface MeasureComparisonSeries {
  readonly id: string
  readonly label: string
  readonly featureId: string
  readonly propertyName: string
  readonly property: MeasureTemporalProperty
  readonly focused: boolean
}

export interface MeasurePropertyGroup {
  readonly key: string
  readonly unitLabel?: string
  readonly series: readonly MeasureComparisonSeries[]
}

const normalizeMetadata = (value: string | undefined) => {
  const normalized = value?.trim().toLocaleLowerCase()
  return normalized || undefined
}

export const getMeasurePropertiesForFeature = (
  feature: MovingFeature,
): readonly MeasureTemporalProperty[] =>
  feature.temporalProperties.filter(
    (property): property is MeasureTemporalProperty =>
      property.type === 'Measure',
  )

export const getAvailableMeasurePropertyNames = (
  features: readonly MovingFeature[],
): readonly string[] =>
  [
    ...new Set(
      features.flatMap((feature) =>
        getMeasurePropertiesForFeature(feature).map(
          (property) => property.name,
        ),
      ),
    ),
  ].sort((left, right) => left.localeCompare(right))

export const getFeaturesWithMeasureProperty = (
  features: readonly MovingFeature[],
  propertyName: string,
): readonly MovingFeature[] =>
  features.filter((feature) =>
    getMeasurePropertiesForFeature(feature).some(
      (property) => property.name === propertyName,
    ),
  )

export const createFeatureComparisonSeries = (
  features: readonly MovingFeature[],
  propertyName: string,
  selectedFeatureIds: ReadonlySet<string>,
  focusedFeatureId?: string,
): readonly MeasureComparisonSeries[] =>
  features.flatMap((feature) => {
    if (!selectedFeatureIds.has(feature.id)) return []
    const property = getMeasurePropertiesForFeature(feature).find(
      (candidate) => candidate.name === propertyName,
    )
    if (!property) return []
    return [
      {
        id: `feature:${feature.id}:${propertyName}`,
        label: feature.id,
        featureId: feature.id,
        propertyName,
        property,
        focused: feature.id === focusedFeatureId,
      },
    ]
  })

export const createPropertyComparisonSeries = (
  feature: MovingFeature,
  selectedPropertyNames: ReadonlySet<string>,
): readonly MeasureComparisonSeries[] =>
  getMeasurePropertiesForFeature(feature)
    .filter((property) => selectedPropertyNames.has(property.name))
    .map((property) => ({
      id: `property:${feature.id}:${property.name}`,
      label: property.name,
      featureId: feature.id,
      propertyName: property.name,
      property,
      focused: true,
    }))

/** Explicit form wins, then unit. Unitless properties only share by name. */
export const getMeasureCompatibilityKey = (
  property: MeasureTemporalProperty,
): string => {
  const form = normalizeMetadata(property.form)
  if (form) return `unit:${form}`
  const unit = normalizeMetadata(property.unit)
  if (unit) return `unit:${unit}`
  return `property:${property.name.trim().toLocaleLowerCase()}`
}

export const groupPropertyComparisonSeries = (
  series: readonly MeasureComparisonSeries[],
): readonly MeasurePropertyGroup[] => {
  const groups = new Map<string, MeasureComparisonSeries[]>()
  for (const item of series) {
    const key = getMeasureCompatibilityKey(item.property)
    const group = groups.get(key)
    if (group) group.push(item)
    else groups.set(key, [item])
  }
  return [...groups].map(([key, items]) => ({
    key,
    unitLabel: items[0]?.property.unit ?? items[0]?.property.form,
    series: items,
  }))
}

export const reconcileSelection = (
  selected: ReadonlySet<string>,
  available: readonly string[],
  fallback?: string,
): Set<string> => {
  const availableSet = new Set(available)
  const reconciled = new Set(
    [...selected].filter((value) => availableSet.has(value)),
  )
  if (reconciled.size === 0 && fallback && availableSet.has(fallback)) {
    reconciled.add(fallback)
  }
  return reconciled
}
