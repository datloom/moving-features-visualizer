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

/** An unobtrusive fallback: near the top-right corner, clear of the app header — used only when no Selected Feature bounds are available to anchor to. */
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

/** Gap, in pixels, left between the Selected Feature panel and the anchored viewer below it. */
export const SELECTED_FEATURE_ANCHOR_GAP = 12

/**
 * The preferred initial/anchored position: directly below the Selected
 * Feature panel's *actual* rendered bounds (never a hard-coded offset), so a
 * taller server-loaded Selected Feature is respected automatically. Clamped
 * into the viewport like any other position — if there's genuinely no room
 * below, this still keeps the whole window reachable rather than pushing
 * most of it off-screen.
 */
export const anchoredViewerPosition = (
  anchorRect: { readonly left: number; readonly bottom: number },
  size: ViewerSize,
  viewport: Viewport,
): ViewerPosition =>
  clampViewerPosition(
    {
      x: anchorRect.left,
      y: anchorRect.bottom + SELECTED_FEATURE_ANCHOR_GAP,
    },
    size,
    viewport,
  )
