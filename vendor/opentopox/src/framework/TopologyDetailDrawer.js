import { buildTopologyDetailModel } from "./EntityTopologyModel.js";

const DEFAULT_LABELS = {
  emptyTitle: "选择实体或关系",
  emptyDescription: "查看实体属性、指标状态和上下游关系。",
  emptyIcon: "i",
  attributes: "基础属性",
  descriptions: "指标表",
  datasets: "数据集",
  relatedEdges: "上下游关系",
  aggregatedEdges: "聚合明细",
  groupMembers: "实体表",
  endpoints: "关系端点",
  parallelEdges: "平行边",
  tags: "标签",
  source: "源实体",
  target: "目标实体",
  edgeLabel: "关系",
  parallelTotal: "同源同目标关系",
  parallelOffset: "当前偏移",
  expandGroup: "展开分组",
  collapseGroup: "折叠分组",
  moreRows: "更多记录",
};

export class TopologyDetailDrawer {
  constructor({
    container,
    nodes = [],
    edges = [],
    context = {},
    getNodes,
    getEdges,
    getContext,
    labels = {},
    maxRelatedEdges = 16,
    maxTableRows = 24,
    onEdgeClick,
    onGroupToggle,
    isGroupExpanded,
  } = {}) {
    if (!container) {
      throw new Error("TopologyDetailDrawer requires a container element.");
    }
    this.container = container;
    this.nodes = nodes;
    this.edges = edges;
    this.context = context;
    this.getNodes = getNodes;
    this.getEdges = getEdges;
    this.getContext = getContext;
    this.labels = { ...DEFAULT_LABELS, ...labels };
    this.maxRelatedEdges = maxRelatedEdges;
    this.maxTableRows = maxTableRows;
    this.onEdgeClick = onEdgeClick;
    this.onGroupToggle = onGroupToggle;
    this.isGroupExpanded = isGroupExpanded;
    this.currentDetail = null;
    this.showEmpty();
  }

  setData({ nodes, edges, context } = {}) {
    if (Array.isArray(nodes)) this.nodes = nodes;
    if (Array.isArray(edges)) this.edges = edges;
    if (context) this.context = context;
    return this;
  }

  showEmpty(options = {}) {
    const labels = { ...this.labels, ...options };
    this.currentDetail = null;
    this.container.dataset.detailKind = "";
    this.container.dataset.detailId = "";
    this.container.innerHTML = `
      <div class="topo-detail-empty details-empty">
        <div class="empty-icon">${escapeHtml(labels.emptyIcon)}</div>
        <h2>${escapeHtml(labels.emptyTitle)}</h2>
        <p>${escapeHtml(labels.emptyDescription)}</p>
      </div>
    `;
  }

  showItem(item, options = {}) {
    const detail = buildTopologyDetailModel({
      item,
      type: options.type,
      nodes: this.resolveNodes(options),
      edges: this.resolveEdges(options),
      context: this.resolveContext(options),
    });
    return this.showDetail(detail, options);
  }

  showDetail(detail) {
    if (!detail) {
      this.showEmpty();
      return null;
    }
    this.currentDetail = detail;
    this.container.dataset.detailKind = detail.kind || "";
    this.container.dataset.detailId = detail.id || "";
    this.container.innerHTML = `
      ${this.renderHeader(detail)}
      ${this.renderRows(detail.rows)}
      ${this.renderDetailSections(detail)}
    `;
    this.bindActions(detail);
    return detail;
  }

  resolveNodes(options = {}) {
    if (Array.isArray(options.nodes)) return options.nodes;
    if (typeof this.getNodes === "function") return this.getNodes() || [];
    return this.nodes || [];
  }

  resolveEdges(options = {}) {
    if (Array.isArray(options.edges)) return options.edges;
    if (typeof this.getEdges === "function") return this.getEdges() || [];
    return this.edges || [];
  }

  resolveContext(options = {}) {
    if (options.context) return options.context;
    if (typeof this.getContext === "function") return this.getContext() || {};
    return this.context || {};
  }

