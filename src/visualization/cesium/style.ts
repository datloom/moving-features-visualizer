import { Color } from 'cesium'

/** Semantic focal color reserved for geometry evaluated at currentTime. */
export const CURRENT_OBJECT_COLOR = Color.fromCssColorString('#ef4444')

const FEATURE_COLOR = Color.fromCssColorString('#35d4c7')
const SELECTED_FEATURE_COLOR = Color.fromCssColorString('#f3b85b')

/** Historical geometry retains feature identity; selection changes emphasis. */
export const featureColor = (selected: boolean): Color =>
  selected ? SELECTED_FEATURE_COLOR : FEATURE_COLOR
