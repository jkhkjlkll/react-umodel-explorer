import { useEffect, useMemo, useRef } from 'react'
import { OpenTopoXGraph, type OpenTopoXGraphHandle } from 'opentopox/react'
import { registerNodeShape } from 'opentopox'
import type { TopologyGraphData } from 'opentopox'
import 'opentopox/style.css'
import type { UModelElement } from '../../api/types'
import type { GraphModel, UModelEdgeData, UModelNodeData } from './graphModel'
import { colorForKind, elementKey, type BackgroundStyle, type ZoomLevel } from './model'

registerNodeShape('umodelNode', (node: { data?: Record<string, unknown> }) => renderUModelNode(node.data || {}))

export function OpenTopoXGraphView({
  graph,
  focusIds,
  zoomLevel,
  layouting,
  backgroundStyle,
  forceFullMode,
  selectedId,
  onZoomLevelChange,
  onSelect,
}: {
  graph: GraphModel
  focusIds: string[]
  zoomLevel: ZoomLevel
  layouting: boolean
  backgroundStyle: BackgroundStyle
  forceFullMode: boolean
  selectedId: string | null
  onZoomLevelChange: (level: ZoomLevel) => void
  onSelect: (element: UModelElement | null) => void
}) {
  const graphRef = useRef<OpenTopoXGraphHandle | null>(null)
  const focusKey = focusIds.join('\u001f')
  const data = useMemo(() => toOpenTopoXData(graph), [graph])

  useEffect(() => {
    const graphApi = graphRef.current?.getGraph()
    if (!graphApi) return
    if (!selectedId) {
      graphApi.clearSelection?.({ emit: false })
      return
    }
    if (graph.nodes.some((node) => node.id === selectedId)) graphApi.selectNode?.(selectedId, { emit: false })
    else graphApi.setSelection?.({ nodes: [], edges: [selectedId], primary: { type: 'edge', id: selectedId } }, { emit: false })
  }, [graph.nodes, selectedId])

  useEffect(() => {
    if (layouting || data.nodes.length === 0) return
    const timer = window.setTimeout(() => {
      const graphApi = graphRef.current?.getGraph()
      if (!graphApi) return
      const focusNodes = focusIds.length > 0 ? data.nodes.filter((node) => focusIds.includes(node.id)) : undefined
      graphApi.fitView({ padding: focusNodes ? 0.18 : 0.2, nodes: focusNodes, maxZoom: focusNodes ? 1.1 : 0.72 })
    }, 220)
    return () => window.clearTimeout(timer)
  }, [data.nodes.length, focusKey, focusIds, layouting])

  return (
    <div
      className="v2-graph-container ume-opentopox-wrap"
      data-zoom={forceFullMode ? 'full' : zoomLevel}
      data-background={backgroundStyle}
    >
      <OpenTopoXGraph
        ref={graphRef}
        containerClassName="ume-opentopox-container"
        config={{
          animate: false,
          autoPerformanceMode: false,
          canvasEdges: false,
          edgeLabelsVisible: false,
          edgeRouting: 'flow',
          fitViewPadding: 0.2,
          grid: false,
          hideEdgesOnViewportMove: false,
          hoverHighlight: false,
          maxZoom: 3,
          minimap: true,
          minZoom: 0.18,
          nodeDraggable: true,
          controls: true,
          controlActions: ['zoom-out', 'zoom-in', 'fit', 'fullscreen', 'minimap'],
          controlZoomStep: 1.22,
          validateData: false,
          zoomSensitivity: 0.0045,
        }}
        data={data}
        layout={{ topoType: 'preset' }}
        nodeType="umodelNode"
        autoFit
        preserveViewport={false}
        onViewportChange={(viewport) => {
          const next = forceFullMode ? 'full' : viewport.zoom < 0.3 ? 'mini' : viewport.zoom < 0.5 ? 'compact' : 'full'
          if (next !== zoomLevel) onZoomLevelChange(next)
        }}
        onNodeClick={(node) => onSelect((node.data as { element?: UModelElement }).element || null)}
        onEdgeClick={(edge) => onSelect((edge.data as { element?: UModelElement }).element || null)}
        onCanvasClick={() => onSelect(null)}
      />
      {layouting && <div className="ume-layout-badge">Arranging OpenTopoX view...</div>}
    </div>
  )
}

