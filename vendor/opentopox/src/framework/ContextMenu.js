export class ContextMenu {
  constructor({
    container,
    graph,
    items = [],
    className = "",
    closeOnAction = true,
    enableContextCopy = false,
    contextOptions = {},
    contextCopyLabel = "Copy Agent context",
  }) {
    if (!container) throw new Error("ContextMenu requires a container");
    this.container = container;
    this.graph = graph;
    this.items = items;
    this.className = className;
    this.closeOnAction = closeOnAction;
    this.enableContextCopy = enableContextCopy;
    this.contextOptions = contextOptions;
    this.contextCopyLabel = contextCopyLabel;
    this.menu = document.createElement("div");
    this.menu.className = `topo-context-menu ${className}`.trim();
    this.menu.hidden = true;
    this.container.appendChild(this.menu);
    this.context = null;
    this.handleContextMenu = (event) => this.openFromEvent(event);
    this.handleDocumentClick = (event) => {
      if (!this.menu.contains(event.target)) this.close();
    };
    this.handleKeydown = (event) => {
      if (event.key === "Escape") this.close();
    };
    this.handleMenuClick = (event) => this.handleMenuClickEvent(event);
    this.handleResize = () => this.close();
    this.container.addEventListener("contextmenu", this.handleContextMenu);
    this.menu.addEventListener("click", this.handleMenuClick);
    document.addEventListener("click", this.handleDocumentClick);
    document.addEventListener("keydown", this.handleKeydown);
    window.addEventListener("resize", this.handleResize, { passive: true });
  }

  getGraphApi() {
    return this.graph?.getGraph?.() || this.graph;
  }

  openFromEvent(event) {
    const graph = this.getGraphApi();
    const context = resolveGraphTarget(event, graph);
    event.preventDefault();
    event.stopPropagation();
    syncContextSelection(context, graph, event);
    this.context = {
      ...context,
      event,
      graph,
      selection: graph?.getSelection?.(),
    };
    const items = this.resolveMenuItems(this.context);
    if (!items.length) {
      this.close();
      return;
    }
    this.render(items);
    this.place(event.clientX, event.clientY);
    this.container.dispatchEvent(new CustomEvent("topo:context-menu", {
      detail: { type: this.context.type, id: this.context.id, items },
      bubbles: true,
    }));
  }

  resolveMenuItems(context) {
    const items = resolveItems(this.items, context);
    if (!this.enableContextCopy || !context.graph?.copyContext) return items;
    return [
      {
        label: this.contextCopyLabel,
        shortcut: context.selection?.nodes?.length || context.selection?.edges?.length ? "selection" : "visible",
        action: () => context.graph.copyContext(this.contextOptions),
      },
      ...(items.length ? [{ separator: true }, ...items] : []),
    ];
  }

  render(items) {
    this.currentItems = items;
    this.menu.innerHTML = items.map((item, index) => {
      if (item.separator) return '<div class="topo-context-separator" role="separator"></div>';
      return `
        <button class="${item.danger ? "is-danger" : ""}" type="button" data-menu-index="${index}" ${item.disabled ? "disabled" : ""}>
          <span>${escapeHtml(item.label)}</span>
          ${item.shortcut ? `<kbd>${escapeHtml(item.shortcut)}</kbd>` : ""}
        </button>
      `;
    }).join("");
  }

  place(clientX, clientY) {
    const rect = this.container.getBoundingClientRect();
    this.menu.hidden = false;
    const menuRect = this.menu.getBoundingClientRect();
    const left = clamp(clientX - rect.left, 8, rect.width - menuRect.width - 8);
    const top = clamp(clientY - rect.top, 8, rect.height - menuRect.height - 8);
    this.menu.style.left = `${left}px`;
    this.menu.style.top = `${top}px`;
  }

  handleMenuClickEvent(event) {
    const button = event.target.closest("[data-menu-index]");
    if (!button) return;
    const item = this.currentItems?.[Number(button.dataset.menuIndex)];
    if (!item || item.disabled) return;
    item.action?.(this.context);
    this.container.dispatchEvent(new CustomEvent("topo:context-menu-action", {
      detail: { label: item.label, type: this.context?.type, id: this.context?.id },
      bubbles: true,
    }));
    if (this.closeOnAction) this.close();
  }

  close() {
    this.menu.hidden = true;
    this.context = null;
  }

  destroy() {
    this.container.removeEventListener("contextmenu", this.handleContextMenu);
    this.menu.removeEventListener("click", this.handleMenuClick);
    document.removeEventListener("click", this.handleDocumentClick);
    document.removeEventListener("keydown", this.handleKeydown);
    window.removeEventListener("resize", this.handleResize);
    this.menu.remove();
  }
}

function resolveItems(items, context) {
  const nextItems = typeof items === "function" ? items(context) : items;
  return (nextItems || []).filter((item) => item && !item.hidden);
}

export function resolveGraphTarget(event, graph) {
  const nodeEl = event.target.closest?.(".topo-node[data-node-id]");
  if (nodeEl) {
    const id = nodeEl.dataset.nodeId;
    const node = graph?.getNodes?.().find((item) => item.id === id);
    return { type: "node", id, node, element: nodeEl };
  }

  const edgeEl = event.target.closest?.(".topo-edge[data-edge-id]");
  if (edgeEl) {
    const id = edgeEl.dataset.edgeId;
    const edge = graph?.getEdges?.().find((item) => item.id === id);
    return { type: "edge", id, edge, element: edgeEl };
  }

  return { type: "canvas", id: "", element: event.currentTarget };
}

function syncContextSelection(context, graph, event) {
  if (!graph?.setSelection || (context.type !== "node" && context.type !== "edge")) return;
  if (graph.isSelectionEnabled && !graph.isSelectionEnabled()) return;
  const selection = graph.getSelection?.() || { nodes: [], edges: [], primary: null };
  const selected = context.type === "node"
    ? selection.nodes?.includes(context.id)
    : selection.edges?.includes(context.id);
  if ((event?.ctrlKey || event?.metaKey) && graph.toggleSelectionItem) {
    graph.toggleSelectionItem({ type: context.type, id: context.id });
    return;
  }
  if (selected) {
    graph.setSelection({ ...selection, primary: { type: context.type, id: context.id } });
    return;
  }
  graph.setSelection({
    nodes: context.type === "node" ? [context.id] : [],
    edges: context.type === "edge" ? [context.id] : [],
    primary: { type: context.type, id: context.id },
  });
}

function clamp(value, min, max) {
  if (!Number.isFinite(max) || max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
