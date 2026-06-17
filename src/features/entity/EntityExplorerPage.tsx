import { useMemo, useState } from 'react'
import {
  Box,
  ChevronDown,
  Filter,
  Grid2X2,
  HeartPulse,
  Network,
  Search,
  Star,
  Table2,
  X,
} from 'lucide-react'
import { createAliyunLikeTopologyData, type TopologyNode } from '../topology/topologyModel'
import { resolveTopologyNodeIconPreset, TopologyPresetIcon } from '../topology/topologyIcons'
import './entity.css'

type EntityView = 'table' | 'topology' | 'health'
type ScopeFilter = 'all' | 'recent' | 'starred'
type EntityStatus = 'normal' | 'warning' | 'critical'
type QueryMode = 'usearch' | 'spl'
type RecommendationKind = 'domain' | 'entity' | 'catalog'

interface EntityDrilldown {
  label: string
  token: string
  count: number
  kind: RecommendationKind
}

interface EntityRecord {
  id: string
  label: string
  type: string
  color: string
  iconPreset?: string
  properties: TopologyNode['properties']
  domain: string
  app: string
  status: EntityStatus
  events: number
  changeEvents: number
  lastSeen: string
  starred: boolean
}

const ENTITY_TOTAL = 19865
const ENTITY_DOMAIN_TOTAL = 7
const ENTITY_TYPE_TOTAL = 101
const OPEN_EVENT_TOTAL = 383
const CHANGE_EVENT_TOTAL = 31569
const TARGET_EVENT_BREAKDOWN = { critical: 346, error: 0, warning: 1, info: 117 }
const TARGET_CONNECTED = { aiApp: 82, aiAgent: 17, starred: 8 }

const apps = ['AI 应用', 'AI Agent', '订单服务', '账单服务', 'CMS Demo', '网关入口', '观测平台']
const domains = ['apm', 'k8s', 'ecs', 'sls', 'cms', 'arms', 'pai']
const recommendedDomains = [
  { label: 'k8s', token: 'k8s', count: 12933, kind: 'domain' as const },
  { label: 'acs', token: 'acs', count: 3423, kind: 'domain' as const },
  { label: 'apm', token: 'apm', count: 861, kind: 'domain' as const },
  { label: 'devops', token: 'devops', count: 714, kind: 'domain' as const },
  { label: 'infra', token: 'infra', count: 346, kind: 'domain' as const },
  { label: 'synthetics', token: 'synthetics', count: 9, kind: 'domain' as const },
  { label: 'rum', token: 'rum', count: 8, kind: 'domain' as const },
]
const recommendedEntities = [
  { label: 'Pod', token: 'k8s@Pod', count: 11731, kind: 'entity' as const },
  { label: '云服务器 ECS（Disk）', token: 'acs@ecs.disk', count: 1396, kind: 'entity' as const },
  { label: '云服务器 ECS（eni）', token: 'acs@ecs.eni', count: 805, kind: 'entity' as const },
  { label: 'devops.image', token: 'devops@image', count: 419, kind: 'entity' as const },
  { label: '云服务器 ECS（Instance）', token: 'acs@ecs.instance', count: 346, kind: 'entity' as const },
  { label: '基础设施:主机', token: 'infra@host', count: 346, kind: 'entity' as const },
  { label: 'Kubernetes 配置项', token: 'k8s@configmap', count: 336, kind: 'entity' as const },
  { label: 'Kubernetes 服务', token: 'k8s@service', count: 301, kind: 'entity' as const },
  { label: 'devops.image_registry', token: 'devops@image_registry', count: 268, kind: 'entity' as const },
  { label: 'Kubernetes 无状态应用', token: 'k8s@deployment', count: 227, kind: 'entity' as const },
]
const appMetricsRows = [
  { name: 'langchain-rag', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '2.52', errors: '0', latency: '28.03 s', tokens: '2.54K', active: true },
  { name: 'google-adk-a2a-protocol', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '76.47', errors: '0', latency: '1.15 s', tokens: '72.24K', active: true },
  { name: 'DeepResearch', probe: 'OpenTelemetry', language: 'java', region: 'cn-hongkong', calls: '0', errors: '0', latency: '0', tokens: '0', active: false },
  { name: 'gw-d44v3iem1hkln8d0d8v0', probe: 'OpenTelemetry', language: 'java', region: 'cn-hongkong', calls: '0', errors: '0', latency: '0', tokens: '0', active: false },
  { name: 'gw-d28nspmm1hksushjsnd0', probe: 'OpenTelemetry', language: 'java', region: 'cn-hongkong', calls: '0', errors: '0', latency: '0', tokens: '0', active: false },
  { name: 'agentscope-code-correction', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '5.23', errors: '0', latency: '12.58 s', tokens: '5.77K', active: true },
  { name: 'dashscope-multicapability', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '0', errors: '0', latency: '0', tokens: '0', active: false },
  { name: 'claude-agent-doc-qa', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '7.52', errors: '0', latency: '284.82 ms', tokens: '126.24K', active: true },
  { name: 'openai-marketing-agent', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '2.44', errors: '0', latency: '13.25 s', tokens: '5.93K', active: true },
  { name: 'knowledge-base-qa', probe: 'ARMS', language: 'python', region: 'cn-hongkong', calls: '1.05', errors: '0', latency: '55.21 s', tokens: '3.71K', active: true },
]
const statusMeta = {
  normal: { label: '正常', color: '#22c55e' },
  warning: { label: '警告', color: '#f97316' },
  critical: { label: '严重', color: '#ef4444' },
} satisfies Record<EntityStatus, { label: string; color: string }>

