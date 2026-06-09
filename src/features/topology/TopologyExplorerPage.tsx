import { useEffect, useMemo, useState } from 'react'
import {
  ChevronRight,
  CircleHelp,
  Database,
  Grid2X2,
  Network,
  Play,
  Search,
  Settings,
  Shuffle,
} from 'lucide-react'
import type { UModelApiClient } from '../../api/client'
import { createAliyunLikeTopologyData, type TopologyNode } from './topologyModel'
import { TopologyCanvas } from './TopologyCanvas'
import './topology.css'

type PanelTab = 'overview' | 'layout'

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
  const focusedTypeSet = useMemo(() => new Set(focusedTypes), [focusedTypes])
  const currentNodeCount = focusedTypes.length > 0 ? data.nodes.filter((node) => focusedTypeSet.has(node.type)).length : data.nodes.length
  const currentEdgeCount = focusedTypes.length > 0
    ? data.edges.filter((edge) => {
      const source = data.nodesById.get(edge.source)
      const target = data.nodesById.get(edge.target)
      return Boolean(source && target && (focusedTypeSet.has(source.type) || focusedTypeSet.has(target.type)))
    }).length
    : data.edges.length

  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => {
      setPlayhead((value) => (value >= 1 ? 0.08 : Math.min(1, value + 0.035)))
    }, 160)
    return () => window.clearInterval(timer)
  }, [playing])

  const focusType = (type: string) => {
    setSelectedNode(null)
    setFocusedTypes((current) => {
      if (clusterRule === 'replace') return current.length === 1 && current[0] === type ? [] : [type]
      return current.includes(type) ? current.filter((item) => item !== type) : [...current, type]
    })
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
            <div className="topo-search-pill">
              <Search size={16} />
              <span>Search</span>
              <kbd>⌘ K</kbd>
            </div>
            <div className="topo-demo-warning">
              当前为演示环境 云监控 2.0 生产地址为：
              <a href="https://cmsnext.console.aliyun.com" target="_blank" rel="noreferrer">https://cmsnext.console.aliyun.com</a>
            </div>
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
              data={data}
              layoutMode={layoutMode}
              focusedTypes={focusedTypes}
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
            <i />
            <span>总量：{data.nodes.length.toLocaleString()} 实体 / {data.edges.length.toLocaleString()} 关系</span>
            <b>拓扑探索</b>
          </footer>
        </main>
      </section>
    </div>
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
            <Database size={13} />
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
          {node.type.includes('Kubernetes') ? 'K' : <Shuffle size={18} />}
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
