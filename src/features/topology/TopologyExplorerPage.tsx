import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import ReactDOM from 'react-dom'
import {
  ChevronRight,
  CircleHelp,
  Grid2X2,
  Network,
  Play,
  Search,
  Settings,
  Shuffle,
} from 'lucide-react'
import type { UModelApiClient } from '../../api/client'
import { createAliyunLikeTopologyData, type TopologyNode } from './topologyModel'
import { resolveTopologyNodeIconPreset, TopologyPresetIcon } from './topologyIcons'
import { TopologyCanvas } from './TopologyCanvas'
import './topology.css'

type PanelTab = 'overview' | 'layout'

const mockApplications = [
  { id: 'app-cms-prod-001', name: '云监控生产应用' },
  { id: 'app-k8s-core-018', name: 'Kubernetes 核心链路' },
  { id: 'app-pai-eas-026', name: 'PAI-EAS 推理服务' },
  { id: 'app-slb-gateway-039', name: 'SLB 网关入口' },
  { id: 'app-ecs-billing-052', name: 'ECS 计费服务' },
  { id: 'app-arms-observe-073', name: 'ARMS 观测服务' },
]

export function TopologyExplorerPage({
  api: _api,
  workspaceId: _workspaceId,
  refreshToken,
}: {
  api: UModelApiClient
  workspaceId: string
  refreshToken: number
}) {
  const data = useMemo(() => createAliyunLikeTopologyData(), [refreshToken])
  const [tab, setTab] = useState<PanelTab>('layout')
  const [layoutMode, setLayoutMode] = useState<'force' | 'cluster'>('force')
  const [clusterRule, setClusterRule] = useState<'replace' | 'append'>('replace')
  const [allowDrag, setAllowDrag] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showClusterLabels, setShowClusterLabels] = useState(true)
  const [focusedTypes, setFocusedTypes] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0.98)
  const [selectedApplicationId, setSelectedApplicationId] = useState(mockApplications[0]?.id || '')
  const [searchDraft, setSearchDraft] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBlurRef = useRef<number | null>(null)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)
  const [searchPanelStyle, setSearchPanelStyle] = useState<CSSProperties>()
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
      })),
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

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setPlayhead((value) => (value >= 1 ? 0.08 : Math.min(1, value + 0.035)))
    }, 160)
    return () => window.clearInterval(timer)
  }, [playing])

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

        <main className="topo-stage">
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
                placeholder="搜索实体、类型、属性..."
              />
              {searchText && (
                <button className="topo-search-clear" type="button" aria-label="清除搜索" onClick={() => {
                  setSearchText('')
                  setSearchDraft('')
                  setSearchOpen(false)
                }}>
                  ×
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
            <label className="topo-app-selector">
              <span>应用 ID</span>
              <select value={selectedApplicationId} onChange={(event) => setSelectedApplicationId(event.target.value)}>
                {mockApplications.map((application) => (
                  <option key={application.id} value={application.id}>
                    {application.id} · {application.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="topo-time-player">
              <button type="button">1小时</button>
              <button type="button">1天</button>
              <button type="button">自定义</button>
              <div className="topo-timeline" aria-hidden>
                {Array.from({ length: 30 }).map((_, index) => (
                  <span key={index} style={{ backgroundColor: data.types[index % data.types.length]?.color }} />
                ))}
              </div>
              <button className="topo-play-button" type="button" onClick={() => setPlaying((value) => !value)}>
                <Play size={15} />
                {playing ? '暂停' : '播放'}
              </button>
              <span>已缓存</span>
            </div>
          </header>

          <section className="topo-graph-card">
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
            {selectedNode && (
              <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
            )}
          </section>

          <footer className="topo-statusbar">
            <span>当前：{currentNodeCount.toLocaleString()} 实体 / {currentEdgeCount.toLocaleString()} 关系</span>
            {searchText && (
              <>
                <i />
                <span>搜索：{searchText}</span>
              </>
            )}
            <i />
            <span>总量：{data.nodes.length.toLocaleString()} 实体 / {data.edges.length.toLocaleString()} 关系</span>
            <b>拓扑探索</b>
          </footer>
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
              <small>{node.type} · {node.properties.region}</small>
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
            <button key={item.type} className={focusedTypeSet.has(item.type) ? 'active' : ''} type="button" onClick={() => onSelectType(item.type)}>
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
  layoutMode: 'force' | 'cluster'
  clusterRule: 'replace' | 'append'
  allowDrag: boolean
  showLabels: boolean
  showClusterLabels: boolean
  onLayoutModeChange: (value: 'force' | 'cluster') => void
  onClusterRuleChange: (value: 'replace' | 'append') => void
  onAllowDragChange: (value: boolean) => void
  onShowLabelsChange: (value: boolean) => void
  onShowClusterLabelsChange: (value: boolean) => void
}) {
  return (
    <div className="topo-layout-panel">
      <SectionTitle title="布局算法" />
      <RadioCard active={layoutMode === 'force'} title="力导向" desc="按实体连接关系布局，不按类型聚类" onClick={() => onLayoutModeChange('force')} />
      <RadioCard active={layoutMode === 'cluster'} title="聚类" desc="按实体类型分组，生成聚类拓扑总览" onClick={() => onLayoutModeChange('cluster')} />
      <SectionTitle title="仿真" />
      <ToggleRow title="允许拖拽" value={allowDrag} onChange={onAllowDragChange} />
      <SectionTitle title="聚焦规则" />
      <RadioCard active={clusterRule === 'replace'} title="替换聚焦" desc="每次聚焦只保留当前实体" onClick={() => onClusterRuleChange('replace')} />
      <RadioCard active={clusterRule === 'append'} title="追加聚焦" desc="每次聚焦追加到现有聚焦实体" onClick={() => onClusterRuleChange('append')} />
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

function NodeDetail({ node, onClose }: { node: TopologyNode; onClose: () => void }) {
  const rows = [
    ['service_id', `${node.id.replace('entity-', 'hwx28v3j7p@19bf')}`],
    ['service', node.label.toLowerCase().replace(/\s+/g, '-').slice(0, 20)],
    ['source', 'apm'],
    ['language', ['dotnet', 'java', 'go', 'nodejs'][Number(node.properties.relationCount) % 4]],
    ['cluster_id', `ca50119b1cae34a8e91ff52c5b65f5bb9`],
    ['workload_name', node.type.includes('Kubernetes') ? 'accounting' : 'cms-demo'],
    ['workload_kind', node.type.includes('Kubernetes') ? 'deployment' : 'service'],
    ['namespace', 'cms-demo'],
    ['pod_name', `${node.label.split(' ')[0]}-7cf85d999d-4gmq7`],
    ['instance_id', `i-j6cd1zguzn6sfmxemmy4`],
    ['host', node.properties.host || node.properties.ip || '10.179.126.252'],
    ['ip', node.properties.ip || '10.179.126.252'],
    ['properties', JSON.stringify(node.properties)],
  ]

  return (
    <aside className="topo-node-detail">
      <button className="topo-detail-close" type="button" onClick={onClose}>×</button>
      <div className="topo-detail-header">
        <div className="topo-detail-icon" style={{ color: node.color, borderColor: node.color }}>
          <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(node)} label={node.type} size={22} />
        </div>
        <div>
          <strong>{shortDetailTitle(node)}</strong>
          <span><i style={{ backgroundColor: node.color }} /> 实例</span>
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
      <button className="topo-detail-primary" type="button">
        <Shuffle size={15} />
        实体详情
      </button>
    </aside>
  )
}

function shortDetailTitle(node: TopologyNode) {
  if (node.type.includes('Kubernetes')) return node.properties.host ? String(node.properties.host) : 'openclaw-chat-config'
  if (node.type.includes('ECS')) return '10.179.126.252'
  return node.label.replace(/\s+\d+$/, '').slice(0, 28)
}

function resolveTypeSummaryPreset(type: string) {
  return resolveTopologyNodeIconPreset({ type, label: type, iconPreset: undefined })
}

function splitSearchWords(text: string) {
  return text
    .toLowerCase()
    .split(/[\s,，/|]+/g)
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
