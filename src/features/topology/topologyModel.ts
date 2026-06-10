export interface TopologyNode {
  id: string
  label: string
  type: string
  cluster: string
  color: string
  x: number
  y: number
  weight: number
  properties: Record<string, string | number>
}

export interface TopologyEdge {
  id: string
  source: string
  target: string
  type: string
  color: string
}

export interface TopologyTypeSummary {
  type: string
  count: number
  color: string
}

export interface TopologyExplorerData {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
  types: TopologyTypeSummary[]
  nodesById: Map<string, TopologyNode>
  bounds: { minX: number; minY: number; maxX: number; maxY: number }
}

const typeNames = [
  '云原生API网关（AI 网关）',
  'NoSQL 数据库',
  '人工智能平台 PAI',
  '容器服务 Kubernetes',
  '负载均衡 SLB',
  '容器服务 Kubernetes 集群',
  'Kubernetes 集群',
  '云原生API网关',
  '应用',
  '负载均衡 ALB',
  '云消息队列 Kafka',
  'PAI-EAS 专属资源组',
  '云服务器 ECS',
  '百炼工作空间',
  '数据库',
  '模型服务',
  '人工智能平台 PAI 工作空间',
]

const colors = [
  '#17a8ff',
  '#6559ff',
  '#7bdc35',
  '#8b5cf6',
  '#10b9a5',
  '#afbd05',
  '#0ea5e9',
  '#44c464',
  '#1db6dc',
  '#e09b12',
  '#20c7a7',
  '#37b6ff',
  '#1ba8db',
  '#ec4899',
  '#1cc8c0',
  '#13b981',
  '#2c9bff',
  '#ef4444',
  '#d946ef',
  '#f97316',
]

const clusterLayout = [
  { cx: 70, cy: 70, radius: 390, count: 1680, variance: 0.5 },
  { cx: -560, cy: -360, radius: 220, count: 560, variance: 0.5 },
  { cx: -470, cy: 280, radius: 150, count: 410, variance: 0.51 },
  { cx: 590, cy: -300, radius: 150, count: 320, variance: 0.51 },
  { cx: 650, cy: 250, radius: 135, count: 250, variance: 0.52 },
  { cx: 420, cy: 520, radius: 135, count: 220, variance: 0.5 },
  { cx: -230, cy: -440, radius: 100, count: 160, variance: 0.52 },
  { cx: -710, cy: 65, radius: 78, count: 135, variance: 0.54 },
  { cx: 820, cy: -20, radius: 84, count: 110, variance: 0.52 },
  { cx: -160, cy: 520, radius: 78, count: 80, variance: 0.53 },
  { cx: 760, cy: 480, radius: 62, count: 46, variance: 0.54 },
  { cx: 290, cy: -500, radius: 60, count: 39, variance: 0.54 },
]

const NODE_TOTAL = 4010
const EDGE_TOTAL = 5342

