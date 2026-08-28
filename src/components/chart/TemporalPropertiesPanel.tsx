import { useEffect, useMemo, useRef, useState } from 'react'

import type {
  ImageTemporalProperty,
  MovingFeature,
  TextTemporalProperty,
} from '../../mfjson/types'
import { isDerivedMeasureSegment } from '../../services/moving-features-api/derivedMeasureProperty'
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
import { ComputeTemporalPropertyDialog } from './ComputeTemporalPropertyDialog'
import { ImagePropertyTimeline } from './ImagePropertyTimeline'
import { MeasureComparisonChart } from './MeasureComparisonChart'
import { TextPropertyChart } from './TextPropertyChart'
import { Icon } from '../ui/Icon'

const MAX_FEATURE_SERIES = 12

export function TemporalPropertiesPanel({
  feature,
  collapsed = false,
}: {
  readonly feature: MovingFeature
  /** Collapsed from the workspace layout (freeing map height) — the panel stays mounted so its comparison/selection state survives. */
  readonly collapsed?: boolean
}) {
  const features = useFeatureStore((state) => state.features)
  const selectedFeatureId = useFeatureStore((state) => state.selectedFeatureId)
  const selectedFeature =
    features.find((item) => item.id === selectedFeatureId) ?? feature
  const [mode, setMode] = useState<MeasureComparisonMode>('properties')
  const [computeOpen, setComputeOpen] = useState(false)
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
  const textProperties = useMemo(
    () =>
      selectedFeature.temporalProperties.filter(
        (property): property is TextTemporalProperty =>
          property.type === 'Text',
      ),
    [selectedFeature],
  )
  const imageProperties = useMemo(
    () =>
      selectedFeature.temporalProperties.filter(
        (property): property is ImageTemporalProperty =>
          property.type === 'Image',
      ),
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
  const [selectedPropertyKeys, setSelectedPropertyKeys] = useState<Set<string>>(
    () =>
      new Set(
        measureProperties[0] ? [`Measure:${measureProperties[0].name}`] : [],
      ),
  )
  const [pendingNavigationKey, setPendingNavigationKey] = useState<string>()
  const chartElementsRef = useRef<Map<string, HTMLDivElement>>(new Map())

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

  const logicalProperties = useMemo(
    () => [
      ...logicalMeasureProperties.map((property) => {
        const segmentsForName = measureProperties.filter(
          (candidate) => candidate.name === property.name,
        )
        const derivedCount = segmentsForName.filter(
          isDerivedMeasureSegment,
        ).length
        return {
          key: `Measure:${property.name}`,
          name: property.name,
          type: 'Measure' as const,
          detail: property.unit ?? property.form,
          // "Derived" when every segment is server-computed; a qualifier
          // when the name is shared with an untouched source property —
          // see "SOURCE PROPERTY COLLISION": the source segments are never
          // removed, so both can coexist under one logical name.
          badge:
            derivedCount === 0
              ? undefined
              : derivedCount === segmentsForName.length
                ? 'Derived'
                : 'Source + Derived',
        }
      }),
      ...[...new Set(textProperties.map((property) => property.name))].map(
        (name) => ({ key: `Text:${name}`, name, type: 'Text' as const }),
      ),
      ...[...new Set(imageProperties.map((property) => property.name))].map(
        (name) => ({ key: `Image:${name}`, name, type: 'Image' as const }),
      ),
    ],
    [
      imageProperties,
      logicalMeasureProperties,
      measureProperties,
      textProperties,
    ],
  )
  useEffect(() => {
    setSelectedPropertyKeys((current) =>
      reconcileSelection(
        current,
        logicalProperties.map((property) => property.key),
        current.size > 0 ? logicalProperties[0]?.key : undefined,
      ),
    )
  }, [logicalProperties])
  const selectedMeasureNames = useMemo(
    () =>
      new Set(
        [...selectedPropertyKeys]
          .filter((key) => key.startsWith('Measure:'))
          .map((key) => key.slice('Measure:'.length)),
      ),
    [selectedPropertyKeys],
  )
  const selectedTextNames = useMemo(
    () =>
      new Set(
        [...selectedPropertyKeys]
          .filter((key) => key.startsWith('Text:'))
          .map((key) => key.slice('Text:'.length)),
      ),
    [selectedPropertyKeys],
  )
  const selectedImageNames = useMemo(
    () =>
      new Set(
        [...selectedPropertyKeys]
          .filter((key) => key.startsWith('Image:'))
          .map((key) => key.slice('Image:'.length)),
      ),
    [selectedPropertyKeys],
  )

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
        createPropertyComparisonSeries(selectedFeature, selectedMeasureNames),
      ),
    [selectedFeature, selectedMeasureNames],
  )
  const selectedTextProperties = useMemo(
    () =>
      [...selectedTextNames].map((name) => ({
        name,
        segments: textProperties.filter((property) => property.name === name),
      })),
    [selectedTextNames, textProperties],
  )
  const selectedImageProperties = useMemo(
    () =>
      [...selectedImageNames].map((name) => ({
        name,
        segments: imageProperties.filter((property) => property.name === name),
      })),
    [imageProperties, selectedImageNames],
  )
  const groups = useMemo(
    () =>
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
        : propertyGroups,
    [featureProperty, featureSeries, mode, propertyGroups],
  )

  const chartEntries = useMemo(
    () => [
      ...groups.map((group) => ({
        key: `measure:${group.key}`,
        propertyKeys: group.series.map(
          (series) => `Measure:${series.propertyName}`,
        ),
        group,
      })),
      ...selectedTextProperties.map(({ name, segments }) => ({
        key: `text:${name}`,
        propertyKeys: [`Text:${name}`],
        kind: 'text' as const,
        name,
        segments,
      })),
      ...selectedImageProperties.map(({ name, segments }) => ({
        key: `image:${name}`,
        propertyKeys: [`Image:${name}`],
        kind: 'image' as const,
        name,
        segments,
      })),
    ],
    [groups, selectedImageProperties, selectedTextProperties],
  )

  useEffect(() => {
    if (!pendingNavigationKey) return
    const entry = chartEntries.find((item) =>
      item.propertyKeys.includes(pendingNavigationKey),
    )
    const element = entry ? chartElementsRef.current.get(entry.key) : undefined
    if (element && typeof element.scrollIntoView === 'function')
      element.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setPendingNavigationKey(undefined)
  }, [chartEntries, pendingNavigationKey])

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
      : logicalProperties.length === 0
        ? 'No supported temporal properties are available for this Feature.'
        : selectedPropertyKeys.size === 0
          ? 'Select at least one temporal property.'
          : undefined

  return (
    <section
      aria-hidden={collapsed}
      aria-label="Temporal Properties"
      className="temporal-panel temporal-comparison-panel"
      inert={collapsed}
    >
      <header className="temporal-panel-heading">
        <div>
          <h2>Temporal Properties</h2>
          <span>Measure, Text, and Image comparison</span>
        </div>
        <div className="temporal-panel-heading-actions">
          <span>{features.length} features</span>
          <button
            className="compute-trigger"
            onClick={() => setComputeOpen(true)}
            type="button"
          >
            <Icon name="plus" size={13} />
            Compute
          </button>
        </div>
      </header>
      {computeOpen ? (
        <ComputeTemporalPropertyDialog
          feature={selectedFeature}
          onClose={() => setComputeOpen(false)}
          onComputed={(key) => {
            // Automatically select the (possibly newly created) derived
            // property and scroll its graph into view — the existing
            // navigation mechanism already used for checklist clicks.
            setMode('properties')
            setSelectedPropertyKeys((current) => new Set(current).add(key))
            setPendingNavigationKey(key)
          }}
        />
      ) : null}
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
              onClick={() => {
                setMode('features')
              }}
              type="button"
            >
              Feature Comparison
            </button>
            <button
              aria-pressed={mode === 'properties'}
              onClick={() => {
                setMode('properties')
              }}
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
                {logicalProperties.map((property) => (
                  <label key={property.key} title={property.name}>
                    <input
                      checked={selectedPropertyKeys.has(property.key)}
                      onChange={(event) => {
                        if (event.target.checked)
                          setPendingNavigationKey(property.key)
                        setSelectedPropertyKeys((current) =>
                          toggle(current, property.key, event.target.checked),
                        )
                      }}
                      type="checkbox"
                    />
                    <span>
                      {property.name}
                      {property.type === 'Measure' && property.detail
                        ? ` (${property.detail})`
                        : ''}
                      {` · ${property.type}`}
                    </span>
                    {property.type === 'Measure' && property.badge ? (
                      <span className="derived-badge">{property.badge}</span>
                    ) : null}
                  </label>
                ))}
              </fieldset>
            </>
          )}
        </aside>
        <div
          className={`comparison-charts ${chartEntries.length > 1 ? 'comparison-charts-multiple' : ''}`}
        >
          {emptyMessage ? (
            <p className="compact-empty">{emptyMessage}</p>
          ) : (
            <>
              {chartEntries.map((entry) => (
                <div
                  className={`comparison-chart-viewport ${
                    'kind' in entry && entry.kind === 'image'
                      ? 'comparison-chart-viewport-image'
                      : ''
                  }`}
                  key={entry.key}
                  ref={(element) => {
                    if (element)
                      chartElementsRef.current.set(entry.key, element)
                    else chartElementsRef.current.delete(entry.key)
                  }}
                >
                  {'group' in entry ? (
                    <MeasureComparisonChart group={entry.group} />
                  ) : entry.kind === 'image' ? (
                    <ImagePropertyTimeline
                      featureId={selectedFeature.id}
                      propertyName={entry.name}
                      properties={entry.segments}
                    />
                  ) : (
                    <TextPropertyChart
                      featureId={selectedFeature.id}
                      propertyName={entry.name}
                      properties={entry.segments}
                    />
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
