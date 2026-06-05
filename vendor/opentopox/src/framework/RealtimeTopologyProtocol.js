export const REALTIME_TOPOLOGY_PROTOCOL = "topology.realtime.v1";

export const REALTIME_TOPOLOGY_MESSAGE_TYPES = Object.freeze({
  SNAPSHOT: "snapshot",
  NODE_PATCH: "nodePatch",
  EDGE_PATCH: "edgePatch",
  TOPOLOGY_PATCH: "topologyPatch",
});

export const REALTIME_TOPOLOGY_PATCH_OPERATIONS = Object.freeze({
  ADD: "add",
  UPDATE: "update",
  REMOVE: "remove",
});

export function createRealtimeTopologyMessage({
  type,
  payload = {},
  version = 0,
  seq = 0,
  serverTime = new Date().toISOString(),
  source = "unknown",
  traceId = createTraceId({ source, version, seq }),
  meta,
  protocol = REALTIME_TOPOLOGY_PROTOCOL,
} = {}) {
  const message = {
    protocol,
    type,
    version,
    seq,
    serverTime,
    source,
    traceId,
    payload,
  };
  if (meta && isPlainObject(meta)) message.meta = { ...meta };
  return message;
}

export function createRealtimeTopologySnapshot({
  nodes = [],
  edges = [],
  payload,
  ...message
} = {}) {
  return createRealtimeTopologyMessage({
    ...message,
    type: REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT,
    payload: {
      mode: "replace",
      nodes,
      edges,
      ...payload,
    },
  });
}

export function createRealtimeNodePatch({
  patches = [],
  payload,
  ...message
} = {}) {
  return createRealtimeTopologyMessage({
    ...message,
    type: REALTIME_TOPOLOGY_MESSAGE_TYPES.NODE_PATCH,
    payload: {
      patches: patches.map(normalizeEntityPatch),
      ...payload,
    },
  });
}

export function createRealtimeEdgePatch({
  patches = [],
  payload,
  ...message
} = {}) {
  return createRealtimeTopologyMessage({
    ...message,
    type: REALTIME_TOPOLOGY_MESSAGE_TYPES.EDGE_PATCH,
    payload: {
      patches: patches.map(normalizeEntityPatch),
      ...payload,
    },
  });
}

export function createRealtimeTopologyPatch({
  addNodes = [],
  updateNodes = [],
  removeNodeIds = [],
  addEdges = [],
  updateEdges = [],
  removeEdgeIds = [],
  payload,
  ...message
} = {}) {
  return createRealtimeTopologyMessage({
    ...message,
    type: REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH,
    payload: {
      addNodes,
      updateNodes,
      removeNodeIds,
      addEdges,
      updateEdges,
      removeEdgeIds,
      ...payload,
    },
  });
}

export function normalizeRealtimeTopologyMessage(input) {
  const parsed = typeof input === "string" ? parseJson(input) : input;
  if (!isPlainObject(parsed)) {
    return {
      protocol: REALTIME_TOPOLOGY_PROTOCOL,
      type: "",
      version: 0,
      seq: 0,
      serverTime: "",
      source: "",
      traceId: "",
      payload: {},
      meta: { invalidInput: true },
    };
  }

  return {
    protocol: parsed.protocol || REALTIME_TOPOLOGY_PROTOCOL,
    type: parsed.type || "",
    version: parsed.version ?? 0,
    seq: Number(parsed.seq ?? 0),
    serverTime: parsed.serverTime || parsed.timestamp || "",
    source: parsed.source || "",
    traceId: parsed.traceId || "",
    payload: isPlainObject(parsed.payload) ? parsed.payload : {},
    ...(isPlainObject(parsed.meta) ? { meta: { ...parsed.meta } } : {}),
  };
}

export function validateRealtimeTopologyMessage(message, {
  requireTraceId = false,
  allowFutureProtocol = false,
} = {}) {
  const normalized = normalizeRealtimeTopologyMessage(message);
  const errors = [];
  const warnings = [];

  if (normalized.meta?.invalidInput) {
    errors.push("message must be a plain object or a JSON object string");
  }
  if (!allowFutureProtocol && normalized.protocol !== REALTIME_TOPOLOGY_PROTOCOL) {
    errors.push(`protocol must be ${REALTIME_TOPOLOGY_PROTOCOL}`);
  }
  if (!Object.values(REALTIME_TOPOLOGY_MESSAGE_TYPES).includes(normalized.type)) {
    errors.push(`type must be one of ${Object.values(REALTIME_TOPOLOGY_MESSAGE_TYPES).join(", ")}`);
  }
  if (!isValidVersion(normalized.version)) {
    errors.push("version must be a non-empty string or finite number");
  }
  if (!Number.isSafeInteger(normalized.seq) || normalized.seq < 0) {
    errors.push("seq must be a non-negative safe integer");
  }
  if (!normalized.serverTime || Number.isNaN(Date.parse(normalized.serverTime))) {
    errors.push("serverTime must be an ISO date-time string");
  }
  if (!normalized.source) {
    errors.push("source is required");
  }
  if (!normalized.traceId) {
    const messageText = "traceId is recommended for realtime topology diagnostics";
    if (requireTraceId) errors.push(messageText);
    else warnings.push(messageText);
  }

  validatePayload(normalized, errors, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    message: normalized,
  };
}

