# Add root workbench pages to standalone explorer

Generated at: `2026-06-26 15:54 +0800`

Branch: `codex/opentopox-experiment`

Patch file: `patches/0001-Add-root-workbench-pages-to-standalone-explorer.patch`

## Commit Message

```text
Add root workbench pages to standalone explorer
```

## Summary

- Added the root project Query page to the standalone subproject and wired it into the sidebar as `查询`.
- Added the root project Imports page to the standalone subproject and wired it into the sidebar as `导入与写入`.
- Added the root project Workspace Settings page and API Debugger page to the standalone subproject sidebar.
- Kept the existing `OModel 探索`, `实体探索`, and `拓扑探索` pages intact.
- Expanded the standalone API client interface so the imported root pages can run against either the real REST API client or the local mock client.
- Added mock implementations for workspace management, query/explain, UModel import/write/delete, entity/relation write/expire, and Agent/API-debugger flows.
- Added the missing query i18n keys used by the root Query page.
- Copied the root query/imports/settings support files and Monaco preload helper into the subproject.

## Notes

- The root project Web UI does not have a separate export page in `web/src/features`; export remains available through the existing OModel page's export action in the subproject.
- The API Debugger still uses real HTTP calls when `apiBase` points at a real server. In mock mode, it dispatches to the standalone `UModelApiClient` methods so the page can be exercised offline.

## Verification

```text
pnpm build
git diff --check
```

Browser verification on `http://127.0.0.1:5181/`:

- Sidebar shows `OModel 探索`, `实体探索`, `拓扑探索`, `查询`, `导入与写入`, `设置`, and `API 调试`.
- The four new pages render without blank screens.
- Query page `执行` returns mock OModel rows.
- API Debugger `调用` returns `200 OK` for the mock health endpoint.
- The original three pages still render after adding the new entries.
