# Task 14 Visual QA Checklist

## Visual hierarchy
- [ ] Cesium remains the primary visual surface.
- [ ] Selected feature and current time are immediately understandable.
- [ ] Charts support rather than dominate the map.
- [ ] Secondary tools do not compete with primary actions.

## Layout
- [ ] No unnecessary card nesting.
- [ ] No accidental dead/empty space.
- [ ] Panels align cleanly.
- [ ] Map is not obscured by oversized overlays.
- [ ] Resizable/collapsible regions behave correctly if implemented.

## Typography
- [ ] Type hierarchy is consistent.
- [ ] Timestamps and numeric values are easy to scan.
- [ ] No oversized marketing-style headings.
- [ ] Labels do not truncate unexpectedly.

## Theme and color
- [ ] Design tokens are used consistently.
- [ ] No decorative random gradients.
- [ ] State is not represented by color alone.
- [ ] Map overlays remain readable over varied imagery.
- [ ] Chart colors remain distinguishable.

## Components
- [ ] shadcn primitives are used appropriately where configured.
- [ ] Lucide icons are used consistently.
- [ ] Icon-only actions have labels/tooltips.
- [ ] Touch/click targets are usable.

## Interaction
- [ ] Play/Pause state is obvious.
- [ ] Seek updates the shared application time.
- [ ] Chart time cursor stays synchronized.
- [ ] Feature selection is visible in list and map contexts.
- [ ] Hover-only interactions have non-hover alternatives where needed.

## Responsive
- [ ] Wide desktop tested.
- [ ] Narrow/tablet width tested.
- [ ] No horizontal overflow from primary layout.
- [ ] Feature explorer remains accessible on narrow widths.
- [ ] Timeline controls remain usable on narrow widths.

## Accessibility
- [ ] Keyboard focus is visible.
- [ ] Primary controls can be reached by keyboard.
- [ ] Icon controls have accessible names.
- [ ] Contrast is sufficient for text and controls.
- [ ] Reduced-motion preference is respected where animation is added.

## Data states
- [ ] Empty/no-data state is intentional.
- [ ] Loading state is intentional.
- [ ] Validation errors are readable and structured.
- [ ] No-feature-selected state is intentional.

## Engineering
- [ ] No MF-JSON parsing added to React UI components.
- [ ] No Cesium types added to the domain model.
- [ ] No duplicate timeline source of truth.
- [ ] Cesium Viewer is not recreated during normal UI updates.
- [ ] Charts are not rebuilt merely to move the time cursor.

## Verification
- [ ] lint passes.
- [ ] unit tests pass.
- [ ] production build passes.
- [ ] relevant E2E/smoke test passes if available.
- [ ] visual issues found during browser review were fixed or documented.
