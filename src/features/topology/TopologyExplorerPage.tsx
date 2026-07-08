import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import ReactDOM from 'react-dom'
import {
  AlertCircle,
  ChevronRight,
  CircleHelp,
  Grid2X2,
  Network,
  Play,
  RefreshCcw,
  Search,
  Settings,
} from 'lucide-react'
import type { UModelApiClient } from '../../api/client'
import { formatError } from '../../lib/json'
import { createTopologyDataFromResults, type TopologyExplorerData, type TopologyNode } from './topologyModel'
import { resolveTopologyNodeIconPreset, TopologyPresetIcon } from './topologyIcons'
import { TopologyCanvas } from './TopologyCanvas'
import { EntityExplorerPage } from '../entity/EntityExplorerPage'
import './topology.css'

type PanelTab = 'overview' | 'layout'
type TopologyLayoutMode = 'force' | 'cluster' | 'architecture' | 'entity'

const ENTITY_LIMIT = 2000
const TOPO_LIMIT = 4000

const emptyTopologyData: TopologyExplorerData = {
  nodes: [],
  edges: [],
  types: [],
  nodesById: new Map(),
  bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
}

export function TopologyExplorerPage({
  api,
  workspaceId,
  refreshToken,
}: {
  api: UModelApiClient
  workspaceId: string
  refreshToken: number
}) {
  const [data, setData] = useState<TopologyExplorerData>(emptyTopologyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<PanelTab>('layout')
  const [layoutMode, setLayoutMode] = useState<TopologyLayoutMode>('force')
  const [clusterRule, setClusterRule] = useState<'replace' | 'append'>('replace')
  const [allowDrag, setAllowDrag] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showClusterLabels, setShowClusterLabels] = useState(true)
  const [focusedTypes, setFocusedTypes] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(1)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBlurRef = useRef<number | null>(null)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)
  const [searchPanelStyle, setSearchPanelStyle] = useState<CSSProperties>()

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [entityResult, topoResult] = await Promise.all([
        api.query(workspaceId, { query: `.entity | limit ${ENTITY_LIMIT}`, limit: ENTITY_LIMIT }),
        api.query(workspaceId, { query: `.topo | limit ${TOPO_LIMIT}`, limit: TOPO_LIMIT }),
      ])
      const nextData = createTopologyDataFromResults(entityResult, topoResult)
      setData(nextData)
      setSelectedNode((current) => (current ? nextData.nodesById.get(current.id) || null : null))
    } catch (nextError) {
      setError(formatError(nextError))
      setData(emptyTopologyData)
      setSelectedNode(null)
    } finally {
      setLoading(false)
    }
  }, [api, workspaceId])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  useEffect(() => {
    if (!playing) {
      setPlayhead(1)
      return
    }
    setPlayhead(0.12)
    const timer = window.setInterval(() => {
      setPlayhead((value) => {
        if (value >= 1) {
          window.clearInterval(timer)
          return 1
        }
        return Math.min(1, value + 0.08)
      })
    }, 120)
    return () => window.clearInterval(timer)
  }, [playing, data.edges.length])

  const focusedTypeSet = useMemo(() => new Set(focusedTypes), [focusedTypes])
  const searchNeedles = useMemo(() => splitSearchWords(searchText), [searchText])
  const displayData = useMemo(() => {
    const nodes = data.nodes.filter((node) => {
      const typeMatched = focusedTypes.length === 0 || focusedTypeSet.has(node.type)
      const searchMatched = searchNeedles.length === 0 || nodeMatchesSearch(node, searchNeedles)
      return typeMatched && searchMatched
    })
    const nodeIds = new Set(nodes.map((node) => node.id))
    const edges = data.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    return {
      ...data,
      nodes,
      edges,
      nodesById: new Map(nodes.map((node) => [node.id, node])),
      types: data.types.map((type) => ({
        ...type,
        count: nodes.filter((node) => node.type === type.type).length,
      })).filter((type) => type.count > 0),
      bounds: nodes.length > 0 ? computeDisplayBounds(nodes) : data.bounds,
    }
  }, [data, focusedTypeSet, focusedTypes.length, searchNeedles])

  const currentNodeCount = displayData.nodes.length
  const currentEdgeCount = displayData.edges.length
  const searchMatches = useMemo(() => {
    const query = searchDraft.trim()
    if (!query) return []
    const needles = splitSearchWords(query)
    return data.nodes
      .filter((node) => nodeMatchesSearch(node, needles))
      .slice(0, 8)
  }, [data.nodes, searchDraft])
  const activeTypes = useMemo(() => data.types.filter((type) => type.count > 0).slice(0, 8), [data.types])
  const relationTypeCount = useMemo(() => new Set(data.edges.map((edge) => edge.type)).size, [data.edges])

  const updateSearchPanelGeometry = useCallback(() => {
    const wrap = searchWrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const viewportPadding = 12
    const width = Math.min(620, Math.max(320, window.innerWidth - viewportPadding * 2))
    const left = Math.min(
      Math.max(viewportPadding, rect.left),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    )
    setSearchPanelStyle({
      left,
      top: rect.bottom + 8,
      width,
      maxWidth: width,
      maxHeight: Math.max(180, window.innerHeight - rect.bottom - 20),
    })
  }, [])

  useLayoutEffect(() => {
    if (!searchOpen) return
    updateSearchPanelGeometry()
    window.addEventListener('resize', updateSearchPanelGeometry)
    window.addEventListener('scroll', updateSearchPanelGeometry, true)
    return () => {
      window.removeEventListener('resize', updateSearchPanelGeometry)
      window.removeEventListener('scroll', updateSearchPanelGeometry, true)
    }
  }, [searchOpen, updateSearchPanelGeometry])

  const focusType = (type: string) => {
    setSelectedNode(null)
    setFocusedTypes((current) => {
      if (clusterRule === 'replace') return current.length === 1 && current[0] === type ? [] : [type]
      return current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    })
  }

  const focusNode = (node: TopologyNode) => {
    setSearchText('')
    setSearchDraft('')
    setLayoutMode('force')
    setSelectedNode(node)
    setFocusedTypes((current) => {
      if (current.includes(node.type)) return current
      return clusterRule === 'append' ? [...current, node.type] : [node.type]
    })
  }

  const applySearch = (text = searchDraft) => {
    const value = text.trim()
    setSearchText(value)
    setSearchDraft(value)
    setSearchOpen(false)
    setSelectedNode(null)
  }

  return (
    <div className="topo-page">
      <section className="topo-console">
        <aside className="topo-config-panel">
          <div className="topo-config-title">
            <Network size={18} />
            <strong>拓扑探索</strong>
          </div>
          <div className="topo-stat-grid">
            <div>
              <strong>{data.nodes.length.toLocaleString()}</strong>
              <span>实体</span>
            </div>
            <div>
              <strong>{data.edges.length.toLocaleString()}</strong>
              <span>关系</span>
            </div>
          </div>
          <div className="topo-panel-tabs">
            <button className={tab === 'overview' ? 'active' : ''} type="button" onClick={() => setTab('overview')}>
              <Grid2X2 size={15} />
              概览
            </button>
            <button className={tab === 'layout' ? 'active' : ''} type="button" onClick={() => setTab('layout')}>
              <Settings size={15} />
              布局
            </button>
          </div>

          {tab === 'overview' ? (
            <OverviewPanel
              types={data.types}
              focusedTypes={focusedTypes}
              onSelectType={focusType}
            />
          ) : (
            <LayoutPanel
              layoutMode={layoutMode}
              clusterRule={clusterRule}
              allowDrag={allowDrag}
              showLabels={showLabels}
              showClusterLabels={showClusterLabels}
              onLayoutModeChange={(value) => {
                setLayoutMode(value)
                setSelectedNode(null)
              }}
              onClusterRuleChange={setClusterRule}
              onAllowDragChange={setAllowDrag}
              onShowLabelsChange={setShowLabels}
              onShowClusterLabelsChange={setShowClusterLabels}
            />
          )}
        </aside>

        <main className={layoutMode === 'entity' ? 'topo-stage entity-layout-active' : 'topo-stage'}>
          <header className="topo-stage-toolbar">
            <div className="topo-search-wrap" ref={searchWrapRef}>
              <Search size={16} />
              <input
                value={searchDraft}
                onBlur={() => {
                  searchBlurRef.current = window.setTimeout(() => setSearchOpen(false), 160)
                }}
                onChange={(event) => {
                  setSearchDraft(event.target.value)
                  setSearchOpen(true)
                }}
                onFocus={() => {
                  if (searchBlurRef.current) window.clearTimeout(searchBlurRef.current)
                  setSearchOpen(true)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') applySearch()
                  if (event.key === 'Escape') setSearchOpen(false)
                }}
                placeholder="搜索实体、类型或属性"
              />
              {searchText && (
                <button
                  className="topo-search-clear"
                  type="button"
                  aria-label="清除搜索"
                  onClick={() => {
                    setSearchText('')
                    setSearchDraft('')
                    setSearchOpen(false)
                  }}
                >
                  x
                </button>
              )}
              {searchOpen && (
                <SearchPopover
                  query={searchDraft}
                  nodes={searchMatches}
                  types={activeTypes}
                  style={searchPanelStyle}
                  onApplySearch={applySearch}
                  onFocusNode={(node) => {
                    focusNode(node)
                    setSearchOpen(false)
                  }}
                  onToggleType={(type) => {
                    focusType(type)
                    setSearchOpen(false)
                  }}
                />
              )}
            </div>

            <div className="topo-app-selector">
              <span>Workspace</span>
              <strong title={workspaceId}>{workspaceId}</strong>
            </div>

            <div className="topo-time-player">
              <button type="button" onClick={() => setPlaying((value) => !value)} disabled={data.edges.length === 0}>
                <Play size={15} />
                {playing ? '关系展开中' : '关系展开'}
              </button>
              <span>{relationTypeCount} 种关系</span>
              <span>{data.types.length} 类实体</span>
              <button type="button" onClick={() => void load()}>
                <RefreshCcw size={14} />
                刷新
              </button>
            </div>
          </header>

          <section className="topo-graph-card">
            {layoutMode === 'entity' ? (
              <div className="topo-entity-layout">
                <EntityExplorerPage api={api} workspaceId={workspaceId} refreshToken={refreshToken} initialView="topology" topologyOnly />
              </div>
            ) : layoutMode === 'architecture' ? (
              <>
                <ArchitectureLayerTopology
                  data={displayData}
                  selectedNode={selectedNode}
                  showLabels={showLabels}
                  onSelectNode={setSelectedNode}
                />
                {loading && (
                  <div className="topo-feedback-overlay">
                    <strong>正在加载后端拓扑数据...</strong>
                    <span>工作空间 `{workspaceId}`</span>
                  </div>
                )}
                {!loading && error && (
                  <div className="topo-feedback-overlay error">
                    <AlertCircle size={18} />
                    <strong>拓扑查询失败</strong>
                    <span>{error}</span>
                    <button type="button" onClick={() => void load()}>
                      重试
                    </button>
                  </div>
                )}
                {!loading && !error && data.nodes.length === 0 && (
                  <div className="topo-feedback-overlay empty">
                    <strong>当前工作空间暂无拓扑数据</strong>
                    <span>请先导入样例或写入实体与关系后再查看拓扑。</span>
                  </div>
                )}
                {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />}
              </>
            ) : (
              <>
                <TopologyCanvas
                  data={displayData}
                  layoutMode={layoutMode}
                  focusedTypes={[]}
                  selectedNode={selectedNode}
                  showLabels={showLabels}
                  showClusterLabels={showClusterLabels}
                  allowDrag={allowDrag}
                  playhead={playhead}
                  onSelectNode={setSelectedNode}
                  onFocusType={focusType}
                />
                {loading && (
                  <div className="topo-feedback-overlay">
                    <strong>正在加载后端拓扑数据...</strong>
                    <span>工作空间 `{workspaceId}`</span>
                  </div>
                )}
                {!loading && error && (
                  <div className="topo-feedback-overlay error">
                    <AlertCircle size={18} />
                    <strong>拓扑查询失败</strong>
                    <span>{error}</span>
                    <button type="button" onClick={() => void load()}>
                      重试
                    </button>
                  </div>
                )}
                {!loading && !error && data.nodes.length === 0 && (
                  <div className="topo-feedback-overlay empty">
                    <strong>当前工作空间暂无拓扑数据</strong>
                    <span>请先导入样例或写入实体与关系后再查看拓扑。</span>
                  </div>
                )}
                {selectedNode && <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />}
              </>
            )}
          </section>

          {layoutMode !== 'entity' && (
          <footer className="topo-statusbar">
            <span>当前: {currentNodeCount.toLocaleString()} 实体 / {currentEdgeCount.toLocaleString()} 关系</span>
            {searchText && (
              <>
                <i />
                <span>搜索: {searchText}</span>
              </>
            )}
            <i />
            <span>总量: {data.nodes.length.toLocaleString()} 实体 / {data.edges.length.toLocaleString()} 关系</span>
            <b>实时拓扑</b>
          </footer>
          )}
        </main>
      </section>
    </div>
  )
}

