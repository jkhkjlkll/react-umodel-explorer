# Third-Party Notices

The published framework package is implemented with browser-native DOM, SVG,
and JavaScript modules. It does not bundle third-party runtime libraries.

Optional integrations:

- Graphviz/Dagre-style layout hooks are adapter interfaces. Consumers may
  register their own layout implementation and are responsible for the license
  obligations of any implementation they choose.
- Browser tests and local validation scripts may use external developer tools
  in the repository, but those tools are not included in the framework runtime
  distribution.

If future releases add bundled dependencies, this file should be updated before
publishing.
