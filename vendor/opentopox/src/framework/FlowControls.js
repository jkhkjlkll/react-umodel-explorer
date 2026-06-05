export class FlowControls {
  constructor({
    container,
    graph,
    actions = ["zoom-out", "zoom-in", "fit", "fullscreen", "minimap"],
    orientation = "horizontal",
    className = "",
    zoomStep = 1.22,
  }) {
    if (!container) throw new Error("FlowControls requires a container");
    this.container = container;
    this.graph = graph;
    this.actions = actions;
    this.orientation = orientation;
    this.className = className;
    this.zoomStep = Number.isFinite(zoomStep) && zoomStep > 1 ? zoomStep : 1.22;
    this.zoom = 1;
    this.graphEventRoot = null;
    this.handleClick = (event) => {
      const button = event.target.closest("[data-control-action]");
      if (!button) return;
      this.runAction(button.dataset.controlAction);
    };
    this.handleViewport = (event) => this.setZoom(event.detail.zoom);
    this.handleFullscreen = (event) => this.renderFullscreenState(event.detail.enabled);
    this.handleMinimap = (event) => this.renderMinimapState(event.detail.enabled);
    this.render();
    this.bindGraphEvents();
  }

  getGraphApi() {
    return this.graph?.getGraph?.() || this.graph;
  }

  setZoom(zoom) {
    this.zoom = Number.isFinite(zoom) ? zoom : 1;
    const label = this.container.querySelector("[data-role='controls-zoom']");
    if (label) label.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  bindGraphEvents() {
    const root = this.graph?.container || this.getGraphApi()?.getContainer?.();
    if (!root) return;
    this.graphEventRoot = root;
    root.addEventListener("topo:viewport", this.handleViewport);
    root.addEventListener("topo:fullscreen", this.handleFullscreen);
    root.addEventListener("topo:minimap", this.handleMinimap);
  }

  render() {
    const buttons = this.actions.map((action) => renderControlButton(action)).join("");
    this.container.innerHTML = `
      <div class="flow-controls ${escapeHtml(this.className)} is-${escapeHtml(this.orientation)}" aria-label="Topology controls">
        ${buttons}
        <span class="flow-controls-zoom" data-role="controls-zoom">100%</span>
      </div>
    `;
    this.setZoom(this.getGraphApi()?.getViewport?.().zoom ?? 1);
    this.renderFullscreenState(this.getGraphApi()?.isFullscreen?.() ?? false);
    this.renderMinimapState(this.getGraphApi()?.isMinimapVisible?.() ?? false);
    this.container.addEventListener("click", this.handleClick);
  }

  async runAction(action) {
    const graph = this.getGraphApi();
    if (!graph) return;
    if (action === "fit") graph.fitView?.({ padding: 0.16 });
    if (action === "center") graph.fitCenter?.();
    if (action === "zoom-in") graph.zoomTo?.(graph.getViewport().zoom * this.zoomStep);
    if (action === "zoom-out") graph.zoomTo?.(graph.getViewport().zoom / this.zoomStep);
    if (action === "fullscreen") {
      const enabled = await graph.toggleFullscreen?.();
      this.renderFullscreenState(Boolean(enabled));
    }
    if (action === "minimap") {
      graph.setMinimapVisible?.(!graph.isMinimapVisible?.());
      this.renderMinimapState(graph.isMinimapVisible?.() ?? false);
    }
  }

  renderFullscreenState(enabled) {
    this.container.querySelector("[data-control-action='fullscreen']")?.classList.toggle("active", Boolean(enabled));
  }

  renderMinimapState(enabled) {
    this.container.querySelector("[data-control-action='minimap']")?.classList.toggle("active", Boolean(enabled));
  }

  destroy() {
    this.container.removeEventListener("click", this.handleClick);
    if (this.graphEventRoot) {
      this.graphEventRoot.removeEventListener("topo:viewport", this.handleViewport);
      this.graphEventRoot.removeEventListener("topo:fullscreen", this.handleFullscreen);
      this.graphEventRoot.removeEventListener("topo:minimap", this.handleMinimap);
    }
    this.graphEventRoot = null;
    this.container.innerHTML = "";
  }
}

export class Toolbar extends FlowControls {}

function renderControlButton(action) {
  const config = {
    fit: { label: "FIT", title: "Fit view" },
    "zoom-out": { label: "-", title: "Zoom out" },
    "zoom-in": { label: "+", title: "Zoom in" },
    center: { label: "C", title: "Center" },
    fullscreen: { label: "FULL", title: "Fullscreen" },
    minimap: { label: "MAP", title: "Toggle minimap" },
  }[action] || { label: action.toUpperCase(), title: action };
  return `<button type="button" title="${escapeHtml(config.title)}" data-control-action="${escapeHtml(action)}">${escapeHtml(config.label)}</button>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
