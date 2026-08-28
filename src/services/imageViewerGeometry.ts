/**
 * Pure geometry helpers for the floating Image viewer window — kept
 * dependency-free from React/DOM so drag/resize/clamp math stays testable
 * without a browser.
 */

export interface ViewerPosition {
  readonly x: number
  readonly y: number
}

export interface ViewerSize {
  readonly width: number
  readonly height: number
}

export interface Viewport {
  readonly width: number
  readonly height: number
}

export const IMAGE_VIEWER_MIN_WIDTH = 220
export const IMAGE_VIEWER_MIN_HEIGHT = 180
export const IMAGE_VIEWER_DEFAULT_WIDTH = 320
export const IMAGE_VIEWER_DEFAULT_HEIGHT = 260

/** A small inset from the viewport edge, and room to clear the app header. */
const DEFAULT_POSITION_MARGIN = 16
const DEFAULT_POSITION_TOP_OFFSET = 56

/** Clamps size between the usable minimum and the viewport itself. */
export const clampViewerSize = (
  size: ViewerSize,
  viewport: Viewport,
): ViewerSize => ({
  width: Math.min(
    Math.max(size.width, IMAGE_VIEWER_MIN_WIDTH),
    Math.max(IMAGE_VIEWER_MIN_WIDTH, viewport.width),
  ),
  height: Math.min(
    Math.max(size.height, IMAGE_VIEWER_MIN_HEIGHT),
    Math.max(IMAGE_VIEWER_MIN_HEIGHT, viewport.height),
  ),
})

/** Clamps position so the whole window stays inside the viewport (title bar always reachable). */
export const clampViewerPosition = (
  position: ViewerPosition,
  size: ViewerSize,
  viewport: Viewport,
): ViewerPosition => {
  const maxX = Math.max(0, viewport.width - size.width)
  const maxY = Math.max(0, viewport.height - size.height)
  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY),
  }
}

/** An unobtrusive default: near the top-right corner, clear of the app header. */
export const defaultViewerPosition = (
  size: ViewerSize,
  viewport: Viewport,
): ViewerPosition =>
  clampViewerPosition(
    {
      x: viewport.width - size.width - DEFAULT_POSITION_MARGIN,
      y: DEFAULT_POSITION_TOP_OFFSET,
    },
    size,
    viewport,
  )
