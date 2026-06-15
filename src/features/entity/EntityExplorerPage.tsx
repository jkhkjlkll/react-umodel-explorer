import { useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Box,
  ChevronRight,
  Clock3,
  Database,
  Filter,
  Grid2X2,
  HeartPulse,
  Network,
  Search,
  Server,
  Star,
  Table2,
} from 'lucide-react'
import { createAliyunLikeTopologyData, type TopologyNode } from '../topology/topologyModel'
import { resolveTopologyNodeIconPreset, TopologyPresetIcon } from '../topology/topologyIcons'
import './entity.css'

type EntityView = 'table' | 'topology' | 'health'
type ScopeFilter = 'all' | 'recent' | 'starred'
type EntityStatus = 'normal' | 'warning' | 'critical'
type QueryMode = 'usearch' | 'spl'

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
  const [selected, setSelected] = useState<EntityRecord | null>(null)

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
  const runQuery = () => setQuery(queryDraft.trim())

  return (
    <div className="entity-page">
      <aside className="entity-side-rail" aria-label="实体探索工具">
        {[Server, Grid2X2, Box, Database, Network, HeartPulse, Activity].map((Icon, index) => (
          <button key={index} className={index === 2 ? 'active' : ''} type="button">
            <Icon size={16} />
          </button>
        ))}
      </aside>

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
          <button className="entity-icon-button" type="button"><Filter size={15} /></button>
          <div className="entity-search">
            <Search size={15} />
            <input
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') runQuery()
              }}
              placeholder={queryMode === 'spl' ? '输入 SPL，例如 * | where entity_type like Kubernetes' : '请输入实体名称、类型、IP...'}
            />
          </div>
          <button className="entity-primary" type="button" onClick={runQuery}>查询</button>
          <div className="entity-view-tabs">
            <button className={view === 'table' ? 'active' : ''} type="button" onClick={() => setView('table')}><Table2 size={14} />表格</button>
            <button className={view === 'topology' ? 'active' : ''} type="button" onClick={() => setView('topology')}><Network size={14} />拓扑</button>
            <button className={view === 'health' ? 'active' : ''} type="button" onClick={() => setView('health')}><HeartPulse size={14} />健康度</button>
          </div>
        </header>

        <section className="entity-content">
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
            <EntityCatalog apps={catalogApps} query={catalogQuery} onQueryChange={setCatalogQuery} />
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
              {view === 'topology' && <EntityMiniTopology records={filtered.slice(0, 140)} onSelect={setSelected} />}
              {view === 'health' && <EntityHealthGrid records={filtered.slice(0, 80)} onSelect={setSelected} />}
            </section>
          </div>
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
  onQueryChange,
}: {
  apps: Array<{ key: string; count: number }>
  query: string
  onQueryChange: (value: string) => void
}) {
  return (
    <section className="entity-card entity-catalog">
      <div className="entity-panel-head">
        <div>
          <strong>实体目录</strong>
          <span>最近访问 0 条记录</span>
        </div>
        <label className="entity-catalog-search">
          <Search size={13} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索" />
        </label>
      </div>
      <div className="entity-app-list">
        {apps.map((item, index) => (
          <button key={item.key} type="button">
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

function EntityMiniTopology({ records, onSelect }: { records: EntityRecord[]; onSelect: (record: EntityRecord) => void }) {
  return (
    <div className="entity-mini-topology">
      {records.map((record, index) => (
        <button
          key={record.id}
          type="button"
          className={`status-${record.status}`}
          style={{
            left: `${6 + ((index * 37) % 86)}%`,
            top: `${8 + ((index * 53) % 78)}%`,
            color: record.color,
          }}
          title={record.label}
          onClick={() => onSelect(record)}
        >
          <span />
        </button>
      ))}
    </div>
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

function resolveEntityIconPreset(record: EntityRecord) {
  return resolveTopologyNodeIconPreset({
    label: record.label,
    type: record.type,
    iconPreset: record.iconPreset,
  })
}
