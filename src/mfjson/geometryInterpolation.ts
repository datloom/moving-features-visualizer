import type { GeometryInterpolation } from './types'

export const GEOMETRY_INTERPOLATIONS = [
  'Discrete',
  'Step',
  'Linear',
  'Quadratic',
  'Cubic',
] as const satisfies readonly GeometryInterpolation[]

/** Normalizes the commonly used Stepwise spelling to the domain's Step mode. */
export const normalizeGeometryInterpolation = (
  value: unknown,
): GeometryInterpolation | undefined => {
  if (value === 'Stepwise') return 'Step'
  return GEOMETRY_INTERPOLATIONS.find(
    (interpolation) => interpolation === value,
  )
}
