import { TopoLayout } from "./TopoLayout.js";

self.onmessage = (event) => {
  const payload = event.data || {};
  const startedAt = Date.now();
  try {
    const layout = new TopoLayout({ options: payload.options || {} });
    const result = layout.executeSync({
      nodes: payload.nodes || [],
      edges: payload.edges || [],
      clearStatus: payload.clearStatus,
    });
    self.postMessage({
      id: payload.id,
      result: {
        ...result,
        meta: {
          ...result.meta,
          worker: true,
          durationMs: Date.now() - startedAt,
          topoType: payload.options?.topoType || "dot",
        },
      },
    });
  } catch (error) {
    self.postMessage({
      id: payload.id,
      error: error?.message || "Layout worker failed",
    });
  }
};
