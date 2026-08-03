import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import ReactDOM from 'react-dom'
import {
  Activity,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Grid2X2,
  Info,
  LineChart,
  Network,
  Play,
  Search,
  Settings,
  Shuffle,
  X,
} from 'lucide-react'
import type { UModelApiClient } from '../../api/client'
import { EntityTopologyView, type EntityTopologyInstance } from '../entity/EntityExplorerPage'
import { createAliyunLikeTopologyData, type TopologyNode } from './topologyModel'
import { resolveTopologyNodeIconPreset, TopologyPresetIcon } from './topologyIcons'
import { TopologyCanvas } from './TopologyCanvas'
import './topology.css'

type PanelTab = 'overview' | 'layout'
type TopologyStageMode = 'canvas' | 'entity-reference'
type TimeRangeMode = '1h' | '1d' | 'custom'
type InstanceDetailTab = 'detail' | 'topology' | 'metrics'

interface TopologyTimeRange {
  mode: TimeRangeMode
  from: string
  to: string
}

const mockApplications = [
  { id: 'app-cms-prod-001', name: '云监控生产应用' },
  { id: 'app-k8s-core-018', name: 'Kubernetes 核心链路' },
  { id: 'app-pai-eas-026', name: 'PAI-EAS 推理服务' },
  { id: 'app-slb-gateway-039', name: 'SLB 网关入口' },
  { id: 'app-ecs-billing-052', name: 'ECS 计费服务' },
  { id: 'app-arms-observe-073', name: 'ARMS 观测服务' },
]

