import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import ReactDOM from 'react-dom'
import { OpenTopoXGraph, type OpenTopoXGraphHandle } from 'opentopox/react'
import { registerNodeShape } from 'opentopox'
import type { TopologyGraphData } from 'opentopox'
import 'opentopox/style.css'
import type { UModelElement } from '../../api/types'
import { useI18n, type TFunction } from '../../i18n'
import { UMODEL_NODE_HEIGHT, UMODEL_NODE_WIDTH, type GraphModel, type UModelEdgeData, type UModelNodeData } from './graphModel'
import { colorForKind, elementKey, isLinkElement, labelForKind, type BackgroundStyle, type ZoomLevel } from './model'

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
  const { t } = useI18n()
  const graphRef = useRef<OpenTopoXGraphHandle | null>(null)
  const [nodeMenu, setNodeMenu] = useState<{ data: UModelNodeData; left: number; top: number } | null>(null)
  const focusKey = focusIds.join('\u001f')
  const data = useMemo(() => toOpenTopoXData(graph), [graph])
  const applyNeighborhoodSelection = useCallback((id: string | null) => {
    const graphApi = graphRef.current?.getGraph()
    if (!graphApi) return
    const selection = buildNeighborhoodSelection(graph, id)
    if (!selection) {
      graphApi.clearSelection?.({ emit: false })
      return
    }
    graphApi.setSelection?.(selection, { emit: false })
  }, [graph])
  const closeNodeMenu = useCallback(() => setNodeMenu(null), [])
  const handleGraphPointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    if (!target?.closest('.ume-node-menu-trigger, .ume-node-action-menu')) return
    event.preventDefault()
    event.stopPropagation()
  }, [])
  const handleGraphClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null
    const trigger = target?.closest<HTMLElement>('.ume-node-menu-trigger')
    if (!trigger) return
    event.preventDefault()
    event.stopPropagation()
    const nodeElement = trigger.closest<HTMLElement>('.topo-node[data-node-id]')
    const nodeId = nodeElement?.dataset.nodeId
    const node = nodeId ? graph.nodes.find((item) => item.id === nodeId) : null
    const nodeData = node?.data as UModelNodeData | undefined
    if (!node || !nodeData?.element || !nodeData.actions) return
    const rect = trigger.getBoundingClientRect()
    setNodeMenu({
      data: nodeData,
      left: Math.min(Math.max(8, rect.right - 184), window.innerWidth - 192),
      top: Math.min(rect.bottom + 7, window.innerHeight - 220),
    })
    applyNeighborhoodSelection(node.id)
    onSelect(nodeData.element)
  }, [applyNeighborhoodSelection, graph.nodes, onSelect])

  useEffect(() => {
    applyNeighborhoodSelection(selectedId)
  }, [applyNeighborhoodSelection, selectedId])

  useEffect(() => {
    if (!nodeMenu) return
    const close = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('.ume-node-action-menu, .ume-node-menu-trigger')) return
      setNodeMenu(null)
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNodeMenu(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('resize', closeNodeMenu)
    window.addEventListener('scroll', closeNodeMenu, true)
    window.addEventListener('keydown', handleKeydown)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('resize', closeNodeMenu)
      window.removeEventListener('scroll', closeNodeMenu, true)
      window.removeEventListener('keydown', handleKeydown)
    }
  }, [closeNodeMenu, nodeMenu])

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

  useEffect(() => {
    let settleFrame: number | null = null
    const frame = window.requestAnimationFrame(() => {
      settleFrame = window.requestAnimationFrame(() => {
        graphRef.current?.refreshMeasurements?.()
      })
    })
    return () => {
      window.cancelAnimationFrame(frame)
      if (settleFrame != null) window.cancelAnimationFrame(settleFrame)
    }
  }, [forceFullMode, zoomLevel])

  return (
    <div
      className="v2-graph-container ume-opentopox-wrap"
      data-zoom={forceFullMode ? 'full' : zoomLevel}
      data-background={backgroundStyle}
      data-focus-active={selectedId ? 'true' : 'false'}
      onClickCapture={handleGraphClickCapture}
      onPointerDownCapture={handleGraphPointerDownCapture}
    >
      <OpenTopoXGraph
        ref={graphRef}
        containerClassName="ume-opentopox-container"
        config={{
          animate: false,
          autoPerformanceMode: false,
          canvasEdges: false,
          edgeLabelsVisible: true,
          edgeRouting: 'flow',
          enableSelection: true,
          fitViewPadding: 0.2,
          grid: false,
          hideEdgesOnViewportMove: false,
          hoverHighlight: true,
          hoverHighlightDegree: 1,
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
          const next = forceFullMode ? 'full' : viewport.zoom < 0.34 ? 'mini' : viewport.zoom < 0.74 ? 'compact' : 'full'
          if (next !== zoomLevel) onZoomLevelChange(next)
        }}
        onNodeClick={(node) => {
          setNodeMenu(null)
          applyNeighborhoodSelection(node.id)
          onSelect((node.data as { element?: UModelElement }).element || null)
        }}
        onEdgeClick={(edge) => {
          setNodeMenu(null)
          applyNeighborhoodSelection(edge.id)
          onSelect((edge.data as { element?: UModelElement }).element || null)
        }}
        onCanvasClick={() => {
          setNodeMenu(null)
          applyNeighborhoodSelection(null)
          onSelect(null)
        }}
      />
      {layouting && <div className="ume-layout-badge">Arranging OpenTopoX view...</div>}
      {nodeMenu && ReactDOM.createPortal(
        <NodeActionMenu
          data={nodeMenu.data}
          left={nodeMenu.left}
          top={nodeMenu.top}
          onClose={closeNodeMenu}
          t={t}
        />,
        document.body,
      )}
    </div>
  )
}