export function createAliyunLikeTopologyData(): TopologyExplorerData {
  const random = mulberry32(20260609)
  const nodes: TopologyNode[] = []
  let sequence = 0

  clusterLayout.forEach((cluster, clusterIndex) => {
    for (let index = 0; index < cluster.count && nodes.length < NODE_TOTAL; index += 1) {
      const typeIndex = weightedTypeIndex(random, clusterIndex, index)
      const angle = random() * Math.PI * 2
      const distance = Math.pow(random(), cluster.variance) * cluster.radius
      const ripple = Math.sin(index * 0.071 + clusterIndex * 1.7) * cluster.radius * 0.018
      const jitter = (random() - 0.5) * cluster.radius * 0.018
      const x = cluster.cx + Math.cos(angle) * (distance + jitter) + Math.cos(angle + Math.PI / 2) * ripple
      const y = cluster.cy + Math.sin(angle) * (distance + jitter) + Math.sin(angle + Math.PI / 2) * ripple
      sequence += 1
      nodes.push({
        id: `entity-${sequence}`,
        label: `${typeNames[typeIndex]} ${String(sequence).padStart(4, '0')}`,
        type: typeNames[typeIndex],
        cluster: `cluster-${clusterIndex}`,
        color: colors[typeIndex % colors.length],
        x,
        y,
        weight: 1 + Math.floor(random() * 4),
        properties: {
          id: `entity-${sequence}`,
          region: ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-hongkong'][sequence % 4],
          status: sequence % 17 === 0 ? 'warning' : 'normal',
          relationCount: Math.floor(2 + random() * 12),
          host: `10.179.${Math.floor(80 + random() * 90)}.${Math.floor(2 + random() * 240)}`,
          ip: `10.179.${Math.floor(80 + random() * 90)}.${Math.floor(2 + random() * 240)}`,
        },
      })
    }
  })

  while (nodes.length < NODE_TOTAL) {
    const angle = random() * Math.PI * 2
    const radius = 560 + random() * 420
    const typeIndex = weightedTypeIndex(random, 3, nodes.length)
    sequence += 1
    nodes.push({
      id: `entity-${sequence}`,
      label: `${typeNames[typeIndex]} ${String(sequence).padStart(4, '0')}`,
      type: typeNames[typeIndex],
      cluster: 'outer-orbit',
      color: colors[typeIndex % colors.length],
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      weight: 1,
      properties: {
        id: `entity-${sequence}`,
        region: ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-hongkong'][sequence % 4],
        status: 'normal',
        relationCount: Math.floor(1 + random() * 7),
        host: `10.179.${Math.floor(80 + random() * 90)}.${Math.floor(2 + random() * 240)}`,
        ip: `10.179.${Math.floor(80 + random() * 90)}.${Math.floor(2 + random() * 240)}`,
      },
    })
  }

  relaxTopologyNodeSpacing(nodes)

  const nodesByCluster = new Map<string, TopologyNode[]>()
  nodes.forEach((node) => {
    const group = nodesByCluster.get(node.cluster) || []
    group.push(node)
    nodesByCluster.set(node.cluster, group)
  })

  const edges: TopologyEdge[] = []
  const usedEdges = new Set<string>()
  const clusterEntries = [...nodesByCluster.entries()].map(([clusterId, group]) => ({ clusterId, group }))
  const nearbyNodesById = new Map<string, TopologyNode[]>()
  let edgeSequence = 0

  function addEdge(source: TopologyNode, target: TopologyNode, type: string) {
    if (source.id === target.id) return false
    const key = source.id < target.id ? `${source.id}:${target.id}` : `${target.id}:${source.id}`
    if (usedEdges.has(key)) return false
    usedEdges.add(key)
    edgeSequence += 1
    edges.push({
      id: `relation-${edgeSequence}`,
      source: source.id,
      target: target.id,
      type,
      color: target.color,
    })
    return true
  }

  for (const { group } of clusterEntries) {
    const neighborLimit = Math.min(96, Math.max(28, Math.ceil(Math.sqrt(group.length) * 3)))
    for (const node of group) {
      nearbyNodesById.set(node.id, nearestNodes(node, group, neighborLimit))
    }
    for (const node of group) {
      const neighbors = nearbyNodesById.get(node.id) || []
      if (neighbors[0]) addEdge(node, neighbors[0], 'contains')
      if (neighbors.length > 12 && random() > 0.38 && edges.length < EDGE_TOTAL) {
        const target = pickStructuralTarget(neighbors, random)
        addEdge(node, target, 'depends_on')
      }
    }
  }

  let fillAttempts = 0
  while (edges.length < EDGE_TOTAL && fillAttempts < EDGE_TOTAL * 8) {
    fillAttempts += 1
    const sourceCluster = clusterEntries[Math.floor(random() * clusterEntries.length)].group
    const source = sourceCluster[Math.floor(random() * sourceCluster.length)]
    const target = pickNearbyNode(source, nearbyNodesById, random)
    addEdge(source, target, random() > 0.5 ? 'depends_on' : 'contains')
  }

  const relationCounts = new Map<string, number>()
  for (const edge of edges) {
    relationCounts.set(edge.source, (relationCounts.get(edge.source) || 0) + 1)
    relationCounts.set(edge.target, (relationCounts.get(edge.target) || 0) + 1)
  }
  for (const node of nodes) {
    node.properties.relationCount = relationCounts.get(node.id) || 0
  }

  const typeCount = new Map<string, { count: number; color: string }>()
  nodes.forEach((node) => {
    const current = typeCount.get(node.type) || { count: 0, color: node.color }
    current.count += 1
    typeCount.set(node.type, current)
  })

  return {
    nodes,
    edges,
    nodesById: new Map(nodes.map((node) => [node.id, node])),
    types: [...typeCount.entries()]
      .map(([type, value]) => ({ type, count: value.count, color: value.color }))
      .sort((left, right) => right.count - left.count),
    bounds: computeBounds(nodes),
  }
}

function computeBounds(nodes: TopologyNode[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  nodes.forEach((node) => {
    minX = Math.min(minX, node.x)
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x)
    maxY = Math.max(maxY, node.y)
  })
  return { minX, minY, maxX, maxY }
}

