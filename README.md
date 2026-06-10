# React OModel Explorer Standalone

Standalone copy of the original OModel Explorer page. It keeps the same React, Monaco, Graphviz, API client, data model, styles, workspace shell, and interaction logic used by the repository Web UI.

The project includes a large mock graph data source by default, so it can be opened and tested before an intranet backend is ready.

## Run

```bash
pnpm install --no-frozen-lockfile
pnpm dev -- --port 5181 --strictPort
```

Open `http://localhost:5181`.

By default it uses `dataSource=mock` and workspace `demo`.

Use a real API:

```text
http://localhost:5181/?dataSource=api&workspace=demo&apiBase=http://localhost:8080
```

## Migrate

- Copy this directory as a standalone React/Vite project.
- The graph, table, search, settings, detail panel, draft editing, React Flow nodes/edges, Monaco editor, and Graphviz layout are copied from the original `web/src/features/umodel` implementation.
- The standalone shell in `src/StandaloneExplorerApp.tsx` only wires API base, workspace, health, refresh, and the original workspace-style frame around `UModelPage`.
- The default workspace is `demo`.

## Docs

- `docs/API.md` documents every backend endpoint this page needs.
- `docs/MIGRATION.md` explains mock/real data source switching and intranet deployment.
