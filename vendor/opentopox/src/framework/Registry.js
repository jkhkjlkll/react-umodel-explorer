const registry = new Map();
const nodeShapes = new Map();
const edgeShapes = new Map();

export function register(name, value) {
  if (!name) throw new Error("register requires a name");
  registry.set(name, value ?? true);
  return () => registry.delete(name);
}

export function getRegistered(name) {
  return registry.get(name);
}

export function getRegistryEntries() {
  return [...registry.entries()].map(([name, value]) => ({ name, value }));
}

export function registerNodeShape(type, shape) {
  if (!type) throw new Error("registerNodeShape requires a type");
  nodeShapes.set(type, normalizeShape(shape));
  return () => nodeShapes.delete(type);
}

export function registerEdgeShape(type, shape) {
  if (!type) throw new Error("registerEdgeShape requires a type");
  edgeShapes.set(type, normalizeShape(shape));
  return () => edgeShapes.delete(type);
}

export function getNodeShape(type) {
  return nodeShapes.get(type);
}

export function getEdgeShape(type) {
  return edgeShapes.get(type);
}

export function getRegisteredNodeShapes() {
  return [...nodeShapes.entries()].map(([type, shape]) => ({ type, shape }));
}

export function getRegisteredEdgeShapes() {
  return [...edgeShapes.entries()].map(([type, shape]) => ({ type, shape }));
}

function normalizeShape(shape) {
  if (typeof shape === "function") return { render: shape };
  return shape || {};
}
