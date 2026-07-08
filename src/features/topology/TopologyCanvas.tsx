import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Graph, type GraphConfigInterface } from '@cosmos.gl/graph'
import type { TopologyEdge, TopologyExplorerData, TopologyNode } from './topologyModel'
import { drawTopologyPresetGlyph, resolveTopologyNodeIconPreset, TopologyPresetIcon } from './topologyIcons'

interface Viewport {
  x: number
  y: number
  zoom: number
}

interface TopologyCanvasProps {
  data: TopologyExplorerData
  layoutMode: 'force' | 'cluster'
  focusedTypes: string[]
  selectedNode: TopologyNode | null
  showLabels: boolean
  showClusterLabels: boolean
  allowDrag: boolean
  playhead: number
  onSelectNode: (node: TopologyNode | null) => void
  onFocusType: (type: string) => void
}

interface ClusterSummary {
  type: string
  count: number
  color: string
  x: number
  y: number
  radius: number
  nodeIds: string[]
}

interface CircleReservation {
  x: number
  y: number
  radius: number
}

interface VisibleForceNode {
  node: TopologyNode
  x: number
  y: number
  selected: boolean
  related: boolean
}

interface ForceRenderPlan {
  nodes: VisibleForceNode[]
  nodeById: Map<string, VisibleForceNode>
  labelCandidates: Array<{ node: TopologyNode; x: number; y: number }>
  radius: number
  ringMode: boolean
  iconMode: boolean
  glyphMode: boolean
}

const minZoom = 0.32
const maxZoom = 7
const zoomSensitivity = 0.012
const maxZoomStep = 1.65
const ringModeZoom = 1.8
const iconModeZoom = 2.35
const glyphModeZoom = 4.25
const labelModeZoom = 6.95
const nodeCullZoom = 0.88
const cosmosSpaceSize = 16384
const cosmosSpacePadding = 1800

interface SelectedRelation {
  type: string
  source: TopologyNode
  target: TopologyNode
  color: string
}

type CosmosPointKind = 'node' | 'cluster'

interface CosmosPoint {
  id: string
  label: string
  type: string
  color: string
  x: number
  y: number
  size: number
  node?: TopologyNode
  cluster?: ClusterSummary
}

interface CosmosLinkLabel {
  id: string
  label: string
  color: string
  sourceIndex: number
  targetIndex: number
  sourceId: string
  targetId: string
  count?: number
}

type CosmosRenderableEdge = Pick<TopologyEdge, 'id' | 'source' | 'target' | 'type' | 'color'> & { count?: number }

interface CosmosData {
  points: CosmosPoint[]
  pointPositions: Float32Array
  pointColors: Float32Array
  pointSizes: Float32Array
  links: Float32Array
  linkColors: Float32Array
  linkWidths: Float32Array
  pointClusters: Array<number | undefined>
  clusterPositions: Array<number | undefined>
  linkLabels: CosmosLinkLabel[]
  nodeIndexById: Map<string, number>
  linkIndicesByNodeId: Map<string, number[]>
  kind: CosmosPointKind
}

interface CosmosViewBoxBasis {
  key: string
  width: number
  height: number
}

export function TopologyCanvas(props: TopologyCanvasProps) {
  const {
    data,
    layoutMode,
    selectedNode,
    showLabels,
    showClusterLabels,
    allowDrag,
    playhead,
    onSelectNode,
    onFocusType,
  } = props
  const shellRef = useRef<HTMLDivElement | null>(null)
  const graphHostRef = useRef<HTMLDivElement | null>(null)
  const graphRef = useRef<Graph | null>(null)
  const cosmosDataRef = useRef<CosmosData | null>(null)
  const cosmosDragRef = useRef({ active: false, moved: false })
  const manualCosmosDragRef = useRef<{
    pointerId: number
    pointIndex: number
    lastX: number
    lastY: number
    moved: boolean
  } | null>(null)
  const handlersRef = useRef({ onFocusType, onSelectNode })
  const [webglFailed, setWebglFailed] = useState(false)
  const [cosmosReady, setCosmosReady] = useState(false)
  const [overlayVersion, setOverlayVersion] = useState(0)
  const [graphInitVersion, setGraphInitVersion] = useState(0)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [cosmosViewBoxBasis, setCosmosViewBoxBasis] = useState<CosmosViewBoxBasis>({ key: '', width: 0, height: 0 })
  const lastFitKeyRef = useRef('')
  const graphReadyToMount = size.width > 0 && size.height > 0
  handlersRef.current = { onFocusType, onSelectNode }
  const nodeById = useMemo(() => data.nodesById || new Map(data.nodes.map((node) => [node.id, node])), [data])
  const clusterSummaries = useMemo(() => createClusterSummaries(data), [data])
  const cosmosBounds = useMemo(
    () => (layoutMode === 'cluster' ? clusterBounds(clusterSummaries) : data.bounds),
    [clusterSummaries, data.bounds, layoutMode],
  )
  const cosmosViewBoxKey = useMemo(
    () => [
      layoutMode,
      data.nodes.length,
      data.edges.length,
      Math.round(cosmosBounds.minX),
      Math.round(cosmosBounds.minY),
      Math.round(cosmosBounds.maxX),
      Math.round(cosmosBounds.maxY),
    ].join(':'),
    [cosmosBounds, data.edges.length, data.nodes.length, layoutMode],
  )
  const cosmosMappingWidth = cosmosViewBoxBasis.width > 0 ? cosmosViewBoxBasis.width : size.width
  const cosmosMappingHeight = cosmosViewBoxBasis.height > 0 ? cosmosViewBoxBasis.height : size.height
  const cosmosMappingSize = useMemo(
    () => ({ width: cosmosMappingWidth, height: cosmosMappingHeight }),
    [cosmosMappingHeight, cosmosMappingWidth],
  )
  const cosmosData = useMemo(
    () => buildCosmosData(data, layoutMode, clusterSummaries, Math.max(0.16, Math.min(1, playhead)), cosmosMappingSize, cosmosBounds),
    [clusterSummaries, cosmosBounds, cosmosMappingSize, data, layoutMode, playhead],
  )
  const selectedRelation = useMemo<SelectedRelation | null>(() => {
    if (!selectedNode) return null
    const edge = data.edges.find((item) => item.source === selectedNode.id || item.target === selectedNode.id)
    if (!edge) return null
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return null
    return { type: edge.type, source, target, color: edge.color }
  }, [data.edges, nodeById, selectedNode])

  useEffect(() => {
    const host = graphHostRef.current
    if (!host || webglFailed || !graphReadyToMount || graphRef.current) return
    const bumpOverlay = () => setOverlayVersion((value) => value + 1)
    let cancelled = false
    try {
      const graph = new Graph(host, createCosmosConfig({
        allowDrag,
        onOverlayChange: bumpOverlay,
        onDragStart: () => {
          cosmosDragRef.current = { active: true, moved: false }
        },
        onDrag: () => {
          cosmosDragRef.current.moved = true
          syncCosmosPointPositions(graphRef.current, cosmosDataRef.current)
          bumpOverlay()
        },
        onDragEnd: () => {
          syncCosmosPointPositions(graphRef.current, cosmosDataRef.current)
          cosmosDragRef.current.active = false
          window.setTimeout(() => {
            cosmosDragRef.current.moved = false
          }, 0)
          bumpOverlay()
        },
        onClickPoint: (index) => {
          if (cosmosDragRef.current.moved) return
          const graphData = cosmosDataRef.current
          const point = graphData?.points[index]
          if (!point) return
          if (point.node) handlersRef.current.onSelectNode(point.node)
          if (point.cluster) handlersRef.current.onFocusType(point.cluster.type)
        },
        onClickBackground: () => {
          if (cosmosDragRef.current.moved) return
          handlersRef.current.onSelectNode(null)
        },
      }))
      graphRef.current = graph
      setGraphInitVersion((value) => value + 1)
      if (!cancelled) bumpOverlay()
    } catch (error) {
      recordCosmosFailure(error)
      setWebglFailed(true)
    }
    return () => {
      cancelled = true
      graphRef.current?.destroy()
      graphRef.current = null
    }
  }, [graphReadyToMount, webglFailed])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return
    const update = () => {
      const rect = shell.getBoundingClientRect()
      setSize({ width: rect.width, height: rect.height })
      setOverlayVersion((value) => value + 1)
    }
    const observer = new ResizeObserver(update)
    observer.observe(shell)
    update()
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (size.width <= 0 || size.height <= 0) return
    setCosmosViewBoxBasis((current) => {
      if (current.key === cosmosViewBoxKey && current.width > 0 && current.height > 0) return current
      return { key: cosmosViewBoxKey, width: size.width, height: size.height }
    })
  }, [cosmosViewBoxKey, size.height, size.width])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || webglFailed) return
    let verifyTimer: number | null = null
    try {
      setCosmosReady(false)
      cosmosDataRef.current = cosmosData
      graph.setPointPositions(cosmosData.pointPositions, true)
      graph.setPointColors(cosmosData.pointColors)
      graph.setPointSizes(cosmosData.pointSizes)
      graph.setLinks(cosmosData.links)
      graph.setLinkColors(cosmosData.linkColors)
      graph.setLinkWidths(cosmosData.linkWidths)
      graph.setPointClusters(cosmosData.pointClusters)
      graph.setClusterPositions(cosmosData.clusterPositions)
      graph.setPinnedPoints(cosmosData.points.map((_, index) => index))
      graph.render()
      graph.pause()
      const fitKey = `${graphInitVersion}:${cosmosViewBoxBasis.key || cosmosViewBoxKey}`
      if (lastFitKeyRef.current !== fitKey) {
        lastFitKeyRef.current = fitKey
        graph.fitView(240, layoutMode === 'cluster' ? 0.28 : 0.2)
      }
      setOverlayVersion((value) => value + 1)
      verifyTimer = window.setTimeout(() => {
        try {
          const visiblePoints = graph.getSampledPoints().indices.length
          if (cosmosData.points.length > 0 && visiblePoints === 0) {
            setWebglFailed(true)
            return
          }
          setCosmosReady(true)
          setOverlayVersion((value) => value + 1)
        } catch (error) {
          recordCosmosFailure(error)
          setWebglFailed(true)
        }
      }, 700)
    } catch (error) {
      recordCosmosFailure(error)
      setWebglFailed(true)
    }
    return () => {
      if (verifyTimer !== null) window.clearTimeout(verifyTimer)
    }
  }, [cosmosData, cosmosViewBoxBasis.key, cosmosViewBoxKey, graphInitVersion, layoutMode, webglFailed])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph || webglFailed) return
    graph.setConfig({ enableDrag: false })
  }, [allowDrag, webglFailed])

  useEffect(() => {
    const graph = graphRef.current
    const graphData = cosmosDataRef.current
    if (!graph || !graphData || webglFailed) return
    setOverlayVersion((value) => value + 1)
  }, [selectedNode, webglFailed])

  const handleCosmosPointerDownCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!allowDrag || layoutMode === 'cluster' || event.button !== 0) return
    const hit = findCosmosPointAt(event.clientX, event.clientY, graphRef.current, cosmosDataRef.current, graphHostRef.current)
    if (!hit) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    cosmosDragRef.current = { active: true, moved: false }
    manualCosmosDragRef.current = {
      pointerId: event.pointerId,
      pointIndex: hit.index,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    }
  }

  const handleCosmosPointerMoveCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = manualCosmosDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    const moved = moveCosmosPoint(
      drag.pointIndex,
      drag.lastX,
      drag.lastY,
      event.clientX,
      event.clientY,
      graphRef.current,
      cosmosDataRef.current,
      graphHostRef.current,
    )
    if (moved) {
      drag.moved = true
      cosmosDragRef.current.moved = true
      drag.lastX = event.clientX
      drag.lastY = event.clientY
      setOverlayVersion((value) => value + 1)
    }
  }

  const handleCosmosPointerUpCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = manualCosmosDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    const point = cosmosDataRef.current?.points[drag.pointIndex]
    manualCosmosDragRef.current = null
    cosmosDragRef.current.active = false
    window.setTimeout(() => {
      cosmosDragRef.current.moved = false
    }, 0)
    if (point?.node && !drag.moved) handlersRef.current.onSelectNode(point.node)
    setOverlayVersion((value) => value + 1)
  }

  const handleCosmosPointerCancelCapture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = manualCosmosDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    manualCosmosDragRef.current = null
    cosmosDragRef.current = { active: false, moved: false }
  }

  if (webglFailed) return <LegacyTopologyCanvas {...props} />

  return (
    <div
      className="topo-canvas-shell topo-cosmos-shell"
      data-cosmos-ready={cosmosReady}
      ref={shellRef}
      onPointerDownCapture={handleCosmosPointerDownCapture}
      onPointerMoveCapture={handleCosmosPointerMoveCapture}
      onPointerUpCapture={handleCosmosPointerUpCapture}
      onPointerCancelCapture={handleCosmosPointerCancelCapture}
    >
      <div className="topo-cosmos-fallback">
        <LegacyTopologyCanvas {...props} />
      </div>
      <div className="topo-cosmos-graph" ref={graphHostRef} />
      {cosmosReady && (
        <CosmosEdgeLabels
          graph={graphRef.current}
          cosmosData={cosmosData}
          selectedNode={selectedNode}
          version={overlayVersion}
        />
      )}
      {cosmosReady && (showLabels || (layoutMode === 'cluster' && showClusterLabels)) && (
        <CosmosLabels
          graph={graphRef.current}
          cosmosData={cosmosData}
          selectedNode={selectedNode}
          showLabels={showLabels}
          showClusterLabels={showClusterLabels}
          version={overlayVersion}
        />
      )}
      {cosmosReady && selectedNode && (
        <SelectedNodePopover
          node={selectedNode}
          relation={selectedRelation}
          screenPoint={resolveCosmosScreenPoint(graphRef.current, selectedNode, cosmosDataRef.current)}
          size={{ width: size.width, height: size.height }}
          version={overlayVersion}
        />
      )}
      {cosmosReady && (
        <MiniMap
          data={data}
          layoutMode={layoutMode}
          clusterSummaries={clusterSummaries}
          viewport={createViewportFromBounds(layoutMode === 'cluster' ? clusterBounds(clusterSummaries) : data.bounds, size)}
          version={overlayVersion}
        />
      )}
    </div>
  )
}