function NodeActionMenu({
  data,
  left,
  top,
  onClose,
  t,
}: {
  data: UModelNodeData
  left: number
  top: number
  onClose: () => void
  t: TFunction
}) {
  const element = data.element
  const isLink = isLinkElement(element)
  const run = (action: () => void) => {
    action()
    onClose()
  }
  return (
    <div
      className="ume-node-menu ume-node-action-menu"
      style={{ left, top } as CSSProperties}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {!isLink && (
        <button onClick={() => run(() => data.actions.onConnect(element))} type="button">
          {t('umodelExplorer.nodeMenu.connectTo')}
        </button>
      )}
      <button onClick={() => run(() => data.actions.onCopy(element))} type="button">
        {t('umodelExplorer.nodeMenu.copyNode')}
      </button>
      {!isLink && (
        <button onClick={() => run(() => data.actions.onCopyCascade(element))} type="button">
          {t('umodelExplorer.nodeMenu.copyWithEdges')}
        </button>
      )}
      <button className="danger" onClick={() => run(() => data.actions.onDelete(element, false))} type="button">
        {isLink ? t('umodelExplorer.action.deleteLink') : t('umodelExplorer.nodeMenu.deleteNode')}
      </button>
      {!isLink && (
        <button className="danger" onClick={() => run(() => data.actions.onDelete(element, true))} type="button">
          {t('umodelExplorer.nodeMenu.deleteWithEdges')}
        </button>
      )}
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
          actions: data.actions,
          color: color.color,
          colorBg: color.bg,
          colorText: color.text,
          label: color.label,
          anchorSelector: '.v2-zoom-full .v2-node-card-body, .v2-zoom-compact .v2-node-card-body, .v2-zoom-mini .v2-node-card-body',
          size: {
            width: Number(node.width || node.measured?.width || UMODEL_NODE_WIDTH),
            height: Number(node.height || node.measured?.height || UMODEL_NODE_HEIGHT),
          },
        },
      }
    }),
    edges: visibleEdges.map((edge) => {
      const data = edge.data as UModelEdgeData | undefined
      const sourceColor = data?.sourceColor || colorForKind(data?.sourceKind || 'data_link').color
      const targetColor = data?.targetColor || colorForKind(data?.targetKind || data?.kind || 'data_link').color
      return {
        id: data?.element ? elementKey(data.element) : edge.id,
        source: edge.source,
        target: edge.target,
        label: relationLabelForUModelEdge(data),
        type: 'flowEdge',
        data: {
          ...data,
          element: data?.element,
          routing: 'flow',
          status: 'ok',
          targetDot: false,
          targetDotRadius: 3.4,
          color: targetColor,
          sourceColor,
          targetColor,
          gradient: true,
          ...edgeOffsets.get(edge.id),
        },
      }
    }),
  }
}

function relationLabelForUModelEdge(data?: UModelEdgeData) {
  const spec = (data?.element?.spec || {}) as Record<string, unknown>
  const semanticType = optionalString(spec.data_link_type)
    || optionalString(spec.entity_link_type)
    || optionalString(spec.relation_type)
    || optionalString(spec.link_type)
    || optionalString(spec.type)
  if (semanticType) return semanticType
  if (data?.kind && data.kind !== '__temp__') return labelForKind(data.kind)
  return data?.title || '关系'
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function buildNeighborhoodSelection(graph: GraphModel, selectedId: string | null) {
  if (!selectedId) return null
  const nodeIds = new Set(graph.nodes.map((node) => node.id))
  const visibleEdges = graph.edges.filter((edge) => !edge.hidden)

  if (nodeIds.has(selectedId)) {
    const nodes = new Set<string>([selectedId])
    const edges: string[] = []
    for (const edge of visibleEdges) {
      if (edge.source !== selectedId && edge.target !== selectedId) continue
      nodes.add(edge.source)
      nodes.add(edge.target)
      edges.push(edgeKeyForOpenTopoX(edge))
    }
    return {
      nodes: [...nodes],
      edges: [...new Set(edges)],
      primary: { type: 'node' as const, id: selectedId },
    }
  }

  const selectedEdge = visibleEdges.find((edge) => edgeKeyForOpenTopoX(edge) === selectedId)
  if (!selectedEdge) return null
  return {
    nodes: [selectedEdge.source, selectedEdge.target],
    edges: [edgeKeyForOpenTopoX(selectedEdge)],
    primary: { type: 'edge' as const, id: edgeKeyForOpenTopoX(selectedEdge) },
  }
}

function edgeKeyForOpenTopoX(edge: GraphModel['edges'][number]) {
  const data = edge.data as UModelEdgeData | undefined
  return data?.element ? elementKey(data.element) : edge.id
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
  return node.position.x + Number(node.width || node.measured?.width || UMODEL_NODE_WIDTH) / 2
}

function centerY(node: GraphModel['nodes'][number]) {
  return node.position.y + Number(node.height || node.measured?.height || UMODEL_NODE_HEIGHT) / 2
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function renderUModelNode(data: Record<string, unknown>) {
  const color = String(data.color || '#8b5cf6')
  const colorBg = String(data.colorBg || '#f3f0ff')
  const colorText = String(data.colorText || color)
  const label = String(data.label || data.kind || 'OModel')
  const title = String(data.title || '')
  const domain = String(data.domain || 'unknown')
  return `
    <div class="v2-node-card ume-map-node" style="--node-color: ${escapeAttr(color)}">
      <span class="ume-node-menu-trigger" role="button" aria-label="Open node actions" title="Actions">...</span>
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
