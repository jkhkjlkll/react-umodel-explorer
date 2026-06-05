import assert from "node:assert/strict";
import test from "node:test";

import { TopoLayout } from "../../src/framework/index.js";
import { getNodeSize } from "../../src/framework/TopoLayout.js";

test("TopoLayout cancels a stale worker layout when a newer request starts", async () => {
  class SlowWorker {
    terminate() {
      this.terminated = true;
    }

    postMessage(payload) {
      setTimeout(() => {
        this.onmessage?.({
          data: {
            id: payload.id,
            result: {
              nodes: payload.nodes,
              edges: payload.edges,
              meta: { worker: true },
            },
          },
        });
      }, 10);
    }
  }

  const layout = new TopoLayout({
    options: {
      useWorker: true,
      workerFactory: () => new SlowWorker(),
    },
  });
  const nodes = [{ id: "api", data: { title: "API" } }];

  const stale = layout.execute({ nodes, edges: [] }).catch((error) => error);
  const latest = await layout.execute({ nodes, edges: [] });
  const staleError = await stale;

  assert.equal(staleError.cancelled, true);
  assert.equal(latest.meta.workerRequested, true);
  assert.equal(latest.nodes.length, 1);
});

test("TopoLayout sync layouts produce stable node positions", () => {
  const layout = new TopoLayout({ options: { topoType: "dot", rankDir: "LR" } });
  const result = layout.executeSync({
    nodes: [
      { id: "api", data: { title: "API" } },
      { id: "db", data: { title: "DB" } },
    ],
    edges: [
      { id: "api-db", source: "api", target: "db" },
    ],
  });

  assert.equal(result.nodes.length, 2);
  assert.equal(Number.isFinite(result.nodes[0].position.x), true);
  assert.equal(Number.isFinite(result.nodes[0].position.y), true);
});

test("getNodeSize uses rendered measurements as an internal minimum", () => {
  const node = {
    id: "redis",
    type: "cardLayerNode",
    data: {
      title: "Redis",
      size: { width: 240, height: 118 },
    },
  };
  Object.defineProperty(node, "__topoMeasuredSize", {
    configurable: true,
    enumerable: false,
    writable: true,
    value: { width: 240, height: 130 },
  });

  assert.deepEqual(getNodeSize(node), { width: 240, height: 130 });
  assert.equal(Object.keys(node).includes("__topoMeasuredSize"), false);
});
