import type {
  MeasureTemporalProperty,
  TemporalPropertySample,
  Timestamp,
} from './types'

export interface MeasureRegressionModel {
  readonly timeOrigin: Timestamp
  readonly centeredTimeMean: number
  readonly valueMean: number
  readonly slope: number
  readonly startTime: Timestamp
  readonly endTime: Timestamp
}

export const fitMeasureRegression = (
  samples: readonly TemporalPropertySample<number>[],
): MeasureRegressionModel => {
  if (samples.length < 2) {
    throw new RangeError('Regression requires at least two samples.')
  }
  const timeOrigin = samples[0]!.time
  let centeredTimeTotal = 0
  let valueTotal = 0
  for (const sample of samples) {
    centeredTimeTotal += sample.time - timeOrigin
    valueTotal += sample.value
  }
  const centeredTimeMean = centeredTimeTotal / samples.length
  const valueMean = valueTotal / samples.length
  let covariance = 0
  let timeVariance = 0
  for (const sample of samples) {
    const centeredTime = sample.time - timeOrigin - centeredTimeMean
    covariance += centeredTime * (sample.value - valueMean)
    timeVariance += centeredTime * centeredTime
  }
  if (!Number.isFinite(timeVariance) || timeVariance <= 0) {
    throw new RangeError('Regression requires distinct finite timestamps.')
  }
  const slope = covariance / timeVariance
  if (!Number.isFinite(slope)) {
    throw new RangeError('Regression model must be finite.')
  }
  return {
    timeOrigin,
    centeredTimeMean,
    valueMean,
    slope,
    startTime: samples[0]!.time,
    endTime: samples.at(-1)!.time,
  }
}

export const evaluateMeasureRegression = (
  model: MeasureRegressionModel,
  time: Timestamp,
): number | undefined => {
  if (time < model.startTime || time > model.endTime) return undefined
  return (
    model.valueMean +
    model.slope * (time - model.timeOrigin - model.centeredTimeMean)
  )
}

const regressionModels = new WeakMap<
  MeasureTemporalProperty,
  MeasureRegressionModel
>()

export const getMeasureRegressionModel = (
  property: MeasureTemporalProperty,
): MeasureRegressionModel => {
  const cached = regressionModels.get(property)
  if (cached) return cached
  const model = fitMeasureRegression(property.samples)
  regressionModels.set(property, model)
  return model
}
