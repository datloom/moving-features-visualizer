# MF-JSON Visualizer — Development Instructions

## 1. Project Overview

This project is a web application for visualizing **OGC Moving Features JSON (MF-JSON)**.

The application visualizes both:

- spatial movement over time
- temporal properties associated with moving objects

Typical moving objects include:

- people
- vehicles
- ships
- aircraft
- robots
- IoT devices
- mobile sensors

The application should allow users to explore:

```text
WHERE
Spatial position

WHEN
Time

WHAT
Temporal properties
```

Examples of temporal properties:

- speed
- acceleration
- temperature
- status
- sensor values
- categorical state

The core objective is to build a reusable **spatiotemporal visualization platform**, not merely a trajectory viewer.

---

# 2. Primary Technology Stack

Use the following stack unless there is a strong technical reason not to.

## Frontend

- React
- TypeScript
- Vite

## Spatial Visualization

- CesiumJS

## Temporal Visualization

- Apache ECharts

## State Management

- Zustand

## Validation

Preferred:

- Zod

or:

- JSON Schema
- Ajv

## Testing

- Vitest
- React Testing Library
- Playwright

## Code Quality

- ESLint
- Prettier

Do not introduce additional major frameworks without justification.

---

# 3. Architecture

The application must follow this architecture.

```text
MF-JSON
   │
   ▼
Validator
   │
   ▼
Parser
   │
   ▼
Normalizer
   │
   ▼
Normalized MovingFeature Model
   │
   ├───────────────┐
   │               │
   ▼               ▼
Cesium Adapter   ECharts Adapter
   │               │
   ▼               ▼
Map View       Temporal Charts
        │
        ▼
   Time Controller
```

The most important architectural principle is:

> MF-JSON parsing, visualization libraries, and React UI must remain separated.

---

# 4. Architecture Rules

## Rule 1 — Never parse MF-JSON inside React components

Bad:

```typescript
const speed =
  data.temporalProperties[0].speed.values;
```

Good:

```typescript
const speed =
  feature.getTemporalProperty("speed");
```

Raw MF-JSON must first pass through:

```text
validation
→ parsing
→ normalization
```

---

## Rule 2 — The domain model must not depend on Cesium

Do not store objects such as:

```typescript
Cesium.Cartesian3
Cesium.JulianDate
Cesium.SampledPositionProperty
```

inside the application domain model.

Use plain application types.

Example:

```typescript
interface PositionSample {
  time: number;
  longitude: number;
  latitude: number;
  height?: number;
}
```

Convert to Cesium objects only inside the Cesium adapter.

---

## Rule 3 — The domain model must not depend on ECharts

Do not store:

```typescript
EChartsOption
SeriesOption
```

inside MF-JSON parser or model code.

Chart options are generated only inside visualization adapters or chart renderers.

---

## Rule 4 — Use one global application time

Cesium, charts, property panels, and timeline controls must share one logical time.

```text
currentTime
     │
 ┌───┼─────────────┐
 ▼   ▼             ▼
Map Chart     Property Panel
```

Do not maintain independent time states for each component.

---

## Rule 5 — Do not synchronize geometry and properties by array index

The following assumption is invalid:

```text
temporalGeometry[5]
=
temporalProperties[5]
```

Temporal geometry and temporal properties can have different sampling timestamps.

Always resolve values using timestamps.

Correct concept:

```text
currentTime
   │
   ├─ lookup/interpolate geometry
   │
   └─ lookup/interpolate temporal property
```

---

## Rule 6 — Preserve interpolation semantics

Geometry interpolation and temporal property interpolation are not identical concepts.

Support the MF-JSON interpolation metadata.

Initial implementation should support:

### Geometry

- Linear

### Measure property

- Discrete
- Step
- Linear

### Text property

- Discrete
- Step

Design interfaces so additional interpolation strategies can be added later.

---

# 5. MF-JSON Input

The application should initially support:

```text
Feature
FeatureCollection
```

The primary geometry type for Phase 1 is:

```text
MovingPoint
```

The implementation should be designed so future geometry types can be added:

```text
MovingLineString
MovingPolygon
```

Do not tightly couple the complete application to `MovingPoint`.

---

# 6. MF-JSON Compatibility

Different generations of MF-JSON examples may contain slightly different structures.

For example, input data may use:

```json
{
  "type": "Feature"
}
```

while older data may contain structures such as:

```json
{
  "type": "MovingFeature"
}
```

Do not scatter compatibility checks throughout the application.

Create an adapter/normalization layer.

Example:

```text
Raw Input
   │
   ▼
MFJsonParser
   │
   ▼
MFJsonNormalizer
   │
   ▼
NormalizedMovingFeature
```

