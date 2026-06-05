import assert from "node:assert/strict";
import test from "node:test";

import {
  createRealtimeNodePatch,
	  createRealtimeTopologyPatch,
	  createRealtimeTopologySnapshot,
	  createTopologyGraphStore,
	  registerNodeShape,
	  validateGraphData,
	} from "../../src/framework/index.js";

test("validateGraphData filters destructive errors and records diagnostics", () => {
  const validation = validateGraphData([
    { id: "api", data: { status: "invalid" } },
    { id: "api", data: { title: "Duplicate" } },
    { id: "db", parentId: "db", type: "unknownNode", data: { title: "DB", status: "ok" } },
  ], [
    { id: "api-db", source: "api", target: "db", data: { status: "ok" } },
    { id: "orphan", source: "api", target: "missing", data: { status: "ok" } },
  ]);

  assert.equal(validation.valid, false);
  assert.equal(validation.duplicateNodes, 1);
  assert.equal(validation.invalidEdges, 1);
  assert.equal(validation.invalidStatuses, 1);
  assert.equal(validation.cyclicParents, 1);
  assert.equal(validation.unknownNodeTypes, 1);
  assert.deepEqual(validation.nodes.map((node) => node.id), ["api", "db"]);
  assert.deepEqual(validation.edges.map((edge) => edge.id), ["api-db"]);
});

test("validateGraphData accepts registered and additional node types", () => {
  const unregister = registerNodeShape("customServiceNode", () => "<strong>Service</strong>");
  try {
    const validation = validateGraphData([
      { id: "api", type: "customServiceNode", data: { title: "API", status: "ok" } },
      { id: "cache", type: "configuredNode", data: { title: "Cache", status: "ok" } },
    ], [
      { id: "api-cache", source: "api", target: "cache", data: { status: "ok" } },
    ], {
      additionalAllowedNodeTypes: ["configuredNode"],
    });

    assert.equal(validation.valid, true);
    assert.equal(validation.hasWarnings, false);
    assert.equal(validation.unknownNodeTypes, 0);
    assert.deepEqual(validation.nodes.map((node) => node.type), ["customServiceNode", "configuredNode"]);
  } finally {
    unregister();
  }
});

test("TopologyGraphStore merges snapshots, patches, and topology changes", () => {
  const store = createTopologyGraphStore();
  store.applyMessage(createRealtimeTopologySnapshot({
    version: 1,
    seq: 1,
    source: "unit",
    nodes: [
      { id: "api", data: { title: "API", status: "ok" } },
      { id: "db", data: { title: "DB", status: "ok" } },
    ],
    edges: [
      { id: "api-db", source: "api", target: "db", data: { status: "ok" } },
    ],
  }));

  store.applyMessage(createRealtimeNodePatch({
    version: 1,
    seq: 2,
    source: "unit",
    patches: [{ id: "api", data: { status: "critical", metric: { label: "P95", value: "300 ms" } } }],
  }));

  store.applyMessage(createRealtimeTopologyPatch({
    version: 2,
    seq: 1,
    source: "unit",
    addNodes: [{ id: "cache", data: { title: "Cache", status: "ok" } }],
    addEdges: [{ id: "api-cache", source: "api", target: "cache", data: { status: "ok" } }],
  }));

  const data = store.getData();
  const api = data.nodes.find((node) => node.id === "api");
  assert.equal(api.data.status, "critical");
  assert.equal(data.nodes.length, 3);
  assert.equal(data.edges.length, 2);
  assert.equal(store.getSnapshot().metrics.nodePatches, 1);
  assert.equal(store.getSnapshot().metrics.topologyPatches, 1);
});