const timeRangePresets: Array<{ mode: TimeRangeMode; label: string; hours: number }> = [
  { mode: '1h', label: '1小时', hours: 1 },
  { mode: '1d', label: '1天', hours: 24 },
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
  const [stageMode, setStageMode] = useState<TopologyStageMode>('canvas')
  const [layoutMode, setLayoutMode] = useState<'force' | 'cluster'>('force')
  const [clusterRule, setClusterRule] = useState<'replace' | 'append'>('replace')
  const [allowDrag, setAllowDrag] = useState(false)
  const [showLabels, setShowLabels] = useState(true)
  const [showClusterLabels, setShowClusterLabels] = useState(true)
  const [focusedTypes, setFocusedTypes] = useState<string[]>([])
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null)
  const [selectedInstance, setSelectedInstance] = useState<EntityTopologyInstance | null>(null)
  const [playing, setPlaying] = useState(false)
  const [playhead, setPlayhead] = useState(0.98)
  const [selectedApplicationId, setSelectedApplicationId] = useState(mockApplications[0]?.id || '')
  const [timeRange, setTimeRange] = useState<TopologyTimeRange>(() => createPresetTimeRange('1h'))
  const [customRangeDraft, setCustomRangeDraft] = useState<TopologyTimeRange>(() => createPresetTimeRange('1h'))
  const [timePanelOpen, setTimePanelOpen] = useState(false)
  const [searchDraft, setSearchDraft] = useState('')
  const [searchText, setSearchText] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const searchBlurRef = useRef<number | null>(null)
  const searchWrapRef = useRef<HTMLDivElement | null>(null)
  const timeWrapRef = useRef<HTMLDivElement | null>(null)
  const [searchPanelStyle, setSearchPanelStyle] = useState<CSSProperties>()
  const [timePanelStyle, setTimePanelStyle] = useState<CSSProperties>()
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
  const timeRangeSummary = useMemo(() => formatTimeRangeSummary(timeRange), [timeRange])

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

  const updateTimePanelGeometry = useCallback(() => {
    const wrap = timeWrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    const viewportPadding = 12
    const width = Math.min(292, window.innerWidth - viewportPadding * 2)
    const left = Math.min(
      Math.max(viewportPadding, rect.right - width),
      Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
    )
    setTimePanelStyle({
      left,
      top: rect.bottom + 8,
      width,
      maxHeight: Math.max(190, window.innerHeight - rect.bottom - 20),
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

  useLayoutEffect(() => {
    if (!timePanelOpen) return
    updateTimePanelGeometry()
    window.addEventListener('resize', updateTimePanelGeometry)
    window.addEventListener('scroll', updateTimePanelGeometry, true)
    return () => {
      window.removeEventListener('resize', updateTimePanelGeometry)
      window.removeEventListener('scroll', updateTimePanelGeometry, true)
    }
  }, [timePanelOpen, updateTimePanelGeometry])

  useEffect(() => {
    if (!timePanelOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setTimePanelOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [timePanelOpen])

  useEffect(() => {
    if (!selectedInstance) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedInstance(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedInstance])

  const focusType = (type: string) => {
    setStageMode('canvas')
    setSelectedNode(null)
    setFocusedTypes((current) => {
      if (clusterRule === 'replace') return current.length === 1 && current[0] === type ? [] : [type]
      return current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    })
  }

  const focusNode = (node: TopologyNode) => {
    setStageMode('canvas')
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
    setStageMode('canvas')
    setSearchText(value)
    setSearchDraft(value)
    setSearchOpen(false)
    setSelectedNode(null)
  }

  const applyPresetTimeRange = (mode: TimeRangeMode) => {
    const nextRange = createPresetTimeRange(mode)
    setTimeRange(nextRange)
    setCustomRangeDraft(nextRange)
    setTimePanelOpen(false)
    setPlaying(false)
  }

  const openCustomTimeRange = () => {
    setCustomRangeDraft(timeRange.mode === 'custom' ? timeRange : createPresetTimeRange('1h', 'custom'))
    setTimePanelOpen((value) => !value)
  }

  const applyCustomTimeRange = () => {
    if (!customRangeDraft.from || !customRangeDraft.to) return
    const normalized = normalizeCustomTimeRange(customRangeDraft)
    setTimeRange(normalized)
    setCustomRangeDraft(normalized)
    setTimePanelOpen(false)
    setPlaying(false)
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
              stageMode={stageMode}
              clusterRule={clusterRule}
              allowDrag={allowDrag}
              showLabels={showLabels}
              showClusterLabels={showClusterLabels}
              onLayoutModeChange={(value) => {
                setStageMode('canvas')
                setLayoutMode(value)
                setSelectedNode(null)
              }}
              onOpenReferenceTopology={() => {
                setStageMode('entity-reference')
                setSelectedNode(null)
                setSearchOpen(false)
                setPlaying(false)
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
              {timeRangePresets.map((preset) => (
                <button
                  key={preset.mode}
                  className={timeRange.mode === preset.mode ? 'active' : ''}
                  type="button"
                  onClick={() => applyPresetTimeRange(preset.mode)}
                >
                  {preset.label}
                </button>
              ))}
              <div className="topo-time-custom" ref={timeWrapRef}>
                <button className={timeRange.mode === 'custom' ? 'active' : ''} type="button" onClick={openCustomTimeRange}>
                  自定义
                </button>
                {timePanelOpen && (
                  <TimeRangePopover
                    range={customRangeDraft}
                    style={timePanelStyle}
                    onChange={setCustomRangeDraft}
                    onClose={() => setTimePanelOpen(false)}
                    onApply={applyCustomTimeRange}
                  />
                )}
              </div>
              <div className="topo-timeline" aria-hidden>
                {Array.from({ length: 30 }).map((_, index) => (
                  <span key={index} style={{ backgroundColor: data.types[index % data.types.length]?.color }} />
                ))}
              </div>
              <button className="topo-play-button" type="button" onClick={() => setPlaying((value) => !value)}>
                <Play size={15} />
                {playing ? '暂停' : '播放'}
              </button>
              <span className="topo-time-summary">{timeRangeSummary}</span>
            </div>
          </header>

          <section className={stageMode === 'entity-reference' ? 'topo-graph-card entity-reference-topology' : 'topo-graph-card'}>
            {stageMode === 'entity-reference' ? (
              <EntityTopologyView
                data={data}
                focusedTypes={focusedTypes}
                selectedNode={selectedNode}
                cardVariant="omodel"
                nodeDragEnabled={allowDrag}
                onSelectNode={setSelectedNode}
                onFocusType={(type) => {
                  setFocusedTypes([type])
                }}
                onInspectInstance={setSelectedInstance}
              />
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
                {selectedNode && (
                  <NodeDetail
                    node={selectedNode}
                    onClose={() => setSelectedNode(null)}
                    onInspect={(node) => {
                      setSearchText(node.label)
                      setSearchDraft(node.label)
                      setFocusedTypes([])
                      setSelectedNode(null)
                    }}
                  />
                )}
              </>
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
            <b>{stageMode === 'entity-reference' ? '实体拓扑' : '拓扑探索'}</b>
          </footer>
        </main>
      </section>
      {selectedInstance && (
        <div className="topo-instance-drawer-layer">
          <button
            className="topo-instance-drawer-backdrop"
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => setSelectedInstance(null)}
          />
          <aside
            className="topo-instance-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="topo-instance-title"
          >
            <InstanceExplorer
              data={data}
              instance={selectedInstance}
              applicationId={selectedApplicationId}
              timeRangeSummary={timeRangeSummary}
              onClose={() => setSelectedInstance(null)}
            />
          </aside>
        </div>
      )}
    </div>
  )
}

function InstanceExplorer({
  data,
  instance,
  applicationId,
  timeRangeSummary,
  onClose,
}: {
  data: ReturnType<typeof createAliyunLikeTopologyData>
  instance: EntityTopologyInstance
  applicationId: string
  timeRangeSummary: string
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<InstanceDetailTab>('detail')
  const application = mockApplications.find((item) => item.id === applicationId)
  const tabs: Array<{ id: InstanceDetailTab; label: string; icon: typeof Database }> = [
    { id: 'detail', label: '实体详情', icon: Database },
    { id: 'topology', label: '关联拓扑', icon: Network },
    { id: 'metrics', label: '指标探索', icon: LineChart },
  ]

  return (
    <div className="topo-instance-page">
      <header className="topo-instance-header">
        <span className="topo-instance-mark" style={{ color: instance.node.color, borderColor: instance.node.color }}>
          <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(instance.node)} label={instance.entityType} size={20} />
        </span>
        <div className="topo-instance-heading">
          <strong id="topo-instance-title">{instance.name}</strong>
          <span>{instance.entityTitle} · {instance.entityType}</span>
        </div>
        <span className="topo-instance-status"><i />运行中</span>
        <div className="topo-instance-context">
          <span>{applicationId} · {application?.name}</span>
          <b>{timeRangeSummary}</b>
        </div>
        <button className="topo-instance-close" type="button" onClick={onClose} aria-label="关闭实例详情" autoFocus>
          <X size={18} />
        </button>
      </header>

      <nav className="topo-instance-tabs" aria-label="实例探索页签">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button key={tab.id} className={activeTab === tab.id ? 'active' : ''} type="button" onClick={() => setActiveTab(tab.id)}>
              <Icon size={15} />
              {tab.label}
            </button>
          )
        })}
      </nav>

      <main className="topo-instance-content">
        {activeTab === 'detail' && <InstanceDetailTabView instance={instance} applicationId={applicationId} />}
        {activeTab === 'topology' && <InstanceTopologyTabView data={data} instance={instance} />}
        {activeTab === 'metrics' && <InstanceMetricsTabView instance={instance} timeRangeSummary={timeRangeSummary} />}
      </main>
    </div>
  )
}

function InstanceDetailTabView({ instance, applicationId }: { instance: EntityTopologyInstance; applicationId: string }) {
  const node = instance.node
  const relationCount = Number(node.properties.relationCount) || 0
  const rows = [
    ['实例 ID', instance.name],
    ['实体类型', instance.entityType],
    ['所属实体', instance.entityTitle],
    ['应用 ID', applicationId],
    ['区域', node.properties.region || 'cn-hongkong'],
    ['运行状态', node.properties.status || 'normal'],
    ['主机地址', node.properties.host || '-'],
    ['IP 地址', node.properties.ip || '-'],
    ['关联关系', `${relationCount} 条`],
  ]
  return (
    <div className="topo-instance-detail-view">
      <section className="topo-instance-summary-grid">
        <SummaryMetric label="平均请求次数" value={instance.requests || '0'} unit="次/min" />
        <SummaryMetric label="平均错误次数" value={instance.errors || '0'} unit="次/min" tone={Number(instance.errors) > 0 ? 'danger' : 'normal'} />
        <SummaryMetric label="平均延迟" value={instance.latency || '0 ms'} unit="" />
        <SummaryMetric label="关联实体" value={String(relationCount)} unit="个" />
      </section>
      <section className="topo-instance-section topo-instance-property-section">
        <div className="topo-instance-section-head">
          <div><strong>基本信息</strong><span>实例标识、归属和运行属性</span></div>
          <span className="topo-instance-info"><Info size={14} /> Mock 数据</span>
        </div>
        <dl className="topo-instance-property-grid">
          {rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
      </section>
    </div>
  )
}

function SummaryMetric({ label, value, unit, tone = 'normal' }: { label: string; value: string; unit: string; tone?: 'normal' | 'danger' }) {
  return (
    <article className={`topo-instance-summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {unit && <small>{unit}</small>}
    </article>
  )
}

function InstanceTopologyTabView({
  data,
  instance,
}: {
  data: ReturnType<typeof createAliyunLikeTopologyData>
  instance: EntityTopologyInstance
}) {
  const neighbors = useMemo(() => {
    const rows = data.edges
      .filter((edge) => edge.source === instance.node.id || edge.target === instance.node.id)
      .map((edge) => {
        const peerId = edge.source === instance.node.id ? edge.target : edge.source
        const peer = data.nodesById.get(peerId)
        return peer ? { edge, peer, incoming: edge.target === instance.node.id } : null
      })
      .filter(Boolean)
    return rows.slice(0, 8) as Array<{ edge: (typeof data.edges)[number]; peer: TopologyNode; incoming: boolean }>
  }, [data, instance.node.id])
  const centerX = 430
  const centerY = 245
  const radiusX = 310
  const radiusY = 165

  return (
    <section className="topo-instance-section topo-neighbor-section">
      <div className="topo-instance-section-head">
        <div><strong>一跳关联拓扑</strong><span>{neighbors.length} 个直接邻居，关系来自当前拓扑数据</span></div>
      </div>
      <div className="topo-neighbor-canvas">
        <svg viewBox="0 0 860 490" role="img" aria-label={`${instance.name} 的关联拓扑`}>
          <defs>
            <marker id="topo-instance-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M0,0 L8,4 L0,8 Z" fill="#b8c1cf" />
            </marker>
          </defs>
          {neighbors.map((item, index) => {
            const angle = (Math.PI * 2 * index) / Math.max(1, neighbors.length) - Math.PI / 2
            const x = centerX + Math.cos(angle) * radiusX
            const y = centerY + Math.sin(angle) * radiusY
            const sourceX = item.incoming ? x : centerX
            const sourceY = item.incoming ? y : centerY
            const targetX = item.incoming ? centerX : x
            const targetY = item.incoming ? centerY : y
            return (
              <g key={item.edge.id}>
                <line x1={sourceX} y1={sourceY} x2={targetX} y2={targetY} stroke="#cbd3df" strokeWidth="2" markerEnd="url(#topo-instance-arrow)" />
                <text x={(centerX + x) / 2} y={(centerY + y) / 2 - 7} textAnchor="middle" className="topo-neighbor-edge-label">{item.edge.type}</text>
                <g transform={`translate(${x - 77} ${y - 31})`}>
                  <rect width="154" height="62" rx="6" fill="#fff" stroke={item.peer.color} strokeWidth="2" />
                  <circle cx="18" cy="19" r="6" fill={item.peer.color} />
                  <text x="31" y="22" className="topo-neighbor-title">{shortSvgLabel(item.peer.label, 17)}</text>
                  <text x="14" y="44" className="topo-neighbor-subtitle">{shortSvgLabel(item.peer.type, 22)}</text>
                </g>
              </g>
            )
          })}
          <g transform={`translate(${centerX - 92} ${centerY - 38})`}>
            <rect width="184" height="76" rx="8" fill="#f7f6ff" stroke="#6559e8" strokeWidth="3" />
            <circle cx="22" cy="22" r="8" fill={instance.node.color} />
            <text x="38" y="26" className="topo-neighbor-center-title">{shortSvgLabel(instance.name, 20)}</text>
            <text x="18" y="53" className="topo-neighbor-center-subtitle">{shortSvgLabel(instance.entityType, 25)}</text>
          </g>
          {neighbors.length === 0 && <text x="430" y="250" textAnchor="middle" className="topo-neighbor-empty">当前实例暂无直接关联</text>}
        </svg>
      </div>
    </section>
  )
}

function InstanceMetricsTabView({ instance, timeRangeSummary }: { instance: EntityTopologyInstance; timeRangeSummary: string }) {
  const metrics = useMemo(() => createInstanceMetrics(instance), [instance])
  return (
    <div className="topo-instance-metrics-view">
      <div className="topo-metrics-toolbar">
        <div><Activity size={16} /><strong>实例指标</strong><span>{timeRangeSummary}</span></div>
        <span>采样间隔 5 分钟</span>
      </div>
      <section className="topo-metric-grid">
        {metrics.map((metric) => <MetricChart key={metric.id} metric={metric} />)}
      </section>
    </div>
  )
}

interface InstanceMetric {
  id: string
  title: string
  value: string
  unit: string
  color: string
  points: number[]
}

function MetricChart({ metric }: { metric: InstanceMetric }) {
  const width = 420
  const height = 150
  const padding = 18
  const max = Math.max(...metric.points, 1)
  const min = Math.min(...metric.points, 0)
  const range = Math.max(1, max - min)
  const coordinates = metric.points.map((point, index) => ({
    x: padding + (index / Math.max(1, metric.points.length - 1)) * (width - padding * 2),
    y: height - padding - ((point - min) / range) * (height - padding * 2),
  }))
  const line = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
  const lastCoordinate = coordinates[coordinates.length - 1]
  const area = `${line} L${lastCoordinate?.x || padding},${height - padding} L${padding},${height - padding} Z`
  return (
    <article className="topo-metric-card">
      <header><span>{metric.title}</span><strong>{metric.value}<small>{metric.unit}</small></strong></header>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${metric.title}时序图`}>
        {[0.25, 0.5, 0.75].map((ratio) => <line key={ratio} x1={padding} x2={width - padding} y1={height * ratio} y2={height * ratio} stroke="#edf0f5" />)}
        <path d={area} fill={`${metric.color}18`} />
        <path d={line} fill="none" stroke={metric.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <footer><span>开始</span><span>当前</span></footer>
    </article>
  )
}

function createInstanceMetrics(instance: EntityTopologyInstance): InstanceMetric[] {
  const seed = hashText(`${instance.name}:${instance.entityType}`)
  const series = (base: number, variance: number, offset: number) => Array.from({ length: 24 }, (_, index) => {
    const wave = Math.sin((index + offset) * 0.58) * variance
    const jitter = ((seed + index * 17 + offset * 13) % 11) * variance * 0.07
    return Math.max(0, Number((base + wave + jitter).toFixed(2)))
  })
  const requests = Number(instance.requests) || 32 + (seed % 25)
  const errors = Number(instance.errors) || 0
  const latency = Number.parseFloat(instance.latency) || 21 + (seed % 18)
  return [
    { id: 'request', title: '请求次数', value: `${requests.toFixed(0)}`, unit: ' 次/min', color: '#6559e8', points: series(requests, Math.max(3, requests * 0.16), 1) },
    { id: 'latency', title: '平均延迟', value: `${latency.toFixed(0)}`, unit: ' ms', color: '#0ea5e9', points: series(latency, Math.max(2, latency * 0.12), 3) },
    { id: 'error', title: '错误次数', value: `${errors.toFixed(0)}`, unit: ' 次/min', color: '#ef4444', points: series(errors, errors > 0 ? 1.4 : 0.15, 5) },
    { id: 'availability', title: '可用率', value: '99.96', unit: '%', color: '#10b981', points: series(99.92, 0.035, 7) },
    { id: 'cpu', title: 'CPU 使用率', value: `${38 + (seed % 24)}`, unit: '%', color: '#f59e0b', points: series(42 + (seed % 16), 8, 9) },
    { id: 'memory', title: '内存使用率', value: `${51 + (seed % 18)}`, unit: '%', color: '#ec4899', points: series(56 + (seed % 12), 5, 11) },
  ]
}

function shortSvgLabel(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value
}

function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return Math.abs(hash)
}

function createPresetTimeRange(mode: TimeRangeMode, nextMode = mode): TopologyTimeRange {
  const preset = timeRangePresets.find((item) => item.mode === mode) || timeRangePresets[0]
  const to = new Date()
  const from = new Date(to.getTime() - preset.hours * 60 * 60 * 1000)
  return {
    mode: nextMode,
    from: toDateTimeLocalValue(from),
    to: toDateTimeLocalValue(to),
  }
}

function normalizeCustomTimeRange(range: TopologyTimeRange): TopologyTimeRange {
  if (!range.from || !range.to) return { ...range, mode: 'custom' }
  return range.from <= range.to
    ? { ...range, mode: 'custom' }
    : { mode: 'custom', from: range.to, to: range.from }
}

function toDateTimeLocalValue(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

function formatTimeRangeSummary(range: TopologyTimeRange) {
  if (range.mode === '1h') return '最近1小时'
  if (range.mode === '1d') return '最近1天'
  return `${formatShortDateTime(range.from)} 至 ${formatShortDateTime(range.to)}`
}

function formatShortDateTime(value: string) {
  const [date, time = ''] = value.split('T')
  const [, month = '', day = ''] = date.split('-')
  return `${month}-${day} ${time}`
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

function TimeRangePopover({
  range,
  style,
  onChange,
  onClose,
  onApply,
}: {
  range: TopologyTimeRange
  style?: CSSProperties
  onChange: (range: TopologyTimeRange | ((value: TopologyTimeRange) => TopologyTimeRange)) => void
  onClose: () => void
  onApply: () => void
}) {
  if (typeof document === 'undefined') return null
  const updateFrom = (value: string) => onChange((current) => ({ ...current, from: value, mode: 'custom' }))
  const updateTo = (value: string) => onChange((current) => ({ ...current, to: value, mode: 'custom' }))
  return ReactDOM.createPortal(
    <div className="topo-time-popover" style={style} onMouseDown={(event) => event.stopPropagation()}>
      <div className="topo-time-popover-title">
        <Clock3 size={15} />
        <strong>自定义时间范围</strong>
      </div>
      <label>
        <span>开始时间</span>
        <input
          type="datetime-local"
          value={range.from}
          onInput={(event) => updateFrom(event.currentTarget.value)}
          onChange={(event) => updateFrom(event.currentTarget.value)}
        />
      </label>
      <label>
        <span>结束时间</span>
        <input
          type="datetime-local"
          value={range.to}
          onInput={(event) => updateTo(event.currentTarget.value)}
          onChange={(event) => updateTo(event.currentTarget.value)}
        />
      </label>
      <div className="topo-time-popover-actions">
        <button type="button" onClick={onClose}>取消</button>
        <button className="primary" type="button" disabled={!range.from || !range.to} onClick={onApply}>应用</button>
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
  stageMode,
  clusterRule,
  allowDrag,
  showLabels,
  showClusterLabels,
  onLayoutModeChange,
  onOpenReferenceTopology,
  onClusterRuleChange,
  onAllowDragChange,
  onShowLabelsChange,
  onShowClusterLabelsChange,
}: {
  layoutMode: 'force' | 'cluster'
  stageMode: TopologyStageMode
  clusterRule: 'replace' | 'append'
  allowDrag: boolean
  showLabels: boolean
  showClusterLabels: boolean
  onLayoutModeChange: (value: 'force' | 'cluster') => void
  onOpenReferenceTopology: () => void
  onClusterRuleChange: (value: 'replace' | 'append') => void
  onAllowDragChange: (value: boolean) => void
  onShowLabelsChange: (value: boolean) => void
  onShowClusterLabelsChange: (value: boolean) => void
}) {
  return (
    <div className="topo-layout-panel">
      <SectionTitle title="布局算法" />
      <RadioCard active={stageMode === 'canvas' && layoutMode === 'force'} title="力导向" desc="按实体连接关系布局，不按类型聚类" onClick={() => onLayoutModeChange('force')} />
      <RadioCard active={stageMode === 'canvas' && layoutMode === 'cluster'} title="聚类" desc="按实体类型分组，生成聚类拓扑总览" onClick={() => onLayoutModeChange('cluster')} />
      <button className={`topo-reference-entry ${stageMode === 'entity-reference' ? 'active' : ''}`} type="button" onClick={onOpenReferenceTopology}>
        <span>
          <Network size={15} />
        </span>
        <strong>实体拓扑视图</strong>
        <small>常规 / 可用区分组拓扑</small>
      </button>
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

function NodeDetail({ node, onClose, onInspect }: { node: TopologyNode; onClose: () => void; onInspect: (node: TopologyNode) => void }) {
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
      <button className="topo-detail-primary" type="button" onClick={() => onInspect(node)}>
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
