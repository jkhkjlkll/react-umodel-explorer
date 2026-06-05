# Security Policy

## Reporting

Please report security issues privately through GitHub private vulnerability
reporting:

<https://github.com/java67-art/OpenTopoX/security/advisories/new>

Do not open a public issue for vulnerabilities, leaked credentials, or
exploitable behavior.

Include:

- A concise description of the issue.
- A minimal reproduction or affected API surface.
- Expected impact and any known workaround.

The maintainers aim to acknowledge valid reports within 5 business days. If the
repository moves to a different GitHub organization, update this file before the
next public release.

## Scope

Security-sensitive areas include:

- Rendering untrusted node, edge, tooltip, or detail-drawer content.
- Realtime transport adapters and message ingestion.
- Data validation, stale-message handling, and patch application.
- Package contents, release artifacts, and accidental credential inclusion.

## Public Content Rules

The public repository should contain maintained source, docs, tests, examples,
license notices, and CI configuration. Do not commit credentials, cookies,
private URLs, local captures, generated screenshots, or copied proprietary
runtime bundles.