export function EntityExplorerPage({ refreshToken }: { refreshToken: number }) {
  const data = useMemo(() => createAliyunLikeTopologyData(), [refreshToken])
  const records = useMemo(() => createEntityRecords(data.nodes), [data.nodes])
  const [view, setView] = useState<EntityView>('table')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [selectedDomain, setSelectedDomain] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [queryMode, setQueryMode] = useState<QueryMode>('usearch')
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [mainSuggestOpen, setMainSuggestOpen] = useState(false)
  const [catalogSuggestOpen, setCatalogSuggestOpen] = useState(false)
  const [drilldown, setDrilldown] = useState<EntityDrilldown | null>(null)
  const [selected, setSelected] = useState<EntityRecord | null>(null)
  const [selectedTopoNode, setSelectedTopoNode] = useState<TopologyNode | null>(null)

  const filtered = useMemo(() => records.filter((record) => {
    const search = query.trim().toLowerCase()
    const matchesSearch = !search || [
      record.label,
      record.type,
      record.domain,
      record.app,
      record.properties.ip,
      record.properties.host,
    ].join(' ').toLowerCase().includes(search)
    const matchesScope = scope === 'all'
      || (scope === 'recent' && Number(record.id.replace('entity-', '')) % 9 === 0)
      || (scope === 'starred' && record.starred)
    return matchesSearch
      && matchesScope
      && (selectedDomain === 'all' || record.domain === selectedDomain)
      && (selectedType === 'all' || record.type === selectedType)
  }), [query, records, scope, selectedDomain, selectedType])

  const stats = useMemo(() => summarizeEntities(records, true), [records])
  const filteredStats = useMemo(() => summarizeEntities(filtered), [filtered])
  const domainStats = useMemo(() => countBy(records, (record) => record.domain), [records])
  const typeStats = useMemo(() => countBy(records, (record) => record.type), [records])
  const catalogApps = useMemo(() => {
    const entries = [
      { key: 'apm', count: 14, kind: 'group' as const },
      { key: 'AI 应用', count: TARGET_CONNECTED.aiApp, kind: 'app' as const },
      { key: 'AI Agent', count: TARGET_CONNECTED.aiAgent, kind: 'app' as const },
      ...countBy(records, (record) => record.app).filter((item) => item.key !== 'AI 应用' && item.key !== 'AI Agent').slice(0, 5).map((item) => ({ ...item, kind: 'app' as const })),
    ]
    const search = catalogQuery.trim().toLowerCase()
    return search ? entries.filter((item) => item.key.toLowerCase().includes(search)) : entries
  }, [catalogQuery, records])
  const topologyTypes = useMemo(() => {
    if (selectedType !== 'all') return [stripSyntheticType(selectedType)]
    const values = [...new Set(filtered.slice(0, 12).map((record) => stripSyntheticType(record.type)))]
    return values
  }, [filtered, selectedType])
  const openDrilldown = (item: EntityDrilldown) => {
    setDrilldown(item)
    setView('table')
    setQueryDraft('')
    setQuery('')
    setMainSuggestOpen(false)
    setCatalogSuggestOpen(false)
  }
  const runQuery = () => {
    const nextQuery = queryDraft.trim()
    setQuery(nextQuery)
    setMainSuggestOpen(false)
    if (nextQuery) {
      openDrilldown({ label: nextQuery, token: nextQuery, count: 83, kind: 'entity' })
    }
  }
  const clearDrilldown = () => {
    setDrilldown(null)
    setQuery('')
    setQueryDraft('')
  }
  const switchView = (nextView: EntityView) => {
    setView(nextView)
    if (nextView !== 'table') {
      setDrilldown(null)
    }
  }

  return (
    <div className="entity-page">
      <main className="entity-main">
        <header className="entity-toolbar">
          <div className="entity-title">
            <Box size={18} />
            <strong>实体探索</strong>
          </div>
          <div className="entity-query-tabs">
            <button className={queryMode === 'usearch' ? 'active' : ''} type="button" onClick={() => setQueryMode('usearch')}>USearch</button>
            <button className={queryMode === 'spl' ? 'active' : ''} type="button" onClick={() => setQueryMode('spl')}>SPL</button>
          </div>
          <button className="entity-icon-button" type="button"><Grid2X2 size={15} /></button>
          {drilldown && (
            <button className="entity-selected-filter" type="button" onClick={clearDrilldown}>
              <span>{drilldown.token}</span>
              <X size={14} />
            </button>
          )}
          <button className="entity-icon-button" type="button"><Filter size={15} /></button>
          <div className="entity-search entity-search-with-popover">
            <Search size={15} />
            <input
              value={queryDraft}
              onFocus={() => setMainSuggestOpen(true)}
              onBlur={() => window.setTimeout(() => setMainSuggestOpen(false), 120)}
              onChange={(event) => {
                setQueryDraft(event.target.value)
                setMainSuggestOpen(true)
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runQuery()
              }}
              placeholder={queryMode === 'spl' ? '输入 SPL，例如 * | where entity_type like Kubernetes' : '请输入实体名称、类型、IP...'}
            />
            {mainSuggestOpen && (
              <EntitySearchPopover compact onSelect={openDrilldown} />
            )}
          </div>
          <button className="entity-primary" type="button" onClick={runQuery}>查询</button>
          <div className="entity-view-tabs">
            <button className={view === 'table' ? 'active' : ''} type="button" onClick={() => switchView('table')}><Table2 size={14} />表格</button>
            <button className={view === 'topology' ? 'active' : ''} type="button" onClick={() => switchView('topology')}><Network size={14} />拓扑</button>
            <button className={view === 'health' ? 'active' : ''} type="button" onClick={() => switchView('health')}><HeartPulse size={14} />健康度</button>
          </div>
        </header>

        <section className="entity-content">
          {drilldown ? (
            <EntityMetricsResult selection={drilldown} />
          ) : view === 'topology' ? (
            <EntityTopologyView
              data={data}
              focusedTypes={topologyTypes}
              selectedNode={selectedTopoNode}
              onSelectNode={(node) => {
                setSelectedTopoNode(node)
                if (node) {
                  const match = filtered.find((record) => stripSyntheticType(record.type) === node.type || record.label.includes(node.label.replace(/\s+\d+$/, '')))
                  if (match) setSelected(match)
                }
              }}
              onFocusType={(type) => {
                const match = typeStats.find((item) => stripSyntheticType(item.key) === type)
                if (match) setSelectedType(match.key)
              }}
            />
          ) : (
            <>
              <div className="entity-summary-grid">
                <EntityStatCard title="实体" items={[
                  { value: stats.total.toLocaleString(), label: '实体总数' },
                  { value: stats.domainCount.toLocaleString(), label: '实体Domain' },
                  { value: stats.typeCount.toLocaleString(), label: '实体类型' },
                ]} />
                <EventCard stats={stats} />
                <HealthCard stats={stats} />
              </div>

              <div className="entity-lower-grid">
                <FilterPanel
                  total={filtered.length}
                  scope={scope}
                  selectedDomain={selectedDomain}
                  selectedType={selectedType}
                  collapsed={!filtersOpen}
                  domains={domainStats}
                  types={typeStats}
                  onScopeChange={setScope}
                  onDomainChange={setSelectedDomain}
                  onTypeChange={setSelectedType}
                  onToggleCollapsed={() => setFiltersOpen((value) => !value)}
                />
                <EntityCatalog
                  apps={catalogApps}
                  query={catalogQuery}
                  suggestOpen={catalogSuggestOpen}
                  onQueryChange={(value) => {
                    setCatalogQuery(value)
                    setCatalogSuggestOpen(true)
                  }}
                  onFocusSearch={() => setCatalogSuggestOpen(true)}
                  onBlurSearch={() => window.setTimeout(() => setCatalogSuggestOpen(false), 120)}
                  onSelect={openDrilldown}
                />
                <section className="entity-result-panel">
                  <div className="entity-panel-head">
                    <div>
                      <strong>{viewTitle(view)}</strong>
                      <span>当前 {filteredStats.total.toLocaleString()} 个实体</span>
                    </div>
                    <button type="button" onClick={() => {
                      setScope('all')
                      setSelectedDomain('all')
                      setSelectedType('all')
                      setQuery('')
                      setQueryDraft('')
                    }}>重置</button>
                  </div>
                  {view === 'table' && <EntityTable records={filtered.slice(0, 80)} selected={selected} onSelect={setSelected} />}
                  {view === 'health' && <EntityHealthGrid records={filtered.slice(0, 80)} onSelect={setSelected} />}
                </section>
              </div>
            </>
          )}
        </section>
      </main>

      <EntityDetail record={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

function EntityStatCard({ title, items }: { title: string; items: Array<{ value: string; label: string }> }) {
  return (
    <section className="entity-card entity-stat-card">
      <strong>{title}</strong>
      <div>
        {items.map((item) => (
          <span key={item.label}>
            <b>{item.value}</b>
            <small>{item.label}</small>
          </span>
        ))}
      </div>
    </section>
  )
}

function EventCard({ stats }: { stats: ReturnType<typeof summarizeEntities> }) {
  const total = Math.max(1, stats.criticalEvents + stats.errorEvents + stats.warningEvents + stats.infoEvents)
  return (
    <section className="entity-card entity-event-card">
      <div>
        <strong>事件</strong>
        <b>{stats.openEvents.toLocaleString()}</b>
        <small>未恢复事件</small>
      </div>
      <div className="entity-change-count">
        <b>{stats.changeEvents.toLocaleString()}</b>
        <small>Change 事件</small>
      </div>
      <div className="entity-event-bar">
        <span style={{ flex: stats.criticalEvents / total, background: '#c94a4a' }} />
        <span style={{ flex: Math.max(0.02, stats.errorEvents / total), background: '#df7b73' }} />
        <span style={{ flex: stats.warningEvents / total, background: '#f97316' }} />
        <span style={{ flex: stats.infoEvents / total, background: '#6559ff' }} />
      </div>
      <div className="entity-event-legend">
        <span><i style={{ background: '#c94a4a' }} />严重 {stats.criticalEvents}</span>
        <span><i style={{ background: '#df7b73' }} />错误 {stats.errorEvents}</span>
        <span><i style={{ background: '#f97316' }} />警告 {stats.warningEvents}</span>
        <span><i style={{ background: '#6559ff' }} />提示 {stats.infoEvents}</span>
      </div>
    </section>
  )
}

function HealthCard({ stats }: { stats: ReturnType<typeof summarizeEntities> }) {
  const abnormal = stats.warning + stats.critical
  const normalPercent = Math.round((stats.normal / Math.max(1, stats.total)) * 100)
  return (
    <section className="entity-card entity-health-card">
      <strong>健康度</strong>
      <div className="entity-health-body">
        <div className="entity-health-ring" style={{ ['--health' as string]: `${normalPercent}%` }}>
          <span>{abnormal === 0 ? '正常' : `${normalPercent}%`}</span>
        </div>
        <div className="entity-health-legend">
          <span><i style={{ background: statusMeta.normal.color }} />正常 {stats.normal.toLocaleString()}</span>
          <span><i style={{ background: statusMeta.warning.color }} />警告 {stats.warning.toLocaleString()}</span>
          <span><i style={{ background: statusMeta.critical.color }} />严重 {stats.critical.toLocaleString()}</span>
          <span><i />总计 {stats.total.toLocaleString()}</span>
        </div>
      </div>
    </section>
  )
}

function FilterPanel({
  total,
  scope,
  selectedDomain,
  selectedType,
  collapsed,
  domains,
  types,
  onScopeChange,
  onDomainChange,
  onTypeChange,
  onToggleCollapsed,
}: {
  total: number
  scope: ScopeFilter
  selectedDomain: string
  selectedType: string
  collapsed: boolean
  domains: Array<{ key: string; count: number }>
  types: Array<{ key: string; count: number }>
  onScopeChange: (value: ScopeFilter) => void
  onDomainChange: (value: string) => void
  onTypeChange: (value: string) => void
  onToggleCollapsed: () => void
}) {
  return (
    <section className={`entity-card entity-filter-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="entity-panel-head">
        <div>
          <strong>过滤器</strong>
          <span>{total.toLocaleString()} 个实体</span>
        </div>
        <button type="button" onClick={onToggleCollapsed}>{collapsed ? '展开' : '收起'}</button>
      </div>
      {!collapsed && (
        <>
          <div className="entity-filter-section">
            <strong>实体范围</strong>
            <FilterRow active={scope === 'all'} label="所有实体" count={total} onClick={() => onScopeChange('all')} />
            <FilterRow active={scope === 'recent'} label="最近访问" count={Math.floor(total / 9)} onClick={() => onScopeChange('recent')} />
            <FilterRow active={scope === 'starred'} label="关注实体" count={8} onClick={() => onScopeChange('starred')} />
          </div>
          <div className="entity-filter-section">
            <strong>实体Domain</strong>
            <div className="entity-chip-grid">
              <button className={selectedDomain === 'all' ? 'active' : ''} type="button" onClick={() => onDomainChange('all')}>全部</button>
              {domains.slice(0, 7).map((item) => (
                <button key={item.key} className={selectedDomain === item.key ? 'active' : ''} type="button" onClick={() => onDomainChange(item.key)}>
                  {item.key}
                </button>
              ))}
            </div>
          </div>
          <div className="entity-filter-section">
            <strong>实体类型</strong>
            <select value={selectedType} onChange={(event) => onTypeChange(event.target.value)}>
              <option value="all">全部类型</option>
              {types.slice(0, 16).map((item) => <option key={item.key} value={item.key}>{item.key} ({item.count})</option>)}
            </select>
          </div>
        </>
      )}
    </section>
  )
}

function EntityCatalog({
  apps,
  query,
  suggestOpen,
  onQueryChange,
  onFocusSearch,
  onBlurSearch,
  onSelect,
}: {
  apps: Array<{ key: string; count: number }>
  query: string
  suggestOpen: boolean
  onQueryChange: (value: string) => void
  onFocusSearch: () => void
  onBlurSearch: () => void
  onSelect: (item: EntityDrilldown) => void
}) {
  return (
    <section className="entity-card entity-catalog">
      <div className="entity-panel-head">
        <div>
          <strong>实体目录</strong>
          <span>最近访问 0 条记录</span>
        </div>
        <label
          className="entity-catalog-search"
          onMouseDown={onFocusSearch}
          onFocus={onFocusSearch}
        >
          <Search size={13} />
          <input
            value={query}
            onFocus={onFocusSearch}
            onBlur={onBlurSearch}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索实体目录"
          />
        </label>
        {suggestOpen && <EntitySearchPopover onSelect={onSelect} />}
      </div>
      <div className="entity-app-list">
        {apps.map((item, index) => (
          <button
            key={item.key}
            type="button"
            onClick={() => onSelect({
              label: item.key,
              token: item.key === 'apm' ? 'apm@apm.genai.service' : item.key,
              count: item.count,
              kind: 'catalog',
            })}
          >
            <span className="entity-app-icon"><Box size={14} /></span>
            <span>
              <b>{item.key}</b>
              <small>{item.key === 'apm' ? `${item.count} 类实体` : `已接入 ${item.count}`}</small>
            </span>
            <Star size={13} className={index % 3 === 0 ? 'filled' : ''} />
          </button>
        ))}
      </div>
    </section>
  )
}

function EntitySearchPopover({ compact = false, onSelect }: { compact?: boolean; onSelect: (item: EntityDrilldown) => void }) {
  return (
    <div className={compact ? 'entity-search-popover compact' : 'entity-search-popover'} onMouseDown={(event) => event.preventDefault()}>
      <div className="entity-search-popover-title">
        <Search size={14} />
        <strong>推荐搜索</strong>
      </div>
      <EntityRecommendationGroup title="推荐域" items={recommendedDomains} onSelect={onSelect} />
      <EntityRecommendationGroup title="推荐实体" items={recommendedEntities} onSelect={onSelect} />
      <p>点击固定标签可多选；输入关键词后搜索目录中的可见文字</p>
    </div>
  )
}

function EntityRecommendationGroup({
  title,
  items,
  onSelect,
}: {
  title: string
  items: EntityDrilldown[]
  onSelect: (item: EntityDrilldown) => void
}) {
  return (
    <div className="entity-recommendation-group">
      <strong>{title}</strong>
      <div>
        {items.map((item, index) => (
          <button key={item.token} type="button" onClick={() => onSelect(item)}>
            <b>#{index + 1}</b>
            <span>{item.label}</span>
            <small>{item.count.toLocaleString()}</small>
          </button>
        ))}
      </div>
    </div>
  )
}

function EntityMetricsResult({ selection }: { selection: EntityDrilldown }) {
  return (
    <section className="entity-metrics-result">
      <div className="entity-metrics-table-wrap">
        <table className="entity-metrics-table">
          <thead>
            <tr>
              <th>应用名称</th>
              <th>探针类型</th>
              <th>语言</th>
              <th>区域</th>
              <th>平均模型调用次数 <span>?</span></th>
              <th>平均模型调用错误次数 <span>?</span></th>
              <th>平均模型调用耗时 <span>?</span></th>
              <th>每分钟平均token消耗</th>
            </tr>
          </thead>
          <tbody>
            {appMetricsRows.map((row, index) => (
              <tr key={row.name}>
                <td><a href="#entity-result" onClick={(event) => event.preventDefault()}>{row.name}</a></td>
                <td>{row.probe}</td>
                <td>{row.language}</td>
                <td>{row.region}</td>
                <MetricCell color="#7069ff" value={row.calls} active={row.active} seed={index} />
                <MetricCell color="#ef4444" value={row.errors} active={false} seed={index + 2} />
                <MetricCell color="#5cbdb9" value={row.latency} active={row.active} seed={index + 4} />
                <MetricCell color="#ff9a3d" value={row.tokens} active={row.active} seed={index + 6} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="entity-metrics-footer">
        <span>每页显示：</span>
        <button type="button">10 <ChevronDown size={14} /></button>
        <span>总数: {selection.count || 83}</span>
        <button type="button" disabled>上一页</button>
        <button type="button" className="active">1</button>
        <button type="button">2</button>
        <button type="button">3</button>
        <button type="button">4</button>
        <span>...</span>
        <button type="button">9</button>
        <button type="button">下一页</button>
        <span>1/9</span>
        <span>到第</span>
        <input aria-label="页码" />
        <span>页</span>
        <button type="button">确定</button>
      </div>
    </section>
  )
}

function MetricCell({ color, value, active, seed }: { color: string; value: string; active: boolean; seed: number }) {
  return (
    <td className="entity-metric-cell">
      <Sparkline color={color} active={active} seed={seed} />
      <b>{value}</b>
    </td>
  )
}

function Sparkline({ color, active, seed }: { color: string; active: boolean; seed: number }) {
  const points = active
    ? Array.from({ length: 18 }, (_, index) => {
      const x = 4 + index * 5
      const wave = Math.sin((index + seed) * 1.3) * 11
      const jitter = ((index * 7 + seed * 5) % 13) - 6
      return `${x},${Math.max(8, Math.min(38, 24 + wave + jitter))}`
    }).join(' ')
    : '4,25 89,25'
  return (
    <svg className="entity-sparkline" viewBox="0 0 94 44" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function FilterRow({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button className={active ? 'entity-filter-row active' : 'entity-filter-row'} type="button" onClick={onClick}>
      <span><i />{label}</span>
      <b>{count.toLocaleString()}</b>
    </button>
  )
}

function EntityTable({ records, selected, onSelect }: { records: EntityRecord[]; selected: EntityRecord | null; onSelect: (record: EntityRecord) => void }) {
  return (
    <div className="entity-table-wrap">
      <table className="entity-table">
        <thead>
          <tr>
            <th>实体</th>
            <th>Domain</th>
            <th>应用</th>
            <th>健康</th>
            <th>事件</th>
            <th>最近上报</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className={selected?.id === record.id ? 'active' : ''} onClick={() => onSelect(record)}>
              <td>
                <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
                  <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={15} />
                </span>
                <span>
                  <b>{record.label}</b>
                  <small>{record.type}</small>
                </span>
              </td>
              <td>{record.domain}</td>
              <td>{record.app}</td>
              <td><StatusPill status={record.status} /></td>
              <td>{record.events}</td>
              <td>{record.lastSeen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EntityTopologyView({
  data,
  focusedTypes,
  selectedNode,
  onSelectNode,
  onFocusType,
}: {
  data: ReturnType<typeof createAliyunLikeTopologyData>
  focusedTypes: string[]
  selectedNode: TopologyNode | null
  onSelectNode: (node: TopologyNode | null) => void
  onFocusType: (type: string) => void
}) {
  const cmsTopology = useMemo(() => createCmsTopologyLayout(data), [data])
  const selectedId = selectedNode?.id

  return (
    <section className="entity-topology-full">
      <div className="entity-topology-zoom" aria-hidden="true">
        <span>−</span>
        <b>13%</b>
        <span>＋</span>
        <span>⌖</span>
      </div>
      <div className="entity-topology-hint">负载均衡 SLB (ServerGroup)</div>
      <svg className="entity-cms-topology" viewBox="0 0 2500 1180" role="img" aria-label="实体拓扑关系图">
        <defs>
          <pattern id="entity-topology-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path d="M 12 0 L 0 0 0 12" fill="none" stroke="#f2f4f8" strokeWidth="1" />
          </pattern>
          <marker id="entity-topology-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#cfd6df" />
          </marker>
        </defs>
        <rect width="2500" height="1180" fill="#fff" />
        <rect width="2500" height="1180" fill="url(#entity-topology-grid)" opacity="0.72" />
        <g className="entity-cms-links">
          {cmsTopology.edges.map((edge, index) => (
            <g key={edge.id}>
              <path
                d={cmsEdgePath(edge)}
                markerEnd="url(#entity-topology-arrow)"
                className={index % 7 === 0 ? 'emphasized' : ''}
              />
              {index % 9 === 0 && (
                <text x={(edge.source.x + edge.target.x) / 2} y={(edge.source.y + edge.target.y) / 2 - 4}>
                  {edge.label}
                </text>
              )}
            </g>
          ))}
        </g>
        <g className="entity-cms-nodes">
          {cmsTopology.nodes.map((item, index) => (
            <g
              key={item.node.id}
              className={selectedId === item.node.id ? 'selected' : ''}
              transform={`translate(${item.x} ${item.y})`}
              onClick={() => {
                onSelectNode(item.node)
                onFocusType(item.node.type)
              }}
            >
              <rect className="entity-cms-card-bg" width={item.width} height={item.height} rx="3" fill="#fff" stroke={item.node.color} />
              <rect className="entity-cms-card-top" x="35" width={Math.max(24, item.width - 70)} height="3" rx="1.5" fill={item.node.color} />
              <circle cx="12" cy="17" r="6.2" fill={softenColor(item.node.color, 0.9)} stroke={item.node.color} />
              <path d={cmsIconPath(item.node.type)} transform="translate(8 13) scale(0.55)" fill="none" stroke={item.node.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <text x="24" y="16" className="title">{cmsShortTitle(item.node.label)}</text>
              <text x={item.width - 10} y="16" className="count" textAnchor="end">已接入: {cmsAccessCount(index, item.node)}</text>
              <text x="24" y={item.height - 9} className="muted">{cmsSubtitle(item.node.type)}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="entity-cms-minimap" aria-hidden="true">
        <svg viewBox="0 0 2500 1180">
          <rect width="2500" height="1180" fill="#fff" />
          {cmsTopology.nodes.map((item) => (
            <rect key={item.node.id} x={item.x} y={item.y} width="18" height="5" fill="#cfd5dd" opacity="0.8" />
          ))}
          <rect x="120" y="80" width="1960" height="940" fill="none" stroke="#e1e5eb" strokeWidth="28" />
        </svg>
      </div>
    </section>
  )
}

function EntityHealthGrid({ records, onSelect }: { records: EntityRecord[]; onSelect: (record: EntityRecord) => void }) {
  return (
    <div className="entity-health-grid">
      {records.map((record) => (
        <button key={record.id} type="button" className={`status-${record.status}`} onClick={() => onSelect(record)}>
          <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
            <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={16} />
          </span>
          <b>{record.label.replace(/\s+\d+$/, '')}</b>
          <small>{record.domain} · {record.events} 事件</small>
          <StatusPill status={record.status} />
        </button>
      ))}
    </div>
  )
}

function EntityDetail({ record, onClose }: { record: EntityRecord | null; onClose: () => void }) {
  if (!record) return null
  return (
    <aside className="entity-detail">
      <button className="entity-detail-close" type="button" onClick={onClose}>×</button>
      <div className="entity-detail-head">
        <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
          <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={24} />
        </span>
        <div>
          <strong>{record.label}</strong>
          <span>{record.type}</span>
        </div>
      </div>
      <StatusPill status={record.status} />
      <dl>
        <dt>Domain</dt><dd>{record.domain}</dd>
        <dt>应用</dt><dd>{record.app}</dd>
        <dt>IP</dt><dd>{record.properties.ip}</dd>
        <dt>Host</dt><dd>{record.properties.host}</dd>
        <dt>连接数</dt><dd>{record.properties.relationCount}</dd>
        <dt>未恢复事件</dt><dd>{record.events}</dd>
        <dt>最近上报</dt><dd>{record.lastSeen}</dd>
      </dl>
    </aside>
  )
}

function StatusPill({ status }: { status: EntityStatus }) {
  const meta = statusMeta[status]
  return <span className={`entity-status-pill status-${status}`}><i style={{ background: meta.color }} />{meta.label}</span>
}

interface CmsTopologyNode {
  node: TopologyNode
  x: number
  y: number
  width: number
  height: number
}

interface CmsTopologyEdge {
  id: string
  source: CmsTopologyNode
  target: CmsTopologyNode
  label: string
}

function createCmsTopologyLayout(data: ReturnType<typeof createAliyunLikeTopologyData>) {
  const anchorNodes = data.nodes.slice(0, 216)
  const groups = cmsLayoutGroups()
  const nodes: CmsTopologyNode[] = []
  let cursor = 0
  groups.forEach((group, groupIndex) => {
    const capacity = group.columns * group.rows
    for (let index = 0; index < capacity && cursor < anchorNodes.length; index += 1) {
      const column = index % group.columns
      const row = Math.floor(index / group.columns)
      const jitterX = ((index * 17 + groupIndex * 11) % 19) - 9
      const jitterY = ((index * 13 + groupIndex * 7) % 13) - 6
      nodes.push({
        node: anchorNodes[cursor],
        x: group.x + column * group.gapX + row * group.slant + jitterX,
        y: group.y + row * group.gapY + Math.sin((index + groupIndex) * 0.9) * 9 + jitterY,
        width: group.width,
        height: group.height,
      })
      cursor += 1
    }
  })

  const byId = new Map(nodes.map((item) => [item.node.id, item]))
  const edges: CmsTopologyEdge[] = []
  data.edges.forEach((edge) => {
    const source = byId.get(edge.source)
    const target = byId.get(edge.target)
    if (!source || !target || edges.length > 190) return
    edges.push({
      id: edge.id,
      source,
      target,
      label: edge.type === 'contains' ? '包含' : '依赖',
    })
  })
  for (let index = 4; index < nodes.length && edges.length < 300; index += 1) {
    const targetIndex = Math.max(0, index - 1 - (index % 7))
    edges.push({
      id: `cms-extra-${index}`,
      source: nodes[index],
      target: nodes[targetIndex],
      label: index % 2 === 0 ? '关联' : '包含',
    })
  }
  for (let index = 12; index < nodes.length && edges.length < 330; index += 8) {
    const targetIndex = Math.max(0, index - 28)
    edges.push({
      id: `cms-long-${index}`,
      source: nodes[index],
      target: nodes[targetIndex],
      label: '依赖',
    })
  }
  return { nodes, edges }
}

function cmsLayoutGroups() {
  return [
    { x: 610, y: 62, columns: 4, rows: 1, gapX: 236, gapY: 78, slant: 0, width: 180, height: 60 },
    { x: 210, y: 205, columns: 5, rows: 4, gapX: 200, gapY: 130, slant: -16, width: 166, height: 56 },
    { x: 640, y: 485, columns: 5, rows: 4, gapX: 220, gapY: 128, slant: 14, width: 176, height: 58 },
    { x: 930, y: 705, columns: 5, rows: 3, gapX: 230, gapY: 126, slant: 0, width: 176, height: 58 },
    { x: 1510, y: 725, columns: 4, rows: 3, gapX: 210, gapY: 126, slant: 8, width: 176, height: 58 },
    { x: 1550, y: 955, columns: 7, rows: 2, gapX: 166, gapY: 72, slant: 4, width: 142, height: 46 },
    { x: 132, y: 912, columns: 4, rows: 2, gapX: 228, gapY: 120, slant: -6, width: 176, height: 58 },
  ]
}

function cmsEdgePath(edge: CmsTopologyEdge) {
  const sourceX = edge.source.x + edge.source.width / 2
  const sourceY = edge.source.y + edge.source.height / 2
  const targetX = edge.target.x + edge.target.width / 2
  const targetY = edge.target.y + edge.target.height / 2
  const dx = targetX - sourceX
  const curve = Math.max(60, Math.min(260, Math.abs(dx) * 0.42))
  const lift = Math.max(-180, Math.min(160, (targetY - sourceY) * 0.18))
  return `M ${sourceX} ${sourceY} C ${sourceX + curve} ${sourceY + lift}, ${targetX - curve} ${targetY - lift}, ${targetX} ${targetY}`
}

function cmsShortTitle(label: string) {
  const clean = label.replace(/\s+\d+$/, '')
  if (clean.includes('Kubernetes')) return clean.replace('容器服务 Kubernetes', 'Kubernetes')
  if (clean.includes('云原生API网关')) return '云原生API网关'
  if (clean.includes('负载均衡')) return clean.replace('负载均衡 ', '负载均衡')
  return clean.length > 12 ? `${clean.slice(0, 12)}...` : clean
}

function cmsSubtitle(type: string) {
  if (type.includes('SLB')) return 'ServerGroup'
  if (type.includes('Kubernetes')) return 'Cluster'
  if (type.includes('ECS')) return 'Instance'
  if (type.includes('PAI')) return 'Workspace'
  if (type.includes('Kafka')) return 'Topic'
  return type.length > 14 ? `${type.slice(0, 14)}...` : type
}

function cmsAccessCount(index: number, node: TopologyNode) {
  const relationCount = Number(node.properties.relationCount || 0)
  if (node.type.includes('应用')) return 220
  if (node.type.includes('接口')) return 164
  return Math.max(1, relationCount + (index % 11))
}

function cmsIconPath(type: string) {
  if (type.includes('数据库') || type.includes('RDS') || type.includes('ClickHouse')) return 'M2 4 C2 2 14 2 14 4 V12 C14 14 2 14 2 12 Z M2 4 C2 6 14 6 14 4 M2 8 C2 10 14 10 14 8'
  if (type.includes('Kafka') || type.includes('消息')) return 'M8 2 L14 5.5 V12.5 L8 16 L2 12.5 V5.5 Z M8 2 V8 M2 5.5 L8 8 L14 5.5'
  if (type.includes('API') || type.includes('接口')) return 'M3 8 H13 M8 3 V13 M4 4 L12 12 M12 4 L4 12'
  if (type.includes('Agent') || type.includes('模型') || type.includes('工具')) return 'M3 12 C4 6 12 6 13 12 M5 12 H11 M8 3 V6 M5 15 L11 15'
  return 'M3 3 H13 V13 H3 Z M5 6 H11 M5 9 H11'
}

function softenColor(color: string, amount: number) {
  const hex = color.replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  const mix = (value: number) => Math.round(value + (255 - value) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function createEntityRecords(nodes: TopologyNode[]): EntityRecord[] {
  const records: EntityRecord[] = []
  for (let index = 0; index < ENTITY_TOTAL; index += 1) {
    const base = nodes[index % nodes.length]
    const sequence = index + 1
    const typeIndex = sequence % ENTITY_TYPE_TOTAL
    const baseType = sequence <= nodes.length ? base.type : `${base.type} ${String(typeIndex + 1).padStart(3, '0')}`
    records.push(toEntityRecord(base, sequence, baseType))
  }
  return records
}

function toEntityRecord(node: TopologyNode, sequence: number, type: string): EntityRecord {
  const status: EntityStatus = sequence % 97 === 0 ? 'critical' : sequence % 17 === 0 ? 'warning' : 'normal'
  const events = sequence <= OPEN_EVENT_TOTAL
    ? status === 'critical' ? 2 : 1
    : 0
  const domain = domains[sequence % domains.length]
  const app = sequence <= TARGET_CONNECTED.aiApp ? 'AI 应用' : sequence <= TARGET_CONNECTED.aiApp + TARGET_CONNECTED.aiAgent ? 'AI Agent' : apps[sequence % apps.length]
  return {
    id: `entity-${sequence}`,
    label: `${type.replace(/\s+\d{3}$/, '')} ${String(sequence).padStart(4, '0')}`,
    type,
    color: node.color,
    iconPreset: node.iconPreset,
    properties: {
      ...node.properties,
      id: `entity-${sequence}`,
      relationCount: Number(node.properties.relationCount || 0) + (sequence % 5),
    },
    domain,
    app,
    status,
    events,
    changeEvents: sequence <= CHANGE_EVENT_TOTAL ? 1 + (sequence % 2) : 0,
    lastSeen: `${sequence % 24} 分钟前`,
    starred: sequence <= TARGET_CONNECTED.starred,
  }
}

function summarizeEntities(records: EntityRecord[], targetTotals = false) {
  const domainsSeen = new Set(records.map((record) => record.domain))
  const typesSeen = new Set(records.map((record) => record.type))
  const critical = records.filter((record) => record.status === 'critical').length
  const warning = records.filter((record) => record.status === 'warning').length
  const normal = records.length - critical - warning
  const criticalEvents = records.filter((record) => record.status === 'critical').reduce((sum, record) => sum + record.events, 0)
  const warningEvents = records.filter((record) => record.status === 'warning').reduce((sum, record) => sum + record.events, 0)
  const infoEvents = records.filter((record) => record.status === 'normal').reduce((sum, record) => sum + record.events, 0)
  return {
    total: records.length,
    domainCount: targetTotals ? ENTITY_DOMAIN_TOTAL : domainsSeen.size,
    typeCount: targetTotals ? ENTITY_TYPE_TOTAL : typesSeen.size,
    critical,
    warning,
    normal,
    criticalEvents: targetTotals ? TARGET_EVENT_BREAKDOWN.critical : criticalEvents,
    errorEvents: targetTotals ? TARGET_EVENT_BREAKDOWN.error : 0,
    warningEvents: targetTotals ? TARGET_EVENT_BREAKDOWN.warning : warningEvents,
    infoEvents: targetTotals ? TARGET_EVENT_BREAKDOWN.info : infoEvents,
    openEvents: targetTotals ? OPEN_EVENT_TOTAL : criticalEvents + warningEvents + infoEvents,
    changeEvents: targetTotals ? CHANGE_EVENT_TOTAL : records.reduce((sum, record) => sum + record.changeEvents, 0),
  }
}

function countBy(records: EntityRecord[], getKey: (record: EntityRecord) => string) {
  const counts = new Map<string, number>()
  records.forEach((record) => counts.set(getKey(record), (counts.get(getKey(record)) || 0) + 1))
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key))
}

function viewTitle(view: EntityView) {
  if (view === 'topology') return '拓扑视图'
  if (view === 'health') return '健康度视图'
  return '实体表格'
}

function stripSyntheticType(type: string) {
  return type.replace(/\s+\d{3}$/, '')
}

function resolveEntityIconPreset(record: EntityRecord) {
  return resolveTopologyNodeIconPreset({
    label: record.label,
    type: record.type,
    iconPreset: record.iconPreset,
  })
}
