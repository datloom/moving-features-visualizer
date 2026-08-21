---
name: mf-visualizer-ui
description: Design, implement, review, or polish the UI/UX of the Moving Features Visualizer. Use for Task 14 and any work involving the Cesium map layout, feature explorer, temporal-property charts, timeline/playback controls, map overlays, responsive behavior, theming, visual hierarchy, accessibility, or UI styling. Enforce the project's geospatial-analytics design direction, shadcn/ui and Lucide conventions, map-first information hierarchy, coordinated map/chart interactions, restrained motion, and visual QA requirements.
---

# Moving Features Visualizer UI

Build the interface as a professional spatiotemporal geospatial analysis tool, not a generic SaaS admin dashboard.

## Workflow

For a new screen, major redesign, or Task 14:

1. Read the repository `AGENTS.md` before editing code.
2. Read `references/visual-direction.md` for the project design system.
3. Inspect the current app, existing components, `components.json`, Tailwind setup, and installed dependencies before adding UI libraries.
4. If the OpenAI `frontend-app-builder` skill is available, use it for concept-first design and browser-fidelity workflow. Treat this project skill as the domain-specific constraints layered on top of it.
5. Preserve the existing MF-JSON architecture. UI work must not move parsing, normalization, interpolation, or Cesium/ECharts adapter logic into presentational components.
6. Establish the complete visual hierarchy before coding substantial layout changes.
7. Implement with reusable components and design tokens.
8. Run the visual QA checklist in `references/task14-qa.md` after implementation.
9. Fix visible regressions before declaring the UI task complete.

## Primary Visual Hierarchy

Prioritize the interface in this order:

1. Cesium map and current moving feature
2. Current time and playback state
3. Selected feature context
4. Temporal-property charts
5. Feature explorer and secondary tools

Keep the map visually dominant. On a desktop primary screen, target roughly 60-75% of the useful content area for the map before expanded analysis panels are opened.

## Layout

Prefer a workspace layout rather than a page of cards:

```text
+-------------------------------------------------------------+
| Header / dataset / primary actions                          |
+-------------+-----------------------------------------------+
| Feature     |                                               |
| Explorer    |               Cesium Map                      |
|             |                                               |
|             |                                   Map tools   |
+-------------+-----------------------------------------------+
| Temporal property panel / charts                            |
+-------------------------------------------------------------+
| Playback controls + shared timeline                         |
+-------------------------------------------------------------+
```

Requirements:

- Keep the Cesium map visible during normal analysis workflows.
- Use resizable/collapsible side and bottom panels where they improve workspace efficiency.
- Avoid nesting every region inside a separate rounded card.
- Use separators, surfaces, and spacing to create structure before adding containers.
- Keep frequently used controls within one interaction of the visualization.
- Put rarely used settings in a sheet, popover, menu, or settings panel.

## Visual Direction

Use a restrained, contemporary technical aesthetic.

Prefer:

- dark or dark-neutral primary application theme
- strong contrast over the map
- subtle borders and surface elevation
- compact professional controls
- consistent spacing and typography
- limited accent colors with semantic meaning
- direct labels for analytical information
- high information density without clutter

Avoid:

- generic SaaS dashboard appearance
- "card soup"
- excessive rounded rectangles
- excessive pills and badges
- purple/blue gradients used only for decoration
- glassmorphism everywhere
- oversized hero-style typography
- decorative empty space that reduces map area
- emoji as application icons
- random per-component colors
- animation without interaction value

## Component System

Prefer existing project components first.

When shadcn/ui is configured, prefer its primitives for conventional UI:

- Button
- Tooltip
- Popover
- DropdownMenu
- Sheet
- Tabs
- Slider
- Toggle / ToggleGroup
- ScrollArea
- Separator
- Resizable
- Command when search/filter needs it

Do not use a shadcn component merely to make the screen look component-heavy. Compose primitives into application-specific controls.

Use Lucide icons for application iconography. Keep icon sizes and stroke treatment consistent.

