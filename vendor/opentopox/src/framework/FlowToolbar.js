export class FlowToolbar {
  constructor({
    container,
    graph,
    onLayoutChange,
    handleReset,
    enableReLayout = false,
    enableFullscreen = true,
    enableContextCopy = false,
    enableAreaSelection = false,
    contextOptions = {},
    children,
    layouts,
  }) {
    this.container = container;
    this.graph = graph;
    this.onLayoutChange = onLayoutChange;
    this.handleReset = handleReset;
    this.enableReLayout = enableReLayout;
    this.enableFullscreen = enableFullscreen;
    this.enableContextCopy = enableContextCopy;
    this.enableAreaSelection = enableAreaSelection;
    this.contextOptions = contextOptions;
    this.children = children;
    this.layouts = layouts || [
      { key: "fdp", label: "FDP", title: "Force layout" },
      { key: "dot", label: "DOT", title: "Directional layout" },
      { key: "layer", label: "LYR", title: "Layer layout" },
      { key: "xyFlow", label: "XY", title: "XYFlow layout" },
      { key: "radial", label: "RAD", title: "Radial layout" },
      { key: "grid", label: "GRID", title: "Grid layout" },
    ];
    this.activeLayout = "dot";
    this.zoom = 1;
    this.fullscreen = false;
    this.handleViewport = (event) => this.setZoom(event.detail.zoom);
    this.handleFullscreen = (event) => this.setFullscreen(event.detail.enabled);
    this.handleSelection = () => this.syncSelectionMode();
    this.handleClick = (event) => this.handleToolbarClick(event);
    this.graphEventRoot = null;
    if (this.enableAreaSelection) this.getGraphApi()?.setSelectionEnabled?.(true);
    this.render();
    this.bindGraphEvents();
  }

  getGraphApi() {
    return this.graph?.getGraph?.() || this.graph;
  }

  getGraphEventRoot() {
    return this.graph?.container || this.getGraphApi()?.getContainer?.();
  }

  setActiveLayout(layout) {
    this.activeLayout = layout;
    this.container.querySelectorAll("[data-layout]").forEach((button) => {
      button.classList.toggle("active", button.dataset.layout === layout);
    });
  }

  setZoom(zoom) {
    this.zoom = Number.isFinite(zoom) ? zoom : 1;
    const label = this.container.querySelector("[data-role='zoom-label']");
    if (label) label.textContent = `${Math.round(this.zoom * 100)}%`;
  }

  setFullscreen(enabled) {
    this.fullscreen = Boolean(enabled);
    this.container.querySelector("[data-action='fullscreen']")?.classList.toggle("active", this.fullscreen);
  }

  syncSelectionMode() {
    const graph = this.getGraphApi();
    this.container.querySelector("[data-action='select-area']")?.classList.toggle("active", graph?.getSelectionMode?.() === "area");
  }

  bindGraphEvents() {
    const root = this.getGraphEventRoot();
    if (!root) return;
    this.graphEventRoot = root;
    root.addEventListener("topo:viewport", this.handleViewport);
    root.addEventListener("topo:fullscreen", this.handleFullscreen);
    root.addEventListener("topo:selection-change", this.handleSelection);
    root.addEventListener("topo:selection-mode-change", this.handleSelection);
  }

  render() {
    const layoutButtons = this.layouts.map((item) => {
      return `<button type="button" title="${escapeHtml(item.title || item.label)}" data-layout="${escapeHtml(item.key)}">${escapeHtml(item.label)}</button>`;
    }).join("");
    const reset = this.handleReset ? '<button type="button" title="Reset" data-action="reset">RST</button>' : "";
    const relayout = this.enableReLayout ? '<button type="button" title="Re-layout" data-action="relayout">RLY</button>' : "";
    const fullscreen = this.enableFullscreen ? '<button type="button" title="Fullscreen" data-action="fullscreen">FULL</button>' : "";
    const contextCopy = this.enableContextCopy ? '<button type="button" title="Copy Agent context" data-action="copy-context">CTX</button>' : "";
    const areaSelection = this.enableAreaSelection ? '<button type="button" title="Select area" data-action="select-area">SEL</button>' : "";
    this.container.innerHTML = `
      <div class="flow-toolbar" aria-label="Topology toolbar">
        <button type="button" title="Fit view" data-action="fit">F</button>
        <button type="button" title="Zoom out" data-action="zoom-out">-</button>
        <span class="toolbar-zoom" data-role="zoom-label">100%</span>
        <button type="button" title="Zoom in" data-action="zoom-in">+</button>
        <button type="button" title="Center" data-action="center">C</button>
        ${reset}
        ${relayout}
        ${fullscreen}
        ${contextCopy || areaSelection ? '<div class="toolbar-divider"></div>' : ""}
        ${contextCopy}
        ${areaSelection}
        <div class="toolbar-divider"></div>
        ${layoutButtons}
        <div data-role="toolbar-children"></div>
      </div>
    `;
    this.setActiveLayout(this.activeLayout);
    const graph = this.getGraphApi();
    this.setZoom(graph?.getViewport?.().zoom ?? 1);
    this.setFullscreen(graph?.isFullscreen?.() ?? false);
    this.syncSelectionMode();
    this.renderChildren();

    this.container.addEventListener("click", this.handleClick);
  }

  async handleToolbarClick(event) {
    const button = event.target.closest("button");
    if (!button) return;

    const graph = this.getGraphApi();
    if (button.dataset.action === "fit") graph.fitView?.({ padding: 0.16 });
    if (button.dataset.action === "center") graph.fitCenter?.();
    if (button.dataset.action === "zoom-in") graph.zoomTo?.(graph.getViewport().zoom + 0.12);
    if (button.dataset.action === "zoom-out") graph.zoomTo?.(graph.getViewport().zoom - 0.12);
    if (button.dataset.action === "reset") this.handleReset?.();
    if (button.dataset.action === "relayout") graph.setData?.({ ...graph.getData(), clearStatus: true, preserveOrigin: true });
    if (button.dataset.action === "copy-context") await graph.copyContext?.(this.contextOptions);
    if (button.dataset.action === "select-area") {
      const mode = graph.getSelectionMode?.() === "area" ? "default" : "area";
      graph.setSelectionMode?.(mode);
      button.classList.toggle("active", mode === "area");
    }
    if (button.dataset.action === "fullscreen") {
      const enabled = await graph.toggleFullscreen?.();
      this.setFullscreen(Boolean(enabled));
    }

    if (button.dataset.layout) {
      this.setActiveLayout(button.dataset.layout);
      this.onLayoutChange?.(button.dataset.layout);
    }
  }

  renderChildren() {
    const host = this.container.querySelector("[data-role='toolbar-children']");
    if (!host || !this.children) return;
    if (typeof this.children === "string") {
      host.innerHTML = this.children;
    } else if (this.children instanceof Node) {
      host.replaceChildren(this.children);
    } else if (typeof this.children === "function") {
      const rendered = this.children();
      if (rendered instanceof Node) host.replaceChildren(rendered);
      if (typeof rendered === "string") host.innerHTML = rendered;
    }
    if (host.childNodes.length) {
      host.before(Object.assign(document.createElement("div"), { className: "toolbar-divider" }));
    }
  }

  destroy() {
    this.container.removeEventListener("click", this.handleClick);
    if (this.graphEventRoot) {
      this.graphEventRoot.removeEventListener("topo:viewport", this.handleViewport);
      this.graphEventRoot.removeEventListener("topo:fullscreen", this.handleFullscreen);
      this.graphEventRoot.removeEventListener("topo:selection-change", this.handleSelection);
      this.graphEventRoot.removeEventListener("topo:selection-mode-change", this.handleSelection);
      this.graphEventRoot = null;
    }
    this.container.innerHTML = "";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
