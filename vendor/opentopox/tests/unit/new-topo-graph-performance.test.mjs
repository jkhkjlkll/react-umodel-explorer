import assert from "node:assert/strict";
import test from "node:test";

import { NewTopoGraph } from "../../src/framework/index.js";

test("NewTopoGraph graph indexes keep connected edge lookups current", () => {
  const graph = createGraphStub({
    nodes: [
      { id: "group-a", type: "labeledGroupNode", data: { title: "Group A" } },
      { id: "api", parentId: "group-a", data: { title: "API" } },
      { id: "db", data: { title: "DB" } },
      { id: "cache", data: { title: "Cache" } },
    ],
    edges: [
      { id: "api-db", source: "api", target: "db" },
      { id: "api-cache", source: "api", target: "cache" },
      { id: "db-cache", source: "db", target: "cache" },
    ],
  });

  graph.rebuildGraphIndexes();

  assert.equal(graph.nodeById.get("api").parentId, "group-a");
  assert.deepEqual([...graph.childrenByParentId.get("group-a")], ["api"]);
  assert.deepEqual(new Set(graph.getConnectedEdgeIds(["api"])), new Set(["api-db", "api-cache"]));

  const previousNode = graph.nodeById.get("api");
  graph.updateNodeIndex({ ...previousNode, parentId: "group-b" }, previousNode);
  assert.equal(graph.childrenByParentId.get("group-a").has("api"), false);
  assert.deepEqual([...graph.childrenByParentId.get("group-b")], ["api"]);

  const previousEdge = graph.edgeById.get("api-db");
  graph.updateEdgeIndex({ ...previousEdge, target: "cache" }, previousEdge);
  assert.equal(graph.edgeIdsByNodeId.get("db").has("api-db"), false);
  assert.deepEqual(new Set(graph.getConnectedEdgeIds(["cache"])), new Set(["api-cache", "db-cache", "api-db"]));
});

test("NewTopoGraph canvas edge mode is gated by performance config", () => {
  const graph = createGraphStub({
    edges: Array.from({ length: 2000 }, (_, index) => ({
      id: `edge-${index}`,
      source: `node-${index}`,
      target: `node-${index + 1}`,
    })),
    canvasEdges: true,
    canvasEdgeThreshold: 2000,
    performanceMode: true,
    graphType: "default",
  });

  assert.equal(graph.shouldUseCanvasEdges(), true);

  graph.canvasEdges = false;
  assert.equal(graph.shouldUseCanvasEdges(), false);

  graph.canvasEdges = true;
  graph.performanceMode = false;
  assert.equal(graph.shouldUseCanvasEdges(), false);

  graph.performanceMode = true;
  graph.canvasEdgeThreshold = 2001;
  assert.equal(graph.shouldUseCanvasEdges(), false);

  graph.canvasEdgeThreshold = 2000;
  graph.graphType = "agentloop";
  assert.equal(graph.shouldUseCanvasEdges(), false);
});

test("NewTopoGraph hover rendering diffs previous and next related elements", () => {
  const nodeA = createElementStub(["is-hover-related"]);
  const nodeB = createElementStub();
  const edgeA = createElementStub(["is-hover-related"]);
  const edgeB = createElementStub();
  const graph = createGraphStub({
    root: createElementStub(),
    nodeElementById: new Map([
      ["api", nodeA],
      ["db", nodeB],
    ]),
    edgeElementById: new Map([
      ["api-db", edgeA],
      ["db-cache", edgeB],
    ]),
    renderedHover: {
      nodes: new Set(["api"]),
      edges: new Set(["api-db"]),
    },
    hoverState: {
      relatedNodes: new Set(["api", "db"]),
      relatedEdges: new Set(["api-db", "db-cache"]),
    },
  });

  graph.renderHoverHighlight();

  assert.equal(nodeA.classList.added.length, 0);
  assert.equal(edgeA.classList.added.length, 0);
  assert.deepEqual(nodeB.classList.added, ["is-hover-related"]);
  assert.deepEqual(edgeB.classList.added, ["is-hover-related"]);
});

test("NewTopoGraph selection rendering diffs multi-selection classes", () => {
  const nodeA = createElementStub(["is-multi-selected"]);
  const nodeB = createElementStub();
  const edgeA = createElementStub(["is-multi-selected"]);
  const graph = createGraphStub({
    selectionEnabled: true,
    selected: null,
    selection: {
      nodes: ["db"],
      edges: [],
      primary: null,
    },
    nodeElementById: new Map([
      ["api", nodeA],
      ["db", nodeB],
    ]),
    edgeElementById: new Map([["api-db", edgeA]]),
    renderedSelection: {
      nodes: new Set(["api"]),
      edges: new Set(["api-db"]),
      primary: null,
    },
  });

  graph.renderSelection();

  assert.deepEqual(nodeA.classList.removed, ["is-multi-selected"]);
  assert.deepEqual(edgeA.classList.removed, ["is-multi-selected"]);
  assert.deepEqual(nodeB.classList.added, ["is-multi-selected"]);
});

test("NewTopoGraph focus traversal uses connected edges and preserves direction semantics", async () => {
  const graph = createGraphStub({
    originData: {
      nodes: [
        { id: "web", data: { title: "Web" } },
        { id: "api", data: { title: "API" } },
        { id: "db", data: { title: "DB" } },
        { id: "cache", data: { title: "Cache" } },
        { id: "queue", data: { title: "Queue" } },
      ],
      edges: [
        { id: "web-api", source: "web", target: "api" },
        { id: "api-db", source: "api", target: "db" },
        { id: "db-cache", source: "db", target: "cache" },
        { id: "queue-cache", source: "queue", target: "cache" },
      ],
    },
    setDataCalls: [],
  });
  graph.setData = async (data) => {
    graph.setDataCalls.push(data);
    return graph;
  };
  graph.getData = () => graph.originData;

  const related = await graph.handleFocusNode("api", { degree: 2, direction: "downstream", disableAnimate: true });

  assert.deepEqual(related.nodes.map((node) => node.id), ["api", "db", "cache"]);
  assert.deepEqual(related.edges.map((edge) => edge.id), ["api-db", "db-cache"]);
  assert.equal(graph.currentFocusId, "api");
  assert.equal(graph.setDataCalls[0].centerNodeId, "api");
  assert.equal(graph.setDataCalls[0].disableAnimate, true);
});

function createGraphStub(options = {}) {
  const graph = Object.create(NewTopoGraph.prototype);
  Object.assign(graph, {
    nodes: [],
    edges: [],
    nodeById: new Map(),
    edgeById: new Map(),
    edgeIdsByNodeId: new Map(),
    childrenByParentId: new Map(),
    minimapStaticDirty: false,
    minimapTransform: { cached: true },
    canvasEdges: true,
    canvasEdgeThreshold: 2000,
    performanceMode: true,
    graphType: "default",
    ...options,
  });
  return graph;
}

function createElementStub(initialClasses = []) {
  return {
    classList: createClassListStub(initialClasses),
  };
}

function createClassListStub(initialClasses = []) {
  const values = new Set(initialClasses);
  return {
    added: [],
    removed: [],
    toggled: [],
    add(...names) {
      for (const name of names) {
        values.add(name);
        this.added.push(name);
      }
    },
    remove(...names) {
      for (const name of names) {
        values.delete(name);
        this.removed.push(name);
      }
    },
    toggle(name, force) {
      const enabled = force ?? !values.has(name);
      if (enabled) values.add(name);
      else values.delete(name);
      this.toggled.push([name, enabled]);
      return enabled;
    },
    contains(name) {
      return values.has(name);
    },
  };
}