Do not introduce another general-purpose UI component framework without explicit justification.

## Design Tokens

Use CSS variables or the project's Tailwind token layer. Do not hardcode unrelated colors across components.

At minimum, maintain semantic tokens for:

- background
- foreground
- surface
- elevated surface
- border
- muted text
- primary/action
- selected/highlight
- success
- warning
- destructive/error
- chart series colors
- map overlay background
- map overlay border

Charts and map overlays must consume the same token system as the rest of the application.

## Cesium Map UI

Treat the map as the main analytical canvas.

Map overlays must:

- use minimum necessary footprint
- remain legible over bright satellite imagery and dark basemaps
- use controlled opaque/translucent backgrounds rather than fragile text-on-map
- avoid covering selected features when practical
- support keyboard focus and tooltips for icon-only actions
- avoid permanent large legends when compact contextual legends can work

Do not recreate the Cesium Viewer to apply ordinary UI state changes.

Keep DOM UI and Cesium rendering responsibilities separate.

## Temporal Charts

Charts support the map rather than competing with it.

Requirements:

- use the shared application `currentTime`
- show a clearly visible current-time indicator
- align temporal formatting across charts and playback controls
- show units next to values or axes where appropriate
- prefer direct labels and concise legends
- distinguish selected/current values from historical context
- preserve MF-JSON interpolation meaning in the visual treatment
- do not convert categorical Text properties into arbitrary numeric lines

For multiple charts, prioritize synchronized inspection and shared time cursor behavior over decorative variety.

## Playback and Timeline

Playback controls are core navigation, not secondary form controls.

Provide clear states for:

- play
- pause
- seek
- current time
- start/end extent
- playback speed

Use familiar iconography and large enough hit targets.

The application Time Store remains the source of truth. Do not add a second timeline state inside the UI.

## Motion

Use motion sparingly for:

- opening/closing analysis panels
- changing selected feature context
- showing/hiding contextual controls
- lightweight state transitions

Do not animate constantly while Cesium objects are already moving.

Prefer short, subtle transitions. Respect `prefers-reduced-motion` where practical.

## Responsive Behavior

Desktop is the primary analytical workspace, but the application must not break at narrower widths.

For desktop:

- keep feature explorer, map, temporal panel, and playback controls available together where possible
- allow panel resizing/collapse

For tablet/narrow screens:

- prioritize map + playback
- move feature explorer to a sheet/drawer
- allow temporal charts to expand as a bottom panel

For mobile:

- preserve basic feature selection, map inspection, and playback
- avoid assuming hover
- maintain usable touch targets
- allow advanced analysis panels to be sequential rather than simultaneous

## Accessibility

- Use semantic HTML for DOM controls.
- Give icon-only buttons accessible labels and tooltips.
- Ensure visible keyboard focus.
- Do not encode state only by color.
- Maintain sufficient foreground/background contrast.
- Ensure chart status/current values have a textual representation where feasible.
- Support keyboard use for playback and primary panel controls.

## React and Performance Constraints

- Keep Cesium imperative rendering out of ordinary React render loops.
- Avoid rerendering large visualization surfaces on every minor UI state change.
- Do not recreate chart datasets only to move the current-time marker.
- Lazy-load heavy secondary surfaces when appropriate, but do not compromise core interaction latency.
- Prefer explicit small components over a giant `App.tsx`.

## Task 14 Completion Standard

Task 14 is not complete merely because the layout renders.

Before completion:

1. Verify desktop layout at a representative wide viewport.
2. Verify a narrow/tablet viewport.
3. Check map visibility and overlays.
4. Check temporal chart integration and current-time indicator.
5. Check playback controls and interaction states.
6. Check empty, loading, error, and selected-feature states relevant to the implemented UI.
7. Check keyboard focus and icon labels.
8. Check overflow, clipping, spacing, alignment, typography, and contrast.
9. Run lint, tests, and production build.
10. Report remaining visual limitations explicitly.

Use `references/task14-qa.md` as the final checklist.
