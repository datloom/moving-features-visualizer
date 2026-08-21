# Moving Features Visualizer - AGENTS.md

## 1. Project Overview

This project is a web application for visualizing OGC Moving Features JSON (MF-JSON).

The application combines:

- temporal geometry
- moving objects and trajectories
- temporal properties such as speed, temperature, and status
- a shared application timeline
- synchronized spatial and temporal visualization

Primary stack:

- React
- TypeScript
- Vite
- CesiumJS
- Apache ECharts
- Zustand
- Zod
- Vitest
- Playwright
- ESLint
- Prettier

The product should become a reusable spatiotemporal visualization platform, not merely a trajectory viewer.

## 2. Core Architecture

Preserve this separation:

```text
Raw MF-JSON
    |
    v
Validator
    |
    v
Parser / Normalizer
    |
    v
Normalized MovingFeature Model
    |
    +------------------+
    |                  |
    v                  v
Cesium Adapter     ECharts Adapter
    |                  |
    v                  v
Spatial View       Temporal View
        \            /
         \          /
          Time Store
```

### Non-negotiable architecture rules

1. Never parse raw MF-JSON inside React components.
2. Do not import Cesium from `src/mfjson/*`.
3. Do not import ECharts from `src/mfjson/*`.
4. Do not use Cesium types as the application domain model.
5. Do not synchronize geometry and temporal properties by array index.
6. Resolve geometry and temporal-property values by timestamp.
7. Use one shared application time source.
8. Do not recreate the Cesium Viewer for normal state updates.
9. Do not rebuild chart data merely to move a current-time indicator.
10. Avoid `any`; validate `unknown` input before use.

## 3. Domain Model Expectations

The normalized model must remain visualization-library independent.

At minimum support:

- MovingFeature
- TemporalGeometry
- MovingPoint
- PositionSample
- TemporalProperty
- TemporalPropertySample

Use numeric application timestamps such as Unix epoch milliseconds internally.

Preserve interpolation metadata.

Initial geometry interpolation:

- Linear

Initial temporal-property support:

- Measure: Discrete, Step, Linear
- Text: Discrete, Step

Future-friendly design should allow additional geometry and property types.

## 4. Project Structure

Prefer approximately:

```text
src/
├── components/
│   ├── map/
│   ├── chart/
│   ├── timeline/
│   └── feature/
├── mfjson/
│   ├── parser.ts
│   ├── validator.ts
│   ├── normalizer.ts
│   ├── interpolation.ts
│   └── types.ts
├── visualization/
│   ├── cesium/
│   └── chart/
├── store/
├── services/
├── utils/
├── App.tsx
└── main.tsx
```

Keep modules small and explicit. Avoid giant generic utility files and giant React components.

## 5. Application Time

The application Time Store is the source of truth.

It should contain at least:

- startTime
- endTime
- currentTime
- playing
- playbackRate

All of the following must synchronize through this store:

- Cesium position
- trajectory time context
- ECharts current-time marker
- current temporal-property values
- timeline controls

Cesium Clock may be used as an adapter detail but must not become a competing source of truth.

## 6. UI/UX Skill Requirement

For Task 14 and any significant UI design, redesign, or polish work, use the repository skill:

```text
$mf-visualizer-ui
```

The skill should live at:

```text
.agents/skills/mf-visualizer-ui/
```

Read its `SKILL.md` and referenced design/QA documents before major UI changes.

If the OpenAI `Build Web Apps` plugin and `frontend-app-builder` skill are available, use `frontend-app-builder` for concept-first visual design and browser-fidelity workflow, while treating `$mf-visualizer-ui` as the project-specific constraints.

For significant React component work, apply React best practices when that skill is available.

## 7. UI Product Direction

This is a professional geospatial analysis application, not a generic SaaS dashboard.

The visual hierarchy must be:

1. Cesium map and current moving feature
2. current time and playback state
3. selected feature context
4. temporal-property charts
5. feature explorer and secondary tools

The map should occupy the majority of the useful desktop workspace.

Prefer a compact workspace layout:

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

## 8. UI Technology Direction

When suitable and already configured, prefer:

- Tailwind CSS for layout and design tokens
- shadcn/ui for conventional UI primitives
- Lucide for icons
- Motion only for restrained, meaningful transitions

Do not introduce another broad component framework without a clear reason.

Use shadcn primitives as building blocks, not as an excuse to turn every region into a card.

## 9. UI Design Rules

Prefer:

- restrained dark/dark-neutral technical theme
- strong typography hierarchy
- subtle borders
- compact controls
- consistent spacing
- semantic design tokens
- limited accent colors
- clear current/selected states
- readable overlays on top of map imagery

Avoid:

- generic admin dashboard templates
- card soup
- excessive rounded rectangles
- excessive badges/pills
- decorative purple/blue gradients
- glassmorphism everywhere
- oversized marketing headings
- emoji icons
- random component-specific colors
- unnecessary animation

## 10. Cesium UI Rules

The map is an analytical canvas.

Map overlays must:

- use minimal screen area
- remain readable over bright and dark basemaps
- use controlled background opacity
- expose accessible labels/tooltips for icon-only controls
- avoid covering selected moving features where practical

Keep DOM UI concerns separated from Cesium rendering concerns.

## 11. Temporal Visualization Rules

Charts must:

- share application currentTime
- show an obvious current-time indicator
- use consistent temporal formatting
- show units where appropriate
- distinguish current/selected values clearly
- preserve interpolation semantics
- render Text properties as categorical/state timelines, not arbitrary numeric lines

Charts should support spatial interpretation, not visually compete with the map.

## 12. Responsive Rules

Desktop is the primary workspace.

Desktop:

- keep map, feature explorer, temporal panel, and playback accessible together where practical
- allow panels to resize/collapse if implemented

Tablet/narrow:

- prioritize map + playback
- move feature explorer into a drawer/sheet if needed
- allow charts to use an expandable bottom region

Mobile:

- preserve basic map inspection, feature selection, and playback
- do not rely on hover
- maintain practical touch targets

## 13. Accessibility

- Use semantic HTML for DOM controls.
- Provide accessible names for icon-only buttons.
- Keep keyboard focus visible.
- Do not encode state using color alone.
- Maintain sufficient contrast.
- Respect reduced-motion preferences when practical.
- Keep important current values available as text as well as graphics.

## 14. Testing and Verification

MF-JSON core tests must run without Cesium.

Before completing a meaningful change, run relevant checks such as:

```bash
npm run lint
npm run test
npm run build
```

For UI tasks, also perform browser/visual verification when the environment supports it.

For Task 14 specifically, follow the `$mf-visualizer-ui` visual QA checklist.

Do not claim a check passed unless it was actually executed.

## 15. Task 14 Definition of Done

Task 14 is complete only when the initial application UI:

- presents Cesium as the dominant workspace
- provides a compact feature explorer
- integrates temporal-property visualization
- provides clear playback/timeline controls
- uses a consistent design-token system
- uses consistent iconography
- handles selected/no-selection/loading/error states relevant to the implemented scope
- behaves acceptably at desktop and narrow/tablet widths
- has no obvious clipping, overlap, contrast, spacing, or alignment defects
- preserves all architecture rules above
- passes lint/tests/build relevant to the project
- has been visually inspected and corrected

## 16. Git and Scope Discipline

Work only on the requested issue unless a prerequisite is genuinely required.

Use small focused commits.

For Task 14:

```text
Issue:
feat: create initial application UI

Branch:
feat/14-initial-ui
```

Do not opportunistically rewrite MF-JSON core logic while implementing UI.
