# Polish entity topology OModel cards

Generated at: `2026-07-07 14:57 +0800`

Branch: `codex/opentopox-experiment`

Commit: `created by this commit`

Patch file: `patches/0001-Polish-entity-topology-omodel-cards.patch`

## Commit Message

```text
Polish entity topology OModel cards
```

## Summary

- Updated the Topology Explorer `实体拓扑视图` to render entity nodes with OModel-style cards.
- Added larger OModel card dimensions so node title, domain, kind, and label text are not clipped when zoomed in.
- Added node dragging for the embedded entity topology view while keeping blank-canvas panning behavior.
- Kept node link paths synchronized with dragged node positions.
- Added an OModel-card-specific spread layout so enlarged cards do not overlap in normal mode.
- Kept the original Entity Explorer CMS topology card style unchanged.

## Changed Files

| Status | File |
| --- | --- |
| M | `src/features/entity/EntityExplorerPage.tsx` |
| M | `src/features/entity/entity.css` |
| M | `src/features/topology/TopologyExplorerPage.tsx` |

## Verification

```text
pnpm build
git diff --check
```

Browser verification on `http://127.0.0.1:5181/`:

- `拓扑探索 / 实体拓扑视图` uses OModel-style cards.
- Node dragging updates the node and connected link positions.
- At `451%` zoom, card text is no longer clipped.
- Scanned 90 nodes and found no title/domain/tag clipping.
- At `333%` zoom, scanned 90 nodes and found `0` card overlaps.
- Browser application console reported no errors.
