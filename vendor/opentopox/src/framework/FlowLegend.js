export class FlowLegend {
  constructor({
    container,
    items = [],
    activeKeys = ["all"],
    multi = false,
    onChange,
    className = "",
  }) {
    if (!container) throw new Error("FlowLegend requires a container");
    this.container = container;
    this.items = items;
    this.activeKeys = new Set(activeKeys);
    this.multi = multi;
    this.onChange = onChange;
    this.className = className;
    this.render();
  }

  setItems(items = []) {
    this.items = items;
    this.render();
  }

  setActive(keys = ["all"], { emit = false } = {}) {
    this.activeKeys = new Set(Array.isArray(keys) ? keys : [keys]);
    this.renderState();
    if (emit) this.emitChange();
  }

  updateLegend(items = this.items) {
    this.setItems(items);
  }

  getActiveKeys() {
    return [...this.activeKeys];
  }

  render() {
    this.container.innerHTML = `
      <div class="flow-legend ${escapeHtml(this.className)}" aria-label="Topology legend">
        ${this.items.map((item) => this.renderItem(item)).join("")}
      </div>
    `;
    this.container.querySelector(".flow-legend")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-legend-key]");
      if (!button) return;
      this.toggle(button.dataset.legendKey);
    });
    this.renderState();
  }

  renderItem(item) {
    const count = Number.isFinite(item.count) ? `<span class="flow-legend-count">${item.count}</span>` : "";
    return `
      <button class="flow-legend-item" type="button" data-legend-key="${escapeHtml(item.key)}" title="${escapeHtml(item.title || item.label)}">
        <span class="flow-legend-dot" style="--legend-color:${escapeHtml(item.color || "#7393b3")}"></span>
        <span class="flow-legend-text">${escapeHtml(item.label || item.key)}</span>
        ${count}
      </button>
    `;
  }

  toggle(key) {
    if (!this.multi || key === "all") {
      this.activeKeys = new Set([key]);
    } else {
      this.activeKeys.delete("all");
      if (this.activeKeys.has(key)) this.activeKeys.delete(key);
      else this.activeKeys.add(key);
      if (!this.activeKeys.size) this.activeKeys.add("all");
    }
    this.renderState();
    this.emitChange();
  }

  renderState() {
    this.container.querySelectorAll("[data-legend-key]").forEach((button) => {
      button.classList.toggle("active", this.activeKeys.has(button.dataset.legendKey));
    });
  }

  emitChange() {
    const activeKeys = this.getActiveKeys();
    const activeItems = this.items.filter((item) => this.activeKeys.has(item.key));
    this.onChange?.(activeKeys, activeItems);
    this.container.dispatchEvent(new CustomEvent("topo:legend-change", {
      detail: { activeKeys, activeItems },
      bubbles: true,
    }));
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
