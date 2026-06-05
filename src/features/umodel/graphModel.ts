import type { UModelElement } from '../../api/types'
import {
  aliasForElements,
  colorForKind,
  columnForKind,
  elementKey,
  endpointId,
  entityLinkTypeForEdge,
  isEntitySetLinkElement,
  isLinkElement,
  tagCountForElement,
  tagsForElement,
  titleForElement,
  type DraftStatus,
  type EntitySetLinkDisplay,
  type KindColor,
} from './model'

export interface GraphActions {
  onSelect: (element: UModelElement) => void
  onFocus: (element: UModelElement) => void
  onConnect: (element: UModelElement) => void
  onCopy: (element: UModelElement) => void
  onCopyCascade: (element: UModelElement) => void
  onDelete: (element: UModelElement, cascade: boolean) => void
}

export interface UModelNodeData extends Record<string, unknown> {
  element: UModelElement
  title: string
  name: string
  domain: string
  kind: string
  color: KindColor
  tags: string[]
  totalTagCount: number
  actions: GraphActions
  draftStatus?: DraftStatus
}

export interface UModelEdgeData extends Record<string, unknown> {
  element: UModelElement
  title: string
  kind: string
  sourceTitle: string
  targetTitle: string
  sourceKind: string
  targetKind: string
  sourceColor: string
  targetColor: string
  draftStatus?: DraftStatus
}

export interface GraphModel {
  nodes: Array<GraphNode<UModelNodeData>>
  edges: Array<GraphEdge<UModelEdgeData>>
}

export interface GraphNode<TData extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  type?: string
  position: { x: number; y: number }
  draggable?: boolean
  width?: number
  height?: number
  initialWidth?: number
  initialHeight?: number
  measured?: { width: number; height: number }
  data: TData
}

export interface GraphEdge<TData extends Record<string, unknown> = Record<string, unknown>> {
  id: string
  type?: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  data?: TData
  hidden?: boolean
}

export function buildGraph(
  elements: UModelElement[],
  actions: GraphActions,
  draftStatusById: Map<string, DraftStatus>,
  entitySetLinkDisplay: EntitySetLinkDisplay,
): GraphModel {
  const nodeElements = elements.filter(
    (element) => !isLinkElement(element) || (entitySetLinkDisplay === 'relative_link' && isEntitySetLinkElement(element)),
  )
  const linkElements = elements.filter(isLinkElement)
  const alias = aliasForElements(nodeElements)
  const nodeIds = new Set(nodeElements.map(elementKey))
  const nodeById = new Map(nodeElements.map((element) => [elementKey(element), element]))
  const validEdges: Array<{
    id: string
    element: UModelElement
    source: string
    target: string
    sourceElement: UModelElement
    targetElement: UModelElement
    kind?: string
  }> = []

  for (const element of linkElements) {
    const src = endpointId((element.spec || {}).src)
    const dest = endpointId((element.spec || {}).dest)
    const source = src ? alias.get(src) || src : ''
    const target = dest ? alias.get(dest) || dest : ''
    const sourceElement = nodeById.get(source)
    const targetElement = nodeById.get(target)
    if (!source || !target || !nodeIds.has(source) || !nodeIds.has(target) || !sourceElement || !targetElement) continue
    const key = elementKey(element)
    if (isEntitySetLinkElement(element) && entitySetLinkDisplay === 'relative_link' && nodeById.has(key)) {
      validEdges.push({
        id: `${key}:source`,
        element,
        source,
        target: key,
        sourceElement,
        targetElement: element,
        kind: '__temp__',
      })
      validEdges.push({
        id: `${key}:target`,
        element,
        source: key,
        target,
        sourceElement: element,
        targetElement,
        kind: '__temp__',
      })
    } else {
      validEdges.push({ id: key, element, source, target, sourceElement, targetElement })
    }
  }

  const nodes = fallbackLayoutNodes(nodeElements).map(({ element, position }) => {
    const key = elementKey(element)
    const color = colorForKind(element.kind)
    const entityLinkNode = entitySetLinkDisplay === 'relative_link' && isEntitySetLinkElement(element)
    const width = entityLinkNode ? Math.min(160, Math.max(68, entityLinkTypeForEdge(element).length * 7 + 34)) : 164
    const height = entityLinkNode ? 28 : 52
    return {
      id: key,
      type: 'umodel',
      position,
      draggable: true,
      width,
      height,
      initialWidth: width,
      initialHeight: height,
      measured: { width, height },
      data: {
        element,
        title: titleForElement(element),
        name: element.name || key,
        domain: element.domain || 'unknown',
        kind: element.kind,
        color,
        tags: tagsForElement(element),
        totalTagCount: tagCountForElement(element),
        actions,
        draftStatus: draftStatusById.get(key),
      },
    }
  })

  const edges: Array<GraphEdge<UModelEdgeData>> = validEdges.map(({ id, element, source, target, sourceElement, targetElement, kind }) => ({
    id,
    type: 'umodel',
    source,
    target,
    sourceHandle: 'source',
    targetHandle: 'target',
    data: {
      element,
      title: titleForElement(element),
      kind: kind || element.kind,
      sourceTitle: source,
      targetTitle: target,
      sourceKind: sourceElement.kind,
      targetKind: targetElement.kind,
      sourceColor: colorForKind(sourceElement.kind).color,
      targetColor: colorForKind(targetElement.kind).color,
      draftStatus: draftStatusById.get(elementKey(element)),
    },
  }))

  return { nodes, edges }
}

