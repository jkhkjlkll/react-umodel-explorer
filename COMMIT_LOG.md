# Commit Log Since 2026-06-18

This file is for offline/internal AI review when the project is transferred as a ZIP archive. ZIP downloads do not include the `.git` directory, so this document records the recent commit history that would otherwise be unavailable.

Repository: `react-umodel-explorer`

Branch when generated: `codex/opentopox-experiment`

Generated at: `2026-07-01 17:15 +0800`

## Summary

There are 12 commits after `2026-06-18 00:00:00 +0800` on the current branch.

## Commits

### c442a72 - Fix OModel draft diff detection

- Full hash: `c442a728cb12a641c71bdff044e3ac8e191d4afe`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-30 17:01:42 +0800`
- Full patch: `patches/0001-Fix-OModel-draft-diff-detection.patch`

#### Changed Files

| Status | File |
| --- | --- |
| M | `src/features/umodel/model.ts` |

#### Change Notes For AI Review

- Fixed a false-positive dirty draft state on the OModel page.
- Ignored `undefined` object properties during stable diff serialization so server data and cloned draft data compare consistently.
- Prevented the OModel page from showing an unnecessary unsaved draft banner or enabling submit when no user-visible change exists.
- Verified the standalone UI after the fix with page-level browser smoke checks across OModel, Entity Explorer, Topology Explorer, Query, Imports, Settings, and API Debugger.

#### Diff Stat

```text
src/features/umodel/model.ts | 1 +
1 file changed, 1 insertion(+)
```

### 12f3abb - Add root workbench pages to standalone explorer

- Full hash: `12f3abb99791be673ff64d8eb24a69b2b7a004a2`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-26 15:58:48 +0800`
- Full patch: `patches/0001-Add-root-workbench-pages-to-standalone-explorer.patch`

#### Changed Files

| Status | File |
| --- | --- |
| A | `commit.md` |
| A | `patches/0001-Add-root-workbench-pages-to-standalone-explorer.patch` |
| M | `src/StandaloneExplorerApp.tsx` |
| M | `src/api/client.ts` |
| M | `src/api/mockClient.ts` |
| M | `src/api/types.ts` |
| A | `src/features/entityTopo/EntityTopoGraphView.tsx` |
| A | `src/features/entityTopo/EntityTopoPage.tsx` |
| A | `src/features/entityTopo/cosmosTopo/cosmosEngine.ts` |
| A | `src/features/entityTopo/cosmosTopo/cosmosLabels.tsx` |
| A | `src/features/entityTopo/cosmosTopo/cosmosTopoGraph.tsx` |
| A | `src/features/entityTopo/cosmosTopo/graphvizLayout.ts` |
| A | `src/features/entityTopo/cosmosTopo/topoVisualIdentity.ts` |
| A | `src/features/entityTopo/cosmosTopo/types.ts` |
| A | `src/features/entityTopo/entityTopo.css` |
| A | `src/features/entityTopo/entityTopoModel.ts` |
| A | `src/features/imports/ImportsPage.tsx` |
| A | `src/features/imports/imports.css` |
| A | `src/features/query/QueryPage.tsx` |
| A | `src/features/query/query.css` |
| A | `src/features/settings/ApiMapPage.tsx` |
| A | `src/features/settings/SettingsPage.tsx` |
| A | `src/features/settings/apiDebugger.css` |
| A | `src/features/settings/settings.css` |
| M | `src/i18n/locales/en-US/query.ts` |
| M | `src/i18n/locales/zh-CN/query.ts` |
| A | `src/lib/preloadMonaco.ts` |

#### Change Notes For AI Review

- Added the root project Query page to the standalone subproject and wired it into the sidebar as `查询`.
- Added the root project Imports page to the standalone subproject and wired it into the sidebar as `导入与写入`.
- Added the root project Workspace Settings page and API Debugger page to the standalone subproject sidebar.
- Preserved the existing `OModel 探索`, `实体探索`, and `拓扑探索` pages while adding the new entries.
- Expanded the standalone API client and mock client so imported root pages can run offline or against a real API base.
- Added Query i18n keys and Monaco preload support needed by the imported workbench pages.

#### Diff Stat