function recordCosmosFailure(error: unknown) {
  console.warn('cosmos.gl topology renderer failed, falling back to canvas', error)
}

function createCosmosConfig({
  allowDrag,
  onOverlayChange,
  onDragStart,
  onDrag,
  onDragEnd,
  onClickPoint,
  onClickBackground,
}: {
  allowDrag: boolean
  onOverlayChange: () => void
  onDragStart: () => void
  onDrag: () => void
  onDragEnd: () => void
  onClickPoint: (index: number) => void
  onClickBackground: () => void
}): Partial<GraphConfigInterface> {
  return {
    attribution: '',
    backgroundColor: '#ffffff',
    curvedLinks: false,
    enableDrag: false,
    enableSimulation: true,
    enableSimulationDuringZoom: false,
    enableZoom: true,
    fitViewDelay: 80,
    fitViewDuration: 260,
    fitViewOnInit: true,
    fitViewPadding: 0.2,
    hoveredPointCursor: 'pointer',
    linkDefaultColor: [0.66, 0.71, 0.76, 0.32],
    linkDefaultWidth: 0.7,
    linkGreyoutOpacity: 0.08,
    linkOpacity: 0.62,
    linkWidthScale: 0.88,
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    pointDefaultColor: '#8aa0b8',
    pointDefaultSize: 3,
    pointGreyoutOpacity: 0.16,
    pointOpacity: 0.95,
    pointSamplingDistance: 92,
    pointSizeScale: 1,
    randomSeed: 20260618,
    renderHoveredPointRing: true,
    rescalePositions: false,
    scaleLinksOnZoom: false,
    scalePointsOnZoom: false,
    showFPSMonitor: false,
    spaceSize: cosmosSpaceSize,
    simulationGravity: 0,
    simulationRepulsion: 0,
    onBackgroundClick: onClickBackground,
    onDragStart,
    onDrag,
    onDragEnd,
    onPointClick: onClickPoint,
    onSimulationTick: onOverlayChange,
    onZoom: onOverlayChange,
    onZoomEnd: onOverlayChange,
  }
}

function buildCosmosData(
  data: TopologyExplorerData,
  layoutMode: 'force' | 'cluster',
  clusterSummaries: ClusterSummary[],
  playhead: number,
  size: { width: number; height: number },
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): CosmosData {
  const mapper = createCosmosViewBoxMapper(bounds, size)
  const points: CosmosPoint[] = layoutMode === 'cluster'
    ? clusterSummaries.map((cluster) => {
      const point = mapper(cluster.x, cluster.y)
      return {
        id: cluster.type,
        label: cluster.type,
        type: cluster.type,
        color: cluster.color,
        x: point.x,
        y: point.y,
        size: clamp(cluster.radius * 0.18, 16, 46),
        cluster,
      }
    })
    : data.nodes.map((node) => {
      const point = mapper(node.x, node.y)
      return {
        id: node.id,
        label: node.label,
        type: node.type,
        color: node.color,
        x: point.x,
        y: point.y,
        size: clamp(2.7 + node.weight * 1.3, 3.8, 8.8),
        node,
      }
    })
  const nodeIndexById = new Map(points.map((point, index) => [point.id, index]))
  const clusterIndexById = new Map<string, number>()
  const clusterPositions: Array<number | undefined> = []
  const pointClusters = points.map((point) => {
    const clusterId = point.node?.cluster
    if (!clusterId) return undefined
    let clusterIndex = clusterIndexById.get(clusterId)
    if (clusterIndex === undefined) {
      clusterIndex = clusterIndexById.size
      clusterIndexById.set(clusterId, clusterIndex)
      clusterPositions[clusterIndex * 2] = point.x
      clusterPositions[clusterIndex * 2 + 1] = point.y
    }
    return clusterIndex
  })
  const pointPositions = new Float32Array(points.length * 2)
  const pointColors = new Float32Array(points.length * 4)
  const pointSizes = new Float32Array(points.length)
  points.forEach((point, index) => {
    pointPositions[index * 2] = point.x
    pointPositions[index * 2 + 1] = point.y
    writeColor(pointColors, index, point.color, point.cluster ? 0.78 : 0.94)
    pointSizes[index] = point.size
  })

  const visibleEdges: CosmosRenderableEdge[] = layoutMode === 'cluster'
    ? buildClusterEdges(data, clusterSummaries)
    : data.edges.slice(0, Math.floor(data.edges.length * playhead))
  const links: number[] = []
  const linkColors: number[] = []
  const linkWidths: number[] = []
  const linkLabels: CosmosLinkLabel[] = []
  const linkIndicesByNodeId = new Map<string, number[]>()
  visibleEdges.forEach((edge) => {
    const sourceIndex = nodeIndexById.get(edge.source)
    const targetIndex = nodeIndexById.get(edge.target)
    if (sourceIndex === undefined || targetIndex === undefined) return
    const linkIndex = links.length / 2
    links.push(sourceIndex, targetIndex)
    appendColor(linkColors, edge.color, layoutMode === 'cluster' ? 0.38 : 0.3)
    linkWidths.push(layoutMode === 'cluster' ? 1.4 : 0.58)
    linkLabels.push({
      id: edge.id || `${edge.source}:${edge.target}:${linkIndex}`,
      label: relationLabel(edge.type, edge.count),
      color: edge.color,
      sourceIndex,
      targetIndex,
      sourceId: edge.source,
      targetId: edge.target,
      count: edge.count,
    })
    pushMapValue(linkIndicesByNodeId, edge.source, linkIndex)
    pushMapValue(linkIndicesByNodeId, edge.target, linkIndex)
  })

  return {
    points,
    pointPositions,
    pointColors,
    pointSizes,
    links: new Float32Array(links),
    linkColors: new Float32Array(linkColors),
    linkWidths: new Float32Array(linkWidths),
    pointClusters,
    clusterPositions,
    linkLabels,
    nodeIndexById,
    linkIndicesByNodeId,
    kind: layoutMode === 'cluster' ? 'cluster' : 'node',
  }
}