  renderHeader(detail) {
    const statusClass = toClassToken(detail.status || "ok");
    const color = sanitizeColor(detail.color);
    const style = color ? ` style="color:${escapeAttribute(color)}"` : "";
    return `
      <div class="topo-detail-header details-header entity-detail-header status-${statusClass}">
        <span class="topo-detail-icon details-icon entity-detail-icon"${style}>${escapeHtml(detail.icon || iconForKind(detail.kind))}</span>
        <div>
          <h2>${escapeHtml(detail.title || detail.id)}</h2>
          <p>${escapeHtml(detail.subTitle || detail.id || "")}</p>
        </div>
      </div>
    `;
  }

  renderRows(rows = []) {
    if (!rows.length) return "";
    return `
      <dl class="topo-detail-list details-list entity-detail-list">
        ${rows.map((row) => `
          <div>
            <dt>${escapeHtml(row.label)}</dt>
            <dd>${escapeHtml(row.value)}</dd>
          </div>
        `).join("")}
      </dl>
    `;
  }

  renderDetailSections(detail) {
    return [
      this.renderDescriptionSection(detail),
      this.renderDatasetSection(detail),
      this.renderTagSection(detail),
      this.renderEndpointSection(detail),
      this.renderRelatedEdges(detail),
      this.renderAggregatedEdges(detail),
      this.renderParallelEdges(detail),
      this.renderGroupAction(detail),
      this.renderGroupMembers(detail),
    ].filter(Boolean).join("");
  }

  renderDescriptionSection(detail) {
    const rows = normalizeKeyValueRows(detail.descriptions);
    if (!rows.length) return "";
    return this.renderTableSection(this.labels.descriptions, rows);
  }

  renderDatasetSection(detail) {
    const rows = normalizeKeyValueRows(detail.datasets);
    if (!rows.length) return "";
    return this.renderTableSection(this.labels.datasets, rows);
  }

  renderTagSection(detail) {
    if (!Array.isArray(detail.tags) || !detail.tags.length) return "";
    return `
      <div class="topo-detail-section details-section relation-section">
        <h3>${escapeHtml(this.labels.tags)}</h3>
        <div class="tag-list topo-detail-tags">
          ${detail.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
    `;
  }

  renderEndpointSection(detail) {
    if (detail.kind !== "edge" && detail.kind !== "groupEdge") return "";
    const rows = [];
    if (detail.context?.sourceNode) {
      rows.push({ label: this.labels.source, value: displayNode(detail.context.sourceNode) });
    }
    if (detail.context?.targetNode) {
      rows.push({ label: this.labels.target, value: displayNode(detail.context.targetNode) });
    }
    if (!rows.length) return "";
    return this.renderTableSection(this.labels.endpoints, rows);
  }

  renderRelatedEdges(detail) {
    if (!Array.isArray(detail.relatedEdges) || !detail.relatedEdges.length) return "";
    const rows = detail.relatedEdges.slice(0, this.maxRelatedEdges);
    const overflow = detail.relatedEdges.length - rows.length;
    return `
      <div class="topo-detail-section details-section relation-section">
        <h3>${escapeHtml(this.labels.relatedEdges)}</h3>
        ${rows.map((edge) => `
          <button class="topo-detail-link relation-row relation-link" type="button" data-topo-edge-id="${escapeAttribute(edge.id)}">
            ${escapeHtml(edge.source)} -> ${escapeHtml(edge.target)}
            <span>${escapeHtml(edge.label || edge.id)}</span>
          </button>
        `).join("")}
        ${overflow > 0 ? `<div class="relation-more">${escapeHtml(overflow)} ${escapeHtml(this.labels.moreRows)}</div>` : ""}
      </div>
    `;
  }

  renderAggregatedEdges(detail) {
    if (!Array.isArray(detail.aggregatedEdges) || detail.aggregatedEdges.length <= 1) return "";
    const rows = detail.aggregatedEdges.slice(0, this.maxTableRows).map((edge) => ({
      label: `${edge.source} -> ${edge.target}`,
      value: edge.label || edge.id,
    }));
    return this.renderTableSection(this.labels.aggregatedEdges, rows);
  }

