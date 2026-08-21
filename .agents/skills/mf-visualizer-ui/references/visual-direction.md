# Moving Features Visualizer - Visual Direction

## 1. Product Character

The product should feel like a precise geospatial analysis instrument: calm, technical, focused, and modern.

Reference qualities:

- professional GIS/mission-control workspace
- modern scientific visualization software
- restrained developer-tool density
- polished mapping application

Do not imitate consumer finance dashboards, marketing landing pages, or generic admin templates.

## 2. Information Hierarchy

Primary: Cesium map and selected/current moving feature.

Secondary: current time, trajectory context, playback status.

Tertiary: temporal-property charts and feature metadata.

Utility: dataset controls, filters, settings, export, help.

## 3. Surface Strategy

Use 3-4 surface levels at most:

1. application background
2. primary workspace surface
3. elevated panel/overlay
4. interactive hover/selected state

Prefer 1px subtle borders and modest shadows. Avoid large glowing shadows.

## 4. Spacing

Use a consistent 4px-based spacing system.

Typical values:

- compact gap: 4-6px
- control gap: 8px
- group gap: 12px
- panel padding: 12-16px
- major region separation: 16-24px

Avoid 24-32px padding inside every analytical panel; this wastes visualization area.

## 5. Typography

Use a modern sans-serif system/font already available to the project.

Recommended hierarchy:

- page/product title: 18-20px, semibold
- panel title: 13-15px, semibold
- body/control: 12-14px
- metadata: 11-12px
- timestamps/numeric values: use tabular numerals when supported

Avoid giant headings.

## 6. Map Overlay Pattern

Map overlay controls should typically be 32-40px controls with clear iconography.

Group related actions, for example:

```text
[ Locate ]
[ Track  ]
[ Layers ]

[ 2D/3D ]
```

Do not scatter unrelated floating buttons around every corner.

## 7. Feature Explorer

Feature rows should emphasize:

- feature identity/name
- current/last known status when available
- selected state
- optional compact secondary metric

Avoid large cards per feature. Prefer a compact searchable list.

## 8. Temporal Property Panel

Support a compact header with:

- property name
- current value
- unit
- chart type/interpolation cue if useful

Charts should use the available width efficiently and share a consistent time scale.

## 9. Timeline

The timeline should read as a transport/navigation surface, not as a form.

Recommended structure:

```text
[|<] [Play/Pause] [>|]   2026-08-21 10:15:32   [1x v]
-------------------------------------------------------
10:00                 current                 11:00
```

Keep the current-time control easy to find at all times.

## 10. States

Design explicitly for:

- no dataset loaded
- loading/parsing
- invalid MF-JSON
- dataset loaded / no feature selected
- feature selected
- playing
- paused
- end of timeline
- empty temporal property

Do not rely on raw browser alerts for normal application states.
