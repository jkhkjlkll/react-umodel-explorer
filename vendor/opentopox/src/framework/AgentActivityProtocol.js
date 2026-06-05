export const AGENT_ACTIVITY_EVENT_SCHEMA = "opentopox.agent-event.v1";

export const AGENT_ACTIVITY_EVENT_TYPES = Object.freeze({
  RUN_STARTED: "agent.run.started",
  RUN_COMPLETED: "agent.run.completed",
  RUN_FAILED: "agent.run.failed",
  STEP_STARTED: "agent.step.started",
  STEP_COMPLETED: "agent.step.completed",
  STEP_FAILED: "agent.step.failed",
  TOOL_STARTED: "agent.tool.started",
  TOOL_COMPLETED: "agent.tool.completed",
  TOOL_FAILED: "agent.tool.failed",
  MCP_REQUESTED: "agent.mcp.requested",
  MCP_COMPLETED: "agent.mcp.completed",
  MCP_FAILED: "agent.mcp.failed",
  SKILL_USED: "agent.skill.used",
  ARTIFACT_CREATED: "agent.artifact.created",
  CONTEXT_USED: "agent.context.used",
});

export const AGENT_ACTIVITY_KINDS = Object.freeze({
  RUN: "run",
  STEP: "step",
  TOOL: "tool",
  MCP: "mcp",
  SKILL: "skill",
  ARTIFACT: "artifact",
  CONTEXT: "context",
});

export const AGENT_ACTIVITY_STATUSES = Object.freeze({
  PENDING: "pending",
  RUNNING: "running",
  OK: "ok",
  WARN: "warn",
  CRITICAL: "critical",
});

const HEAVY_FIELD_NAMES = new Set([
  "body",
  "content",
  "context",
  "contextBody",
  "events",
  "input",
  "logs",
  "messages",
  "output",
  "payload",
  "prompt",
  "response",
  "text",
  "transcript",
]);

const AGENT_ACTIVITY_EVENT_TYPE_VALUES = Object.freeze(Object.values(AGENT_ACTIVITY_EVENT_TYPES));
const AGENT_ACTIVITY_STATUS_VALUES = Object.freeze(Object.values(AGENT_ACTIVITY_STATUSES));

export function createAgentActivityEvent(input = {}) {
  return normalizeAgentActivityEvent(input);
}

export function normalizeAgentActivityEvent(input = {}) {
  const raw = typeof input === "string" ? parseJson(input) : input;
  const source = isPlainObject(raw) ? raw : {};
  const type = source.type || "";
  const kind = normalizeActivityKind(source.kind || inferActivityKind(type));
  const runId = stringOrEmpty(source.runId || source.threadId || source.sessionId);
  const stepId = stringOrEmpty(source.stepId || source.parentStepId);
  const targetId = stringOrEmpty(source.targetId || source.activityId || source.toolCallId || source.toolId || source.mcpId || source.skillId || source.artifactId || source.contextId);
  const createdAt = normalizeDate(source.createdAt || source.timestamp || source.startedAt) || new Date().toISOString();
  const status = normalizeActivityStatus(source.status || inferActivityStatus(type));
  const event = {
    schema: source.schema || AGENT_ACTIVITY_EVENT_SCHEMA,
    id: stringOrEmpty(source.id) || createEventId({ type, runId, stepId, targetId, createdAt }),
    type,
    kind,
    runId,
    createdAt,
    status,
  };

  addOptionalString(event, "stepId", stepId);
  addOptionalString(event, "parentId", source.parentId);
  addOptionalString(event, "targetId", targetId);
  addOptionalString(event, "name", source.name || source.title || source.label);
  addOptionalString(event, "summary", source.summary);
  addOptionalString(event, "inputSummary", source.inputSummary);
  addOptionalString(event, "outputSummary", source.outputSummary);
  addOptionalString(event, "startedAt", normalizeDate(source.startedAt));
  addOptionalString(event, "endedAt", normalizeDate(source.endedAt));
  if (Number.isFinite(Number(source.durationMs))) event.durationMs = Number(source.durationMs);
  if (isPlainObject(source.error)) event.error = sanitizeError(source.error);

  const contextRef = sanitizeReference(source.contextRef || source.meta?.contextRef || source.ref, "context");
  const artifactRef = sanitizeReference(source.artifactRef || source.meta?.artifactRef, "artifact");
  const toolRef = sanitizeReference(source.toolRef || source.meta?.toolRef, "tool");
  const mcpRef = sanitizeReference(source.mcpRef || source.meta?.mcpRef, "mcp");
  const skillRef = sanitizeReference(source.skillRef || source.meta?.skillRef, "skill");
  if (contextRef) event.contextRef = contextRef;
  if (artifactRef) event.artifactRef = artifactRef;
  if (toolRef) event.toolRef = toolRef;
  if (mcpRef) event.mcpRef = mcpRef;
  if (skillRef) event.skillRef = skillRef;

  const meta = sanitizeActivityMeta(source.meta);
  if (Object.keys(meta).length) event.meta = meta;
  return event;
}

