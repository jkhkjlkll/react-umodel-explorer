# Contributing

Thanks for taking the time to improve OpenTopoX.

All contributors are expected to follow the
[Code of Conduct](./CODE_OF_CONDUCT.md). Security issues must be reported
through the private channels listed in [SECURITY.md](./SECURITY.md), not public
issues.

## Development

```sh
npm install
npm run check
```

The project is intentionally lightweight: browser-native ESM, DOM, SVG, and
Node.js tests. Please keep new dependencies out of the runtime path unless they
are clearly necessary and their license is compatible with MIT distribution.

## Pull Requests

- Keep changes focused and explain the user-visible behavior they affect.
- Add or update unit tests when changing protocol, store, scheduler, layout, or
  data transformation behavior.
- Update docs when changing public APIs, package exports, or integration
  expectations.
- Do not commit generated caches, local screenshots, credentials, captured
  third-party bundles, or private research notes.

## Commit Hygiene

Use clear commit messages and avoid mixing unrelated refactors with behavior
changes. This makes review and future provenance checks much easier.
