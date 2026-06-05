export class FlowControls {
  constructor({
    container,
    graph,
    actions = ["fit", "zoom-out", "zoom-in", "center", "fullscreen"],
    orientation = "horizontal",
    className = "",
  }) {
    if (!container) throw new Error("FlowControls requires a container");
    this.container = container;
    this.graph = graph;
    this.actions = actions;
    this.orientation = orientation;
    this.className = className;
    this.zoom = 1;
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
    root.addEventListener("topo:viewport", (event) => this.setZoom(event.detail.zoom));
    root.addEventListener("topo:fullscreen", (event) => this.renderFullscreenState(event.detail.enabled));
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
    this.container.addEventListener("click", (event) => {
      const button = event.target.closest("[data-control-action]");
      if (!button) return;
      this.runAction(button.dataset.controlAction);
    });
  }

  async runAction(action) {
    const graph = this.getGraphApi();
    if (!graph) return;
    if (action === "fit") graph.fitView?.({ padding: 0.16 });
    if (action === "center") graph.fitCenter?.();
    if (action === "zoom-in") graph.zoomTo?.(graph.getViewport().zoom + 0.12);
    if (action === "zoom-out") graph.zoomTo?.(graph.getViewport().zoom - 0.12);
    if (action === "fullscreen") {
      const enabled = await graph.toggleFullscreen?.();
      this.renderFullscreenState(Boolean(enabled));
    }
  }

  renderFullscreenState(enabled) {
    this.container.querySelector("[data-control-action='fullscreen']")?.classList.toggle("active", Boolean(enabled));
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
