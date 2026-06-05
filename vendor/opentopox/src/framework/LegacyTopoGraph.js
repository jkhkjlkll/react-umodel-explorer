import { NewTopoGraph } from "./NewTopoGraph.js";
import { registerEdgeShape, registerNodeShape } from "./Registry.js";

export class StandardTopologyGraph extends NewTopoGraph {
  constructor(options = {}) {
    const defaults = { topoType: "dot", graphType: "standard" };
    super(withPresetConfig(options, defaults));
    applyPresetLayout(this, options, defaults);
  }
}

export class LayeredTopologyGraph extends NewTopoGraph {
  constructor(options = {}) {
    const defaults = { topoType: "layer", graphType: "layered", grid: true };
    super(withPresetConfig(options, defaults));
    applyPresetLayout(this, options, defaults);
  }
}

export class SpatialTopologyGraph extends NewTopoGraph {
  constructor(options = {}) {
    const defaults = { topoType: "xyFlow", graphType: "spatial", grid: true };
    super(withPresetConfig(options, defaults));
    applyPresetLayout(this, options, defaults);
  }
}

export class FlowTopologyGraph extends NewTopoGraph {
  constructor(options = {}) {
    const defaults = { topoType: "entityFlow", graphType: "flow" };
    super(withPresetConfig(options, defaults));
    applyPresetLayout(this, options, defaults);
  }
}

export function selectTopologyGraph(type = "standard") {
  const graphType = String(type || "").toLowerCase();
  if (graphType === "entity" || graphType === "layer" || graphType === "layered") return LayeredTopologyGraph;
  if (graphType === "map" || graphType === "spatial") return SpatialTopologyGraph;
  if (graphType === "flow") return FlowTopologyGraph;
  if (graphType === "standard" || graphType === "default" || graphType === "topology") return StandardTopologyGraph;
  return NewTopoGraph;
}

export function createTopologyGraph({ type = "standard", ...options } = {}) {
  const GraphClass = selectTopologyGraph(type);
  return new GraphClass(options);
}

export function registerTopologyShape(kind, type, shape) {
  if (kind === "edge") return registerEdgeShape(type, shape);
  return registerNodeShape(type, shape);
}

function withPresetConfig(options, defaults) {
  return {
    ...options,
    config: {
      ...options.config,
      graphType: options.config?.graphType || defaults.graphType,
      grid: options.config?.grid ?? defaults.grid ?? false,
    },
  };
}

function applyPresetLayout(graph, options, defaults) {
  graph.presetDefaults = defaults;
  graph.setLayout({ topoType: defaults.topoType, ...(options.layout || {}) });
}