function buildClusterEdges(data: TopologyExplorerData, clusters: ClusterSummary[]) {
  const typeByNodeId = new Map<string, string>()
  clusters.forEach((cluster) => cluster.nodeIds.forEach((id) => typeByNodeId.set(id, cluster.type)))
  const colorByType = new Map(clusters.map((cluster) => [cluster.type, cluster.color]))
  const edgeBuckets = new Map<string, { source: string; target: string; color: string; count: number; typeCounts: Map<string, number> }>()
  data.edges.forEach((edge) => {
    const source = typeByNodeId.get(edge.source)
    const target = typeByNodeId.get(edge.target)
    if (!source || !target || source === target) return
    const key = source < target ? `${source}:${target}` : `${target}:${source}`
    const current = edgeBuckets.get(key) || {
      source,
      target,
      color: colorByType.get(target) || edge.color,
      count: 0,
      typeCounts: new Map<string, number>(),
    }
    current.count += 1
    current.typeCounts.set(edge.type, (current.typeCounts.get(edge.type) || 0) + 1)
    edgeBuckets.set(key, current)
  })
  return [...edgeBuckets.entries()].map(([id, edge]) => ({
    id,
    source: edge.source,
    target: edge.target,
    color: edge.color,
    type: dominantRelationType(edge.typeCounts),
    count: edge.count,
  }))
}

function createCosmosViewBoxMapper(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  size: { width: number; height: number },
) {
  const usable = cosmosSpaceSize - cosmosSpacePadding * 2
  const screenRatio = Math.max(0.25, Math.min(4, (size.width || 1280) / Math.max(1, size.height || 720)))
  const rawWidth = Math.max(1, bounds.maxX - bounds.minX)
  const rawHeight = Math.max(1, bounds.maxY - bounds.minY)
  let viewWidth = rawWidth
  let viewHeight = rawHeight
  if (viewWidth / viewHeight > screenRatio) {
    viewHeight = viewWidth / screenRatio
  } else {
    viewWidth = viewHeight * screenRatio
  }
  const centerX = (bounds.minX + bounds.maxX) / 2
  const centerY = (bounds.minY + bounds.maxY) / 2
  const minX = centerX - viewWidth / 2
  const minY = centerY - viewHeight / 2
  return (x: number, y: number) => ({
    x: cosmosSpacePadding + ((x - minX) / viewWidth) * usable,
    y: cosmosSpacePadding + ((y - minY) / viewHeight) * usable,
  })
}

function relationLabel(type: string, count?: number) {
  const label = type || '关系'
  return count && count > 1 ? `${label} · ${count}` : label
}

function dominantRelationType(typeCounts: Map<string, number>) {
  let result = '关系'
  let max = 0
  for (const [type, count] of typeCounts.entries()) {
    if (count <= max) continue
    result = type || '关系'
    max = count
  }
  return result
}

function sampleEdgeLabels(labels: CosmosLinkLabel[], limit: number) {
  if (labels.length <= limit) return labels
  const stride = Math.max(1, Math.ceil(labels.length / limit))
  return labels.filter((_, index) => index % stride === 0).slice(0, limit)
}

function CosmosEdgeLabels({
  graph,
  cosmosData,
  selectedNode,
}: {
  graph: Graph | null
  cosmosData: CosmosData
  selectedNode: TopologyNode | null
  version: number
}) {
  if (!graph || cosmosData.linkLabels.length === 0) return null
  const selectedIndex = selectedNode ? cosmosData.nodeIndexById.get(selectedNode.id) : undefined
  const relatedLabels = selectedIndex === undefined
    ? []
    : cosmosData.linkLabels.filter((label) => label.sourceIndex === selectedIndex || label.targetIndex === selectedIndex)
  const labels = selectedIndex === undefined
    ? sampleEdgeLabels(cosmosData.linkLabels, cosmosData.kind === 'cluster' ? 32 : 42)
    : relatedLabels.slice(0, 80)
  return (
    <div className="topo-cosmos-edge-label-layer" aria-hidden>
      {labels.map((label) => {
        const source = cosmosData.points[label.sourceIndex]
        const target = cosmosData.points[label.targetIndex]
        if (!source || !target) return null
        const [sourceLeft, sourceTop] = graph.spaceToScreenPosition([source.x, source.y])
        const [targetLeft, targetTop] = graph.spaceToScreenPosition([target.x, target.y])
        const left = (sourceLeft + targetLeft) / 2
        const top = (sourceTop + targetTop) / 2
        const active = selectedIndex !== undefined && (label.sourceIndex === selectedIndex || label.targetIndex === selectedIndex)
        return (
          <span
            key={label.id}
            className={`topo-cosmos-edge-label ${active ? 'active' : ''}`}
            style={{ left, top, '--topo-edge-label-color': label.color } as CSSProperties}
          >
            {label.label}
          </span>
        )
      })}
    </div>
  )
}

function CosmosLabels({
  graph,
  cosmosData,
  selectedNode,
  showLabels,
  showClusterLabels,
}: {
  graph: Graph | null
  cosmosData: CosmosData
  selectedNode: TopologyNode | null
  showLabels: boolean
  showClusterLabels: boolean
  version: number
}) {
  if (!graph) return null
  const selectedIndex = selectedNode ? cosmosData.nodeIndexById.get(selectedNode.id) : undefined
  const sampled = cosmosData.kind === 'cluster'
    ? cosmosData.points.map((_, index) => index)
    : graph.getSampledPoints().indices.slice(0, 42)
  const indices = selectedIndex === undefined ? sampled : Array.from(new Set([selectedIndex, ...sampled.slice(0, 24)]))
  return (
    <div className="topo-cosmos-label-layer" aria-hidden>
      {indices.map((index) => {
        const point = cosmosData.points[index]
        if (!point) return null
        if (cosmosData.kind === 'node' && !showLabels && index !== selectedIndex) return null
        if (cosmosData.kind === 'cluster' && !showClusterLabels) return null
        const [left, top] = graph.spaceToScreenPosition([point.x, point.y])
        const active = index === selectedIndex
        return (
          <span
            key={point.id}
            className={`topo-cosmos-label ${active ? 'active' : ''} ${cosmosData.kind === 'cluster' ? 'cluster' : ''}`}
            style={{ left, top, borderColor: point.color }}
          >
            {point.label}
          </span>
        )
      })}
    </div>
  )
}

