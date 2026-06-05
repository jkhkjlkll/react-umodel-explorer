import assert from "node:assert/strict";
import test from "node:test";

import {
  createRealtimeNodePatch,
  createRealtimeTopologyCursor,
  createRealtimeTopologySnapshot,
  shouldAcceptRealtimeTopologyMessage,
  validateRealtimeTopologyMessage,
} from "../../src/framework/index.js";

test("validates realtime snapshot envelopes", () => {
  const message = createRealtimeTopologySnapshot({
    version: 1,
    seq: 1,
    source: "unit",
    nodes: [{ id: "api", data: { title: "API" } }],
    edges: [],
  });

  const validation = validateRealtimeTopologyMessage(message);
  assert.equal(validation.valid, true);
  assert.equal(validation.errors.length, 0);
  assert.equal(validation.message.payload.nodes.length, 1);
});

test("rejects stale realtime messages by version and sequence", () => {
  const current = createRealtimeNodePatch({
    version: 2,
    seq: 10,
    source: "unit",
    patches: [{ id: "api", data: { status: "warn" } }],
  });
  const cursor = createRealtimeTopologyCursor(current);

  const stale = createRealtimeNodePatch({
    version: 2,
    seq: 9,
    source: "unit",
    patches: [{ id: "api", data: { status: "critical" } }],
  });
  const newer = createRealtimeNodePatch({
    version: 2,
    seq: 11,
    source: "unit",
    patches: [{ id: "api", data: { status: "ok" } }],
  });

  assert.equal(shouldAcceptRealtimeTopologyMessage(stale, cursor).accept, false);
  assert.equal(shouldAcceptRealtimeTopologyMessage(stale, cursor).reason, "stale");
  assert.equal(shouldAcceptRealtimeTopologyMessage(newer, cursor).accept, true);
});
