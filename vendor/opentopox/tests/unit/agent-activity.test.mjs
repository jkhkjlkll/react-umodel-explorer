import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_ACTIVITY_EVENT_TYPES,
  buildAgentActivityTopology,
  createAgentActivityAdapter,
  createAgentActivityEvent,
  createChatTopologyBlockPayload,
  validateAgentActivityEvent,
  validateChatTopologyBlockPayload,
  validateGraphData,
} from "../../src/framework/index.js";

test("Agent activity events carry lightweight references instead of context bodies", () => {
  const validation = validateAgentActivityEvent({
    type: AGENT_ACTIVITY_EVENT_TYPES.CONTEXT_USED,
    runId: "run-1",
    stepId: "inspect",
    targetId: "ctx-1",
    name: "Selected topology",
    context: { nodes: [{ id: "heavy" }], edges: [] },
    contextRef: {
      id: "ctx-1",
      summary: "5 nodes, 4 edges",
      nodeCount: 5,
      edgeCount: 4,
      truncated: false,
    },
    meta: {
      context: { nodes: [{ id: "heavy" }] },
      safe: "kept",
    },
  });

  assert.equal(validation.valid, true);
  assert.equal(validation.event.contextRef.id, "ctx-1");
  assert.equal(validation.event.contextRef.nodeCount, 5);
  assert.equal(validation.event.meta.safe, "kept");
  assert.equal(validation.event.meta.context, undefined);
  assert.match(validation.warnings.join("\n"), /references/);
});

test("AgentActivityAdapter maps realtime activity into topology patches", () => {
  const adapter = createAgentActivityAdapter();
  adapter.ingest(createAgentActivityEvent({
    type: AGENT_ACTIVITY_EVENT_TYPES.RUN_STARTED,
    runId: "run-1",
    name: "Fix issue",
  }));
  adapter.ingest({
    type: AGENT_ACTIVITY_EVENT_TYPES.STEP_STARTED,
    runId: "run-1",
    stepId: "inspect",
    name: "Inspect code",
  });
  adapter.ingest({
    type: AGENT_ACTIVITY_EVENT_TYPES.TOOL_STARTED,
    runId: "run-1",
    stepId: "inspect",
    targetId: "exec-1",
    name: "exec_command",
  });
  const failed = adapter.ingest({
    type: AGENT_ACTIVITY_EVENT_TYPES.TOOL_FAILED,
    runId: "run-1",
    stepId: "inspect",
    targetId: "exec-1",
    name: "exec_command",
    error: { message: "command failed" },
  });

  assert.equal(failed.valid, true);
  const graph = adapter.getGraphData();
  const run = graph.nodes.find((node) => node.type === "agentRunNode");
  const step = graph.nodes.find((node) => node.type === "agentStepNode");
  const tool = graph.nodes.find((node) => node.type === "toolCallNode");
  assert.equal(run.data.status, "warn");
  assert.equal(step.data.status, "warn");
  assert.equal(tool.data.status, "critical");
  assert.equal(graph.edges.some((edge) => edge.data.relation === "invokes" && edge.target === tool.id), true);

  const validation = validateGraphData(graph.nodes, graph.edges);
  assert.equal(validation.valid, true);
});

test("buildAgentActivityTopology and chat block payload support compact AI output", () => {
  const events = [
    { type: AGENT_ACTIVITY_EVENT_TYPES.RUN_STARTED, runId: "run-2", name: "Answer question" },
    { type: AGENT_ACTIVITY_EVENT_TYPES.STEP_STARTED, runId: "run-2", stepId: "summarize", name: "Summarize topology" },
    { type: AGENT_ACTIVITY_EVENT_TYPES.ARTIFACT_CREATED, runId: "run-2", stepId: "summarize", targetId: "reply-topology", artifactRef: { id: "reply-topology", summary: "compact block" } },
  ];
  const graph = buildAgentActivityTopology(events);
  const payload = createChatTopologyBlockPayload({
    kind: "activity-trace",
    title: "Agent activity",
    graph,
    view: { compact: true, maxHeight: 180 },
  });
  const validation = validateChatTopologyBlockPayload(payload);

  assert.equal(graph.nodes.length, 3);
  assert.equal(payload.schema, "opentopox.chat-topology-block.v1");
  assert.equal(payload.view.readonly, true);
  assert.equal(validation.valid, true);
});