function syncCosmosPointPositions(graph: Graph | null, cosmosData: CosmosData | null) {
  if (!graph || !cosmosData) return
  const positions = graph.getPointPositions()
  if (!positions || positions.length < cosmosData.points.length * 2) return
  cosmosData.points.forEach((point, index) => {
    const x = positions[index * 2]
    const y = positions[index * 2 + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    point.x = x
    point.y = y
    cosmosData.pointPositions[index * 2] = x
    cosmosData.pointPositions[index * 2 + 1] = y
  })
}

function findCosmosPointAt(
  clientX: number,
  clientY: number,
  graph: Graph | null,
  cosmosData: CosmosData | null,
  host: HTMLElement | null,
): { index: number; distance: number } | null {
  if (!graph || !cosmosData || !host || cosmosData.kind !== 'node') return null
  const rect = host.getBoundingClientRect()
  let best: { index: number; distance: number } | null = null
  for (let index = 0; index < cosmosData.points.length; index += 1) {
    const point = cosmosData.points[index]
    if (!point.node) continue
    const [screenX, screenY] = graph.spaceToScreenPosition([point.x, point.y])
    const dx = clientX - rect.left - screenX
    const dy = clientY - rect.top - screenY
    const radius = Math.max(24, Math.min(48, graph.spaceToScreenRadius(point.size) + 18))
    const distance = Math.hypot(dx, dy)
    if (distance > radius || (best && distance >= best.distance)) continue
    best = { index, distance }
  }
  return best
}

function moveCosmosPoint(
  pointIndex: number,
  previousClientX: number,
  previousClientY: number,
  nextClientX: number,
  nextClientY: number,
  graph: Graph | null,
  cosmosData: CosmosData | null,
  host: HTMLElement | null,
) {
  if (!graph || !cosmosData || !host) return false
  const point = cosmosData.points[pointIndex]
  if (!point) return false
  const rect = host.getBoundingClientRect()
  const previousSpace = graph.screenToSpacePosition([previousClientX - rect.left, previousClientY - rect.top])
  const nextSpace = graph.screenToSpacePosition([nextClientX - rect.left, nextClientY - rect.top])
  const dx = nextSpace[0] - previousSpace[0]
  const dy = nextSpace[1] - previousSpace[1]
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) + Math.abs(dy) <= 0)) return false
  point.x += dx
  point.y += dy
  cosmosData.pointPositions[pointIndex * 2] = point.x
  cosmosData.pointPositions[pointIndex * 2 + 1] = point.y
  graph.setPointPositions(cosmosData.pointPositions, true)
  graph.render()
  return true
}

function resolveCosmosScreenPoint(graph: Graph | null, node: TopologyNode, cosmosData?: CosmosData | null) {
  if (!graph) return undefined
  const index = cosmosData?.nodeIndexById.get(node.id)
  if (index !== undefined) {
    const point = cosmosData?.points[index]
    if (point) return graph.spaceToScreenPosition([point.x, point.y])
  }
  return graph.spaceToScreenPosition([node.x, node.y])
}

function createViewportFromBounds(bounds: { minX: number; minY: number; maxX: number; maxY: number }, size: { width: number; height: number }): Viewport {
  const width = Math.max(1, size.width || 1280)
  const height = Math.max(1, size.height || 720)
  const zoom = Math.min((width * 0.72) / Math.max(1, bounds.maxX - bounds.minX), (height * 0.74) / Math.max(1, bounds.maxY - bounds.minY))
  return {
    x: width / 2 - ((bounds.minX + bounds.maxX) / 2) * zoom,
    y: height / 2 - ((bounds.minY + bounds.maxY) / 2) * zoom,
    zoom: clamp(zoom, minZoom, 1.2),
  }
}

function writeColor(target: Float32Array, index: number, color: string, alpha: number) {
  const [r, g, b] = parseHexColor(color)
  target[index * 4] = r
  target[index * 4 + 1] = g
  target[index * 4 + 2] = b
  target[index * 4 + 3] = alpha
}

function appendColor(target: number[], color: string, alpha: number) {
  const [r, g, b] = parseHexColor(color)
  target.push(r, g, b, alpha)
}

function parseHexColor(color: string) {
  const normalized = color.replace('#', '').trim()
  const hex = normalized.length === 3
    ? normalized.split('').map((char) => `${char}${char}`).join('')
    : normalized.padEnd(6, '0').slice(0, 6)
  const value = Number.parseInt(hex, 16)
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ] as const
}

function pushMapValue(map: Map<string, number[]>, key: string, value: number) {
  const values = map.get(key)
  if (values) values.push(value)
  else map.set(key, [value])
}

