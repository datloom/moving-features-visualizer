import { create } from 'zustand'

import type { ImageTemporalProperty } from '../mfjson/types'
import {
  clampViewerPosition,
  clampViewerSize,
  IMAGE_VIEWER_DEFAULT_HEIGHT,
  IMAGE_VIEWER_DEFAULT_WIDTH,
  type Viewport,
  type ViewerPosition,
  type ViewerSize,
} from '../services/imageViewerGeometry'

export type ImageViewerPositionMode = 'anchored' | 'manual'

/**
 * UI-only presentation state for the floating current-image viewer — which
 * Image TemporalProperty it's showing, and its window geometry. Deliberately
 * separate from TimeStore (not domain/temporal state) and rendered from a
 * workspace-level component so it stays visible even while the Temporal
 * Properties panel that opened it is collapsed.
 */
export interface ImageViewerState {
  readonly propertyName: string | undefined
  readonly properties: readonly ImageTemporalProperty[]
  /**
   * 'anchored' (the default): position is derived live from the Selected
   * Feature panel's actual rendered bounds, recomputed as that panel resizes
   * — see FloatingImageViewer. 'manual': the user has dragged the viewer, so
   * `manualPosition` is authoritative and Selected Feature resizing must
   * never move it again.
   */
  readonly positionMode: ImageViewerPositionMode
  /** Only meaningful once positionMode is 'manual'. */
  readonly manualPosition: ViewerPosition | undefined
  readonly size: ViewerSize
}

export interface ImageViewerActions {
  /** Opens (or retargets) the single shared viewer onto this property's live current image. */
  open: (
    propertyName: string,
    properties: readonly ImageTemporalProperty[],
  ) => void
  /** Closes the viewer only if it's currently showing `propertyName` — avoids one property's unmount/change closing another's open viewer. */
  closeIfShowing: (propertyName: string) => void
  close: () => void
  /** Records a user drag — switches positionMode to 'manual' from then on. */
  setManualPosition: (position: ViewerPosition) => void
  setSize: (size: ViewerSize) => void
  /** Re-clamps the current geometry into a (possibly resized) viewport. Anchored positioning re-derives itself instead — this only matters for a manual position. */
  clampToViewport: (viewport: Viewport) => void
}

export const initialImageViewerState: ImageViewerState = {
  propertyName: undefined,
  properties: [],
  positionMode: 'anchored',
  manualPosition: undefined,
  size: {
    width: IMAGE_VIEWER_DEFAULT_WIDTH,
    height: IMAGE_VIEWER_DEFAULT_HEIGHT,
  },
}

export const useImageViewerStore = create<
  ImageViewerState & ImageViewerActions
>((set, get) => ({
  ...initialImageViewerState,
  open: (propertyName, properties) => set({ propertyName, properties }),
  closeIfShowing: (propertyName) => {
    if (get().propertyName === propertyName) {
      set({ propertyName: undefined, properties: [] })
    }
  },
  close: () => set({ propertyName: undefined, properties: [] }),
  setManualPosition: (position) =>
    set({ positionMode: 'manual', manualPosition: position }),
  setSize: (size) => set({ size }),
  clampToViewport: (viewport) => {
    const state = get()
    const size = clampViewerSize(state.size, viewport)
    const manualPosition = state.manualPosition
      ? clampViewerPosition(state.manualPosition, size, viewport)
      : undefined
    set({ size, manualPosition })
  },
}))