```text
commit.md                                          |    44 +
patches/0001-Add-root-workbench-pages-to-standalone-explorer.patch | 15955 +++++++++++++++++++
src/StandaloneExplorerApp.tsx                      |    40 +-
src/api/client.ts                                  |    17 +-
src/api/mockClient.ts                              |   450 +-
src/api/types.ts                                   |     9 +
src/features/entityTopo/EntityTopoGraphView.tsx    |   234 +
src/features/entityTopo/EntityTopoPage.tsx         |  1142 ++
src/features/entityTopo/cosmosTopo/cosmosEngine.ts |  3134 ++++
src/features/entityTopo/cosmosTopo/cosmosLabels.tsx |   436 +
src/features/entityTopo/cosmosTopo/cosmosTopoGraph.tsx |  1446 ++
src/features/entityTopo/cosmosTopo/graphvizLayout.ts |    48 +
src/features/entityTopo/cosmosTopo/topoVisualIdentity.ts |   145 +
src/features/entityTopo/cosmosTopo/types.ts        |   276 +
src/features/entityTopo/entityTopo.css             |  1855 +++
src/features/entityTopo/entityTopoModel.ts         |   862 +
src/features/imports/ImportsPage.tsx               |   353 +
src/features/imports/imports.css                   |   298 +
src/features/query/QueryPage.tsx                   |  1248 ++
src/features/query/query.css                       |  1095 ++
src/features/settings/ApiMapPage.tsx               |  1200 ++
src/features/settings/SettingsPage.tsx             |   349 +
src/features/settings/apiDebugger.css              |   560 +
src/features/settings/settings.css                 |   346 +
src/i18n/locales/en-US/query.ts                    |     8 +
src/i18n/locales/zh-CN/query.ts                    |     8 +
src/lib/preloadMonaco.ts                           |    45 +
27 files changed, 31566 insertions(+), 37 deletions(-)
```

### ea39ede - Add explorer interaction patch log

- Full hash: `ea39ede825b2dc97e7a9379505bf90b106cca224`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-25 16:52:47 +0800`

#### Changed Files

| Status | File |
| --- | --- |
| M | `COMMIT_LOG.md` |
| A | `patches/0001-Fix-explorer-interaction-controls.patch` |

#### Change Notes For AI Review

- Added the full patch file for `7d8dcaa` so ZIP-based handoff can inspect the exact explorer interaction-control diff.
- Updated the offline commit log with time control, pagination, filtering, and read-only control context.

#### Diff Stat

```text
COMMIT_LOG.md                                    |  71 +-
patches/0001-Fix-explorer-interaction-controls.patch | 807 +++++++++++++++++++++
2 files changed, 876 insertions(+), 2 deletions(-)
```

### 7d8dcaa - Fix explorer interaction controls

- Full hash: `7d8dcaaa51f648a9c5685d6c6f18f3a6b3173a1e`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-25 15:36:56 +0800`
- Full patch: `patches/0001-Fix-explorer-interaction-controls.patch`

#### Changed Files

| Status | File |
| --- | --- |
| M | `src/features/entity/EntityExplorerPage.tsx` |
| M | `src/features/entity/entity.css` |
| M | `src/features/topology/TopologyExplorerPage.tsx` |
| M | `src/features/topology/topology.css` |
| M | `src/features/umodel/UModelPage.tsx` |
| M | `src/features/umodel/umodel.css` |

#### Change Notes For AI Review

- Made the Topology Explorer time controls functional, including `1小时`, `1天`, and a custom time-range popover.
- Rendered the custom time popover through a fixed portal so it is not clipped by the toolbar or covered by the graph canvas.
- Added reliable `datetime-local` input handling so custom ranges update the displayed summary.
- Added functional Entity Explorer toolbar controls for showing/hiding summary cards and toggling the filter panel.
- Made Entity Explorer metric and topology-detail pagination interactive, including previous/next, page number buttons, and page-jump input.
- Replaced fake table links with real row-selection buttons and highlighted selected rows.
- Converted read-only page-size controls to status pills instead of clickable buttons.
- Disabled non-functional OModel spec-card reorder/delete controls in read-only detail mode, leaving only `查看` as the actionable control.

#### Diff Stat

```text
src/features/entity/EntityExplorerPage.tsx     | 134 +++++++++++-----
src/features/entity/entity.css                 |  45 ++++--
src/features/topology/TopologyExplorerPage.tsx | 207 ++++++++++++++++++++++++-
src/features/topology/topology.css             |  96 ++++++++++++
src/features/umodel/UModelPage.tsx             |   6 +-
src/features/umodel/umodel.css                 |   5 +
6 files changed, 435 insertions(+), 58 deletions(-)
```

### a43bb1a - Add omodel polish patch log