Compatibility handling must remain inside the MF-JSON core module.

---

# 7. Recommended Domain Model

Use plain TypeScript models.

Example:

```typescript
export interface MovingFeature {
  id: string;

  staticProperties: Record<string, unknown>;

  geometry: TemporalGeometry;

  temporalProperties: TemporalProperty[];
}

export interface TemporalGeometry {
  type: "MovingPoint";

  samples: PositionSample[];

  interpolation: GeometryInterpolation;
}

export interface PositionSample {
  time: number;

  longitude: number;

  latitude: number;

  height?: number;
}

export type GeometryInterpolation =
  | "Linear";

export interface TemporalProperty {
  name: string;

  type: TemporalPropertyType;

  unit?: string;

  interpolation: PropertyInterpolation;

  samples: TemporalPropertySample[];
}

export type TemporalPropertyType =
  | "Measure"
  | "Text"
  | "Image";

export type PropertyInterpolation =
  | "Discrete"
  | "Step"
  | "Linear"
  | "Regression";

export interface TemporalPropertySample {
  time: number;

  value:
    | number
    | string
    | boolean
    | null;
}
```

These types may evolve, but their responsibilities must remain library-independent.

---

# 8. Source Directory Structure

Use approximately the following structure.

```text
src/
│
├── components/
│   │
│   ├── map/
│   │   ├── CesiumViewer.tsx
│   │   ├── MovingFeatureEntity.tsx
│   │   └── TrajectoryRenderer.ts
│   │
│   ├── chart/
│   │   ├── TemporalChart.tsx
│   │   ├── MeasureChart.tsx
│   │   └── StateTimeline.tsx
│   │
│   ├── timeline/
│   │   ├── Timeline.tsx
│   │   ├── PlayerControls.tsx
│   │   └── PlaybackSpeed.tsx
│   │
│   └── feature/
│       ├── FeatureList.tsx
│       └── FeatureInfo.tsx
│
├── mfjson/
│   ├── parser.ts
│   ├── validator.ts
│   ├── normalizer.ts
│   ├── interpolation.ts
│   └── types.ts
│
├── visualization/
│   │
│   ├── cesium/
│   │   ├── CesiumAdapter.ts
│   │   └── positionConverter.ts
│   │
│   └── chart/
│       ├── EChartsAdapter.ts
│       └── PropertyRenderer.ts
│
├── store/
│   ├── timeStore.ts
│   ├── featureStore.ts
│   └── visualizationStore.ts
│
├── services/
│   ├── FileDataSource.ts
│   └── HttpDataSource.ts
│
├── utils/
│   ├── time.ts
│   └── coordinate.ts
│
├── App.tsx
└── main.tsx
```

This structure may be refined when necessary.

Avoid putting unrelated logic into large generic utility files.

---

# 9. Time Store

The application time state is central to the system.

Implement approximately:

```typescript
interface TimeState {
  startTime: number;

  endTime: number;

  currentTime: number;

  playing: boolean;

  playbackRate: number;

  setCurrentTime(time: number): void;

  setRange(
    startTime: number,
    endTime: number
  ): void;

  setPlaybackRate(rate: number): void;

  play(): void;

  pause(): void;
}
```

The Time Store must be usable without Cesium.

Cesium may subscribe to this state.

Charts may subscribe to this state.

---

# 10. Cesium Requirements

Convert normalized `MovingPoint` samples to a Cesium representation through an adapter.

Use:

```text
SampledPositionProperty
```

for time-based positions.

Use:

```text
PathGraphics
```

or equivalent Entity properties to show trajectories.

Do not construct Cesium entities inside the MF-JSON parser.

Initial map features:

- show trajectory
- show current moving object
- animate object over time
- allow feature selection
- zoom to loaded features

Future compatibility should allow:

- billboard
- point
- 3D model
- camera tracking
- property-driven styling

---

# 11. Temporal Property Visualization

Implement property visualization according to property type.

## Measure

Examples:

```text
speed
temperature
acceleration
```

Recommended renderer:

```text
line chart
scatter chart
step line
```

depending on interpolation.

---

## Text

Examples:

```text
STOPPED
MOVING
IDLE
ERROR
```

Render as a categorical state timeline.

Do not convert text states into artificial numeric line charts.

---

## Image

Not required for MVP.

However, architecture must allow a future image timeline renderer.

---

# 12. Property Renderer Architecture

Use strategy/factory style architecture.

Example:

```typescript
interface PropertyRenderer {
  supports(
    property: TemporalProperty
  ): boolean;

  createOption(
    property: TemporalProperty
  ): unknown;
}
```

Possible implementations:

```text
MeasurePropertyRenderer

TextPropertyRenderer

ImagePropertyRenderer
```