function SearchPopover({
  query,
  nodes,
  types,
  style,
  onApplySearch,
  onFocusNode,
  onToggleType,
}: {
  query: string
  nodes: TopologyNode[]
  types: Array<{ type: string; count: number; color: string }>
  style?: CSSProperties
  onApplySearch: (query: string) => void
  onFocusNode: (node: TopologyNode) => void
  onToggleType: (type: string) => void
}) {
  if (typeof document === 'undefined') return null
  return ReactDOM.createPortal(
    <div className="topo-search-popover" style={style} onMouseDown={(event) => event.preventDefault()}>
      {query.trim() && (
        <button className="topo-search-command" onClick={() => onApplySearch(query)} type="button">
          <Search size={13} />
          搜索 "{query.trim()}"
        </button>
      )}
      <div className="topo-search-section">
        <strong>实体</strong>
        {nodes.length === 0 ? <span className="topo-search-empty">没有匹配实体</span> : nodes.map((node) => (
          <button key={node.id} onClick={() => onFocusNode(node)} type="button">
            <span className="topo-search-dot" style={{ background: node.color }} />
            <span>
              <b>{node.label}</b>
              <small>{node.type} | {stringProp(node.properties, '__domain__') || stringProp(node.properties, 'namespace') || node.id}</small>
            </span>
          </button>
        ))}
      </div>
      <div className="topo-search-section">
        <strong>类型</strong>
        <div className="topo-token-cloud">
          {types.map((type) => (
            <button key={type.type} onClick={() => onToggleType(type.type)} type="button">
              <span style={{ background: type.color }} />
              {type.type}
              <b>{type.count.toLocaleString()}</b>
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}

function OverviewPanel({
  types,
  focusedTypes,
  onSelectType,
}: {
  types: Array<{ type: string; count: number; color: string }>
  focusedTypes: string[]
  onSelectType: (type: string) => void
}) {
  const focusedTypeSet = new Set(focusedTypes)
  return (
    <div className="topo-overview-list">
      {types.map((item) => (
        <button
          key={item.type}
          className={focusedTypeSet.has(item.type) ? 'active' : ''}
          type="button"
          onClick={() => onSelectType(item.type)}
        >
          <span className="topo-type-icon" style={{ color: item.color, borderColor: item.color }}>
            <TopologyPresetIcon preset={resolveTypeSummaryPreset(item.type)} label={item.type} size={13} />
          </span>
          <span>{item.type}</span>
          <b>{item.count}</b>
          <CircleHelp size={14} />
          <ChevronRight size={14} />
        </button>
      ))}
    </div>
  )
}

function LayoutPanel({
  layoutMode,
  clusterRule,
  allowDrag,
  showLabels,
  showClusterLabels,
  onLayoutModeChange,
  onClusterRuleChange,
  onAllowDragChange,
  onShowLabelsChange,
  onShowClusterLabelsChange,
}: {
  layoutMode: TopologyLayoutMode
  clusterRule: 'replace' | 'append'
  allowDrag: boolean
  showLabels: boolean
  showClusterLabels: boolean
  onLayoutModeChange: (value: TopologyLayoutMode) => void
  onClusterRuleChange: (value: 'replace' | 'append') => void
  onAllowDragChange: (value: boolean) => void
  onShowLabelsChange: (value: boolean) => void
  onShowClusterLabelsChange: (value: boolean) => void
}) {
  return (
    <div className="topo-layout-panel">
      <SectionTitle title="布局算法" />
      <RadioCard active={layoutMode === 'force'} title="关系布局" desc="按照实体连接关系展示真实拓扑。" onClick={() => onLayoutModeChange('force')} />
      <RadioCard active={layoutMode === 'cluster'} title="类型聚类" desc="按照实体类型分组查看结构总览。" onClick={() => onLayoutModeChange('cluster')} />
      <RadioCard active={layoutMode === 'architecture'} title="架构分层" desc="按照架构层次分层查看层内和跨层调用。" onClick={() => onLayoutModeChange('architecture')} />
      <SectionTitle title="拓扑视图" />
      <RadioCard active={layoutMode === 'entity'} title="实体拓扑" desc="在右侧展示实体拓扑视图。" onClick={() => onLayoutModeChange('entity')} />
      <SectionTitle title="交互" />
      <ToggleRow title="允许拖拽" value={allowDrag} onChange={onAllowDragChange} />
      <SectionTitle title="聚焦规则" />
      <RadioCard active={clusterRule === 'replace'} title="替换聚焦" desc="每次只保留当前类型聚焦。" onClick={() => onClusterRuleChange('replace')} />
      <RadioCard active={clusterRule === 'append'} title="追加聚焦" desc="可叠加多个类型一起观察。" onClick={() => onClusterRuleChange('append')} />
      <SectionTitle title="显示" />
      <ToggleRow title="显示标签" value={showLabels} onChange={onShowLabelsChange} />
      <ToggleRow title="聚类标签" value={showClusterLabels} onChange={onShowClusterLabelsChange} disabled={layoutMode !== 'cluster'} />
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return <div className="topo-section-title">{title}</div>
}

function RadioCard({ active, title, desc, onClick }: { active: boolean; title: string; desc: string; onClick: () => void }) {
  return (
    <button className={`topo-radio-card ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span />
      <strong>{title}</strong>
      <small>{desc}</small>
    </button>
  )
}

function ToggleRow({ title, value, disabled, onChange }: { title: string; value: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`topo-toggle-row ${disabled ? 'disabled' : ''}`}>
      <span>{title}</span>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <i />
    </label>
  )
}

type ArchitectureLayerKey = 'tenant' | 'cloud' | 'microservice' | 'host' | 'datacenter'

interface ArchitectureLayer {
  key: ArchitectureLayerKey
  title: string
  label: string
  color: string
  stroke: string
  y: number
  height: number
  depth: number
}

interface ArchitectureNodeItem {
  node: TopologyNode
  layer: ArchitectureLayer
  x: number
  y: number
  degree: number
}

interface ArchitectureEdgeItem {
  id: string
  source: ArchitectureNodeItem
  target: ArchitectureNodeItem
  type: string
  color: string
  crossLayer: boolean
  labelVisible: boolean
}

interface ArchitectureProjectedPoint {
  x: number
  y: number
  z: number
  scale: number
}

interface ArchitectureProjectedLayer {
  layer: ArchitectureLayer
  points: string
  label: ArchitectureProjectedPoint
  title: ArchitectureProjectedPoint
  hidden: number
  depth: number
  opacity: number
}

interface ArchitectureProjectedNode {
  item: ArchitectureNodeItem
  point: ArchitectureProjectedPoint
  radius: number
  opacity: number
}

interface ArchitectureProjectedEdge {
  edge: ArchitectureEdgeItem
  source: ArchitectureProjectedPoint
  target: ArchitectureProjectedPoint
  label: ArchitectureProjectedPoint
  opacity: number
}

const architectureLayers: ArchitectureLayer[] = [
  { key: 'tenant', title: '租户/业务应用', label: '租户', color: '#fff2be', stroke: '#d7b958', y: 30, height: 104, depth: 190 },
  { key: 'cloud', title: '云服务', label: '云服务', color: '#c9f3f8', stroke: '#58becf', y: 168, height: 112, depth: 92 },
  { key: 'microservice', title: '微服务', label: '微服务', color: '#142033', stroke: '#536680', y: 314, height: 112, depth: 0 },
  { key: 'host', title: '主机/容器', label: '主机', color: '#101d2d', stroke: '#43667f', y: 460, height: 112, depth: -106 },
  { key: 'datacenter', title: '数据中心/网络', label: '数据中心', color: '#10293c', stroke: '#4280a6', y: 606, height: 96, depth: -204 },
]

const architectureLayerByKey = new Map(architectureLayers.map((layer) => [layer.key, layer]))

function ArchitectureLayerTopology({
  data,
  selectedNode,
  showLabels,
  onSelectNode,
}: {
  data: TopologyExplorerData
  selectedNode: TopologyNode | null
  showLabels: boolean
  onSelectNode: (node: TopologyNode | null) => void
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const plan = useMemo(() => createArchitecturePlan(data), [data])
  const [rotation, setRotation] = useState({ x: 58, y: -28 })
  const [viewportSize, setViewportSize] = useState({ width: 1120, height: 730 })
  const rotateRef = useRef({ active: false, moved: false, startX: 0, startY: 0, rotationX: 58, rotationY: -28 })
  const suppressNextClickRef = useRef(false)
  const selectedLayer = selectedNode ? plan.nodeById.get(selectedNode.id)?.layer.key : ''
  const projection = useMemo(() => createArchitectureProjection(plan, rotation), [plan, rotation])
  const viewBox = useMemo(() => createArchitectureViewBox(projection, viewportSize), [projection, viewportSize])
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const update = () => {
      const rect = viewport.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) setViewportSize({ width: rect.width, height: rect.height })
    }
    const observer = new ResizeObserver(update)
    observer.observe(viewport)
    update()
    return () => observer.disconnect()
  }, [])
  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('.topo-architecture-node-hit')) return
    rotateRef.current = {
      active: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      rotationX: rotation.x,
      rotationY: rotation.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = rotateRef.current
    if (!state.active) return
    const dx = event.clientX - state.startX
    const dy = event.clientY - state.startY
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      state.moved = true
      suppressNextClickRef.current = true
    }
    setRotation({
      x: Math.max(36, Math.min(72, state.rotationX - dy * 0.12)),
      y: Math.max(-64, Math.min(64, state.rotationY + dx * 0.18)),
    })
  }
  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!rotateRef.current.active) return
    rotateRef.current.active = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }
  const handleCanvasClick = () => {
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false
      return
    }
    onSelectNode(null)
  }

  return (
    <div className="topo-architecture-shell">
      <div
        ref={viewportRef}
        className="topo-architecture-viewport"
        onClick={handleCanvasClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
      >
        <svg className="topo-architecture-projection" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" role="img" aria-label="架构分层 3D 拓扑">
          <defs>
            <filter id="topo-architecture-board-shadow" x="-20%" y="-30%" width="140%" height="170%">
              <feDropShadow dx="0" dy="16" stdDeviation="12" floodColor="#0f172a" floodOpacity="0.22" />
            </filter>
            <filter id="topo-architecture-node-glow" x="-80%" y="-80%" width="260%" height="260%">
              <feDropShadow dx="0" dy="0" stdDeviation="4" floodColor="#3b82f6" floodOpacity="0.42" />
            </filter>
            <marker id="topo-architecture-projection-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" />
            </marker>
          </defs>
          <g className="topo-architecture-projected-layers">
            {projection.layers.map((item) => (
              <g key={item.layer.key} className={`topo-architecture-projected-layer ${item.layer.key} ${selectedLayer === item.layer.key ? 'active' : ''}`}>
                <polygon
                  points={item.points}
                  style={{
                    fill: item.layer.color,
                    stroke: item.layer.stroke,
                    opacity: item.opacity,
                  }}
                />
                <text x={item.label.x} y={item.label.y}>{item.layer.label}</text>
                <text className="title" x={item.title.x} y={item.title.y}>{item.layer.title}</text>
                {item.hidden > 0 && <text className="hidden" x={item.title.x + 680 * item.title.scale} y={item.title.y}>+{item.hidden} 未展示</text>}
              </g>
            ))}
          </g>
          <g className="topo-architecture-projected-edges">
            {projection.edges.map((item) => (
              <g key={item.edge.id} className={item.edge.crossLayer ? 'cross-layer' : 'same-layer'} style={{ opacity: item.opacity }}>
                <line
                  x1={item.source.x}
                  y1={item.source.y}
                  x2={item.target.x}
                  y2={item.target.y}
                  style={{ stroke: item.edge.color }}
                />
                {showLabels && item.edge.labelVisible && (
                  <text x={item.label.x} y={item.label.y} style={{ fill: item.edge.color }}>
                    {item.edge.type}
                  </text>
                )}
              </g>
            ))}
          </g>
          <g className="topo-architecture-projected-nodes">
            {projection.nodes.map((item) => {
              const selected = selectedNode?.id === item.item.node.id
              return (
                <g
                  key={item.item.node.id}
                  className={`topo-architecture-node-hit ${item.item.layer.key} ${selected ? 'active' : ''}`}
                  transform={`translate(${item.point.x} ${item.point.y})`}
                  style={{
                    '--topo-node-color': item.item.node.color,
                    opacity: item.opacity,
                  } as CSSProperties}
                  role="button"
                  tabIndex={0}
                  aria-label={`${shortDetailTitle(item.item.node)} ${item.item.node.type}`}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectNode(item.item.node)
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onSelectNode(item.item.node)
                  }}
                >
                  <circle className="halo" r={item.radius + 5} />
                  <circle className="dot" r={item.radius} />
                  {item.item.degree > 0 && <text className="degree" x={item.radius + 5} y={-item.radius + 1}>{item.item.degree}</text>}
                  <g className="label" transform={`translate(${item.radius + 8} -16)`}>
                    <rect width="148" height="35" rx="5" />
                    <text x="8" y="14">{shortDetailTitle(item.item.node)}</text>
                    <text className="type" x="8" y="28">{item.item.node.type}</text>
                  </g>
                </g>
              )
            })}
          </g>
        </svg>
      </div>
      <div className="topo-architecture-legend">
        <span><i className="same" />层内调用</span>
        <span><i className="cross" />跨层调用</span>
        <b>{plan.edges.length} 条可见调用</b>
      </div>
    </div>
  )
}

function createArchitecturePlan(data: TopologyExplorerData) {
  const degreeById = new Map<string, number>()
  data.edges.forEach((edge) => {
    degreeById.set(edge.source, (degreeById.get(edge.source) || 0) + 1)
    degreeById.set(edge.target, (degreeById.get(edge.target) || 0) + 1)
  })
  const buckets = new Map<ArchitectureLayerKey, TopologyNode[]>()
  architectureLayers.forEach((layer) => buckets.set(layer.key, []))
  data.nodes.forEach((node) => {
    buckets.get(resolveArchitectureLayerKey(node))?.push(node)
  })

  const layerCounts = new Map<ArchitectureLayerKey, number>()
  const visibleLayerCounts = new Map<ArchitectureLayerKey, number>()
  const nodes: ArchitectureNodeItem[] = []
  architectureLayers.forEach((layer) => {
    const bucket = buckets.get(layer.key) || []
    layerCounts.set(layer.key, bucket.length)
    const visible = [...bucket]
      .sort((left, right) => (degreeById.get(right.id) || 0) - (degreeById.get(left.id) || 0) || left.label.localeCompare(right.label, 'zh-Hans-CN', { numeric: true }))
      .slice(0, layer.key === 'tenant' ? 18 : 28)
    visibleLayerCounts.set(layer.key, visible.length)
    visible.forEach((node, index) => {
      const columns = Math.min(14, Math.max(1, Math.ceil(visible.length / 3)))
      const row = Math.floor(index / columns)
      const col = index % columns
      const xStart = layer.key === 'datacenter' ? 250 : 230
      const xEnd = layer.key === 'datacenter' ? 860 : 940
      const x = columns <= 1 ? (xStart + xEnd) / 2 : xStart + ((xEnd - xStart) * col) / (columns - 1)
      const y = layer.y + 42 + row * 28
      nodes.push({ node, layer, x, y, degree: degreeById.get(node.id) || 0 })
    })
  })

  const nodeById = new Map(nodes.map((item) => [item.node.id, item]))
  const edges = data.edges.flatMap((edge, index) => {
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    if (!source || !target) return []
    const crossLayer = source.layer.key !== target.layer.key
    return [{
      id: edge.id || `${edge.source}:${edge.target}:${index}`,
      source,
      target,
      type: edge.type || 'calls',
      color: edge.color || target.node.color,
      crossLayer,
      labelVisible: crossLayer || index % 5 === 0,
    }]
  }).slice(0, 160)

  return { nodes, edges, nodeById, layerCounts, visibleLayerCounts }
}

function createArchitectureProjection(
  plan: ReturnType<typeof createArchitecturePlan>,
  rotation: { x: number; y: number },
) {
  const layers: ArchitectureProjectedLayer[] = architectureLayers.map((layer) => {
    const corners = [
      projectArchitecturePoint(150, layer.y, layer.depth, rotation),
      projectArchitecturePoint(1060, layer.y, layer.depth, rotation),
      projectArchitecturePoint(990, layer.y + layer.height, layer.depth, rotation),
      projectArchitecturePoint(80, layer.y + layer.height, layer.depth, rotation),
    ]
    const count = plan.layerCounts.get(layer.key) || 0
    const visible = plan.visibleLayerCounts.get(layer.key) || 0
    const avgDepth = corners.reduce((sum, point) => sum + point.z, 0) / corners.length
    return {
      layer,
      points: corners.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' '),
      label: projectArchitecturePoint(72, layer.y + layer.height - 15, layer.depth + 4, rotation),
      title: projectArchitecturePoint(190, layer.y + 27, layer.depth + 4, rotation),
      hidden: Math.max(0, count - visible),
      depth: avgDepth,
      opacity: 0.74 + Math.min(0.22, (avgDepth + 260) / 2400),
    }
  }).sort((left, right) => left.depth - right.depth)

  const nodes: ArchitectureProjectedNode[] = plan.nodes.map((item) => {
    const point = projectArchitecturePoint(item.x, item.y, item.layer.depth + 34, rotation)
    const radius = Math.max(3.8, Math.min(8.2, 5.2 * point.scale + Math.min(3, item.degree * 0.16)))
    return {
      item,
      point,
      radius,
      opacity: Math.max(0.42, Math.min(1, 0.58 + point.scale * 0.34)),
    }
  }).sort((left, right) => left.point.z - right.point.z)

  const projectedById = new Map(nodes.map((item) => [item.item.node.id, item]))
  const edges: ArchitectureProjectedEdge[] = plan.edges.flatMap((edge) => {
    const source = projectedById.get(edge.source.node.id)
    const target = projectedById.get(edge.target.node.id)
    if (!source || !target) return []
    const label = {
      x: (source.point.x + target.point.x) / 2,
      y: (source.point.y + target.point.y) / 2 - (edge.crossLayer ? 8 : 13),
      z: (source.point.z + target.point.z) / 2,
      scale: (source.point.scale + target.point.scale) / 2,
    }
    return [{
      edge,
      source: source.point,
      target: target.point,
      label,
      opacity: edge.crossLayer ? 0.68 : 0.36,
    }]
  }).sort((left, right) => left.label.z - right.label.z)

  return { layers, nodes, edges }
}

function createArchitectureViewBox(
  projection: ReturnType<typeof createArchitectureProjection>,
  size: { width: number; height: number },
) {
  const xs: number[] = []
  const ys: number[] = []
  projection.layers.forEach((item) => {
    item.points.split(' ').forEach((pair) => {
      const [x, y] = pair.split(',').map(Number)
      if (Number.isFinite(x) && Number.isFinite(y)) {
        xs.push(x)
        ys.push(y)
      }
    })
    xs.push(item.label.x, item.title.x, item.title.x + 760 * item.title.scale)
    ys.push(item.label.y, item.title.y)
  })
  projection.edges.forEach((item) => {
    xs.push(item.source.x, item.target.x, item.label.x)
    ys.push(item.source.y, item.target.y, item.label.y)
  })
  projection.nodes.forEach((item) => {
    const labelWidth = 168 * item.point.scale
    const labelHeight = 42 * item.point.scale
    xs.push(item.point.x - item.radius - 12, item.point.x + item.radius + labelWidth)
    ys.push(item.point.y - item.radius - labelHeight, item.point.y + item.radius + 14)
  })
  if (xs.length === 0 || ys.length === 0) return '0 0 1120 730'
  let minX = Math.min(...xs)
  let maxX = Math.max(...xs)
  let minY = Math.min(...ys)
  let maxY = Math.max(...ys)
  const width = Math.max(1, maxX - minX)
  const height = Math.max(1, maxY - minY)
  const paddingX = Math.max(52, width * 0.08)
  const paddingY = Math.max(48, height * 0.1)
  minX -= paddingX
  maxX += paddingX
  minY -= paddingY
  maxY += paddingY
  const targetRatio = Math.max(0.45, Math.min(3.2, (size.width || 1120) / Math.max(1, size.height || 730)))
  let viewWidth = maxX - minX
  let viewHeight = maxY - minY
  const currentRatio = viewWidth / Math.max(1, viewHeight)
  if (currentRatio > targetRatio) {
    const nextHeight = viewWidth / targetRatio
    const delta = nextHeight - viewHeight
    minY -= delta / 2
    maxY += delta / 2
    viewHeight = nextHeight
  } else {
    const nextWidth = viewHeight * targetRatio
    const delta = nextWidth - viewWidth
    minX -= delta / 2
    maxX += delta / 2
    viewWidth = nextWidth
  }
  return `${minX.toFixed(1)} ${minY.toFixed(1)} ${viewWidth.toFixed(1)} ${viewHeight.toFixed(1)}`
}

function projectArchitecturePoint(x: number, y: number, z: number, rotation: { x: number; y: number }): ArchitectureProjectedPoint {
  const cx = 560
  const cy = 365
  const rx = (rotation.x * Math.PI) / 180
  const ry = (rotation.y * Math.PI) / 180
  const px = x - cx
  const py = y - cy
  const pz = z
  const y1 = py * Math.cos(rx) - pz * Math.sin(rx)
  const z1 = py * Math.sin(rx) + pz * Math.cos(rx)
  const x2 = px * Math.cos(ry) + z1 * Math.sin(ry)
  const z2 = -px * Math.sin(ry) + z1 * Math.cos(ry)
  const depth = 980
  const scale = depth / (depth + z2 + 220)
  return {
    x: cx + x2 * scale,
    y: cy + y1 * scale * 0.95,
    z: z2,
    scale,
  }
}

function resolveArchitectureLayerKey(node: TopologyNode): ArchitectureLayerKey {
  const text = [
    node.type,
    node.label,
    node.cluster,
    ...Object.entries(node.properties).flatMap(([key, value]) => [key, String(value)]),
  ].join(' ').toLowerCase()
  if (matchesAny(text, ['tor', 'cna', 'coresw', 'aggrsw', 'switch', 'datacenter', 'physical', 'baremetal'])) return 'datacenter'
  if (matchesAny(text, ['k8s.node', 'ecs', 'host', 'vm', 'server', 'compute', 'pod', 'container', 'workload'])) return 'host'
  if (matchesAny(text, ['devops.service', 'devops.gateway', 'devops.job', 'cronjob', 'api-com', 'ha-proxy', 'haproxy', 'nova', 'neutron', 'keystone', 'om-console'])) return 'microservice'
  if (matchesAny(text, ['rds', 'mysql', 'postgres', 'redis', 'elasticsearch', 'kafka', 'rocketmq', 'slb', 'cdn', 'oss', 'bucket', 'waf', 'prometheus', 'logstore', 'dws', 'dli'])) return 'cloud'
  if (matchesAny(text, ['application', 'frontend', 'web', 'nginx', 'service a', 'tenant', 'business'])) return 'tenant'
  if (matchesAny(text, ['vpc', 'nat_gateway', 'nat gateway', 'network'])) return 'datacenter'
  return architectureLayerByKey.get('microservice') ? 'microservice' : 'cloud'
}

function matchesAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle))
}

function NodeDetail({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const rows = detailRowsFor(node)

  return (
    <aside className="topo-node-detail">
      <button className="topo-detail-close" type="button" onClick={onClose}>x</button>
      <div className="topo-detail-header">
        <div className="topo-detail-icon" style={{ color: node.color, borderColor: node.color }}>
          <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(node)} label={node.type} size={22} />
        </div>
        <div>
          <strong>{shortDetailTitle(node)}</strong>
          <span><i style={{ backgroundColor: node.color }} /> {node.type}</span>
        </div>
      </div>
      <div className="topo-detail-section-title">属性</div>
      <div className="topo-detail-table">
        {rows.map(([key, value]) => (
          <div key={key} className="topo-detail-row">
            <small>{key}</small>
            <b>{value}</b>
          </div>
        ))}
      </div>
    </aside>
  )
}

function detailRowsFor(node: TopologyNode) {
  const preferredKeys = [
    '__domain__',
    '__entity_type__',
    '__entity_id__',
    'display_name',
    'name',
    'namespace',
    'environment',
    'id',
    'relationCount',
    '__first_observed_time__',
    '__last_observed_time__',
  ]
  const rows: Array<[string, string]> = []
  preferredKeys.forEach((key) => {
    const value = node.properties[key]
    if (value === undefined || value === '') return
    rows.push([key, String(value)])
  })
  Object.entries(node.properties).forEach(([key, value]) => {
    if (preferredKeys.includes(key) || value === undefined || value === '') return
    rows.push([key, String(value)])
  })
  return rows
}

function shortDetailTitle(node: TopologyNode) {
  return stringProp(node.properties, 'display_name')
    || stringProp(node.properties, 'name')
    || node.label.replace(/\s+\d+$/, '')
    || node.id
}

function resolveTypeSummaryPreset(type: string) {
  return resolveTopologyNodeIconPreset({ type, label: type, iconPreset: undefined })
}

function splitSearchWords(text: string) {
  return text
    .toLowerCase()
    .split(/[\s,|]+/g)
    .map((item) => item.trim())
    .filter(Boolean)
}

function nodeMatchesSearch(node: TopologyNode, needles: string[]) {
  if (needles.length === 0) return true
  const haystack = [
    node.id,
    node.label,
    node.type,
    node.cluster,
    ...Object.entries(node.properties).flatMap(([key, value]) => [key, String(value)]),
  ].join(' ').toLowerCase()
  return needles.every((needle) => haystack.includes(needle))
}

function computeDisplayBounds(nodes: TopologyNode[]) {
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
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: -1, minY: -1, maxX: 1, maxY: 1 }
  }
  const padding = 80
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding }
}

function stringProp(properties: Record<string, string | number>, key: string) {
  const value = properties[key]
  return typeof value === 'string' ? value : ''
}