  renderParallelEdges(detail) {
    if (!detail.parallel || Number(detail.parallel.total || 1) <= 1) return "";
    return this.renderTableSection(this.labels.parallelEdges, [
      { label: this.labels.parallelTotal, value: detail.parallel.total },
      { label: this.labels.parallelOffset, value: detail.parallel.offset },
    ]);
  }

  renderGroupAction(detail) {
    if (detail.kind !== "group" || typeof this.onGroupToggle !== "function") return "";
    const groupId = detail.groupId || String(detail.id || "").replace(/^group:/, "").replace(/:overflow$/, "");
    const expanded = typeof this.isGroupExpanded === "function"
      ? Boolean(this.isGroupExpanded(groupId, detail))
      : Boolean(detail.expanded);
    return `
      <button class="topo-detail-action detail-action" type="button" data-topo-group-id="${escapeAttribute(groupId)}" data-topo-group-expanded="${expanded}">
        ${escapeHtml(expanded ? this.labels.collapseGroup : this.labels.expandGroup)}
      </button>
    `;
  }

  renderGroupMembers(detail) {
    if (detail.kind !== "group" || !Array.isArray(detail.members) || !detail.members.length) return "";
    const rows = detail.members.slice(0, this.maxTableRows).map((node) => ({
      label: node.data?.title || node.id,
      value: node.data?.subTitle || node.data?.domain || node.id,
    }));
    return this.renderTableSection(this.labels.groupMembers, rows);
  }

  renderTableSection(title, rows = []) {
    if (!rows.length) return "";
    return `
      <div class="topo-detail-section details-section relation-section">
        <h3>${escapeHtml(title)}</h3>
        ${rows.map((row) => `
          <div class="topo-detail-table-row table-row">
            <span>${escapeHtml(row.label)}</span>
            <strong>${escapeHtml(row.value)}</strong>
          </div>
        `).join("")}
      </div>
    `;
  }

  bindActions(detail) {
    this.container.querySelectorAll("[data-topo-edge-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const edge = this.resolveEdges().find((item) => item.id === button.dataset.topoEdgeId)
          || detail.relatedEdges?.find((item) => item.id === button.dataset.topoEdgeId);
        if (!edge) return;
        if (typeof this.onEdgeClick === "function") {
          this.onEdgeClick(edge, detail);
        } else {
          this.showItem(edge, { type: "edge" });
        }
      });
    });

    this.container.querySelector("[data-topo-group-id]")?.addEventListener("click", (event) => {
      if (typeof this.onGroupToggle !== "function") return;
      this.onGroupToggle({
        groupId: event.currentTarget.dataset.topoGroupId,
        expanded: event.currentTarget.dataset.topoGroupExpanded === "true",
        detail,
      });
    });
  }
}

function normalizeKeyValueRows(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter(Boolean)
      .map((item) => ({
        label: item.label ?? item.name ?? item.key ?? "",
        value: formatCellValue(item.value ?? item.count ?? item.id ?? ""),
      }))
      .filter((item) => item.label || item.value);
  }
  if (typeof value === "object") {
    return Object.entries(value).map(([key, entryValue]) => ({
      label: key,
      value: formatCellValue(entryValue),
    }));
  }
  return [{ label: "", value: formatCellValue(value) }];
}

function formatCellValue(value) {
  if (Array.isArray(value)) return `${value.length} 条`;
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

function displayNode(node) {
  return node?.data?.title || node?.data?.subTitle || node?.id || "";
}

function iconForKind(kind) {
  if (kind === "edge" || kind === "groupEdge") return "ED";
  if (kind === "group") return "GR";
  return "N";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function toClassToken(value) {
  return String(value ?? "").replace(/[^a-zA-Z0-9_-]/g, "-") || "unknown";
}

function sanitizeColor(value) {
  const color = String(value || "");
  if (/^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
  if (/^[a-zA-Z]+$/.test(color)) return color;
  return "";
}