Do not implement all property rendering in one large conditional component.

---

# 13. Input Sources

Phase 1 must support:

```text
local JSON file

HTTP URL/API
```

Create a data source abstraction.

Example:

```typescript
interface MovingFeatureDataSource {
  load(): Promise<unknown>;
}
```

Implement:

```text
FileDataSource

HttpDataSource
```

This architecture should eventually allow:

```text
OGC API - Moving Features
streaming source
paginated source
```

---

# 14. Error Handling

Validation errors must provide useful information.

Bad:

```text
Invalid JSON
```

Preferred:

```text
MF-JSON Validation Error

Feature:
vehicle-001

Path:
temporalGeometry.coordinates

Problem:
coordinates count does not match datetimes count.

datetimes:
125

coordinates:
124
```

Errors should provide, when possible:

- feature ID
- JSON path
- error code
- human-readable message
- expected value
- actual value

---

# 15. Performance Rules

Do not repeatedly parse MF-JSON during animation.

Wrong:

```text
animation frame
→ parse JSON
→ create normalized model
→ render
```

Correct:

```text
load

→ validate

→ parse

→ normalize

→ cache

→ render many times
```

During animation, only application state such as `currentTime` should normally change.

Avoid creating a new complete trajectory object every animation frame.

---

# 16. React Performance

Do not use React state for every Cesium rendering detail.

Cesium is an imperative rendering engine.

React should manage:

- application state
- UI
- feature selection
- time controls
- configuration

Cesium should manage:

- entities
- visual primitives
- camera
- scene updates

Avoid rebuilding the Cesium Viewer on React re-render.

---

# 17. Test Requirements

MF-JSON parser and normalizer are critical and require unit tests.

Minimum test cases:

```text
valid MovingPoint

invalid JSON

missing temporalGeometry

2D coordinate

3D coordinate

invalid datetime

unordered datetime

different coordinate/datetime lengths

empty temporalProperties

Measure property

Text property

missing interpolation

Linear interpolation

Step interpolation

multiple properties

multiple temporal property groups

FeatureCollection
```

Tests must verify behavior, not implementation details.

---

# 18. Phase 1 Scope

Implement:

- React + TypeScript + Vite application
- Cesium initialization
- ECharts initialization
- MF-JSON validator
- MF-JSON parser
- MF-JSON normalizer
- Feature input
- FeatureCollection input
- MovingPoint
- 2D coordinate
- 3D coordinate
- Linear geometry interpolation
- Measure temporal property
- Text temporal property
- trajectory visualization
- moving object visualization
- Play
- Pause
- seek
- playback rate
- map/chart time synchronization
- feature selection
- basic validation errors

Do not implement unless required by foundational architecture:

- MovingPolygon
- MovingLineString
- streaming
- WebSocket
- large-scale GPU optimization
- deck.gl
- authentication
- database
- backend service
- advanced styling editor

---

# 19. Definition of Done

Phase 1 is considered complete when the following scenario works.

Given an MF-JSON object containing:

```text
Vehicle A

1000 position samples

speed

temperature

status
```

the user can:

1. load the MF-JSON file
2. see the vehicle trajectory
3. see the current vehicle position
4. press Play
5. see the vehicle move
6. inspect speed on a chart
7. inspect temperature on a chart
8. inspect status over time
9. seek to a different time
10. see map and charts immediately synchronize
11. select a moving feature
12. see useful validation errors for invalid input

---

# 20. Coding Style

Prefer:

- small modules
- explicit types
- pure functions for parsing
- immutable normalized input data
- interfaces around external libraries
- meaningful names

Avoid:

- `any`
- giant React components
- global mutable objects
- parsing inside rendering components
- duplicated date conversion logic
- duplicated interpolation logic
- hardcoded property names such as `"speed"`
- tightly coupled Cesium/MF-JSON code

When `unknown` input enters the application, validate and narrow it before use.

---

# 21. Git Workflow

Use small commits.

Recommended commit examples:

```text
feat: initialize React and Cesium application

feat: add MF-JSON domain types

feat: implement MovingPoint parser

feat: add MF-JSON validation

feat: add normalized temporal properties

feat: render MovingPoint in Cesium

feat: add application time store

feat: synchronize Cesium with time store

feat: add temporal measure chart

feat: add text state timeline

test: add MovingPoint parser tests
```

Avoid combining unrelated changes in a single commit.

---

# 22. Development Priority

When choosing between UI polish and architecture correctness, prioritize:

```text
1. correct MF-JSON interpretation

2. normalized data model

3. time synchronization

4. testability

5. visualization correctness

6. performance

7. UI polish
```

The first implementation should be simple, readable, and extensible rather than visually elaborate.