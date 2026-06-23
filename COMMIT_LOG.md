# Commit Log Since 2026-06-18

This file is for offline/internal AI review when the project is transferred as a ZIP archive. ZIP downloads do not include the `.git` directory, so this document records the recent commit history that would otherwise be unavailable.

Repository: `react-umodel-explorer`

Branch when generated: `codex/opentopox-experiment`

Generated at: `2026-06-23 16:34 +0800`

## Summary

There are 5 commits after `2026-06-18 00:00:00 +0800` on the current branch.

## Commits

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
