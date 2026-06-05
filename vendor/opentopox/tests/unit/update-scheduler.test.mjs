import assert from "node:assert/strict";
import test from "node:test";

import {
  createRealtimeEdgePatch,
  createRealtimeNodePatch,
  createTopologyUpdateScheduler,
} from "../../src/framework/index.js";

test("TopologyUpdateScheduler coalesces light node and edge patches", async () => {
  const calls = [];
  const graph = {
    patchGraphData: (patch, options) => calls.push({ patch, options }),
    updateDebugMetrics: (metrics) => calls.push({ metrics }),
  };
  const scheduler = createTopologyUpdateScheduler({ graph, flushIntervalMs: 1000 });

  scheduler.enqueueMessage(createRealtimeNodePatch({
    version: 1,
    seq: 1,
    source: "unit",
    patches: [{ id: "api", data: { status: "warn" } }],
  }));
  scheduler.enqueueMessage(createRealtimeNodePatch({
    version: 1,
    seq: 2,
    source: "unit",
    patches: [{ id: "api", data: { status: "critical" } }],
  }));
  scheduler.enqueueMessage(createRealtimeEdgePatch({
    version: 1,
    seq: 3,
    source: "unit",
    patches: [{ id: "api-db", data: { latency: "120 ms" } }],
  }));

  await scheduler.flush();

  const patchCall = calls.find((call) => call.patch);
  assert.equal(patchCall.patch.nodePatches.length, 1);
  assert.equal(patchCall.patch.nodePatches[0].data.status, "critical");
  assert.equal(patchCall.patch.edgePatches.length, 1);
  assert.equal(patchCall.options.preserveViewport, true);
  assert.equal(calls.some((call) => call.metrics?.queueSize === 0), true);
  scheduler.destroy();
});

test("TopologyUpdateScheduler passes direct structure patches without a store", async () => {
  const calls = [];
  const graph = {
    patchGraphData: (patch) => calls.push(patch),
  };
  const scheduler = createTopologyUpdateScheduler({ graph, flushIntervalMs: 1000 });

  scheduler.enqueueGraphPatch({
    addedNodes: [{ id: "cache", data: { title: "Cache" } }],
    addedEdges: [{ id: "api-cache", source: "api", target: "cache" }],
  });
  await scheduler.flush();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].addedNodes.length, 1);
  assert.equal(calls[0].addedEdges.length, 1);
  scheduler.destroy();
});
