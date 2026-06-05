import { resolveGraphTarget } from "./ContextMenu.js";

export class Tooltip {
  constructor({
    container,
    graph,
    renderContent,
    delay = 140,
    className = "",
  }) {
    if (!container) throw new Error("Tooltip requires a container");
    this.container = container;
    this.graph = graph;
    this.renderContent = renderContent;
    this.delay = delay;
    this.tooltip = document.createElement("div");
    this.tooltip.className = `topo-tooltip ${className}`.trim();
    this.tooltip.hidden = true;
    this.container.appendChild(this.tooltip);
    this.timer = null;
    this.context = null;
    this.destroyed = false;
    this.handlePointerOver = (event) => this.schedule(event);
    this.handlePointerMove = (event) => this.move(event.clientX, event.clientY);
    this.handlePointerOut = (event) => this.handleOut(event);
    this.container.addEventListener("pointerover", this.handlePointerOver);
    this.container.addEventListener("pointermove", this.handlePointerMove);
    this.container.addEventListener("pointerout", this.handlePointerOut);
    this.container.addEventListener("mouseover", this.handlePointerOver);
    this.container.addEventListener("mousemove", this.handlePointerMove);
    this.container.addEventListener("mouseout", this.handlePointerOut);
  }

  getGraphApi() {
    return this.graph?.getGraph?.() || this.graph;
  }

  schedule(event) {
    if (this.destroyed) return;
    const context = resolveGraphTarget(event, this.getGraphApi());
    if (context.type === "canvas" || context.element === this.context?.element) return;
    window.clearTimeout(this.timer);
    this.context = {
      ...context,
      event,
      graph: this.getGraphApi(),
    };
    this.timer = window.setTimeout(() => {
      if (this.destroyed) return;
      this.show(this.context);
      this.move(event.clientX, event.clientY);
    }, this.delay);
  }

  show(context) {
    if (this.destroyed) return;
    const content = this.renderContent?.(context) || defaultTooltipContent(context);
    if (!content) {
      this.hide();
      return;
    }
    if (content instanceof Node) {
      this.tooltip.replaceChildren(content);
    } else {
      this.tooltip.innerHTML = content;
    }
    this.tooltip.dataset.tooltipType = context.type;
    this.tooltip.hidden = false;
    this.tooltip.classList.add("is-visible");
  }

  move(clientX, clientY) {
    if (this.tooltip.hidden) return;
    const rect = this.container.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const left = clamp(clientX - rect.left + 14, 8, rect.width - tooltipRect.width - 8);
    const top = clamp(clientY - rect.top + 14, 8, rect.height - tooltipRect.height - 8);
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  handleOut(event) {
    if (!this.context?.element) return;
    if (event.relatedTarget && this.context.element.contains(event.relatedTarget)) return;
    this.hide();
  }

  hide() {
    window.clearTimeout(this.timer);
    this.timer = null;
    this.context = null;
    this.tooltip.hidden = true;
    this.tooltip.classList.remove("is-visible");
  }

  destroy() {
    this.hide();
    this.destroyed = true;
    this.container.removeEventListener("pointerover", this.handlePointerOver);
    this.container.removeEventListener("pointermove", this.handlePointerMove);
    this.container.removeEventListener("pointerout", this.handlePointerOut);
    this.container.removeEventListener("mouseover", this.handlePointerOver);
    this.container.removeEventListener("mousemove", this.handlePointerMove);
    this.container.removeEventListener("mouseout", this.handlePointerOut);
    this.tooltip.remove();
  }
}

function defaultTooltipContent(context) {
  if (context.type === "node" && context.node) {
    const data = context.node.data || {};
    return `
      <div class="topo-tooltip-title">${escapeHtml(data.title || context.node.id)}</div>
      <div class="topo-tooltip-row"><span>Type</span><strong>${escapeHtml(data.domain || context.node.type || "node")}</strong></div>
      <div class="topo-tooltip-row"><span>Status</span><strong>${escapeHtml(data.status || "ok")}</strong></div>
    `;
  }
  if (context.type === "edge" && context.edge) {
    return `
      <div class="topo-tooltip-title">${escapeHtml(context.edge.label || context.edge.id)}</div>
      <div class="topo-tooltip-row"><span>Source</span><strong>${escapeHtml(context.edge.source)}</strong></div>
      <div class="topo-tooltip-row"><span>Target</span><strong>${escapeHtml(context.edge.target)}</strong></div>
    `;
  }
  return "";
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