- Full hash: `a43bb1ab8dc349ecd76d1f672ba83e0992b8e9b4`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-24 09:51:07 +0800`

#### Changed Files

| Status | File |
| --- | --- |
| M | `COMMIT_LOG.md` |
| A | `patches/0001-Polish-omodel-detail-panels-and-card-labels.patch` |

#### Change Notes For AI Review

- Added the full patch file for `46cb084` so ZIP-based handoff can inspect the exact OModel detail-panel and card-label diff.
- Updated the offline commit log with OModel detail panel collapsibility and card field-label context.

#### Diff Stat

```text
COMMIT_LOG.md                                      |  65 +++-
patches/0001-Polish-omodel-detail-panels-and-card-labels.patch | 345 +++++++++++++++++++++
2 files changed, 408 insertions(+), 2 deletions(-)
```

### 46cb084 - Polish omodel detail panels and card labels

- Full hash: `46cb08404c10c8661b59890f4a19596b31b36b34`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-24 09:43:06 +0800`
- Full patch: `patches/0001-Polish-omodel-detail-panels-and-card-labels.patch`

#### Changed Files

| Status | File |
| --- | --- |
| M | `src/features/umodel/UModelOpenTopoXGraphView.tsx` |
| M | `src/features/umodel/UModelPage.tsx` |
| M | `src/features/umodel/graphModel.ts` |
| M | `src/features/umodel/umodel.css` |

#### Change Notes For AI Review

- Made all OModel detail form sections collapsible, including Metadata, More Config, Schema, and Spec.
- Changed the OModel property action label and dialog title from `显示` to `查看`, while keeping `显示名 (Display Name)` unchanged.
- Passed precomputed OModel field tags into the OpenTopoX custom node renderer.
- Rendered field label chips under OModel graph cards in full, compact, and mini zoom modes.
- Increased OModel card height from 56px to 64px so field labels are visible without clipping.
- Tuned card label chip styles to match the root project's `.ume-node-tags` treatment while preserving the Aliyun-style card look.

#### Diff Stat

```text
src/features/umodel/UModelOpenTopoXGraphView.tsx |  18 +++-
src/features/umodel/UModelPage.tsx               | 108 +++++++++++++----------
src/features/umodel/graphModel.ts                |   2 +-
src/features/umodel/umodel.css                   |  43 +++++++--
4 files changed, 118 insertions(+), 53 deletions(-)
```

### c601609 - Add topology detail patch log

- Full hash: `c60160969bba8983cc9c60bc83ae3e7c4352228c`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-23 16:37:32 +0800`

#### Changed Files

| Status | File |
| --- | --- |
| M | `COMMIT_LOG.md` |
| A | `patches/0001-Add-topology-detail-panel-and-spec-display-dialog.patch` |

#### Change Notes For AI Review

- Added the full patch file for `4c6d665` so ZIP-based handoff can inspect the exact topology detail and OModel property dialog diff.
- Updated the offline commit log with topology detail panel and spec display dialog context.

#### Diff Stat

```text
COMMIT_LOG.md                                                |   62 +-
patches/0001-Add-topology-detail-panel-and-spec-display-dialog.patch | 1025 ++++++++++++++++++++
2 files changed, 1085 insertions(+), 2 deletions(-)
```

### 4c6d665 - Add topology detail panel and spec display dialog

- Full hash: `4c6d665099737e0e14239e906df145bab32a31a2`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-23 16:33:05 +0800`
- Full patch: `patches/0001-Add-topology-detail-panel-and-spec-display-dialog.patch`

#### Changed Files

| Status | File |
| --- | --- |
| M | `src/features/entity/EntityExplorerPage.tsx` |
| M | `src/features/entity/entity.css` |
| M | `src/features/umodel/UModelPage.tsx` |
| M | `src/features/umodel/umodel.css` |

#### Change Notes For AI Review

- Added a right-side topology detail table in Entity Explorer when clicking topology cards, matching the Aliyun/CMS-style reference layout.
- Suppressed the old floating entity detail panel while Entity Explorer is in topology mode.
- Added focused zoom behavior for selected entity topology cards and updated topology zoom display.
- Made OModel detail `Schema 信息 (Schema)` expandable/collapsible with grouped schema rows.
- Changed OModel property card action text from `编辑` to `显示`.
- Added a read-only OModel property display dialog styled after the reference form, including Name, Display Name, Description, Short Description, Launch Stage, Type, and Semantic Role fields.

#### Diff Stat

```text
src/features/entity/EntityExplorerPage.tsx | 227 ++++++++++++++++--------
src/features/entity/entity.css             | 165 +++++++++++++++++-
src/features/umodel/UModelPage.tsx         | 166 +++++++++++++++++-
src/features/umodel/umodel.css             | 271 ++++++++++++++++++++++++++++-
4 files changed, 750 insertions(+), 79 deletions(-)
```

### 3d31cf5 - Add relation label styling patch