function LegacyTopologyCanvas({
  data,
  layoutMode,
  focusedTypes,
  selectedNode,
  showLabels,
  showClusterLabels,
  allowDrag,
  playhead,
  onSelectNode,
  onFocusType,
}: TopologyCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 0.74 })
  const sizeRef = useRef({ width: 0, height: 0, ratio: 1 })
  const frameRef = useRef<number | null>(null)
  const minimapTimerRef = useRef<number | null>(null)
  const lastMinimapUpdateRef = useRef(0)
  const dragRef = useRef<{
    x: number
    y: number
    moved: boolean
    mode: 'viewport' | 'node'
    node?: TopologyNode
  } | null>(null)
  const [minimapVersion, setMinimapVersion] = useState(0)

  const nodeById = useMemo(() => data.nodesById || new Map(data.nodes.map((node) => [node.id, node])), [data])
  const focusedTypeSet = useMemo(() => new Set(focusedTypes), [focusedTypes])
  const clusterSummaries = useMemo(() => createClusterSummaries(data), [data])
  const layoutBounds = layoutMode === 'cluster' ? clusterBounds(clusterSummaries) : data.bounds
  const selectedNeighborIds = useMemo(() => {
    if (!selectedNode) return null
    const ids = new Set<string>([selectedNode.id])
    for (const edge of data.edges) {
      if (edge.source === selectedNode.id) ids.add(edge.target)
      if (edge.target === selectedNode.id) ids.add(edge.source)
    }
    return ids
  }, [data.edges, selectedNode])
  const selectedRelation = useMemo<SelectedRelation | null>(() => {
    if (!selectedNode) return null
    const edge = data.edges.find((item) => item.source === selectedNode.id || item.target === selectedNode.id)
    if (!edge) return null
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return null
    return { type: edge.type, source, target, color: edge.color }
  }, [data.edges, nodeById, selectedNode])
  const drawStateRef = useRef({
    data,
    nodeById,
    layoutMode,
    focusedTypeSet,
    clusterSummaries,
    selectedNode,
    selectedNeighborIds,
    showLabels,
    showClusterLabels,
    playhead,
  })
  drawStateRef.current = {
    data,
    nodeById,
    layoutMode,
    focusedTypeSet,
    clusterSummaries,
    selectedNode,
    selectedNeighborIds,
    showLabels,
    showClusterLabels,
    playhead,
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.min(window.devicePixelRatio || 1, 2)
      sizeRef.current = { width: rect.width, height: rect.height, ratio }
      canvas.width = Math.max(1, Math.floor(rect.width * ratio))
      canvas.height = Math.max(1, Math.floor(rect.height * ratio))
      const boundsWidth = layoutBounds.maxX - layoutBounds.minX
      const boundsHeight = layoutBounds.maxY - layoutBounds.minY
      const zoom = Math.min((rect.width * 0.72) / boundsWidth, (rect.height * 0.74) / boundsHeight)
      viewportRef.current = {
        x: rect.width / 2 - ((layoutBounds.minX + layoutBounds.maxX) / 2) * zoom,
        y: rect.height / 2 - ((layoutBounds.minY + layoutBounds.maxY) / 2) * zoom,
        zoom: clamp(zoom, minZoom, 1.2),
      }
      requestDraw()
      scheduleMinimapUpdate(true)
    }

    const observer = new ResizeObserver(resize)
    observer.observe(canvas)
    resize()
    return () => observer.disconnect()
  }, [layoutBounds.maxX, layoutBounds.maxY, layoutBounds.minX, layoutBounds.minY])

  useEffect(() => {
    requestDraw()
    scheduleMinimapUpdate(true)
  }, [data, layoutMode, focusedTypes, selectedNode, showLabels, showClusterLabels, playhead])

  useEffect(() => {
    return () => {
      if (minimapTimerRef.current !== null) {
        window.clearTimeout(minimapTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const shell = shellRef.current
    if (!shell) return

    const handleNativeWheel = (event: globalThis.WheelEvent) => {
      if (!isPointInsideElement(event.clientX, event.clientY, shell)) return
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
      const viewport = viewportRef.current
      const rect = shell.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const before = screenToWorld(pointerX, pointerY, viewport)
      const delta = normalizeWheelDelta(event)
      const zoomStep = clamp(Math.exp(-delta * zoomSensitivity), 1 / maxZoomStep, maxZoomStep)
      const nextZoom = clamp(viewport.zoom * zoomStep, minZoom, maxZoom)
      viewport.zoom = nextZoom
      viewport.x = pointerX - before.x * nextZoom
      viewport.y = pointerY - before.y * nextZoom
      requestDraw()
      scheduleMinimapUpdate()
    }

    const handleNativeGesture = (event: Event) => {
      const gesture = event as Event & { clientX?: number; clientY?: number }
      if (gesture.clientX !== undefined && gesture.clientY !== undefined && !isPointInsideElement(gesture.clientX, gesture.clientY, shell)) return
      if (event.cancelable) event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('wheel', handleNativeWheel, { passive: false, capture: true })
    document.addEventListener('gesturestart', handleNativeGesture, { passive: false, capture: true } as AddEventListenerOptions)
    document.addEventListener('gesturechange', handleNativeGesture, { passive: false, capture: true } as AddEventListenerOptions)
    document.addEventListener('gestureend', handleNativeGesture, { passive: false, capture: true } as AddEventListenerOptions)
    return () => {
      document.removeEventListener('wheel', handleNativeWheel, { capture: true })
      document.removeEventListener('gesturestart', handleNativeGesture, { capture: true } as EventListenerOptions)
      document.removeEventListener('gesturechange', handleNativeGesture, { capture: true } as EventListenerOptions)
      document.removeEventListener('gestureend', handleNativeGesture, { capture: true } as EventListenerOptions)
    }
  }, [])

  function requestDraw() {
    if (frameRef.current !== null) return
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null
      const state = drawStateRef.current
      drawTopology(canvasRef.current, state.data, state.nodeById, viewportRef.current, sizeRef.current, {
        layoutMode: state.layoutMode,
        focusedTypeSet: state.focusedTypeSet,
        clusterSummaries: state.clusterSummaries,
        selectedNode: state.selectedNode,
        selectedNeighborIds: state.selectedNeighborIds,
        showLabels: state.showLabels,
        showClusterLabels: state.showClusterLabels,
        playhead: state.playhead,
      })
    })
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    const rect = event.currentTarget.getBoundingClientRect()
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, viewportRef.current)
    const dragNode = allowDrag && layoutMode !== 'cluster'
      ? findNearestNode(data.nodes, world, viewportRef.current.zoom, focusedTypeSet)
      : null
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      moved: false,
      mode: dragNode ? 'node' : 'viewport',
      node: dragNode || undefined,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true
    drag.x = event.clientX
    drag.y = event.clientY
    if (drag.mode === 'node' && drag.node) {
      drag.node.x += dx / viewportRef.current.zoom
      drag.node.y += dy / viewportRef.current.zoom
    } else {
      viewportRef.current.x += dx
      viewportRef.current.y += dy
    }
    requestDraw()
    scheduleMinimapUpdate()
  }

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current
    dragRef.current = null
    event.currentTarget.releasePointerCapture(event.pointerId)
    if (drag?.moved) {
      if (drag.mode === 'node' && drag.node) onSelectNode(drag.node)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const world = screenToWorld(event.clientX - rect.left, event.clientY - rect.top, viewportRef.current)
    if (layoutMode === 'cluster') {
      const cluster = findNearestCluster(clusterSummaries, world, viewportRef.current.zoom)
      if (cluster) onFocusType(cluster.type)
      return
    }
    onSelectNode(findNearestNode(data.nodes, world, viewportRef.current.zoom, focusedTypeSet))
  }

  return (
    <div className="topo-canvas-shell" ref={shellRef}>
      <canvas
        ref={canvasRef}
        className={`topo-canvas ${allowDrag ? 'allow-drag' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      />
      {selectedNode && (
        <SelectedNodePopover
          node={selectedNode}
          relation={selectedRelation}
          viewport={viewportRef.current}
          size={sizeRef.current}
          version={minimapVersion}
        />
      )}
      <MiniMap
        data={data}
        layoutMode={layoutMode}
        clusterSummaries={clusterSummaries}
        viewport={viewportRef.current}
        version={minimapVersion}
      />
    </div>
  )

  function scheduleMinimapUpdate(immediate = false) {
    const update = () => {
      minimapTimerRef.current = null
      lastMinimapUpdateRef.current = performance.now()
      setMinimapVersion((value) => value + 1)
    }
    if (immediate) {
      if (minimapTimerRef.current !== null) window.clearTimeout(minimapTimerRef.current)
      update()
      return
    }
    const remaining = 80 - (performance.now() - lastMinimapUpdateRef.current)
    if (remaining <= 0) {
      update()
      return
    }
    if (minimapTimerRef.current === null) {
      minimapTimerRef.current = window.setTimeout(update, remaining)
    }
  }
}

function normalizeWheelDelta(event: globalThis.WheelEvent) {
  if (event.deltaMode === globalThis.WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16
  if (event.deltaMode === globalThis.WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 480
  return event.deltaY
}

function isPointInsideElement(clientX: number, clientY: number, element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
}

function SelectedNodePopover({
  node,
  relation,
  screenPoint,
  viewport,
  size,
}: {
  node: TopologyNode
  relation: SelectedRelation | null
  screenPoint?: [number, number]
  viewport?: Viewport
  size: { width: number; height: number }
  version: number
}) {
  const point = screenPoint ? { x: screenPoint[0], y: screenPoint[1] } : viewport ? worldToScreen(node.x, node.y, viewport) : { x: size.width / 2, y: size.height / 2 }
  const left = clamp(point.x + 24, 18, Math.max(18, size.width - 456))
  const top = clamp(point.y - 18, 18, Math.max(18, size.height - 242))
  if (relation) {
    return (
      <div className="topo-relation-popover" style={{ left, top }}>
        <div className="topo-relation-title">
          <span style={{ backgroundColor: relation.color }} />
          <div>
            <strong>{relation.type}</strong>
            <small>关系</small>
          </div>
        </div>
        <RelationEntityCard title="源实体" node={relation.source} />
        <RelationEntityCard title="目标实体" node={relation.target} />
      </div>
    )
  }
  return (
      <div className="topo-node-popover" style={{ left, top }}>
        <span className="topo-popover-icon" style={{ color: node.color, borderColor: node.color }}>
          <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(node)} label={node.type} size={22} />
        </span>
        <div>
        <strong>{node.label}</strong>
        <small>{node.type}</small>
        <dl>
          <dt>连接数</dt>
          <dd>{node.properties.relationCount}</dd>
          <dt>标识</dt>
          <dd>{node.properties.id}</dd>
        </dl>
      </div>
    </div>
  )
}

function RelationEntityCard({ title, node }: { title: string; node: TopologyNode }) {
  return (
    <div className="topo-relation-entity">
      <small>{title}</small>
      <div>
        <span className="topo-popover-icon" style={{ color: node.color, borderColor: node.color }}>
          <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(node)} label={node.type} size={18} />
        </span>
        <p>
          <b style={{ color: node.color }}>{node.type}</b>
          <strong>{node.label}</strong>
        </p>
      </div>
    </div>
  )
}

function MiniMap({
  data,
  layoutMode,
  clusterSummaries,
  viewport,
  version,
}: {
  data: TopologyExplorerData
  layoutMode: 'force' | 'cluster'
  clusterSummaries: ClusterSummary[]
  viewport: Viewport
  version: number
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(window.devicePixelRatio || 1, 2)
    const width = 196
    const height = 118
    canvas.width = width * ratio
    canvas.height = height * ratio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`
    const context = canvas.getContext('2d')
    if (!context) return
    const bounds = layoutMode === 'cluster' ? clusterBounds(clusterSummaries) : data.bounds
    const scale = Math.min((width - 18) / (bounds.maxX - bounds.minX), (height - 18) / (bounds.maxY - bounds.minY))
    const offsetX = width / 2 - ((bounds.minX + bounds.maxX) / 2) * scale
    const offsetY = height / 2 - ((bounds.minY + bounds.maxY) / 2) * scale
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#f7f7ff'
    context.fillRect(0, 0, width, height)
    if (layoutMode === 'cluster') {
      for (const cluster of clusterSummaries) {
        context.fillStyle = cluster.color
        context.globalAlpha = 0.78
        context.beginPath()
        context.arc(offsetX + cluster.x * scale, offsetY + cluster.y * scale, Math.max(3, cluster.radius * scale), 0, Math.PI * 2)
        context.fill()
      }
    } else {
      for (let index = 0; index < data.nodes.length; index += 3) {
        const node = data.nodes[index]
        context.fillStyle = node.color
        context.globalAlpha = 0.78
        context.fillRect(offsetX + node.x * scale, offsetY + node.y * scale, 1.6, 1.6)
      }
    }
    context.globalAlpha = 1
    context.strokeStyle = '#6559ff'
    context.lineWidth = 2
    const viewW = 1280 / viewport.zoom * scale
    const viewH = 720 / viewport.zoom * scale
    const centerWorld = screenToWorld(640, 360, viewport)
    context.strokeRect(offsetX + centerWorld.x * scale - viewW / 2, offsetY + centerWorld.y * scale - viewH / 2, viewW, viewH)
  }, [data, layoutMode, clusterSummaries, viewport, version])

  return (
    <div className="topo-minimap">
      <canvas ref={canvasRef} />
    </div>
  )
}

function drawTopology(
  canvas: HTMLCanvasElement | null,
  data: TopologyExplorerData,
  nodeById: Map<string, TopologyNode>,
  viewport: Viewport,
  size: { width: number; height: number; ratio: number },
  options: {
    layoutMode: 'force' | 'cluster'
    focusedTypeSet: Set<string>
    clusterSummaries: ClusterSummary[]
    selectedNode: TopologyNode | null
    selectedNeighborIds: Set<string> | null
    showLabels: boolean
    showClusterLabels: boolean
    playhead: number
  },
) {
  if (!canvas || size.width <= 0 || size.height <= 0) return
  const context = canvas.getContext('2d')
  if (!context) return
  context.setTransform(size.ratio, 0, 0, size.ratio, 0, 0)
  context.clearRect(0, 0, size.width, size.height)
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, size.width, size.height)
  if (options.layoutMode === 'cluster') {
    drawClusterTopology(context, data, nodeById, viewport, size, options)
    return
  }
  const forcePlan = createForceRenderPlan(data, viewport, size, options)
  drawForceBackgroundEdges(context, data, forcePlan, viewport, size, options)
  drawForceEdges(context, data, forcePlan, viewport, size, options)
  drawForceNodes(context, forcePlan, viewport, size, options)
}

