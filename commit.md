# Add entity topology entry to topology explorer

Generated at: `2026-07-06 09:50 +0800`

Branch: `codex/opentopox-experiment`

Commit: `created by this commit`

Patch file: `patches/0001-Add-entity-topology-entry-to-topology-explorer.patch`

## Commit Message

```text
Add entity topology entry to topology explorer
```

## Summary

- Exported the Entity Explorer topology view so it can be reused inside Topology Explorer.
- Added a new `实体拓扑视图` entry under Topology Explorer `布局算法 / 聚类`.
- Kept the default Topology Explorer canvas unchanged, and switched back to the original canvas when selecting `力导向` or `聚类`.
- Added `常规 / 可用区分组` switching inside the reused entity topology canvas.
- Added region and availability-zone grouped frames, draggable panning, wheel zoom, reset viewport, and a close button for the topology detail table.
- Polished the embedded topology entry and canvas styles so the reused view fits the Topology Explorer page.

## Changed Files

| Status | File |
| --- | --- |
| M | `src/features/entity/EntityExplorerPage.tsx` |
| M | `src/features/entity/entity.css` |
| M | `src/features/topology/TopologyExplorerPage.tsx` |
| M | `src/features/topology/topology.css` |

## Verification

```text
pnpm build
git diff --check
```

Browser verification already completed on `http://127.0.0.1:5181/`:

- Topology Explorer shows the new `实体拓扑视图` entry below `聚类`.
- Clicking `实体拓扑视图` opens the reused Entity Explorer topology view.
- Default embedded topology stays in `常规` mode.
- Clicking `可用区分组` shows region and availability-zone frames.
- Clicking `聚类` returns to the original Topology Explorer canvas.
- Browser application console reported no app errors.