- Full hash: `3d31cf5dbd5f39a4c2645e96d9e8493141c36b01`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-22 17:21:36 +0800`

#### Changed Files

| Status | File |
| --- | --- |
| M | `COMMIT_LOG.md` |
| A | `patches/0001-Match-relation-label-styling.patch` |

#### Change Notes For AI Review

- Added the full patch file for `ef163ec` so ZIP-based handoff can inspect the exact relation label styling diff.
- Updated the offline commit log with relation label styling context.

#### Diff Stat

```text
COMMIT_LOG.md                                   |  62 ++++++++-
patches/0001-Match-relation-label-styling.patch | 168 ++++++++++++++++++++++++
2 files changed, 228 insertions(+), 2 deletions(-)
```

### ef163ec - Match relation label styling

- Full hash: `ef163ec37745cca7459c4088cc6bfade47a341ad`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-22 17:19:53 +0800`
- Full patch: `patches/0001-Match-relation-label-styling.patch`

#### Changed Files

| Status | File |
| --- | --- |
| M | `src/features/topology/TopologyCanvas.tsx` |
| M | `src/features/topology/topology.css` |
| M | `src/features/umodel/umodel.css` |

#### Change Notes For AI Review

- Matched the topology relation label visual style to the root project's entity topology labels.
- Updated topology overlay labels to use white capsule styling, 8px radius, subtle slate border, and light shadow.
- Updated active topology relation labels to use a soft color halo based on the relation color.
- Updated canvas fallback relation labels to use the same white capsule treatment.
- Updated OModel/OpenTopoX SVG edge labels to use the root project's white-stroked, low-contrast text style.

#### Diff Stat

```text
src/features/topology/TopologyCanvas.tsx | 27 +++++++++++++++------------
src/features/topology/topology.css       | 27 ++++++++++++++++-----------
src/features/umodel/umodel.css           | 28 ++++++++++++++++++++++------
3 files changed, 53 insertions(+), 29 deletions(-)
```

### 44677f1 - Add offline commit log and patch

- Full hash: `44677f158cff4368ea18f607a266802c23192e33`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-22 11:15:53 +0800`

#### Changed Files

| Status | File |
| --- | --- |
| A | `COMMIT_LOG.md` |
| A | `patches/0001-Improve-topology-and-omodel-graph-interactions.patch` |

#### Change Notes For AI Review

- Added an offline commit summary file for ZIP-based handoff.
- Added the full patch for `f0c33e4` so internal AI can inspect the exact diff without a `.git` directory.

#### Diff Stat

```text
COMMIT_LOG.md                                      |   56 +
...ve-topology-and-omodel-graph-interactions.patch | 1866 ++++++++++++++++++++
2 files changed, 1922 insertions(+)
```

### f0c33e4 - Improve topology and omodel graph interactions

- Full hash: `f0c33e49b12c43acfa17c424045eb36624a5b452`
- Author: `jkhkjlkll <jkhkjlkll@users.noreply.github.com>`
- Date: `2026-06-22 10:57:29 +0800`
- Full patch: `patches/0001-Improve-topology-and-omodel-graph-interactions.patch`

#### Changed Files

| Status | File |
| --- | --- |
| M | `package.json` |
| M | `pnpm-lock.yaml` |
| M | `src/features/topology/TopologyCanvas.tsx` |
| M | `src/features/topology/topology.css` |
| M | `src/features/umodel/UModelOpenTopoXGraphView.tsx` |
| M | `src/features/umodel/UModelPage.tsx` |
| M | `src/features/umodel/umodel.css` |

#### Change Notes For AI Review

- Added/updated topology graph rendering behavior, including the Cosmos/OpenTopoX-related topology canvas work.
- Added relationship labels on graph edges so OModel and topology relationship lines show their relation names.
- Added OModel card menu behavior, including the three-dot action button and menu actions for connect, copy, cascade copy, delete, and cascade delete.
- Updated OModel card/detail interactions so clicking a card opens a structured detail panel.
- Reworked the OModel detail `Spec` display from raw JSON into grouped, card-style property rows.
- Added supporting CSS for OModel node menu, action menu, edge labels, and structured spec cards.

#### Diff Stat

```text
package.json                                     |   1 +
pnpm-lock.yaml                                   | 186 +++++++
src/features/topology/TopologyCanvas.tsx         | 659 ++++++++++++++++++++++-
src/features/topology/topology.css               | 119 ++++
src/features/umodel/UModelOpenTopoXGraphView.tsx | 144 ++++-
src/features/umodel/UModelPage.tsx               | 148 ++++-
src/features/umodel/umodel.css                   | 215 +++++++-
7 files changed, 1442 insertions(+), 30 deletions(-)
```