function fallbackLayoutNodes(elements: UModelElement[]) {
  const grouped = new Map<number, UModelElement[]>()
  for (const element of elements) {
    const column = columnForKind(element.kind)
    if (!grouped.has(column)) grouped.set(column, [])
    grouped.get(column)!.push(element)
  }

  const result: Array<{ element: UModelElement; position: { x: number; y: number } }> = []
  let lane = 0
  const maxPerLane = 12
  for (const [, items] of [...grouped.entries()].sort((left, right) => left[0] - right[0])) {
    const sorted = [...items].sort((left, right) => titleForElement(left).localeCompare(titleForElement(right)))
    for (let start = 0; start < sorted.length; start += maxPerLane) {
      const chunk = sorted.slice(start, start + maxPerLane)
      chunk.forEach((element, index) => {
        const total = chunk.length
        result.push({ element, position: { x: lane * 330, y: (index - (total - 1) / 2) * 68 } })
      })
      lane += 1
    }
  }
  return result
}

export async function layoutGraphWithGraphviz(model: GraphModel): Promise<GraphModel> {
  return layoutGraphAsStructuredTree(model)
}

function layoutGraphAsStructuredTree(model: GraphModel): GraphModel {
  if (model.nodes.length === 0) return model

  const outgoing = new Map<string, Array<{ id: string; target: string }>>()
  const incoming = new Map<string, number>()
  const degree = new Map<string, number>()
  for (const node of model.nodes) {
    outgoing.set(node.id, [])
    incoming.set(node.id, 0)
    degree.set(node.id, 0)
  }
  for (const edge of model.edges) {
    if (!outgoing.has(edge.source) || !incoming.has(edge.target)) continue
    outgoing.get(edge.source)!.push({ id: edge.id, target: edge.target })
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1)
  }

  const nodeById = new Map(model.nodes.map((node) => [node.id, node]))
  const visited = new Set<string>()
  const childrenById = new Map<string, string[]>()
  const treeEdgeIds = new Set<string>()
  const roots: string[] = []

  for (const node of model.nodes) childrenById.set(node.id, [])

  function compareByConnectivity(leftId: string, rightId: string) {
    const degreeDelta = (degree.get(rightId) || 0) - (degree.get(leftId) || 0)
    if (degreeDelta !== 0) return degreeDelta
    const left = nodeById.get(leftId)
    const right = nodeById.get(rightId)
    if (left && right) return compareStructuredNodes(left, right)
    return leftId.localeCompare(rightId)
  }

  function growTree(rootId: string) {
    if (visited.has(rootId)) return
    roots.push(rootId)
    visited.add(rootId)
    const queue = [rootId]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      const nextEdges = [...(outgoing.get(currentId) || [])]
        .filter((edge) => !visited.has(edge.target))
        .sort((left, right) => compareByConnectivity(left.target, right.target))
      for (const edge of nextEdges) {
        visited.add(edge.target)
        childrenById.get(currentId)!.push(edge.target)
        treeEdgeIds.add(edge.id)
        queue.push(edge.target)
      }
    }
  }

  const preferredRoots = model.nodes
    .filter((node) => (outgoing.get(node.id)?.length || 0) > 0 && (incoming.get(node.id) || 0) === 0)
    .map((node) => node.id)
    .sort(compareByConnectivity)
  const fallbackRoots = model.nodes
    .map((node) => node.id)
    .sort(compareByConnectivity)

  for (const id of [...preferredRoots, ...fallbackRoots]) growTree(id)

  const positions = new Map<string, { x: number; y: number }>()
  const entityIds = model.nodes
    .filter((node) => node.data.kind === 'entity_set')
    .map((node) => node.id)
    .sort(compareByConnectivity)
  const primaryEntityIds = entityIds.slice(0, Math.min(18, Math.max(8, Math.ceil(entityIds.length * 0.36))))
  const primaryEntityIdSet = new Set(primaryEntityIds)
  const secondaryEntityIds = entityIds.filter((id) => !primaryEntityIdSet.has(id))
  const leftFarKinds = new Set(['explorer', 'aliyun_prometheus', 'profile_set', 'trace_set', 'event_set'])
  const rightKinds = new Set(['metric_set', 'log_set', 'runbook_set'])
  const storageKinds = new Set(['sls_logstore', 'sls_metricstore'])
  const leftFarIds: string[] = []
  const rightIds: string[] = []
  const storageIds: string[] = []
  const fallbackIds: string[] = []

  for (const node of model.nodes) {
    if (node.data.kind === 'entity_set') continue
    if (leftFarKinds.has(node.data.kind)) leftFarIds.push(node.id)
    else if (rightKinds.has(node.data.kind)) rightIds.push(node.id)
    else if (storageKinds.has(node.data.kind)) storageIds.push(node.id)
    else fallbackIds.push(node.id)
  }

  function connectedIds(id: string) {
    const ids: string[] = []
    for (const edge of model.edges) {
      if (edge.source === id) ids.push(edge.target)
      else if (edge.target === id) ids.push(edge.source)
    }
    return ids
  }

  function bestEntityAnchor(id: string) {
    const candidates = connectedIds(id)
      .filter((candidateId) => nodeById.get(candidateId)?.data.kind === 'entity_set')
      .sort((leftId, rightId) => {
        const primaryDelta = Number(primaryEntityIdSet.has(rightId)) - Number(primaryEntityIdSet.has(leftId))
        if (primaryDelta !== 0) return primaryDelta
        return compareByConnectivity(leftId, rightId)
      })
    return candidates[0] || primaryEntityIds[0] || entityIds[0]
  }

  function positionedAnchorY(id: string) {
    const direct = positions.get(id)
    if (direct) return direct.y
    const positionedNeighbor = connectedIds(id)
      .map((candidateId) => positions.get(candidateId))
      .filter(Boolean)
      .sort((left, right) => Math.abs(left!.y) - Math.abs(right!.y))[0]
    if (positionedNeighbor) return positionedNeighbor.y
    const entityAnchor = bestEntityAnchor(id)
    return entityAnchor ? positions.get(entityAnchor)?.y || 0 : 0
  }

  function placeStack(ids: string[], x: number, rowStep: number, yOffset = 0) {
    const sortedIds = [...ids].sort(compareByConnectivity)
    sortedIds.forEach((id, index) => {
      positions.set(id, { x, y: (index - (sortedIds.length - 1) / 2) * rowStep + yOffset })
    })
  }

  function placeClusteredLane(ids: string[], x: number, direction: 1 | -1, options?: { rowStep?: number; yOffset?: number; typeOffsets?: Record<string, number>; columnStep?: number }) {
    const rowStep = options?.rowStep || 54
    const yOffset = options?.yOffset || 0
    const typeOffsets = options?.typeOffsets || {}
    const columnStep = options?.columnStep || 158
    const minGap = Math.max(rowStep, 74)
    const anchorGroups = new Map<string, string[]>()
    for (const id of ids) {
      const anchor = bestEntityAnchor(id) || '__none__'
      if (!anchorGroups.has(anchor)) anchorGroups.set(anchor, [])
      anchorGroups.get(anchor)!.push(id)
    }

    const occupiedByColumn = new Map<number, number[]>()
    const anchors = [...anchorGroups.entries()].sort((left, right) => positionedAnchorY(left[0]) - positionedAnchorY(right[0]))
    for (const [anchor, groupIds] of anchors) {
      const sortedGroup = groupIds.sort((leftId, rightId) => {
        const kindDelta = laneKindOrder(nodeById.get(leftId)?.data.kind || '') - laneKindOrder(nodeById.get(rightId)?.data.kind || '')
        if (kindDelta !== 0) return kindDelta
        return compareByConnectivity(leftId, rightId)
      })
      sortedGroup.forEach((id, index) => {
        const kind = nodeById.get(id)?.data.kind || ''
        const column = typeOffsets[kind] || 0
        const columnKey = direction * column
        const occupied = occupiedByColumn.get(columnKey) || []
        const desiredY = positionedAnchorY(anchor) + (index - (sortedGroup.length - 1) / 2) * rowStep + yOffset
        let y = desiredY
        while (occupied.some((value) => Math.abs(value - y) < minGap)) y += minGap
        occupied.push(y)
        occupiedByColumn.set(columnKey, occupied)
        positions.set(id, {
          x: x + direction * column * columnStep,
          y,
        })
      })
    }
  }

  placeStack(primaryEntityIds, 0, 76)
  placeClusteredLane(secondaryEntityIds, -250, -1, { rowStep: 74 })
  placeClusteredLane(leftFarIds, -540, -1, {
    rowStep: 74,
    yOffset: -20,
    columnStep: 132,
    typeOffsets: { explorer: 0, event_set: 0, aliyun_prometheus: 1, trace_set: 1, profile_set: 2 },
  })
  placeClusteredLane(rightIds, 260, 1, {
    rowStep: 74,
    columnStep: 132,
    typeOffsets: { metric_set: 0, runbook_set: 0, log_set: 1 },
  })
  placeClusteredLane(storageIds, 640, 1, {
    rowStep: 74,
    yOffset: 8,
    columnStep: 132,
    typeOffsets: { sls_logstore: 0, sls_metricstore: 1 },
  })
  placeClusteredLane(fallbackIds, -540, -1, { rowStep: 74, yOffset: 22, columnStep: 132 })

  const minY = Math.min(...[...positions.values()].map((position) => position.y))
  const offsetY = Number.isFinite(minY) ? -minY : 0
  for (const [id, position] of positions) {
    positions.set(id, { x: position.x, y: position.y + offsetY })
  }

  const edgeById = new Map(model.edges.map((edge) => [edge.id, edge]))
  const isDrawableEdge = (edge: GraphModel['edges'][number]) => {
    const source = positions.get(edge.source)
    const target = positions.get(edge.target)
    if (!source || !target) return false
    const laneDistance = Math.abs(target.x - source.x)
    const verticalDistance = Math.abs(target.y - source.y)
    return laneDistance >= 130 && laneDistance <= 760 && verticalDistance <= 900
  }

  if (treeEdgeIds.size === 0) {
    for (const edge of model.edges) {
      const source = positions.get(edge.source)
      const target = positions.get(edge.target)
      if (!source || !target || source.x >= target.x) continue
      treeEdgeIds.add(edge.id)
    }
  }

  const visibleEdgeIds = new Set([...treeEdgeIds].filter((id) => {
    const edge = edgeById.get(id)
    return edge ? isDrawableEdge(edge) : false
  }))
  const extraEdgeLimit = 96
  const extraCandidates = model.edges
    .filter((edge) => !visibleEdgeIds.has(edge.id))
    .filter(isDrawableEdge)
    .sort((left, right) => {
      const leftSource = positions.get(left.source)!
      const leftTarget = positions.get(left.target)!
      const rightSource = positions.get(right.source)!
      const rightTarget = positions.get(right.target)!
      const leftScore = Math.abs(leftTarget.x - leftSource.x) + Math.abs(leftTarget.y - leftSource.y) * 0.4
      const rightScore = Math.abs(rightTarget.x - rightSource.x) + Math.abs(rightTarget.y - rightSource.y) * 0.4
      return leftScore - rightScore
    })
    .slice(0, extraEdgeLimit)

  for (const edge of extraCandidates) visibleEdgeIds.add(edge.id)

  return {
    ...model,
    nodes: model.nodes.map((node) => {
      const position = positions.get(node.id)
      if (!position) return node
      return { ...node, position }
    }),
    edges: model.edges.map((edge) => {
      const visible = visibleEdgeIds.has(edge.id)
      return {
        ...edge,
        hidden: !visible,
        data: edge.data ? { ...edge.data, isTreeEdge: treeEdgeIds.has(edge.id) } : edge.data,
      }
    }),
  }
}

function compareStructuredNodes(left: GraphModel['nodes'][number], right: GraphModel['nodes'][number]) {
  const domain = (left.data.domain || '').localeCompare(right.data.domain || '')
  if (domain !== 0) return domain
  const kind = left.data.kind.localeCompare(right.data.kind)
  if (kind !== 0) return kind
  return left.data.title.localeCompare(right.data.title)
}

function laneKindOrder(kind: string) {
  const order: Record<string, number> = {
    entity_set: 0,
    aliyun_prometheus: 1,
    explorer: 2,
    event_set: 3,
    profile_set: 4,
    trace_set: 5,
    metric_set: 6,
    log_set: 7,
    runbook_set: 8,
    sls_logstore: 9,
    sls_metricstore: 10,
  }
  return order[kind] ?? 99
}

function depthForKind(kind: string) {
  if (kind === 'entity_set') return 1
  if (kind === 'entity_set_link') return 2
  if (kind === 'metric_set' || kind === 'log_set') return 3
  if (kind === 'trace_set' || kind === 'event_set' || kind === 'profile_set') return 4
  return 5
}