function nearestNodes(source: TopologyNode, nodes: TopologyNode[], limit: number) {
  const nearest: Array<{ node: TopologyNode; distance: number }> = []
  for (const node of nodes) {
    if (node.id === source.id) continue
    const distance = Math.hypot(node.x - source.x, node.y - source.y)
    let insertAt = nearest.findIndex((item) => distance < item.distance)
    if (insertAt === -1) insertAt = nearest.length
    nearest.splice(insertAt, 0, { node, distance })
    if (nearest.length > limit) nearest.pop()
  }
  return nearest.map((item) => item.node)
}

function pickNearbyNode(source: TopologyNode, nearbyNodesById: Map<string, TopologyNode[]>, random: () => number) {
  const neighbors = nearbyNodesById.get(source.id) || []
  if (neighbors.length === 0) return source
  const weightedIndex = Math.floor(Math.pow(random(), 0.82) * neighbors.length)
  return neighbors[Math.min(neighbors.length - 1, weightedIndex)]
}

function pickStructuralTarget(neighbors: TopologyNode[], random: () => number) {
  const lower = Math.min(neighbors.length - 1, 10)
  const upper = Math.min(neighbors.length - 1, 54)
  if (upper <= lower) return neighbors[lower]
  const index = lower + Math.floor(Math.pow(random(), 0.78) * (upper - lower + 1))
  return neighbors[Math.min(neighbors.length - 1, index)]
}

function relaxTopologyNodeSpacing(nodes: TopologyNode[]) {
  const nodesByCluster = new Map<string, TopologyNode[]>()
  for (const node of nodes) {
    const group = nodesByCluster.get(node.cluster) || []
    group.push(node)
    nodesByCluster.set(node.cluster, group)
  }

  for (const [clusterId, group] of nodesByCluster.entries()) {
    const cluster = clusterSpecForId(clusterId)
    const minDistance = clusterId === 'outer-orbit'
      ? 14
      : clamp(cluster.radius / Math.sqrt(group.length) * 0.92, 5.4, 8.6)
    const maxRadius = clusterId === 'outer-orbit' ? 1020 : cluster.radius * 1.02
    for (let iteration = 0; iteration < 4; iteration += 1) {
      relaxClusterPass(group, cluster.cx, cluster.cy, maxRadius, minDistance)
    }
  }
}

function relaxClusterPass(nodes: TopologyNode[], cx: number, cy: number, maxRadius: number, minDistance: number) {
  const grid = new Map<string, Array<{ node: TopologyNode; index: number }>>()
  const cellSize = minDistance
  nodes.forEach((node, index) => {
    const key = gridKey(node.x, node.y, cellSize)
    const bucket = grid.get(key) || []
    bucket.push({ node, index })
    grid.set(key, bucket)
  })

  nodes.forEach((node, index) => {
    const cellX = Math.floor(node.x / cellSize)
    const cellY = Math.floor(node.y / cellSize)
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        const bucket = grid.get(`${cellX + offsetX}:${cellY + offsetY}`)
        if (!bucket) continue
        for (const item of bucket) {
          if (item.index <= index) continue
          let dx = item.node.x - node.x
          let dy = item.node.y - node.y
          let distance = Math.hypot(dx, dy)
          if (distance >= minDistance) continue
          if (distance < 0.001) {
            const angle = deterministicPairAngle(node.id, item.node.id)
            dx = Math.cos(angle)
            dy = Math.sin(angle)
            distance = 1
          }
          const push = (minDistance - distance) * 0.46
          const nx = dx / distance
          const ny = dy / distance
          node.x -= nx * push
          node.y -= ny * push
          item.node.x += nx * push
          item.node.y += ny * push
        }
      }
    }
  })

  for (const node of nodes) {
    const dx = node.x - cx
    const dy = node.y - cy
    const distance = Math.hypot(dx, dy)
    if (distance <= maxRadius) continue
    const scale = maxRadius / distance
    node.x = cx + dx * scale
    node.y = cy + dy * scale
  }
}

function clusterSpecForId(clusterId: string) {
  if (clusterId.startsWith('cluster-')) {
    const index = Number(clusterId.slice('cluster-'.length))
    const cluster = clusterLayout[index]
    if (cluster) return cluster
  }
  return { cx: 0, cy: 0, radius: 960 }
}

function gridKey(x: number, y: number, cellSize: number) {
  return `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`
}

function deterministicPairAngle(left: string, right: string) {
  const text = `${left}:${right}`
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return ((hash >>> 0) / 4294967295) * Math.PI * 2
}

function weightedTypeIndex(random: () => number, clusterIndex: number, index: number) {
  if (random() < 0.38) return (clusterIndex * 3 + index) % Math.min(10, typeNames.length)
  if (random() < 0.82) return Math.floor(random() * typeNames.length)
  return Math.floor(random() * typeNames.length)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function mulberry32(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}