function drawForceBackgroundEdges(
  context: CanvasRenderingContext2D,
  data: TopologyExplorerData,
  forcePlan: ForceRenderPlan,
  viewport: Viewport,
  size: { width: number; height: number },
  options: { focusedTypeSet: Set<string>; selectedNode: TopologyNode | null; playhead: number },
) {
  if (viewport.zoom < 0.12) return
  const visibleWindow = Math.max(0.16, Math.min(1, options.playhead))
  const stride = viewport.zoom > 0.52 ? 1 : 2
  const ringMode = viewport.zoom >= ringModeZoom
  const iconMode = viewport.zoom >= iconModeZoom
  const edgeNodeRadius = iconMode ? clamp(7 + viewport.zoom * 2.1, 12, 18) : ringMode ? clamp(4.5 + viewport.zoom * 1.6, 6.5, 10) : viewport.zoom > 0.75 ? 1.9 : 1.65
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.globalCompositeOperation = 'multiply'
  for (let index = 0; index < data.edges.length * visibleWindow; index += stride) {
    const edge = data.edges[index]
    const sourceVisible = forcePlan.nodeById.get(edge.source)
    const targetVisible = forcePlan.nodeById.get(edge.target)
    if (!sourceVisible || !targetVisible) continue
    const source = sourceVisible.node
    const target = targetVisible.node
    if (options.focusedTypeSet.size > 0 && !options.focusedTypeSet.has(source.type) && !options.focusedTypeSet.has(target.type)) continue
    const selectedEdge = Boolean(options.selectedNode && (edge.source === options.selectedNode.id || edge.target === options.selectedNode.id))
    if (source.cluster !== target.cluster) continue
    const endpoints = edgeEndpointsOnNodeRings(
      { x: sourceVisible.x, y: sourceVisible.y },
      { x: targetVisible.x, y: targetVisible.y },
      Math.max(0, edgeNodeRadius - 2.5),
      Math.max(0, edgeNodeRadius - 2.5),
    )
    const from = endpoints.from
    const to = endpoints.to
    if (!lineIntersectsViewport(from.x, from.y, to.x, to.y, size.width, size.height)) continue

    context.globalAlpha = options.selectedNode
      ? selectedEdge ? 0.56 : 0.06
      : viewport.zoom > 1.15 ? 0.42 : 0.48
    context.strokeStyle = '#a9b6c2'
    context.lineWidth = selectedEdge ? 1.9 : viewport.zoom > 1.2 ? 0.94 : 0.82
    drawStraightEdgePath(context, from, to)
    context.stroke()
  }
  context.restore()
}

function drawForceAnchorDots(
  context: CanvasRenderingContext2D,
  data: TopologyExplorerData,
  viewport: Viewport,
  size: { width: number; height: number },
  options: { focusedTypeSet: Set<string>; selectedNode: TopologyNode | null },
) {
  if (viewport.zoom < 1.1 || options.selectedNode) return
  const step = viewport.zoom > 2.4 ? 1 : 2
  const dotRadius = clamp(1.4 + viewport.zoom * 0.18, 1.6, 2.4)
  context.save()
  context.globalAlpha = viewport.zoom > 1.8 ? 0.72 : 0.58
  for (let index = 0; index < data.nodes.length; index += step) {
    const node = data.nodes[index]
    if (options.focusedTypeSet.size > 0 && !options.focusedTypeSet.has(node.type)) continue
    const point = worldToScreen(node.x, node.y, viewport)
    if (point.x < -8 || point.y < -8 || point.x > size.width + 8 || point.y > size.height + 8) continue
    context.fillStyle = node.color
    context.beginPath()
    context.arc(point.x, point.y, dotRadius, 0, Math.PI * 2)
    context.fill()
  }
  context.restore()
}

function drawForceEdges(
  context: CanvasRenderingContext2D,
  data: TopologyExplorerData,
  forcePlan: ForceRenderPlan,
  viewport: Viewport,
  size: { width: number; height: number },
  options: { focusedTypeSet: Set<string>; selectedNode: TopologyNode | null; playhead: number },
) {
  if (!options.selectedNode && viewport.zoom < 2.75) return
  const stride = options.selectedNode || viewport.zoom > 4 ? 1 : 2
  const visibleWindow = Math.max(0.16, Math.min(1, options.playhead))
  const labelBoxes: Array<{ x: number; y: number; width: number; height: number }> = []
  const maxLabels = options.selectedNode ? 80 : 36
  let labelCount = 0
  context.save()
  context.lineCap = 'round'
  context.lineJoin = 'round'
  for (let index = 0; index < data.edges.length * visibleWindow; index += stride) {
    const edge = data.edges[index]
    const sourceVisible = forcePlan.nodeById.get(edge.source)
    const targetVisible = forcePlan.nodeById.get(edge.target)
    if (!sourceVisible || !targetVisible) continue
    const source = sourceVisible.node
    const target = targetVisible.node
    if (options.focusedTypeSet.size > 0 && !options.focusedTypeSet.has(source.type) && !options.focusedTypeSet.has(target.type)) continue
    const selectedEdge = Boolean(options.selectedNode && (edge.source === options.selectedNode.id || edge.target === options.selectedNode.id))
    if (source.cluster !== target.cluster) continue
    const endpoints = edgeEndpointsOnNodeRings(
      { x: sourceVisible.x, y: sourceVisible.y },
      { x: targetVisible.x, y: targetVisible.y },
      Math.max(0, forcePlan.radius - 2.5),
      Math.max(0, forcePlan.radius - 2.5),
    )
    const from = endpoints.from
    const to = endpoints.to
    if (!lineIntersectsViewport(from.x, from.y, to.x, to.y, size.width, size.height)) continue

    if (!selectedEdge && viewport.zoom < 3.8) continue
    context.globalAlpha = selectedEdge ? 0.86 : 0.16
    context.strokeStyle = selectedEdge ? edge.color : '#b9c5d0'
    context.lineWidth = selectedEdge ? 1.75 : 0.62
    drawStraightEdgePath(context, from, to)
    context.stroke()
    if (labelCount < maxLabels && (selectedEdge || viewport.zoom >= 4.8)) {
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
      if (drawEdgeLabel(context, edge.type, mid.x, mid.y, edge.color, selectedEdge, labelBoxes)) {
        labelCount += 1
      }
    }
  }
  context.restore()
}

function createForceRenderPlan(
  data: TopologyExplorerData,
  viewport: Viewport,
  size: { width: number; height: number },
  options: {
    focusedTypeSet: Set<string>
    selectedNode: TopologyNode | null
    selectedNeighborIds: Set<string> | null
  },
): ForceRenderPlan {
  const ringMode = viewport.zoom >= ringModeZoom
  const iconMode = viewport.zoom >= iconModeZoom
  const glyphMode = viewport.zoom >= glyphModeZoom
  const radius = iconMode ? clamp(7 + viewport.zoom * 2.1, 12, 18) : ringMode ? clamp(4.5 + viewport.zoom * 1.6, 6.5, 10) : viewport.zoom > 0.75 ? 1.9 : 1.65
  const shouldReserveScreenSpace = viewport.zoom >= nodeCullZoom
  const shouldPrioritizeNodes = Boolean(options.selectedNode || options.selectedNeighborIds || options.focusedTypeSet.size > 0)
  const nodes = shouldPrioritizeNodes
    ? [...data.nodes].sort((left, right) => nodePriority(right, options) - nodePriority(left, options))
    : data.nodes
  const reservations: CircleReservation[] = []
  const visibleNodes: VisibleForceNode[] = []
  const visibleNodeById = new Map<string, VisibleForceNode>()
  const labelCandidates: Array<{ node: TopologyNode; x: number; y: number }> = []

  for (const node of nodes) {
    if (options.focusedTypeSet.size > 0 && !options.focusedTypeSet.has(node.type) && options.selectedNode?.id !== node.id) continue
    const selected = options.selectedNode?.id === node.id
    const related = options.selectedNeighborIds?.has(node.id) ?? false
    const point = worldToScreen(node.x, node.y, viewport)
    if (point.x < -42 || point.y < -42 || point.x > size.width + 42 || point.y > size.height + 42) continue
    const reservationRadius = forceNodeReservationRadius(viewport.zoom, radius, iconMode, glyphMode)
    if (shouldReserveScreenSpace && !selected && circleOverlaps(reservations, point.x, point.y, reservationRadius)) continue
    reservations.push({ x: point.x, y: point.y, radius: reservationRadius })
    const visibleNode = { node, x: point.x, y: point.y, selected, related }
    visibleNodes.push(visibleNode)
    visibleNodeById.set(node.id, visibleNode)
    if (selected || node.weight >= 4) labelCandidates.push({ node, x: point.x, y: point.y + radius + 13 })
  }

  return {
    nodes: visibleNodes,
    nodeById: visibleNodeById,
    labelCandidates,
    radius,
    ringMode,
    iconMode,
    glyphMode,
  }
}

