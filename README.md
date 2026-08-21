# MF-JSON Visualizer

A React and TypeScript application for visualizing OGC Moving Features JSON
across synchronized spatial and temporal views.

## Development

Requires Node.js 22 or newer.

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run lint
npm run test
npm run build
npm run test:e2e
```

The Playwright command requires its Chromium browser to be installed with
`npx playwright install chromium`.

## Architecture

Raw MF-JSON will flow through validation and normalization before it reaches
visualization adapters. The normalized domain in `src/mfjson` remains
independent from Cesium and ECharts; those integrations belong under
`src/visualization`. React components consume application-ready models and a
single shared time store rather than parsing source documents.

This initial phase establishes the toolchain and module boundaries only.
MF-JSON parsing, visualization adapters, and timeline behavior will be added in
later focused tasks.
