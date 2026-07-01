# Fix OModel draft diff detection

Generated at: `2026-07-01 17:15 +0800`

Branch: `codex/opentopox-experiment`

Commit: `c442a728cb12a641c71bdff044e3ac8e191d4afe`

Patch file: `patches/0001-Fix-OModel-draft-diff-detection.patch`

## Commit Message

```text
Fix OModel draft diff detection
```

## Summary

- Fixed a false-positive dirty draft state on the OModel page.
- Updated the stable object serializer to ignore keys whose value is `undefined`.
- Prevented equivalent server data and draft data from comparing as different just because cloned draft data drops `undefined` fields.
- Kept the OModel submit button disabled when there is no user-visible change.

## Changed Files

| Status | File |
| --- | --- |
| M | `src/features/umodel/model.ts` |

## Verification

```text
pnpm build
git diff --check
```

Browser verification on `http://localhost:5181/`:

- `OModel 探索`, `实体探索`, `拓扑探索`, `查询`, `导入与写入`, `设置`, and `API 调试` all rendered without blank screens.
- OModel initial state no longer showed a false unsaved draft banner.
- OModel add/upload/create dialogs opened and closed correctly.
- Entity Explorer search, table/topology/health tabs, and topology zoom controls worked.
- Topology Explorer search, custom time range, and play controls worked.
- Query, Imports, Settings, and API Debugger primary actions worked with mock responses.
- Browser application console reported no app errors.