function drawForceNodes(
  context: CanvasRenderingContext2D,
  forcePlan: ForceRenderPlan,
  viewport: Viewport,
  size: { width: number; height: number },
  options: {
    selectedNode: TopologyNode | null
    showLabels: boolean
  },
) {
  for (const item of forcePlan.nodes) {
    if (options.selectedNode && !item.selected && !item.related) {
      context.globalAlpha = 0.14
    } else {
      context.globalAlpha = 0.94
    }
    if (forcePlan.iconMode) {
      drawIconNode(context, item.node, item.x, item.y, forcePlan.radius, item.selected, forcePlan.glyphMode || forcePlan.iconMode)
    } else if (forcePlan.ringMode) {
      drawRingNode(context, item.node, item.x, item.y, forcePlan.radius, item.selected)
    } else {
      context.fillStyle = item.node.color
      context.beginPath()
      context.arc(item.x, item.y, forcePlan.radius + item.node.weight * 0.08, 0, Math.PI * 2)
      context.fill()
    }
  }

  context.globalAlpha = 1
  if (!options.showLabels && !options.selectedNode) return
  context.font = `${viewport.zoom > 2.2 ? 13 : 12}px var(--om-cjk-font)`
  context.textBaseline = 'middle'
  context.textAlign = 'center'
  context.fillStyle = '#263244'
  if (options.selectedNode) {
    const point = worldToScreen(options.selectedNode.x, options.selectedNode.y, viewport)
    if (point.x >= 0 && point.y >= 0 && point.x <= size.width && point.y <= size.height) {
      drawNodeLabel(context, shortNodeLabel(options.selectedNode), point.x, point.y + forcePlan.radius + 13)
    }
    context.textAlign = 'start'
    return
  }
  if (viewport.zoom < labelModeZoom) {
    context.textAlign = 'start'
    return
  }

  let labelCount = 0
  const labelBoxes: Array<{ x: number; y: number; width: number; height: number }> = []
  for (const item of forcePlan.labelCandidates) {
    if (labelCount >= 10) break
    const label = shortNodeLabel(item.node)
    const width = context.measureText(label).width + 18
    const box = { x: item.x - width / 2, y: item.y - 10, width, height: 21 }
    if (labelBoxes.some((current) => rectanglesOverlap(current, box))) continue
    drawNodeLabel(context, label, item.x, item.y)
    labelBoxes.push(box)
    labelCount += 1
  }
  context.textAlign = 'start'
}

function drawForceEdgePath(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  source: TopologyNode,
  target: TopologyNode,
) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  context.beginPath()
  context.moveTo(from.x, from.y)
  if (distance < 1) {
    context.lineTo(to.x, to.y)
    return
  }
  const normalX = -dy / distance
  const normalY = dx / distance
  const bendSign = deterministicEdgeSign(source.id, target.id)
  const bend = clamp(distance * 0.018, 1.5, 12) * bendSign
  const midX = (from.x + to.x) / 2
  const midY = (from.y + to.y) / 2
  context.quadraticCurveTo(midX + normalX * bend, midY + normalY * bend, to.x, to.y)
}

function drawStraightEdgePath(
  context: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  context.beginPath()
  context.moveTo(from.x, from.y)
  context.lineTo(to.x, to.y)
}

function edgeEndpointsOnNodeRings(
  from: { x: number; y: number },
  to: { x: number; y: number },
  fromRadius: number,
  toRadius: number,
) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)
  if (distance < 0.001) return { from, to }
  const unitX = dx / distance
  const unitY = dy / distance
  return {
    from: { x: from.x + unitX * fromRadius, y: from.y + unitY * fromRadius },
    to: { x: to.x - unitX * toRadius, y: to.y - unitY * toRadius },
  }
}

function edgeVisualColor(color: string) {
  const rgb = hexToRgb(color)
  if (!rgb) return color
  return `rgb(${Math.round((rgb.r + 72) / 2)}, ${Math.round((rgb.g + 190) / 2)}, ${Math.round((rgb.b + 232) / 2)})`
}

function deterministicEdgeSign(sourceId: string, targetId: string) {
  const hash = stableHash(`${sourceId}:${targetId}`)
  return hash & 1 ? 1 : -1
}

function stableHash(text: string) {
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash
}

function hexToRgb(color: string) {
  const normalized = color.trim()
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(normalized)
  if (!match) return null
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  }
}

function drawClusterTopology(
  context: CanvasRenderingContext2D,
  data: TopologyExplorerData,
  nodeById: Map<string, TopologyNode>,
  viewport: Viewport,
  size: { width: number; height: number },
  options: {
    focusedTypeSet: Set<string>
    clusterSummaries: ClusterSummary[]
    showClusterLabels: boolean
    playhead: number
  },
) {
  drawClusterEdges(context, data, nodeById, viewport, size, options)
  const focused = options.focusedTypeSet
  for (const cluster of options.clusterSummaries) {
    if (focused.size > 0 && !focused.has(cluster.type)) {
      context.globalAlpha = 0.22
    } else {
      context.globalAlpha = 0.96
    }
    drawClusterBlob(context, cluster, viewport)
  }
  context.globalAlpha = 1
  if (options.showClusterLabels) {
    drawClusterLabels(context, options.clusterSummaries, viewport, size, focused)
  }
}

function drawClusterEdges(
  context: CanvasRenderingContext2D,
  data: TopologyExplorerData,
  nodeById: Map<string, TopologyNode>,
  viewport: Viewport,
  size: { width: number; height: number },
  options: { focusedTypeSet: Set<string>; clusterSummaries: ClusterSummary[]; playhead: number },
) {
  const clusterByType = new Map(options.clusterSummaries.map((cluster) => [cluster.type, cluster]))
  const edgeCount = new Map<string, { source: ClusterSummary; target: ClusterSummary; count: number; color: string; typeCounts: Map<string, number> }>()
  const visibleWindow = Math.max(0.16, Math.min(1, options.playhead))
  for (let index = 0; index < data.edges.length * visibleWindow; index += 1) {
    const edge = data.edges[index]
    const sourceNode = nodeById.get(edge.source)
    const targetNode = nodeById.get(edge.target)
    if (!sourceNode || !targetNode || sourceNode.type === targetNode.type) continue
    if (options.focusedTypeSet.size > 0 && !options.focusedTypeSet.has(sourceNode.type) && !options.focusedTypeSet.has(targetNode.type)) continue
    const source = clusterByType.get(sourceNode.type)
    const target = clusterByType.get(targetNode.type)
    if (!source || !target) continue
    const key = source.type < target.type ? `${source.type}|${target.type}` : `${target.type}|${source.type}`
    const current = edgeCount.get(key) || { source, target, count: 0, color: target.color, typeCounts: new Map<string, number>() }
    current.count += 1
    current.typeCounts.set(edge.type, (current.typeCounts.get(edge.type) || 0) + 1)
    edgeCount.set(key, current)
  }
  const labelBoxes: Array<{ x: number; y: number; width: number; height: number }> = []
  let labelCount = 0
  for (const edge of edgeCount.values()) {
    const from = worldToScreen(edge.source.x, edge.source.y, viewport)
    const to = worldToScreen(edge.target.x, edge.target.y, viewport)
    if (!lineIntersectsViewport(from.x, from.y, to.x, to.y, size.width, size.height)) continue
    context.globalAlpha = clamp(edge.count / 90, 0.06, 0.22)
    context.strokeStyle = edge.color
    context.lineWidth = clamp(Math.sqrt(edge.count) * 0.22, 0.55, 4.2)
    context.beginPath()
    context.moveTo(from.x, from.y)
    const midX = (from.x + to.x) / 2
    const midY = (from.y + to.y) / 2
    const controlX = midX + (to.y - from.y) * 0.05
    const controlY = midY - (to.x - from.x) * 0.05
    context.quadraticCurveTo(controlX, controlY, to.x, to.y)
    context.stroke()
    if (labelCount < 30 && drawEdgeLabel(context, relationLabel(dominantRelationType(edge.typeCounts), edge.count), controlX, controlY, edge.color, false, labelBoxes)) {
      labelCount += 1
    }
  }
  context.globalAlpha = 1
}

function drawClusterBlob(context: CanvasRenderingContext2D, cluster: ClusterSummary, viewport: Viewport) {
  const center = worldToScreen(cluster.x, cluster.y, viewport)
  const dotCount = Math.min(cluster.count, 520)
  context.fillStyle = cluster.color
  for (let index = 0; index < dotCount; index += 1) {
    const point = phyllotaxisPoint(index, dotCount, cluster.radius)
    const x = center.x + point.x * viewport.zoom
    const y = center.y + point.y * viewport.zoom
    context.beginPath()
    context.arc(x, y, Math.max(1.4, 1.95 * viewport.zoom), 0, Math.PI * 2)
    context.fill()
  }
}

function drawClusterLabels(
  context: CanvasRenderingContext2D,
  clusters: ClusterSummary[],
  viewport: Viewport,
  size: { width: number; height: number },
  focusedTypeSet: Set<string>,
) {
  context.font = '700 14px var(--om-cjk-font)'
  context.textBaseline = 'middle'
  context.textAlign = 'left'
  for (const cluster of clusters.slice(0, 11)) {
    if (focusedTypeSet.size > 0 && !focusedTypeSet.has(cluster.type)) continue
    const point = worldToScreen(cluster.x - cluster.radius * 0.52, cluster.y - cluster.radius * 0.18, viewport)
    if (point.x < -220 || point.y < -30 || point.x > size.width + 40 || point.y > size.height + 40) continue
    const name = cluster.type.length > 22 ? `${cluster.type.slice(0, 20)}...` : cluster.type
    const nameWidth = context.measureText(name).width
    const countText = String(cluster.count)
    const countWidth = context.measureText(countText).width
    const width = nameWidth + countWidth + 50
    context.save()
    context.shadowColor = 'rgba(24, 36, 64, 0.14)'
    context.shadowBlur = 16
    context.fillStyle = 'rgba(255, 255, 255, 0.95)'
    roundRect(context, point.x, point.y, width, 34, 17)
    context.fill()
    context.shadowBlur = 0
    context.fillStyle = cluster.color
    context.beginPath()
    context.arc(point.x + 18, point.y + 17, 6, 0, Math.PI * 2)
    context.fill()
    context.fillStyle = '#334155'
    context.fillText(name, point.x + 32, point.y + 17)
    context.fillStyle = '#94a3b8'
    context.fillText(countText, point.x + 38 + nameWidth, point.y + 17)
    context.restore()
  }
}