function toOpenTopoXData(graph: GraphModel): TopologyGraphData & Record<string, unknown> {
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]))
  const visibleEdges = graph.edges.filter((edge) => !edge.hidden)
  const edgeOffsets = computeEdgeOffsets(visibleEdges, nodeById)

  return {
    nodes: graph.nodes.map((node) => {
      const data = node.data as UModelNodeData
      const color = colorForKind(data.kind)
      return {
        id: node.id,
        type: 'umodelNode',
        position: { ...node.position },
        data: {
          element: data.element,
          title: data.title,
          domain: data.domain,
          kind: data.kind,
          color: color.color,
          colorBg: color.bg,
          colorText: color.text,
          label: color.label,
          size: { width: Number(node.width || node.measured?.width || 164), height: Number(node.height || node.measured?.height || 52) },
        },
      }
    }),
    edges: visibleEdges.map((edge) => {
      const data = edge.data as UModelEdgeData | undefined
      const color = colorForKind(data?.kind || 'data_link').color
      return {
        id: data?.element ? elementKey(data.element) : edge.id,
        source: edge.source,
        target: edge.target,
        type: 'flowEdge',
        markerEnd: false,
        data: {
          ...data,
          element: data?.element,
          markerEnd: false,
          routing: 'flow',
          status: 'ok',
          targetDot: true,
          targetDotRadius: 3.4,
          color,
          ...edgeOffsets.get(edge.id),
        },
      }
    }),
  }
}

function computeEdgeOffsets(edges: GraphModel['edges'], nodeById: Map<string, GraphModel['nodes'][number]>) {
  const outgoing = new Map<string, GraphModel['edges']>()
  const incoming = new Map<string, GraphModel['edges']>()

  for (const edge of edges) {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) continue
    const direction = centerX(target) >= centerX(source) ? 1 : -1
    pushGroup(outgoing, `${edge.source}:${direction}`, edge)
    pushGroup(incoming, `${edge.target}:${direction}`, edge)
  }

  const sourceOffsets = offsetsForGroups(outgoing, (edge) => centerY(nodeById.get(edge.target)!))
  const targetOffsets = offsetsForGroups(incoming, (edge) => centerY(nodeById.get(edge.source)!))

  const result = new Map<string, { sourceOffset: number; targetOffset: number }>()
  for (const edge of edges) {
    result.set(edge.id, {
      sourceOffset: sourceOffsets.get(edge.id) || 0,
      targetOffset: targetOffsets.get(edge.id) || 0,
    })
  }
  return result
}

function pushGroup<T>(groups: Map<string, T[]>, key: string, value: T) {
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key)!.push(value)
}

function offsetsForGroups<T extends { id: string }>(groups: Map<string, T[]>, rankValue: (item: T) => number, step = 3.8, max = 18) {
  const result = new Map<string, number>()
  for (const items of groups.values()) {
    const sorted = [...items].sort((left, right) => rankValue(left) - rankValue(right) || left.id.localeCompare(right.id))
    sorted.forEach((item, index) => {
      result.set(item.id, clamp((index - (sorted.length - 1) / 2) * step, -max, max))
    })
  }
  return result
}

function centerX(node: GraphModel['nodes'][number]) {
  return node.position.x + Number(node.width || node.measured?.width || 164) / 2
}

function centerY(node: GraphModel['nodes'][number]) {
  return node.position.y + Number(node.height || node.measured?.height || 52) / 2
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function renderUModelNode(data: Record<string, unknown>) {
  const color = String(data.color || '#8b5cf6')
  const colorBg = String(data.colorBg || '#f3f0ff')
  const colorText = String(data.colorText || color)
  const label = String(data.label || data.kind || 'UModel')
  const title = String(data.title || '')
  const domain = String(data.domain || 'unknown')
  return `
    <div class="v2-node-card ume-map-node" style="--node-color: ${escapeAttr(color)}">
      <div class="v2-zoom-mini">
        <div class="v2-node-card-body ume-node-mini" style="border-color: ${escapeAttr(color)}">
          <span style="color: ${escapeAttr(color)}">${escapeHtml(title)}</span>
        </div>
      </div>
      <div class="v2-zoom-compact">
        <div class="v2-node-card-body ume-node-compact">
          <div class="ume-node-stripe" style="background: ${escapeAttr(color)}"></div>
          <div class="ume-node-compact-main">
            <span class="ume-kind-tag large" style="background: ${escapeAttr(colorBg)}; color: ${escapeAttr(colorText)}">${escapeHtml(label)}</span>
            <strong>${escapeHtml(title)}</strong>
          </div>
        </div>
      </div>
      <div class="v2-zoom-full">
        <div class="v2-node-card-body ume-node-full">
          <div class="ume-node-stripe thin" style="background: ${escapeAttr(color)}"></div>
          <div class="ume-node-content">
            <div class="ume-node-meta">
              <span class="ume-kind-tag" style="background: ${escapeAttr(colorBg)}; color: ${escapeAttr(colorText)}">${escapeHtml(label)}</span>
              <code>${escapeHtml(domain)}</code>
            </div>
            <strong class="ume-node-title">${escapeHtml(title)}</strong>
          </div>
        </div>
      </div>
    </div>
  `
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: string) {
  return escapeHtml(value).replace(/`/g, '&#96;')
}
