import { performance } from "node:perf_hooks";

import {
  TopoLayout,
  createRealtimeNodePatch,
  createTopologyGraphStore,
  createTopologyUpdateScheduler,
} from "../src/framework/index.js";

const sizes = parseSizeList(process.env.TOPOLOGY_BENCH_SIZES || "500,1000,3000");
const edgeMultipliers = parseSizeList(process.env.TOPOLOGY_BENCH_EDGE_MULTIPLIERS || "1,3");
const patchCount = Number(process.env.TOPOLOGY_BENCH_PATCHES || 200);
const results = [];

for (const nodeCount of sizes) {
  for (const edgeMultiplier of edgeMultipliers) {
    const edgeCount = nodeCount * edgeMultiplier;
    const graph = createBenchmarkGraph(nodeCount, edgeCount);
    const layout = new TopoLayout({ options: { topoType: "dot", rankDir: "LR", autoWorker: false } });

    const layoutResult = measure(() => layout.executeSync(graph));
    const storeResult = measure(() => {
      const store = createTopologyGraphStore({ ...graph, version: 1 });
      return store.getSnapshot();
    });
    const schedulerResult = await measureAsync(async () => {
      let lastPatch = null;
      const scheduler = createTopologyUpdateScheduler({
        graph: {
          patchGraphData: (patch) => {
            lastPatch = patch;
          },
          updateDebugMetrics: () => {},
        },
        flushIntervalMs: 1000,
      });
      for (let index = 0; index < patchCount; index += 1) {
        scheduler.enqueueMessage(createRealtimeNodePatch({
          version: 1,
          seq: index + 1,
          source: "benchmark",
          patches: [{
            id: `node-${index % nodeCount}`,
            data: { status: index % 5 === 0 ? "warn" : "ok", metric: { label: "P95", value: `${20 + index % 80} ms` } },
          }],
        }));
      }
      const metrics = await scheduler.flush();
      scheduler.destroy();
      return { metrics, patchSize: lastPatch?.nodePatches?.length || 0 };
    });

    results.push({
      nodeCount,
      edgeCount,
      edgeMultiplier,
      patchCount,
      layoutMs: layoutResult.durationMs,
      storeMs: storeResult.durationMs,
      schedulerFlushMs: schedulerResult.durationMs,
      coalescedPatches: schedulerResult.value.patchSize,
    });
  }
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
} else {
  console.table(results);
}

function createBenchmarkGraph(nodeCount, edgeCount) {
  const nodes = Array.from({ length: nodeCount }, (_, index) => ({
    id: `node-${index}`,
    data: {
      title: `Node ${index}`,
      status: index % 17 === 0 ? "warn" : "ok",
      metric: { label: "RPS", value: String(100 + index) },
    },
  }));
  const edges = Array.from({ length: edgeCount }, (_, index) => ({
    id: `edge-${index}`,
    source: `node-${index % nodeCount}`,
    target: `node-${(index * 7 + 1) % nodeCount}`,
    label: "flow",
    data: {
      status: index % 29 === 0 ? "warn" : "ok",
      latency: `${10 + index % 90} ms`,
    },
  })).filter((edge) => edge.source !== edge.target);
  return { nodes, edges };
}

function measure(fn) {
  const startedAt = performance.now();
  const value = fn();
  return {
    value,
    durationMs: roundMs(performance.now() - startedAt),
  };
}

async function measureAsync(fn) {
  const startedAt = performance.now();
  const value = await fn();
  return {
    value,
    durationMs: roundMs(performance.now() - startedAt),
  };
}

function parseSizeList(value) {
  return String(value)
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