function drawRingNode(context: CanvasRenderingContext2D, node: TopologyNode, x: number, y: number, radius: number, selected: boolean) {
  context.save()
  context.lineWidth = selected ? 2.8 : 1.7
  context.fillStyle = 'rgba(255, 255, 255, 0.82)'
  context.strokeStyle = selected ? '#4d6fff' : node.color
  context.beginPath()
  context.arc(x, y, selected ? radius + 2 : radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.restore()
}

function drawIconNode(
  context: CanvasRenderingContext2D,
  node: TopologyNode,
  x: number,
  y: number,
  radius: number,
  selected: boolean,
  showGlyph: boolean,
) {
  context.save()
  context.lineWidth = selected ? 3.6 : 2
  context.fillStyle = '#ffffff'
  context.strokeStyle = selected ? '#4d6fff' : node.color
  if (selected) {
    context.shadowColor = 'rgba(77, 111, 255, 0.28)'
    context.shadowBlur = 16
  }
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.shadowBlur = 0
  if (showGlyph) {
    context.fillStyle = node.color
    drawTopologyPresetGlyph(context, resolveTopologyNodeIconPreset(node), node.type, x, y, Math.max(14, radius * 1.14))
  }
  context.restore()
}

function drawNodeLabel(context: CanvasRenderingContext2D, label: string, x: number, y: number) {
  const width = context.measureText(label).width + 14
  context.save()
  context.fillStyle = 'rgba(255, 255, 255, 0.82)'
  context.fillRect(x - width / 2, y - 10, width, 20)
  context.fillStyle = '#2f3b52'
  context.fillText(label, x, y)
  context.restore()
}

function drawEdgeLabel(
  context: CanvasRenderingContext2D,
  label: string,
  x: number,
  y: number,
  color: string,
  active: boolean,
  labelBoxes: Array<{ x: number; y: number; width: number; height: number }>,
) {
  const text = label || '关系'
  context.save()
  context.font = `${active ? '700 11px' : '650 10px'} -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif`
  context.textBaseline = 'middle'
  context.textAlign = 'center'
  const width = Math.min(context.measureText(text).width + 18, 180)
  const height = active ? 22 : 20
  const box = { x: x - width / 2, y: y - height / 2, width, height }
  if (labelBoxes.some((current) => rectanglesOverlap(current, box))) {
    context.restore()
    return false
  }
  labelBoxes.push(box)
  context.globalAlpha = 1
  context.shadowColor = active ? 'rgba(15, 23, 42, 0.12)' : 'rgba(15, 23, 42, 0.08)'
  context.shadowBlur = active ? 18 : 12
  context.shadowOffsetY = active ? 8 : 5
  roundRect(context, box.x, box.y, box.width, box.height, 8)
  context.fillStyle = active ? '#ffffff' : 'rgba(255, 255, 255, 0.94)'
  context.fill()
  context.shadowColor = 'transparent'
  context.strokeStyle = active ? color : 'rgba(100, 116, 139, 0.18)'
  context.lineWidth = 1
  context.stroke()
  context.globalAlpha = 1
  context.fillStyle = active ? '#1e293b' : '#64748b'
  const clipped = text.length > 18 ? `${text.slice(0, 16)}...` : text
  context.fillText(clipped, x, y + 0.5, width - 12)
  context.restore()
  return true
}

function createClusterSummaries(data: TopologyExplorerData): ClusterSummary[] {
  const nodesByType = new Map<string, TopologyNode[]>()
  for (const node of data.nodes) {
    const nodes = nodesByType.get(node.type) || []
    nodes.push(node)
    nodesByType.set(node.type, nodes)
  }
  return data.types.map((item, index) => {
    const nodes = nodesByType.get(item.type) || []
    const angle = index * 2.399963
    const orbit = index === 0 ? 0 : 150 + Math.sqrt(index) * 92
    return {
      type: item.type,
      count: item.count,
      color: item.color,
      x: Math.cos(angle) * orbit + Math.sin(index * 0.7) * 80,
      y: Math.sin(angle) * orbit * 0.82 + Math.cos(index * 0.51) * 46,
      radius: clamp(Math.sqrt(item.count) * 4.8, 24, 152),
      nodeIds: nodes.map((node) => node.id),
    }
  })
}

function clusterBounds(clusters: ClusterSummary[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const cluster of clusters) {
    minX = Math.min(minX, cluster.x - cluster.radius - 90)
    minY = Math.min(minY, cluster.y - cluster.radius - 90)
    maxX = Math.max(maxX, cluster.x + cluster.radius + 90)
    maxY = Math.max(maxY, cluster.y + cluster.radius + 90)
  }
  return { minX, minY, maxX, maxY }
}

function findNearestCluster(clusters: ClusterSummary[], world: { x: number; y: number }, zoom: number) {
  let nearest: ClusterSummary | null = null
  let nearestDistance = Infinity
  for (const cluster of clusters) {
    const distance = Math.hypot(cluster.x - world.x, cluster.y - world.y)
    const threshold = cluster.radius + Math.max(34 / zoom, 18)
    if (distance < nearestDistance && distance <= threshold) {
      nearest = cluster
      nearestDistance = distance
    }
  }
  return nearest
}

function findNearestNode(nodes: TopologyNode[], world: { x: number; y: number }, zoom: number, focusedTypeSet: Set<string>) {
  let nearest: TopologyNode | null = null
  let nearestDistance = Infinity
  const threshold = Math.max((zoom >= ringModeZoom ? 22 : 16) / zoom, 5)
  for (const node of nodes) {
    if (focusedTypeSet.size > 0 && !focusedTypeSet.has(node.type)) continue
    const distance = Math.hypot(node.x - world.x, node.y - world.y)
    if (distance < nearestDistance && distance <= threshold) {
      nearest = node
      nearestDistance = distance
    }
  }
  return nearest
}

function nodePriority(
  node: TopologyNode,
  options: { focusedTypeSet: Set<string>; selectedNode: TopologyNode | null; selectedNeighborIds: Set<string> | null },
) {
  let priority = node.weight
  if (options.selectedNode?.id === node.id) priority += 100
  if (options.selectedNeighborIds?.has(node.id)) priority += 18
  if (options.focusedTypeSet.has(node.type)) priority += 12
  return priority
}

function circleOverlaps(reservations: CircleReservation[], x: number, y: number, radius: number) {
  for (const current of reservations) {
    const distance = Math.hypot(current.x - x, current.y - y)
    if (distance < current.radius + radius) return true
  }
  return false
}

function forceNodeReservationRadius(zoom: number, radius: number, iconMode: boolean, glyphMode: boolean) {
  if (glyphMode) return clamp(radius + 34 + (zoom - glyphModeZoom) * 6, 50, 66)
  if (iconMode) return clamp(radius + 24 + (zoom - iconModeZoom) * 5, 38, 52)
  if (zoom >= ringModeZoom) return clamp(radius + 16, 25, 32)
  return clamp(radius + 8, 11, 16)
}

function phyllotaxisPoint(index: number, count: number, radius: number) {
  const angle = index * 2.399963
  const distance = Math.sqrt((index + 0.5) / count) * radius
  return {
    x: Math.cos(angle) * distance,
    y: Math.sin(angle) * distance,
  }
}

function shortNodeLabel(node: TopologyNode) {
  if (node.type.includes('Kubernetes')) return node.label.includes(' ') ? node.label.split(' ').slice(0, 2).join(' ') : node.label
  if (node.type.includes('ECS')) return String(node.properties.host || '10.179.126.252')
  return node.label.length > 18 ? `${node.label.slice(0, 16)}...` : node.label
}

function worldToScreen(x: number, y: number, viewport: Viewport) {
  return {
    x: x * viewport.zoom + viewport.x,
    y: y * viewport.zoom + viewport.y,
  }
}

function screenToWorld(x: number, y: number, viewport: Viewport) {
  return {
    x: (x - viewport.x) / viewport.zoom,
    y: (y - viewport.y) / viewport.zoom,
  }
}

function lineIntersectsViewport(x1: number, y1: number, x2: number, y2: number, width: number, height: number) {
  return Math.max(x1, x2) >= -20 && Math.min(x1, x2) <= width + 20 && Math.max(y1, y2) >= -20 && Math.min(y1, y2) <= height + 20
}

function rectanglesOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  return left.x < right.x + right.width && left.x + left.width > right.x && left.y < right.y + right.height && left.y + left.height > right.y
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
