import { useEffect, useMemo, useState } from 'react'

import type { MovingFeature } from '../../mfjson/types'
import { useFeatureStore } from '../../store/featureStore'
import {
  createFeatureComparisonSeries,
  createPropertyComparisonSeries,
  getAvailableMeasurePropertyNames,
  getFeaturesWithMeasureProperty,
  getMeasurePropertiesForFeature,
  groupPropertyComparisonSeries,
  reconcileSelection,
  type MeasureComparisonMode,
} from '../../visualization/chart/measureComparison'
import { MeasureComparisonChart } from './MeasureComparisonChart'

const MAX_FEATURE_SERIES = 12

export function TemporalPropertiesPanel({
  feature,
}: {
  readonly feature: MovingFeature
}) {
  const features = useFeatureStore((state) => state.features)
  const selectedFeatureId = useFeatureStore((state) => state.selectedFeatureId)
  const selectedFeature =
    features.find((item) => item.id === selectedFeatureId) ?? feature
  const [mode, setMode] = useState<MeasureComparisonMode>('properties')
  const availablePropertyNames = useMemo(
    () => getAvailableMeasurePropertyNames(features),
    [features],
  )
  const [featureProperty, setFeatureProperty] = useState(
    availablePropertyNames[0] ?? '',
  )
  const [selectedFeatureIds, setSelectedFeatureIds] = useState<Set<string>>(
    () => new Set(selectedFeatureId ? [selectedFeatureId] : []),
  )
  const measureProperties = useMemo(
    () => getMeasurePropertiesForFeature(selectedFeature),
    [selectedFeature],
  )
  const logicalMeasureProperties = useMemo(
    () =>
      measureProperties.filter(
        (property, index) =>
          measureProperties.findIndex(
            (candidate) => candidate.name === property.name,
          ) === index,
      ),
    [measureProperties],
  )
  const [selectedPropertyNames, setSelectedPropertyNames] = useState<
    Set<string>
  >(() => new Set(measureProperties[0] ? [measureProperties[0].name] : []))

  useEffect(() => {
    if (!availablePropertyNames.includes(featureProperty))
      setFeatureProperty(availablePropertyNames[0] ?? '')
  }, [availablePropertyNames, featureProperty])

  const eligibleFeatures = useMemo(
    () => getFeaturesWithMeasureProperty(features, featureProperty),
    [featureProperty, features],
  )
  const eligibleFeatureIds = useMemo(
    () => eligibleFeatures.map((item) => item.id),
    [eligibleFeatures],
  )
  useEffect(() => {
    const fallback = eligibleFeatureIds.includes(selectedFeatureId ?? '')
      ? selectedFeatureId
      : eligibleFeatureIds[0]
    setSelectedFeatureIds((current) =>
      reconcileSelection(current, eligibleFeatureIds, fallback),
    )
  }, [eligibleFeatureIds, selectedFeatureId])

  const measurePropertyNames = useMemo(
    () => logicalMeasureProperties.map((property) => property.name),
    [logicalMeasureProperties],
  )
  useEffect(() => {
    setSelectedPropertyNames((current) =>
      reconcileSelection(
        current,
        measurePropertyNames,
        measurePropertyNames[0],
      ),
    )
  }, [measurePropertyNames])

  const featureSeries = useMemo(
    () =>
      createFeatureComparisonSeries(
        features,
        featureProperty,
        selectedFeatureIds,
        selectedFeatureId,
      ),
    [featureProperty, features, selectedFeatureId, selectedFeatureIds],
  )
  const propertyGroups = useMemo(
    () =>
      groupPropertyComparisonSeries(
        createPropertyComparisonSeries(selectedFeature, selectedPropertyNames),
      ),
    [selectedFeature, selectedPropertyNames],
  )
  const groups =
    mode === 'features'
      ? [
          {
            key: `feature:${featureProperty}`,
            unitLabel:
              featureSeries[0]?.property.unit ??
              featureSeries[0]?.property.form,
            series: featureSeries,
          },
        ]
      : propertyGroups

  const toggle = (current: Set<string>, value: string, checked: boolean) => {
    const next = new Set(current)
    if (checked) next.add(value)
    else next.delete(value)
    return next
  }
  const emptyMessage =
    mode === 'features'
      ? availablePropertyNames.length === 0
        ? 'No Measure properties are available in the loaded dataset.'
        : selectedFeatureIds.size === 0
          ? 'Select at least one Feature to compare.'
          : featureSeries.length === 0
            ? 'No loaded Features contain the selected property.'
            : undefined
      : measureProperties.length === 0
        ? 'No Measure properties are available for this Feature.'
        : selectedPropertyNames.size === 0
          ? 'Select at least one Measure property.'
          : undefined

  return (
    <section
      aria-label="Temporal Properties"
      className="temporal-panel temporal-comparison-panel"
    >
      <header className="temporal-panel-heading">
        <div>
          <h2>Temporal Properties</h2>
          <span>Measure comparison</span>
        </div>
        <span>{features.length} features</span>
      </header>
      <div className="comparison-workspace">
        <aside
          className="comparison-controls"
          aria-label="Measure comparison controls"
        >
          <div
            className="comparison-mode"
            role="group"
            aria-label="Comparison mode"
          >
            <button
              aria-pressed={mode === 'features'}
              onClick={() => setMode('features')}
              type="button"
            >
              Feature Comparison
            </button>
            <button
              aria-pressed={mode === 'properties'}
              onClick={() => setMode('properties')}
              type="button"
            >
              Property Comparison
            </button>
          </div>
          {mode === 'features' ? (
            <>
              <label className="comparison-field">
                Property
                <select
                  value={featureProperty}
                  onChange={(event) => setFeatureProperty(event.target.value)}
                >
                  {availablePropertyNames.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <fieldset className="comparison-checklist">
                <legend>Features</legend>
                {eligibleFeatures.map((item) => {
                  const checked = selectedFeatureIds.has(item.id)
                  return (
                    <label key={item.id} title={item.id}>
                      <input
                        checked={checked}
                        disabled={
                          !checked &&
                          selectedFeatureIds.size >= MAX_FEATURE_SERIES
                        }
                        onChange={(event) =>
                          setSelectedFeatureIds((current) =>
                            toggle(current, item.id, event.target.checked),
                          )
                        }
                        type="checkbox"
                      />
                      <span>{item.id}</span>
                    </label>
                  )
                })}
              </fieldset>
              {selectedFeatureIds.size >= MAX_FEATURE_SERIES ? (
                <p className="comparison-warning">
                  Maximum {MAX_FEATURE_SERIES} visible series.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <p className="comparison-feature" title={selectedFeature.id}>
                <span>Feature</span>
                {selectedFeature.id}
              </p>
              <fieldset className="comparison-checklist">
                <legend>Properties</legend>
                {logicalMeasureProperties.map((property) => (
                  <label key={property.name} title={property.name}>
                    <input
                      checked={selectedPropertyNames.has(property.name)}
                      onChange={(event) =>
                        setSelectedPropertyNames((current) =>
                          toggle(current, property.name, event.target.checked),
                        )
                      }
                      type="checkbox"
                    />
                    <span>
                      {property.name}
                      {property.unit
                        ? ` (${property.unit})`
                        : property.form
                          ? ` (${property.form})`
                          : ''}
                    </span>
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </aside>
        <div
          className={`comparison-charts ${groups.length > 1 ? 'comparison-charts-multiple' : ''}`}
        >
          {emptyMessage ? (
            <p className="compact-empty">{emptyMessage}</p>
          ) : (
            groups.map((group) => (
              <MeasureComparisonChart group={group} key={group.key} />
            ))
          )}
        </div>
      </div>
    </section>
  )
}