export function validateAgentActivityEvent(input, {
  allowFutureSchema = false,
} = {}) {
  const raw = typeof input === "string" ? parseJson(input) : input;
  const event = normalizeAgentActivityEvent(input);
  const errors = [];
  const warnings = [];

  if (!isPlainObject(raw)) errors.push("event must be a plain object or a JSON object string");
  if (!allowFutureSchema && event.schema !== AGENT_ACTIVITY_EVENT_SCHEMA) {
    errors.push(`schema must be ${AGENT_ACTIVITY_EVENT_SCHEMA}`);
  }
  if (!AGENT_ACTIVITY_EVENT_TYPE_VALUES.includes(event.type)) {
    errors.push(`type must be one of ${AGENT_ACTIVITY_EVENT_TYPE_VALUES.join(", ")}`);
  }
  if (!event.runId) errors.push("runId is required");
  if (!AGENT_ACTIVITY_STATUS_VALUES.includes(event.status)) {
    errors.push(`status must be one of ${AGENT_ACTIVITY_STATUS_VALUES.join(", ")}`);
  }
  if (!event.createdAt || Number.isNaN(Date.parse(event.createdAt))) errors.push("createdAt must be an ISO date-time string");
  for (const key of ["startedAt", "endedAt"]) {
    if (event[key] && Number.isNaN(Date.parse(event[key]))) errors.push(`${key} must be an ISO date-time string`);
  }
  if (Number.isFinite(event.durationMs) && event.durationMs < 0) errors.push("durationMs must be non-negative");

  const heavyFields = findHeavyFields(raw);
  if (heavyFields.length) {
    warnings.push(`Agent activity events should carry references, not large bodies: ${heavyFields.slice(0, 6).join(", ")}`);
  }
  if (event.contextRef && hasGraphBody(event.contextRef)) {
    warnings.push("contextRef should contain only lightweight metadata; load context body by id when needed");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    event,
  };
}

export function inferActivityKind(type = "") {
  if (type.includes(".run.")) return AGENT_ACTIVITY_KINDS.RUN;
  if (type.includes(".step.")) return AGENT_ACTIVITY_KINDS.STEP;
  if (type.includes(".tool.")) return AGENT_ACTIVITY_KINDS.TOOL;
  if (type.includes(".mcp.")) return AGENT_ACTIVITY_KINDS.MCP;
  if (type.includes(".skill.")) return AGENT_ACTIVITY_KINDS.SKILL;
  if (type.includes(".artifact.")) return AGENT_ACTIVITY_KINDS.ARTIFACT;
  if (type.includes(".context.")) return AGENT_ACTIVITY_KINDS.CONTEXT;
  return "";
}

