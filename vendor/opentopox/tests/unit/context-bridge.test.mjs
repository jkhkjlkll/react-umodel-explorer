import assert from "node:assert/strict";
import test from "node:test";

import {
  createTopologyContext,
  formatTopologyContextAsMarkdown,
  getVisibleGraphData,
  resolveContextGraph,
} from "../../src/framework/index.js";

const nodes = [
  { id: "api", position: { x: 0, y: 0 }, measured: { width: 100, height: 60 }, data: { title: "API", token: "secret-token" } },
  { id: "order", position: { x: 180, y: 0 }, measured: { width: 120, height: 60 }, data: { title: "Order" } },
  { id: "db", position: { x: 380, y: 0 }, measured: { width: 100, height: 60 }, data: { title: "DB", password: "secret-password" } },
  { id: "queue", position: { x: 0, y: 180 }, measured: { width: 120, height: 60 }, data: { title: "Queue" } },
];

const edges = [
  { id: "api-order", source: "api", target: "order", data: { latency: "20ms" } },
  { id: "order-db", source: "order", target: "db", data: { latency: "30ms" } },
  { id: "api-queue", source: "api", target: "queue", data: { latency: "12ms" } },
];

test("getVisibleGraphData includes visible nodes and internal edges", () => {
  const visible = getVisibleGraphData({
    nodes,
    edges,
    visibleRect: { x: -10, y: -10, width: 340, height: 100 },
  });

  assert.deepEqual(visible.nodes.map((node) => node.id), ["api", "order"]);
  assert.deepEqual(visible.edges.map((edge) => edge.id), ["api-order"]);
});

test("resolveContextGraph includes selected edge endpoints", () => {
  const context = resolveContextGraph({
    nodes,
    edges,
    selection: { nodes: [], edges: ["order-db"], primary: { type: "edge", id: "order-db" } },
    scope: "selected",
    includeMode: "explicit",
  });

  assert.deepEqual(context.nodes.map((node) => node.id), ["order", "db"]);
  assert.deepEqual(context.edges.map((edge) => edge.id), ["order-db"]);
});

test("resolveContextGraph adds connected edges between selected nodes", () => {
  const context = resolveContextGraph({
    nodes,
    edges,
    selection: { nodes: ["api", "order", "queue"], edges: [] },
    scope: "selected",
    includeMode: "connectedEdges",
  });

  assert.deepEqual(context.nodes.map((node) => node.id), ["api", "order", "queue"]);
  assert.deepEqual(context.edges.map((edge) => edge.id), ["api-order", "api-queue"]);
});

test("oneHop expands selected nodes by direction", () => {
  const context = resolveContextGraph({
    nodes,
    edges,
    selection: { nodes: ["order"], edges: [] },
    scope: "selected",
    includeMode: "oneHop",
    direction: "downstream",
  });

  assert.deepEqual(context.nodes.map((node) => node.id), ["order", "db"]);
  assert.deepEqual(context.edges.map((edge) => edge.id), ["order-db"]);
});

test("createTopologyContext redacts sensitive fields and formats markdown", () => {
  const context = createTopologyContext({
    nodes,
    edges,
    selection: { nodes: ["api", "db"], edges: [] },
    source: { graphType: "agent-bridge", layout: "preset" },
    options: {
      scope: "selected",
      includeMode: "connectedEdges",
      includeViewport: false,
    },
  });

  assert.equal(context.schema, "opentopox.agent-context.v1");
  assert.equal(context.source.graphType, "agent-bridge");
  assert.equal(context.nodes.find((node) => node.id === "api").data.token, undefined);
  assert.equal(context.nodes.find((node) => node.id === "db").data.password, undefined);
  assert.deepEqual(context.meta.redactedFields, ["data.password", "data.token"]);

  const markdown = formatTopologyContextAsMarkdown(context);
  assert.match(markdown, /## OpenTopoX Context/);
  assert.match(markdown, /```json/);
  assert.doesNotMatch(markdown, /secret-token|secret-password/);
});
