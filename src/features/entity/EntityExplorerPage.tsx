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
        <b>10%</b>
        <span>＋</span>
        <span>⌖</span>
      </div>
      <div className="entity-topology-hint">负载均衡 SLB (ServerGroup)</div>
      <svg className="entity-cms-topology" viewBox="0 0 5600 2600" preserveAspectRatio="xMinYMin meet" role="img" aria-label="实体拓扑关系图">
        <defs>
          <pattern id="entity-topology-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#e9edf3" />
          </pattern>
          <marker id="entity-topology-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#b9c1cc" />
          </marker>
        </defs>
        <rect width="5600" height="2600" fill="#fff" />
        <rect width="5600" height="2600" fill="url(#entity-topology-grid)" opacity="0.92" />
        <g className="entity-cms-links">
          {cmsTopology.edges.map((edge, index) => (
            <g key={edge.id}>
              <path
                d={cmsEdgePath(edge)}
                markerEnd="url(#entity-topology-arrow)"
                className={index % 7 === 0 ? 'emphasized' : ''}
              />
              {edge.showLabel && (
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
              <rect className="entity-cms-card-bg" width={item.width} height={item.height} rx="3" fill="#fff" stroke={item.color} />
              <rect className="entity-cms-card-top" x={(item.width - Math.max(54, item.width * 0.42)) / 2} width={Math.max(54, item.width * 0.42)} height="3" rx="1.5" fill={item.color} />
              <path d={cmsIconPath(item.title)} transform="translate(10.5 12.6) scale(0.48)" fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <text x="27" y="18" className="title">{item.title}</text>
              <text x={item.width - 9} y="18" className="count" textAnchor="end">已接入: {item.access}</text>
              <text x="27" y={item.height - 9} className="muted">{item.subtitle}</text>
            </g>
          ))}
        </g>
      </svg>
      <div className="entity-cms-minimap" aria-hidden="true">
        <svg viewBox="0 0 5600 2600">
          <rect width="5600" height="2600" fill="#fff" />
          {cmsTopology.nodes.map((item) => (
            <rect key={item.node.id} x={item.x} y={item.y} width="18" height="5" fill="#cfd5dd" opacity="0.8" />
          ))}
          <rect x="100" y="70" width="3100" height="1700" fill="none" stroke="#e1e5eb" strokeWidth="50" />
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
  title: string
  subtitle: string
  color: string
  access: number
}

interface CmsTopologyEdge {
  id: string
  source: CmsTopologyNode
  target: CmsTopologyNode
  label: string
  showLabel?: boolean
}

function createCmsTopologyLayout(data: ReturnType<typeof createAliyunLikeTopologyData>) {
  const templates = cmsLayoutTemplates()
  const nodes = templates.map((template, index) => {
    const sourceNode = data.nodes[(index * 19 + 7) % data.nodes.length]
    return {
      node: sourceNode,
      x: template.x,
      y: template.y,
      width: template.width || 190,
      height: template.height || 58,
      title: template.title,
      subtitle: template.subtitle,
      color: template.color,
      access: template.access,
    }
  })
  const edges: CmsTopologyEdge[] = []

  function addEdge(sourceIndex: number, targetIndex: number, label: string, showLabel = false) {
    const source = nodes[sourceIndex]
    const target = nodes[targetIndex]
    if (!source || !target) return
    edges.push({ id: `cms-edge-${edges.length}`, source, target, label, showLabel })
  }

  const relations: Array<[number, number, string, boolean?]> = [
    [0, 3, 'contains', true], [1, 4, 'contains'], [2, 4, 'related_to', true],
    [3, 6, 'contains'], [4, 7, 'same_as', true], [5, 8, 'contains'],
    [6, 9, 'contains', true], [7, 11, 'same_as'], [8, 12, 'contains'],
    [9, 14, 'contains'], [10, 15, 'contains'], [11, 18, 'calls', true],
    [12, 17, 'same_as'], [13, 20, 'calls'], [14, 22, 'contains', true],
    [15, 24, 'calls'], [16, 27, 'contains'], [17, 29, 'same_as', true],
    [18, 30, 'calls'], [19, 32, 'contains'], [20, 33, 'contains'],
    [21, 36, 'contains'], [22, 38, 'same_as'], [23, 40, 'calls', true],
    [24, 41, 'calls'], [25, 43, 'contains'], [26, 44, 'calls'],
    [27, 46, 'same_as'], [28, 48, 'contains', true], [29, 49, 'calls'],
    [30, 52, 'calls'], [31, 52, 'calls', true], [32, 52, 'calls'],
    [33, 52, 'calls'], [34, 52, 'calls'], [35, 52, 'calls', true],
    [36, 52, 'contains'], [37, 52, 'calls'], [38, 52, 'calls'],
    [39, 52, 'contains'], [40, 52, 'same_as', true], [41, 52, 'calls'],
    [42, 52, 'calls'], [43, 52, 'calls'], [44, 52, 'same_as'],
    [45, 52, 'contains'], [46, 52, 'calls'], [47, 52, 'calls'],
    [48, 52, 'contains'], [49, 52, 'calls'], [50, 52, 'calls', true],
    [51, 52, 'contains'], [52, 53, 'calls'], [52, 54, 'calls', true],
    [52, 55, 'same_as'], [52, 56, 'contains'], [52, 57, 'calls'],
    [52, 58, 'calls'], [52, 59, 'same_as', true], [52, 60, 'contains'],
    [52, 61, 'calls'], [52, 62, 'calls'], [52, 63, 'contains'],
    [53, 64, 'contains'], [54, 65, 'contains'], [55, 66, 'same_as'],
    [56, 67, 'calls'], [57, 68, 'calls'], [58, 69, 'contains'],
    [59, 70, 'same_as'], [60, 71, 'calls'], [61, 72, 'calls'],
    [62, 73, 'contains'], [63, 74, 'calls'], [64, 75, 'contains'],
    [65, 76, 'same_as'], [66, 77, 'calls'], [67, 78, 'calls'],
    [68, 79, 'contains'], [70, 80, 'contains'], [71, 81, 'calls'],
    [72, 82, 'contains'], [73, 83, 'same_as'], [74, 84, 'calls'],
    [77, 90, 'contains', true], [78, 91, 'calls'], [79, 92, 'calls'],
    [80, 93, 'contains'], [81, 94, 'calls'], [82, 95, 'same_as'],
    [85, 86, 'calls', true], [86, 87, 'contains'], [87, 88, 'calls'],
    [88, 89, 'contains'], [89, 96, 'same_as'], [96, 97, 'contains'],
    [97, 98, 'contains'], [98, 99, 'calls'], [99, 100, 'calls'],
    [100, 101, 'contains'], [101, 102, 'same_as'], [102, 103, 'calls'],
    [103, 104, 'contains'], [104, 105, 'calls'], [105, 106, 'contains'],
    [106, 107, 'calls'], [107, 108, 'same_as'], [108, 109, 'contains'],
    [109, 110, 'calls'], [110, 111, 'contains'], [111, 112, 'calls'],
    [76, 12, 'same_as'], [1, 90, 'same_as', true], [5, 92, 'same_as'],
    [52, 88, 'contains'], [69, 95, 'calls'], [15, 52, 'contains'],
  ]
  relations.forEach(([source, target, label, showLabel]) => addEdge(source, target, label, showLabel))

  return { nodes, edges }
}

function cmsLayoutTemplates() {
  const blue = '#5c9ded'
  const red = '#f06456'
  const green = '#7db443'
  const orange = '#f59b42'
  const purple = '#c05adf'
  const cyan = '#54bdb9'
  return [
    { x: 980, y: 70, title: '云原生API网关', subtitle: 'acs.apig.instance', color: blue, access: 2 },
    { x: 1700, y: 140, title: 'Kubernetes 集群', subtitle: 'acs.cs.cluster', color: blue, access: 1 },
    { x: 2460, y: 128, title: '云消息队列 Kafka', subtitle: 'acs.alikafka.instance', color: red, access: 6 },
    { x: 1030, y: 270, title: '网关监听', subtitle: 'acs.apig.listener', color: blue, access: 3 },
    { x: 1320, y: 300, title: '容器服务 Kubernetes', subtitle: 'k8s.cluster', color: blue, access: 5 },
    { x: 1620, y: 292, title: '云数据库 ClickHouse', subtitle: 'acs.clickhouse.cluster', color: blue, access: 2 },
    { x: 1110, y: 505, title: 'ServerGroup', subtitle: 'acs.slb.servergroup', color: blue, access: 9 },
    { x: 1325, y: 510, title: 'Ingress', subtitle: 'k8s.ingress', color: blue, access: 12 },
    { x: 1550, y: 508, title: '云消息队列 Kafka', subtitle: 'acs.alikafka.topic', color: red, access: 3 },
    { x: 1120, y: 705, title: '负载均衡 SLB', subtitle: 'acs.slb.instance', color: blue, access: 4 },
    { x: 1340, y: 702, title: 'Kubernetes Service', subtitle: 'k8s.service', color: blue, access: 18 },
    { x: 1595, y: 695, title: 'Kafka Topic', subtitle: 'acs.alikafka.topic', color: red, access: 4 },
    { x: 1845, y: 688, title: 'PolarDB 代理', subtitle: 'acs.polardb.endpoint', color: blue, access: 10 },
    { x: 2080, y: 700, title: '云数据库 RDS', subtitle: 'acs.rds.instance', color: purple, access: 16 },
    { x: 980, y: 885, title: '容器组 Pod', subtitle: 'k8s.pod', color: blue, access: 22 },
    { x: 1230, y: 890, title: '无状态应用', subtitle: 'k8s.deployment', color: blue, access: 16 },
    { x: 1480, y: 875, title: '配置项', subtitle: 'k8s.configmap', color: green, access: 8 },
    { x: 1750, y: 872, title: '云数据库 PolarDB', subtitle: 'acs.polardb.cluster', color: orange, access: 1 },
    { x: 2045, y: 855, title: '数据库', subtitle: 'apm.external.database', color: purple, access: 4 },
    { x: 2295, y: 840, title: 'Elasticsearch', subtitle: 'acs.elasticsearch.instance', color: cyan, access: 2 },
    { x: 2535, y: 820, title: '云数据库 Tair', subtitle: 'acs.kvstore.instance', color: red, access: 32 },
    { x: 920, y: 1075, title: '节点', subtitle: 'k8s.node', color: green, access: 59 },
    { x: 1170, y: 1080, title: '消息服务', subtitle: 'apm.external.message', color: purple, access: 3 },
    { x: 1420, y: 1080, title: '其他外部服务', subtitle: 'apm.external.others', color: green, access: 1 },
    { x: 1700, y: 1068, title: 'RPC 服务', subtitle: 'apm.external.rpc_client', color: green, access: 18 },
    { x: 1988, y: 1075, title: 'NoSQL 数据库', subtitle: 'apm.external.nosql', color: green, access: 9 },
    { x: 2255, y: 1070, title: '云原生API网关', subtitle: 'acs.apig.gateway', color: orange, access: 9 },
    { x: 2530, y: 1060, title: '大模型', subtitle: 'apm.external.model', color: green, access: 12 },
    { x: 2785, y: 1060, title: '工具', subtitle: 'apm.external.tool', color: green, access: 48 },
    { x: 730, y: 1300, title: '训练任务', subtitle: 'acs.pai.trainingjob', color: orange, access: 9 },
    { x: 1000, y: 1290, title: '人工智能平台PAI', subtitle: 'acs.pai.eas.instance', color: orange, access: 9 },
    { x: 1285, y: 1290, title: '知识库', subtitle: 'apm.external.knowledge', color: green, access: 4 },
    { x: 1565, y: 1270, title: '接口', subtitle: 'apm.operation', color: orange, access: 164, width: 205 },
    { x: 1870, y: 1300, title: '调用链 Span', subtitle: 'apm.span', color: blue, access: 28 },
    { x: 2145, y: 1305, title: 'AI Agent', subtitle: 'apm.genai.agent', color: blue, access: 20 },
    { x: 2420, y: 1300, title: '任务', subtitle: 'apm.genai.task', color: red, access: 5 },
    { x: 2700, y: 1288, title: '函数工具', subtitle: 'apm.genai.tool_call', color: green, access: 15 },
    { x: 820, y: 1515, title: '百炼工作空间', subtitle: 'acs.bailian.workspace', color: purple, access: 2 },
    { x: 1090, y: 1515, title: 'PAI 工作空间', subtitle: 'acs.pai.workspace', color: orange, access: 2 },
    { x: 1360, y: 1510, title: '模型服务', subtitle: 'apm.model_service', color: green, access: 7 },
    { x: 1640, y: 1515, title: '应用', subtitle: 'apm.service', color: blue, access: 220, width: 205 },
    { x: 1925, y: 1520, title: '网关实例', subtitle: 'acs.apig.instance', color: orange, access: 13 },
    { x: 2198, y: 1520, title: 'AI 应用', subtitle: 'apm.genai.app', color: blue, access: 82 },
    { x: 2468, y: 1515, title: 'K8s 节点', subtitle: 'k8s.node', color: red, access: 32 },
    { x: 2740, y: 1510, title: '容器', subtitle: 'k8s.container', color: blue, access: 77 },
    { x: 745, y: 1745, title: 'GPU 节点池', subtitle: 'acs.cs.nodepool', color: green, access: 5 },
    { x: 1015, y: 1742, title: 'ECS 实例', subtitle: 'acs.ecs.instance', color: blue, access: 19 },
    { x: 1290, y: 1738, title: '云盘', subtitle: 'acs.ecs.disk', color: blue, access: 16 },
    { x: 1565, y: 1730, title: '网络接口', subtitle: 'acs.ecs.eni', color: blue, access: 12 },
    { x: 1840, y: 1738, title: '安全组', subtitle: 'acs.ecs.securitygroup', color: blue, access: 8 },
    { x: 2115, y: 1742, title: 'VPC', subtitle: 'acs.vpc', color: cyan, access: 4 },
    { x: 2388, y: 1738, title: '日志库', subtitle: 'acs.sls.logstore', color: orange, access: 6 },
    { x: 1680, y: 1498, title: '应用', subtitle: 'apm.service', color: blue, access: 220, width: 205 },
    { x: 1835, y: 1190, title: '接口', subtitle: 'apm.operation', color: orange, access: 164, width: 205 },
    { x: 2050, y: 1188, title: '数据库', subtitle: 'apm.external.database', color: purple, access: 4 },
    { x: 2260, y: 1198, title: 'NoSQL 数据库', subtitle: 'apm.external.nosql', color: green, access: 9 },
    { x: 2470, y: 1186, title: '云原生API网关', subtitle: 'acs.apig.aiapi', color: orange, access: 13 },
    { x: 1580, y: 1395, title: 'HTTP 请求', subtitle: 'apm.http', color: orange, access: 27 },
    { x: 1900, y: 1398, title: '数据库调用', subtitle: 'apm.db_call', color: purple, access: 11 },
    { x: 2230, y: 1402, title: '模型调用', subtitle: 'apm.llm_call', color: green, access: 35 },
    { x: 2560, y: 1398, title: '工具调用', subtitle: 'apm.tool_call', color: green, access: 42 },
    { x: 1300, y: 1588, title: '消息队列调用', subtitle: 'apm.message_call', color: red, access: 6 },
    { x: 1505, y: 1605, title: '缓存调用', subtitle: 'apm.cache_call', color: red, access: 13 },
    { x: 1710, y: 1618, title: 'RPC 调用', subtitle: 'apm.rpc_call', color: green, access: 18 },
    { x: 1915, y: 1625, title: '服务调用', subtitle: 'apm.service_call', color: blue, access: 31 },
    { x: 2120, y: 1615, title: '链路入口', subtitle: 'apm.entry', color: blue, access: 7 },
    { x: 2325, y: 1603, title: '节点', subtitle: 'k8s.node', color: red, access: 18 },
    { x: 2530, y: 1588, title: '任务', subtitle: 'apm.task', color: blue, access: 6 },
    { x: 2735, y: 1575, title: 'Pod', subtitle: 'k8s.pod', color: blue, access: 46 },
    { x: 2940, y: 1565, title: '容器组', subtitle: 'k8s.pod', color: blue, access: 28 },
    { x: 1030, y: 1878, title: '告警', subtitle: 'cms.alarm', color: red, access: 7, width: 158, height: 48 },
    { x: 1210, y: 1882, title: '事件', subtitle: 'cms.event', color: orange, access: 11, width: 158, height: 48 },
    { x: 1390, y: 1888, title: '指标', subtitle: 'cms.metric', color: blue, access: 34, width: 158, height: 48 },
    { x: 1570, y: 1892, title: '日志', subtitle: 'sls.log', color: orange, access: 18, width: 158, height: 48 },
    { x: 1750, y: 1890, title: 'Trace', subtitle: 'xtrace.trace', color: purple, access: 21, width: 158, height: 48 },
    { x: 1930, y: 1885, title: '变更', subtitle: 'cms.change', color: green, access: 9, width: 158, height: 48 },
    { x: 2110, y: 1878, title: 'SLO', subtitle: 'cms.slo', color: cyan, access: 5, width: 158, height: 48 },
    { x: 2290, y: 1874, title: '拨测', subtitle: 'cms.synthetic', color: cyan, access: 4, width: 158, height: 48 },
    { x: 2470, y: 1878, title: '仪表盘', subtitle: 'cms.dashboard', color: blue, access: 12, width: 158, height: 48 },
    { x: 2650, y: 1884, title: '巡检', subtitle: 'cms.check', color: green, access: 6, width: 158, height: 48 },
    { x: 2830, y: 1888, title: '根因分析', subtitle: 'cms.rca', color: purple, access: 3, width: 158, height: 48 },
    { x: 3180, y: 1740, title: 'AI Agent', subtitle: 'apm.genai.agent', color: blue, access: 20 },
    { x: 3385, y: 1740, title: '大模型', subtitle: 'apm.external.model', color: green, access: 12 },
    { x: 3590, y: 1740, title: '工具', subtitle: 'apm.external.tool', color: green, access: 48 },
    { x: 3188, y: 1850, title: '节点', subtitle: 'k8s.node', color: red, access: 6 },
    { x: 3393, y: 1850, title: '任务', subtitle: 'apm.genai.task', color: blue, access: 8 },
    { x: 3598, y: 1850, title: '日志任务', subtitle: 'sls.task', color: orange, access: 4 },
    { x: 3196, y: 1960, title: '函数', subtitle: 'fc.function', color: green, access: 5 },
    { x: 3401, y: 1960, title: '插件', subtitle: 'apm.plugin', color: purple, access: 7 },
    { x: 3606, y: 1960, title: '配置', subtitle: 'apm.config', color: blue, access: 9 },
  ]
}

function cmsEdgePath(edge: CmsTopologyEdge) {
  const sourceX = edge.source.x + edge.source.width / 2
  const sourceY = edge.source.y + edge.source.height / 2
  const targetX = edge.target.x + edge.target.width / 2
  const targetY = edge.target.y + edge.target.height / 2
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const curve = Math.max(80, Math.min(420, Math.abs(dx) * 0.34 + Math.abs(dy) * 0.08))
  const direction = dx >= 0 ? 1 : -1
  const lift = Math.max(-220, Math.min(220, dy * 0.22))
  return `M ${sourceX} ${sourceY} C ${sourceX + curve * direction} ${sourceY + lift}, ${targetX - curve * direction} ${targetY - lift}, ${targetX} ${targetY}`
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