export function inferActivityStatus(type = "") {
  if (type.endsWith(".started") || type.endsWith(".requested")) return AGENT_ACTIVITY_STATUSES.RUNNING;
  if (type.endsWith(".failed")) return AGENT_ACTIVITY_STATUSES.CRITICAL;
  if (type.endsWith(".completed") || type.endsWith(".used") || type.endsWith(".created")) return AGENT_ACTIVITY_STATUSES.OK;
  return AGENT_ACTIVITY_STATUSES.PENDING;
}

export function sanitizeActivityMeta(meta = {}) {
  if (!isPlainObject(meta)) return {};
  return sanitizePlainObject(meta, { depth: 0, maxDepth: 4 });
}

function sanitizePlainObject(value, { depth, maxDepth }) {
  if (!isPlainObject(value) || depth > maxDepth) return {};
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (isHeavyFieldName(key)) continue;
    const sanitized = sanitizeMetaValue(entry, { depth: depth + 1, maxDepth });
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}

function sanitizeMetaValue(value, { depth, maxDepth }) {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return truncateString(value, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeMetaValue(item, { depth, maxDepth })).filter((item) => item !== undefined);
  if (isPlainObject(value)) return sanitizePlainObject(value, { depth, maxDepth });
  return undefined;
}

function sanitizeReference(ref, fallbackType) {
  if (!isPlainObject(ref)) {
    if (typeof ref === "string" && ref.trim()) return { id: ref.trim(), type: fallbackType };
    return null;
  }
  const output = {};
  for (const key of ["id", "schema", "type", "name", "title", "summary", "source", "url"]) {
    if (ref[key] != null && ref[key] !== "") output[key] = truncateString(String(ref[key]), 500);
  }
  for (const key of ["nodeCount", "edgeCount", "size", "durationMs"]) {
    if (Number.isFinite(Number(ref[key]))) output[key] = Number(ref[key]);
  }
  if (typeof ref.truncated === "boolean") output.truncated = ref.truncated;
  if (!output.type && fallbackType) output.type = fallbackType;
  return output.id || output.name || output.title ? output : null;
}

function sanitizeError(error) {
  return {
    message: truncateString(String(error.message || "Agent activity failed"), 500),
    ...(error.code ? { code: String(error.code) } : {}),
  };
}

function addOptionalString(target, key, value) {
  const next = stringOrEmpty(value);
  if (next) target[key] = next;
}

function normalizeActivityKind(kind) {
  return Object.values(AGENT_ACTIVITY_KINDS).includes(kind) ? kind : "";
}

function normalizeActivityStatus(status) {
  return AGENT_ACTIVITY_STATUS_VALUES.includes(status) ? status : AGENT_ACTIVITY_STATUSES.PENDING;
}

function normalizeDate(value) {
  if (!value) return "";
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return "";
  return new Date(timestamp).toISOString();
}

function stringOrEmpty(value) {
  return value == null ? "" : String(value).trim();
}

function truncateString(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value;
}

function createEventId({ type, runId, stepId, targetId, createdAt }) {
  return [runId, stepId, targetId, type, createdAt].filter(Boolean).map(safeIdPart).join(":");
}

function safeIdPart(value) {
  return String(value).replace(/\s+/g, "_").replace(/[^\w:.-]/g, "_");
}

function findHeavyFields(value, path = "", found = []) {
  if (!isPlainObject(value)) return found;
  for (const [key, entry] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (isHeavyFieldName(key)) found.push(nextPath);
    else if (isPlainObject(entry)) findHeavyFields(entry, nextPath, found);
    if (found.length >= 20) break;
  }
  return found;
}

function isHeavyFieldName(key = "") {
  return HEAVY_FIELD_NAMES.has(String(key)) || /(?:Body|Content|Payload|Prompt|Response|Transcript)$/.test(String(key));
}

function hasGraphBody(ref) {
  return Array.isArray(ref.nodes) || Array.isArray(ref.edges) || Array.isArray(ref.messages);
}

function parseJson(input) {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