export function createRealtimeTopologyCursor(message) {
  const normalized = normalizeRealtimeTopologyMessage(message);
  return {
    version: normalized.version,
    seq: normalized.seq,
    serverTime: normalized.serverTime,
    source: normalized.source,
    traceId: normalized.traceId,
  };
}

export function compareRealtimeTopologyVersions(left, right) {
  if (left === right) return 0;
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
    return Math.sign(leftNumber - rightNumber);
  }
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: "base" });
}

export function compareRealtimeTopologyMessages(left, right) {
  const a = normalizeRealtimeTopologyMessage(left);
  const b = normalizeRealtimeTopologyMessage(right);
  const versionDelta = compareRealtimeTopologyVersions(a.version, b.version);
  if (versionDelta) return versionDelta;
  return Math.sign(a.seq - b.seq);
}

export function shouldAcceptRealtimeTopologyMessage(message, cursor = {}, options = {}) {
  const currentCursor = cursor || {};
  const validation = validateRealtimeTopologyMessage(message, options);
  if (!validation.valid) {
    return {
      accept: false,
      reason: "invalid",
      validation,
      cursor: currentCursor,
    };
  }
  if (!isValidVersion(currentCursor.version)) {
    return {
      accept: true,
      reason: "initial",
      validation,
      cursor: createRealtimeTopologyCursor(validation.message),
    };
  }

  const order = compareRealtimeTopologyMessages(validation.message, currentCursor);
  if (order <= 0) {
    return {
      accept: false,
      reason: "stale",
      validation,
      cursor: currentCursor,
    };
  }

  return {
    accept: true,
    reason: "newer",
    validation,
    cursor: createRealtimeTopologyCursor(validation.message),
  };
}

function validatePayload(message, errors, warnings) {
  const payload = message.payload;
  if (!isPlainObject(payload)) {
    errors.push("payload must be a plain object");
    return;
  }

  if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.SNAPSHOT) {
    if (!Array.isArray(payload.nodes)) errors.push("snapshot payload.nodes must be an array");
    if (!Array.isArray(payload.edges)) errors.push("snapshot payload.edges must be an array");
    return;
  }

  if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.NODE_PATCH) {
    validateEntityPatches(payload.patches, "nodePatch", errors);
    return;
  }

  if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.EDGE_PATCH) {
    validateEntityPatches(payload.patches, "edgePatch", errors);
    return;
  }

  if (message.type === REALTIME_TOPOLOGY_MESSAGE_TYPES.TOPOLOGY_PATCH) {
    const operationKeys = ["addNodes", "updateNodes", "removeNodeIds", "addEdges", "updateEdges", "removeEdgeIds"];
    for (const key of operationKeys) {
      if (payload[key] != null && !Array.isArray(payload[key])) {
        errors.push(`topologyPatch payload.${key} must be an array when provided`);
      }
    }
    const hasOperation = operationKeys.some((key) => Array.isArray(payload[key]) && payload[key].length > 0);
    if (!hasOperation) warnings.push("topologyPatch payload has no operations");
  }
}

function validateEntityPatches(patches, name, errors) {
  if (!Array.isArray(patches)) {
    errors.push(`${name} payload.patches must be an array`);
    return;
  }
  patches.forEach((patch, index) => {
    if (!isPlainObject(patch)) {
      errors.push(`${name} payload.patches[${index}] must be a plain object`);
      return;
    }
    if (!patch.id) errors.push(`${name} payload.patches[${index}].id is required`);
    if (!isPlainObject(patch.data) && !isPlainObject(patch.patch)) {
      errors.push(`${name} payload.patches[${index}] requires data or patch object`);
    }
  });
}

function normalizeEntityPatch(patch) {
  if (!isPlainObject(patch)) return { id: "", data: {} };
  return {
    id: patch.id,
    ...(isPlainObject(patch.data) ? { data: { ...patch.data } } : {}),
    ...(isPlainObject(patch.patch) ? { patch: { ...patch.patch } } : {}),
    ...(Array.isArray(patch.removeFields) ? { removeFields: [...patch.removeFields] } : {}),
    ...(patch.replace === true ? { replace: true } : {}),
    ...(isPlainObject(patch.meta) ? { meta: { ...patch.meta } } : {}),
  };
}

function createTraceId({ source, version, seq }) {
  return `${source || "unknown"}:${version ?? 0}:${seq ?? 0}`;
}

function isValidVersion(version) {
  if (typeof version === "number") return Number.isFinite(version);
  if (typeof version === "string") return version.trim().length > 0;
  return false;
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
