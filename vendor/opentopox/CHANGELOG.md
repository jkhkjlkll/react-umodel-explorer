# Changelog

## Unreleased

- Added Agent Bridge context helpers for visible topology extraction, selected graph context, redaction, Markdown serialization, and clipboard copy.
- Agent Bridge interactive selection is opt-in via `config.enableSelection`; default graph interactions keep the existing single-select behavior.
- Added graph selection APIs for node/edge multi-select, area selection mode, area edge hit testing, visible-range select, visible-range invert, criteria-based selection, and selection change events.
- Added Agentic Topology Observability primitives for lightweight Agent activity events, event-to-topology patches, and readonly AI Chat topology blocks.

## 0.1.0

- Added the standalone DOM/SVG topology framework entry at `src/framework/index.js`.
- Added realtime topology protocol helpers, data adapter, graph store, update scheduler, and viewport-preserving patch runtime.
- Added keyed DOM rendering, local edge updates, automatic performance mode, worker-backed large graph layout, light structure patches, and an optional realtime debug panel.
- Added TypeScript declaration entry at `src/framework/index.d.ts`.
- Added package build output generation via `npm run build`.
