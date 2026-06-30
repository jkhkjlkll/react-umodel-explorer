import { type WheelEvent, useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  Box,
  ChevronDown,
  Filter,
  Filter as FilterIcon,
  Grid2X2,
  Home,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  X,
} from 'lucide-react'
import type { UModelApiClient } from '../../api/client'
import { formatError } from '../../lib/json'
import { createTopologyDataFromResults, type TopologyEdge, type TopologyExplorerData, type TopologyNode } from '../topology/topologyModel'
import { resolveTopologyNodeIconPreset, TopologyPresetIcon, type TopologyIconPreset } from '../topology/topologyIcons'
import './entity.css'

type EntityView = 'table' | 'topology' | 'health'
type ScopeFilter = 'all' | 'recent' | 'starred'
type EntityStatus = 'normal' | 'warning' | 'critical'
type QueryMode = 'usearch' | 'spl'
type SearchCategory = 'all' | 'name' | 'type' | 'domain' | 'instance'
type EntityScopePreset = 'all' | 'applications' | 'k8s' | 'ecs' | 'rds' | 'rum'
type RecommendationKind = 'domain' | 'entity' | 'catalog'
type EntityInstanceTab =
  | 'detail'
  | 'topology'
  | 'trace'
  | 'page'
  | 'heatmap'
  | 'resource'
  | 'api'
  | 'exception'
  | 'customEvent'
  | 'customLog'
  | 'settings'
  | 'logSearch'
  | 'related'

type EntityDetailTab =
  | 'detail'
  | 'topology'
  | 'trace'
  | 'page'
  | 'heatmap'
  | 'resource'
  | 'api'
  | 'exception'
  | 'customEvent'
  | 'customLog'
  | 'settings'
  | 'logSearch'
  | 'related'
type EntityAggregateSortKey = 'name' | 'tags' | 'probe' | 'language' | 'region' | 'latency'
type EntityTableSortKey = 'name' | 'type' | 'instance' | 'domain' | 'tags' | 'health' | 'events' | 'updated'
type SortDirection = 'asc' | 'desc'
type EntityRelationFilter = 'all' | 'provided' | 'dependency'

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

interface EntityScopeTab {
  key: EntityScopePreset
  label: string
  count: number
}

interface EntityCatalogTypeItem {
  key: string
  label: string
  count: number
  color: string
  iconPreset?: TopologyIconPreset
}

interface EntityCatalogDomainGroup {
  key: string
  title: string
  summary: string
  count: number
  items: EntityCatalogTypeItem[]
}

const ENTITY_LIMIT = 2000
const TOPO_LIMIT = 4000

const searchCategories: Array<{ key: SearchCategory; label: string }> = [
  { key: 'all', label: '全部' },
  { key: 'name', label: '实体名称' },
  { key: 'type', label: '实体类型' },
  { key: 'domain', label: '实体Domain' },
  { key: 'instance', label: '实例 ID' },
]

const emptyEntityTopologyData: TopologyExplorerData = {
  nodes: [],
  edges: [],
  types: [],
  nodesById: new Map(),
  bounds: { minX: -1, minY: -1, maxX: 1, maxY: 1 },
}

const statusMeta = {
  normal: { label: '正常', color: '#22c55e' },
  warning: { label: '警告', color: '#f97316' },
  critical: { label: '严重', color: '#ef4444' },
} satisfies Record<EntityStatus, { label: string; color: string }>

export function EntityExplorerPage({
  api,
  workspaceId,
  refreshToken,
}: {
  api: UModelApiClient
  workspaceId: string
  refreshToken: number
}) {
  const [data, setData] = useState<TopologyExplorerData>(emptyEntityTopologyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const records = useMemo(() => createEntityRecords(data.nodes), [data.nodes])
  const [view, setView] = useState<EntityView>('table')
  const [selectedTopScope, setSelectedTopScope] = useState<EntityScopePreset>('all')
  const [scope, setScope] = useState<ScopeFilter>('all')
  const [selectedDomain, setSelectedDomain] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [queryMode, setQueryMode] = useState<QueryMode>('usearch')
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('all')
  const [searchCategoryOpen, setSearchCategoryOpen] = useState(false)
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [catalogQuery, setCatalogQuery] = useState('')
  const [mainSuggestOpen, setMainSuggestOpen] = useState(false)
  const [catalogSuggestOpen, setCatalogSuggestOpen] = useState(false)
  const [drilldown, setDrilldown] = useState<EntityDrilldown | null>(null)
  const [selected, setSelected] = useState<EntityRecord | null>(null)
  const [selectedTopoNode, setSelectedTopoNode] = useState<TopologyNode | null>(null)
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [entityResult, topoResult] = await Promise.all([
        api.query(workspaceId, { query: `.entity | limit ${ENTITY_LIMIT}`, limit: ENTITY_LIMIT }),
        api.query(workspaceId, { query: `.topo | limit ${TOPO_LIMIT}`, limit: TOPO_LIMIT }),
      ])
      const nextData = createTopologyDataFromResults(entityResult, topoResult)
      const nextRecords = createEntityRecords(nextData.nodes)
      setData(nextData)
      setSelected((current) => current ? nextRecords.find((item) => item.id === current.id) || null : null)
      setSelectedTopoNode((current) => current ? nextData.nodesById.get(current.id) || null : null)
    } catch (nextError) {
      setData(emptyEntityTopologyData)
      setSelected(null)
      setSelectedTopoNode(null)
      setError(formatError(nextError))
    } finally {
      setLoading(false)
    }
  }, [api, workspaceId])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const filtered = useMemo(() => records.filter((record) => {
    const search = query.trim().toLowerCase()
    const matchesSearch = !search || entitySearchText(record, searchCategory).includes(search)
    const matchesTopScope = selectedTopScope === 'all' || matchesEntityScopePreset(record, selectedTopScope)
    const matchesScope = scope === 'all'
      || (scope === 'recent' && records.slice(0, Math.min(3, records.length)).some((item) => item.id === record.id))
      || (scope === 'starred' && record.starred)
    return matchesSearch
      && matchesTopScope
      && matchesScope
      && (selectedDomain === 'all' || record.domain === selectedDomain)
      && (selectedType === 'all' || record.type === selectedType)
  }), [query, records, scope, searchCategory, selectedDomain, selectedTopScope, selectedType])

  const stats = useMemo(() => summarizeEntities(records), [records])
  const filteredStats = useMemo(() => summarizeEntities(filtered), [filtered])
  const domainStats = useMemo(() => countBy(records, (record) => record.domain), [records])
  const typeStats = useMemo(() => countBy(records, (record) => record.type), [records])
  const recentCatalogRecords = useMemo(() => records.slice(0, Math.min(3, records.length)), [records])
  const recentCount = recentCatalogRecords.length
  const starredCount = useMemo(() => records.filter((record) => record.starred).length, [records])
  const catalogApps = useMemo(() => {
    const entries = [
      ...domainStats.slice(0, 4).map((item) => ({ ...item, kind: 'domain' as const })),
      ...typeStats.slice(0, 6).map((item) => ({ ...item, kind: 'type' as const })),
    ]
    const search = catalogQuery.trim().toLowerCase()
    return search ? entries.filter((item) => item.key.toLowerCase().includes(search)) : entries
  }, [catalogQuery, domainStats, typeStats])
  const catalogDomainGroups = useMemo(() => createCatalogDomainGroups(records, catalogQuery), [catalogQuery, records])
  const recommendedDomainItems = useMemo<EntityDrilldown[]>(() => domainStats.slice(0, 7).map((item) => ({
    label: item.key,
    token: item.key,
    count: item.count,
    kind: 'domain',
  })), [domainStats])
  const recommendedEntityItems = useMemo<EntityDrilldown[]>(() => typeStats.slice(0, 10).map((item) => ({
    label: stripSyntheticType(item.key),
    token: item.key,
    count: item.count,
    kind: 'entity',
  })), [typeStats])
  const scopeTabs = useMemo(
    () => createEntityScopeTabs(records),
    [records],
  )
  const drilldownRecords = useMemo(() => filterRecordsForDrilldown(records, drilldown), [drilldown, records])
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
    setSearchCategoryOpen(false)
    setCatalogSuggestOpen(false)
  }
  const runQuery = () => {
    const nextQuery = queryDraft.trim()
    setQuery(nextQuery)
    setMainSuggestOpen(false)
    setSearchCategoryOpen(false)
    setDrilldown(null)
    setView('table')
  }
  const clearDrilldown = () => {
    setDrilldown(null)
    setQuery('')
    setQueryDraft('')
  }
  const selectDetailNode = (node: TopologyNode) => {
    const match = records.find((record) => record.id === node.id)
    if (match) setSelected(match)
    setSelectedTopoNode(node)
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
          <div className="entity-toolbar-top">
            <div className="entity-title">
              <Box size={18} />
              <strong>实体探索</strong>
            </div>
            <div className="entity-scope-tabs" role="listbox" aria-label="实体范围">
              {scopeTabs.map((tab, index) => (
                <button
                  key={tab.key}
                  type="button"
                  role="option"
                  aria-selected={tab.key === selectedTopScope}
                  className={tab.key === selectedTopScope ? 'active' : ''}
                  onKeyDown={(event) => {
                    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                    event.preventDefault()
                    const offset = event.key === 'ArrowRight' ? 1 : -1
                    const nextTab = scopeTabs[(index + offset + scopeTabs.length) % scopeTabs.length]
                    setSelectedTopScope(nextTab.key)
                    setScope('all')
                    setSelectedDomain('all')
                    setSelectedType('all')
                  }}
                  onClick={() => {
                    setDrilldown(null)
                    setSelectedTopoNode(null)
                    setSelected(null)
                    setQuery('')
                    setQueryDraft('')
                    setSelectedTopScope(tab.key)
                    setScope('all')
                    setSelectedDomain('all')
                    setSelectedType('all')
                  }}
                >
                  <span>{tab.label}</span>
                  <b>{tab.count.toLocaleString()}</b>
                </button>
              ))}
            </div>
            <div className="entity-topline-actions">
              <div className="entity-time-picker">
                <span>15min</span>
                <input aria-label="请输入时间" value="最近15分钟" readOnly />
                <ChevronDown size={13} />
              </div>
              <button type="button" aria-label="刷新实体探索" onClick={() => void load()}>
                <RefreshCw size={14} />
              </button>
              <button className="accent" type="button" aria-label="智能助手">
                <Sparkles size={15} />
              </button>
            </div>
          </div>
          <div className="entity-toolbar-bottom">
            <div className="entity-query-tabs">
              <button className={queryMode === 'usearch' ? 'active' : ''} type="button" onClick={() => setQueryMode('usearch')}>USearch</button>
              <button className={queryMode === 'spl' ? 'active' : ''} type="button" onClick={() => setQueryMode('spl')}>SPL</button>
            </div>
            <div
              className="entity-search-category"
              onBlur={() => window.setTimeout(() => setSearchCategoryOpen(false), 120)}
            >
              <button
                className={searchCategoryOpen ? 'entity-query-action entity-search-category-split active' : 'entity-query-action entity-search-category-split'}
                type="button"
                aria-haspopup="menu"
                aria-expanded={searchCategoryOpen}
                onClick={() => setSearchCategoryOpen((value) => !value)}
                title={`搜索分类：${searchCategories.find((item) => item.key === searchCategory)?.label || '全部'}`}
              >
                <span className="entity-search-category-split-main">
                  <Grid2X2 size={15} />
                </span>
                <span className="entity-search-category-split-divider" aria-hidden="true" />
                <span className="entity-search-category-split-sub">
                  <FilterIcon size={14} />
                </span>
              </button>
              {searchCategoryOpen && (
                <div className="entity-search-category-menu" role="menu">
                  {searchCategories.map((item) => (
                    <button
                      key={item.key}
                      className={item.key === searchCategory ? 'active' : ''}
                      type="button"
                      role="menuitemradio"
                      aria-checked={item.key === searchCategory}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setSearchCategory(item.key)
                        setSearchCategoryOpen(false)
                      }}
                    >
                      <span>{item.label}</span>
                      {item.key === searchCategory && <b>✓</b>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {drilldown && (
              <button className="entity-selected-filter" type="button" onClick={clearDrilldown}>
                <span>{drilldown.token}</span>
                <X size={14} />
              </button>
            )}
            <button className="entity-query-action" type="button" onClick={() => setFiltersOpen((value) => !value)}>
              <Filter size={14} />
              <span>筛选</span>
            </button>
            <code className="entity-query-editor entity-search-with-popover">
              <span className="entity-query-line" aria-hidden="true">1</span>
              <input
                aria-label="The editor is not accessible at this time."
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
                placeholder={queryMode === 'spl' ? '输入 SPL，例如 * | where entity_type like Kubernetes' : '请输入实体关键词（至少 4 个字符）'}
              />
              {!queryDraft && (
                <span className="entity-query-placeholder" aria-hidden="true">
                  {queryMode === 'spl' ? '输入 SPL，例如 * | where entity_type like Kubernetes' : '请输入实体关键词（至少 4 个字符）'}
                </span>
              )}
              <Search className="entity-query-search-icon" size={14} aria-hidden="true" />
              {mainSuggestOpen && (
                <EntitySearchPopover
                  compact
                  recommendedDomains={recommendedDomainItems}
                  recommendedEntities={recommendedEntityItems}
                  onSelect={openDrilldown}
                />
              )}
            </code>
            <button className="entity-primary" type="button" onClick={runQuery}>查询</button>
            <div className="entity-view-tabs" role="radiogroup" aria-label="实体视图">
              <button className={view === 'table' ? 'active' : ''} type="button" role="radio" aria-checked={view === 'table'} onClick={() => switchView('table')}><i />表格</button>
              <button className={view === 'topology' ? 'active' : ''} type="button" role="radio" aria-checked={view === 'topology'} onClick={() => switchView('topology')}><i />拓扑</button>
              <button className={view === 'health' ? 'active' : ''} type="button" role="radio" aria-checked={view === 'health'} onClick={() => switchView('health')}><i />健康度</button>
            </div>
          </div>
        </header>

        <section className="entity-content">
          {drilldown ? (
            <EntityMetricsResult selection={drilldown} records={drilldownRecords} />
          ) : view === 'topology' ? (
            <EntityTopologyView
              data={data}
              focusedTypes={topologyTypes}
              selectedNode={selectedTopoNode}
              onSelectNode={(node) => {
                setSelectedTopoNode(node)
                if (node) {
                  const match = filtered.find((record) => record.id === node.id)
                  if (match) setSelected(match)
                }
              }}
              onFocusType={(type) => {
                const match = typeStats.find((item) => stripSyntheticType(item.key) === type)
                if (match) {
                  setSelectedTopScope('all')
                  setSelectedType(match.key)
                }
              }}
            />
          ) : (
            <>
              {loading && <EntityFeedback message="正在加载后端实体数据..." />}
              {!loading && error && <EntityFeedback tone="error" message="实体查询失败" detail={error} onRetry={() => void load()} />}
              {!loading && !error && records.length === 0 && <EntityFeedback message={'\u5f53\u524d\u5de5\u4f5c\u7a7a\u95f4\u6682\u65e0\u5b9e\u4f53\u6570\u636e'} detail={'\u8bf7\u5148\u5bfc\u5165\u6837\u4f8b\u6216\u5199\u5165\u5b9e\u4f53\u540e\u518d\u67e5\u770b\u5b9e\u4f53\u63a2\u7d22\u3002'} />}
              <div className="entity-summary-grid" role="region" aria-label="实体总览">
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
                  recentCount={recentCount}
                  starredCount={starredCount}
                  onScopeChange={setScope}
                  onDomainChange={(value) => {
                    setSelectedTopScope('all')
                    setSelectedDomain(value)
                  }}
                  onTypeChange={(value) => {
                    setSelectedTopScope('all')
                    setSelectedType(value)
                  }}
                  onToggleCollapsed={() => setFiltersOpen((value) => !value)}
                />
                <EntityCatalog
                  apps={catalogApps}
                  groups={catalogDomainGroups}
                  recentRecords={recentCatalogRecords}
                  total={filtered.length}
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
                {view === 'health' && (
                  <section className="entity-result-panel">
                    <div className="entity-panel-head">
                      <div>
                        <strong>{viewTitle(view)}</strong>
                        <span>当前 {filteredStats.total.toLocaleString()} 个实体</span>
                      </div>
                      <button type="button" onClick={() => {
                        setScope('all')
                        setSelectedTopScope('all')
                        setSelectedDomain('all')
                        setSelectedType('all')
                        setQuery('')
                        setQueryDraft('')
                      }}>重置</button>
                    </div>
                    <EntityHealthGrid records={filtered.slice(0, 80)} onSelect={setSelected} />
                  </section>
                )}
              </div>
            </>
          )}
        </section>
      </main>

      <EntityDetail
        record={view === 'topology' ? null : selected}
        data={data}
        onClose={() => setSelected(null)}
        onSelectNode={selectDetailNode}
      />
    </div>
  )
}

function EntityStatCard({ title, items }: { title: string; items: Array<{ value: string; label: string }> }) {
  return (
    <article className="entity-card entity-stat-card">
      <strong>{title}</strong>
      <div className="entity-overview-metrics">
        {items.map((item) => (
          <span className="entity-overview-metric" key={item.label}>
            <b>{item.value}</b>
            <small>{item.label}</small>
          </span>
        ))}
      </div>
    </article>
  )
}

function EntityFeedback({
  message,
  detail,
  tone = 'info',
  onRetry,
}: {
  message: string
  detail?: string
  tone?: 'info' | 'error'
  onRetry?: () => void
}) {
  return (
    <section className={`entity-feedback ${tone}`}>
      <strong>{message}</strong>
      {detail && <span>{detail}</span>}
      {onRetry && <button type="button" onClick={onRetry}>重试</button>}
    </section>
  )
}

function EventCard({ stats }: { stats: ReturnType<typeof summarizeEntities> }) {
  const total = Math.max(1, stats.criticalEvents + stats.errorEvents + stats.warningEvents + stats.infoEvents)
  return (
    <article className="entity-card entity-event-card">
      <div className="entity-overview-card-head">
        <strong>事件</strong>
      </div>
      <div className="entity-overview-metrics entity-event-totals">
        <span className="entity-overview-metric">
          <b>{stats.openEvents.toLocaleString()}</b>
          <small>未恢复事件</small>
        </span>
        <span className="entity-overview-metric">
          <b>{stats.changeEvents.toLocaleString()}</b>
          <small>Change 事件</small>
        </span>
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
    </article>
  )
}

function HealthCard({ stats }: { stats: ReturnType<typeof summarizeEntities> }) {
  const normalPercent = Math.round((stats.normal / Math.max(1, stats.total)) * 100)
  const healthRows = [
    { key: 'normal' as const, label: '正常', value: stats.normal.toLocaleString(), color: statusMeta.normal.color },
    { key: 'warning' as const, label: '警告', value: stats.warning.toLocaleString(), color: statusMeta.warning.color },
    { key: 'critical' as const, label: '严重', value: stats.critical.toLocaleString(), color: statusMeta.critical.color },
    { key: 'total' as const, label: '总计', value: stats.total.toLocaleString(), color: '#94a3b8' },
  ]
  return (
    <article className="entity-card entity-health-card">
      <div className="entity-overview-card-head">
        <strong>健康度</strong>
      </div>
      <div className="entity-health-body">
        <div className="entity-health-score">
          <b>{normalPercent}%</b>
          <small>正常</small>
        </div>
        <div className="entity-health-breakdown">
          {healthRows.map((item) => (
            <span key={item.key}>
              <i style={{ background: item.color }} />
              <small>{item.label}</small>
              {item.key === 'total' && (
                <button
                  className="entity-health-info-button"
                  type="button"
                  aria-label="目前仅 应用（apm@apm.service） 参与健康度计算"
                  title="目前仅 应用（apm@apm.service） 参与健康度计算"
                >
                  ?
                </button>
              )}
              <b>{item.value}</b>
            </span>
          ))}
        </div>
      </div>
    </article>
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
  recentCount,
  starredCount,
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
  recentCount: number
  starredCount: number
  onScopeChange: (value: ScopeFilter) => void
  onDomainChange: (value: string) => void
  onTypeChange: (value: string) => void
  onToggleCollapsed: () => void
}) {
  const [catalogGroup, setCatalogGroup] = useState<'domain' | 'app'>('domain')
  const filterRows = catalogGroup === 'domain'
    ? [
      { key: 'all', label: '全部实体域', count: total, active: selectedDomain === 'all', onClick: () => onDomainChange('all') },
      ...domains.slice(0, 7).map((item) => ({
        key: item.key,
        label: item.key,
        count: item.count,
        active: selectedDomain === item.key,
        onClick: () => onDomainChange(item.key),
      })),
    ]
    : [
      { key: 'all', label: '全部应用', count: total, active: selectedType === 'all', onClick: () => onTypeChange('all') },
      ...types.slice(0, 7).map((item) => ({
        key: item.key,
        label: item.key,
        count: item.count,
        active: selectedType === item.key,
        onClick: () => onTypeChange(item.key),
      })),
    ]

  return (
    <section className={`entity-card entity-filter-panel ${collapsed ? 'collapsed' : ''}`}>
      <div className="entity-panel-head">
        <div>
          <strong>过滤器</strong>
          <span>{total.toLocaleString()} 个实体</span>
        </div>
        <button type="button" aria-label={collapsed ? '展开筛选' : '收起筛选'} onClick={onToggleCollapsed}>{collapsed ? '展开筛选' : '收起筛选'}</button>
      </div>
      {!collapsed && (
        <>
          <div className="entity-filter-section">
            <strong>实体范围</strong>
            <FilterRow active={scope === 'all'} label={'\u6240\u6709\u5b9e\u4f53'} count={total} onClick={() => onScopeChange('all')} />
            <FilterRow active={scope === 'recent'} label={'\u6700\u8fd1\u8bbf\u95ee'} count={recentCount} onClick={() => onScopeChange('recent')} />
            <FilterRow active={scope === 'starred'} label="关注实体" count={starredCount} onClick={() => onScopeChange('starred')} />
          </div>
          <div className="entity-filter-section">
            <div className="entity-filter-section-title">
              <strong>目录分组方式</strong>
              <div className="entity-filter-segmented" role="group" aria-label="目录分组方式">
                <button className={catalogGroup === 'domain' ? 'active' : ''} type="button" onClick={() => setCatalogGroup('domain')}>实体Domain</button>
                <button className={catalogGroup === 'app' ? 'active' : ''} type="button" onClick={() => setCatalogGroup('app')}>应用</button>
              </div>
            </div>
            <div className="entity-domain-list">
              {filterRows.map((item) => (
                <button key={item.key} className={item.active ? 'entity-domain-row active' : 'entity-domain-row'} type="button" onClick={item.onClick}>
                  <span>{item.label}</span>
                  <b>{item.count.toLocaleString()}</b>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function EntityCatalog({
  apps,
  groups,
  recentRecords,
  total,
  query,
  suggestOpen,
  onQueryChange,
  onFocusSearch,
  onBlurSearch,
  onSelect,
}: {
  apps: Array<{ key: string; count: number; kind: 'domain' | 'type' }>
  groups: EntityCatalogDomainGroup[]
  recentRecords: EntityRecord[]
  total: number
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
          <span>{total.toLocaleString()} 个实体</span>
        </div>
        <div className="entity-catalog-search-row">
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
          <button className="entity-catalog-search-button" type="button" disabled>搜索</button>
          {suggestOpen && (
            <EntitySearchPopover
              recommendedDomains={apps.filter((item) => item.kind === 'domain').map((item) => ({
                label: item.key,
                token: item.key,
                count: item.count,
                kind: 'domain',
              }))}
              recommendedEntities={apps.filter((item) => item.kind === 'type').map((item) => ({
                label: item.key,
                token: item.key,
                count: item.count,
                kind: 'entity',
              }))}
              onSelect={onSelect}
            />
          )}
        </div>
      </div>
      <div className="entity-app-list">
        {recentRecords.length > 0 && (
          <div className="entity-catalog-recent">
            <div className="entity-catalog-group-title">
              <span>最近访问</span>
              <small>{recentRecords.length.toLocaleString()} 条记录</small>
            </div>
            {recentRecords.map((record) => (
              <button
                key={record.id}
                className="entity-catalog-recent-item"
                type="button"
                onClick={() => onSelect({
                  label: stripSyntheticType(record.type),
                  token: record.type,
                  count: 1,
                  kind: 'entity',
                })}
              >
                <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
                  <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={14} />
                </span>
                <span>
                  <b>{record.label}</b>
                  <small>{record.lastSeen}</small>
                  <em>{entityInstanceId(record)}</em>
                  <em>{record.type}</em>
                </span>
              </button>
            ))}
          </div>
        )}
        {groups.map((group) => (
          <div className="entity-catalog-group" key={group.key}>
            <div className="entity-catalog-group-title">
              <button
                className="entity-catalog-domain-title"
                type="button"
                onClick={() => onSelect({
                  label: group.title,
                  token: group.title,
                  count: group.count,
                  kind: 'domain',
                })}
              >
                {group.title}
              </button>
              <small>{group.summary}</small>
            </div>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => onSelect({
                  label: item.label,
                  token: item.key,
                  count: item.count,
                  kind: 'entity',
                })}
              >
                <span className="entity-type-icon" style={{ color: item.color, borderColor: item.color }}>
                  <TopologyPresetIcon preset={item.iconPreset} label={item.key} size={13} />
                </span>
                <span>
                  <b>{item.label}</b>
                  <small>已接入</small>
                </span>
                <strong>{item.count.toLocaleString()}</strong>
              </button>
            ))}
          </div>
        ))}
      </div>
    </section>
  )
}

function EntitySearchPopover({
  compact = false,
  recommendedDomains,
  recommendedEntities,
  onSelect,
}: {
  compact?: boolean
  recommendedDomains: EntityDrilldown[]
  recommendedEntities: EntityDrilldown[]
  onSelect: (item: EntityDrilldown) => void
}) {
  return (
    <div className={compact ? 'entity-search-popover compact' : 'entity-search-popover'} onMouseDown={(event) => event.preventDefault()}>
      <div className="entity-search-popover-title">
        <Search size={14} />
        <strong>推荐搜索</strong>
      </div>
      <EntityRecommendationGroup title={'\u63a8\u8350\u57df'} items={recommendedDomains} onSelect={onSelect} />
      <EntityRecommendationGroup title="推荐实体类型" items={recommendedEntities} onSelect={onSelect} />
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

function EntityMetricsResult({ selection, records }: { selection: EntityDrilldown; records: EntityRecord[] }) {
  const rows = createEntityMetricRows(records)
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
              <th>每分钟平均 Token 消耗</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
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
        <span>总数: {records.length.toLocaleString()}</span>
        <button type="button" disabled>上一页</button>
        <button type="button" className="active">1</button>
        <button type="button">2</button>
        <button type="button">3</button>
        <button type="button">4</button>
        <span>...</span>
        <button type="button">9</button>
        <button type="button">下一页</button>
        <span>1/{Math.max(1, Math.ceil(records.length / 10))}</span>
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
  const [sortKey, setSortKey] = useState<EntityTableSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const sortedRecords = useMemo(() => [...records].sort((left, right) => {
    const leftValue = entityTableSortValue(left, sortKey)
    const rightValue = entityTableSortValue(right, sortKey)
    const result = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? result : -result
  }), [records, sortDirection, sortKey])
  const visibleRows = sortedRecords.slice(0, 80)
  const pageCount = Math.max(1, Math.ceil(records.length / 20))
  const changeSort = (key: EntityTableSortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc')
        return currentKey
      }
      setSortDirection('asc')
      return key
    })
  }
  const sortState = (key: EntityTableSortKey) => sortKey === key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'
  const sortClass = (key: EntityTableSortKey) => `entity-topology-sort ${sortKey === key ? sortDirection : ''}`

  return (
    <div className="entity-table-wrap">
      <div className="entity-table-scroll">
        <table className="entity-table">
          <thead>
            <tr>
              <th aria-label="选择实体"><input type="checkbox" aria-label="选择全部实体" /></th>
              <th aria-sort={sortState('name')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('name')}>
                  实体名称 <span className={sortClass('name')} />
                </button>
              </th>
              <th aria-sort={sortState('type')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('type')}>
                  实体类型 <span className={sortClass('type')} />
                </button>
              </th>
              <th aria-sort={sortState('instance')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('instance')}>
                  实例 ID <span className={sortClass('instance')} />
                </button>
              </th>
              <th aria-sort={sortState('domain')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('domain')}>
                  Domain <span className={sortClass('domain')} />
                </button>
              </th>
              <th aria-sort={sortState('tags')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('tags')}>
                  标签 <span className={sortClass('tags')} />
                </button>
              </th>
              <th aria-sort={sortState('health')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('health')}>
                  健康度 <span className={sortClass('health')} />
                </button>
              </th>
              <th aria-sort={sortState('events')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('events')}>
                  未恢复事件 <span className={sortClass('events')} />
                </button>
              </th>
              <th aria-sort={sortState('updated')}>
                <button type="button" className="entity-table-sort-header" onClick={() => changeSort('updated')}>
                  更新时间 <span className={sortClass('updated')} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr className="entity-table-empty-row">
                <td colSpan={9}>暂无匹配实体</td>
              </tr>
            )}
            {visibleRows.map((record) => (
              <tr key={record.id} className={selected?.id === record.id ? 'active' : ''} onClick={() => onSelect(record)}>
                <td onClick={(event) => event.stopPropagation()}>
                  <input type="checkbox" aria-label={`选择 ${record.label}`} checked={selected?.id === record.id} readOnly />
                </td>
                <td>
                  <div className="entity-row-title">
                    <button
                      className={record.starred ? 'entity-row-star active' : 'entity-row-star'}
                      type="button"
                      aria-label={record.starred ? '已关注实体' : '关注实体'}
                      onClick={(event) => event.stopPropagation()}
                    >
                      <Star size={14} />
                    </button>
                    <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
                      <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={15} />
                    </span>
                    <span>
                      <b>{record.label}</b>
                      <small>{entityInstanceId(record)}</small>
                    </span>
                  </div>
                </td>
                <td><span className="entity-type-tag">{record.type}</span></td>
                <td title={entityInstanceId(record)}>{entityInstanceId(record)}</td>
                <td>{record.domain}</td>
                <td><span className="entity-tag-count">{entityTagCountFromRecord(record)} 个标签</span></td>
                <td><StatusPill status={record.status} /></td>
                <td><span className={record.events > 0 ? 'entity-event-count warning' : 'entity-event-count'}>{record.events}</span></td>
                <td>{record.lastSeen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="entity-table-footer">
        <span>每页显示:</span>
        <button type="button">20 <ChevronDown size={14} /></button>
        <span>总数: {records.length.toLocaleString()}</span>
        <button type="button" disabled>‹ 上一页</button>
        <button type="button" className="active">1</button>
        {pageCount > 1 && <button type="button">2</button>}
        {pageCount > 2 && <span>...</span>}
        {pageCount > 2 && <button type="button">{pageCount}</button>}
        <button type="button" disabled={pageCount <= 1}>下一页 ›</button>
      </div>
    </div>
  )
}

function entityInstanceId(record: EntityRecord) {
  return valueText(record.properties.instanceId)
    || valueText(record.properties.instance_id)
    || valueText(record.properties.id)
    || record.id
}

function entityTableSortValue(record: EntityRecord, key: EntityTableSortKey) {
  if (key === 'name') return record.label
  if (key === 'type') return stripSyntheticType(record.type) || record.type
  if (key === 'instance') return entityInstanceId(record)
  if (key === 'domain') return record.domain
  if (key === 'tags') return entityTagCountFromRecord(record)
  if (key === 'health') return { critical: 3, warning: 2, normal: 1 }[record.status]
  if (key === 'events') return record.events
  return valueText(record.properties.__last_observed_time__)
    || valueText(record.properties.updated_at)
    || record.lastSeen
}

function entitySearchText(record: EntityRecord, category: SearchCategory) {
  const fields = {
    all: [
      record.label,
      record.type,
      stripSyntheticType(record.type),
      record.domain,
      record.app,
      entityInstanceId(record),
      valueText(record.properties.ip),
      valueText(record.properties.host),
    ],
    name: [record.label],
    type: [record.type, stripSyntheticType(record.type)],
    domain: [record.domain],
    instance: [entityInstanceId(record)],
  } satisfies Record<SearchCategory, string[]>
  return fields[category].join(' ').toLowerCase()
}

function entityTagCountFromRecord(record: EntityRecord) {
  return Object.entries(record.properties)
    .filter(([key, value]) => !key.startsWith('__') && valueText(value))
    .length
}

function EntityTopologyView({
  data,
  focusedTypes,
  selectedNode,
  onSelectNode,
  onFocusType,
}: {
  data: TopologyExplorerData
  focusedTypes: string[]
  selectedNode: TopologyNode | null
  onSelectNode: (node: TopologyNode | null) => void
  onFocusType: (type: string) => void
}) {
  const referenceTopology = useMemo(() => createReferenceStyleTopology(data, focusedTypes), [data, focusedTypes])
  const [selectedAggregateId, setSelectedAggregateId] = useState<string>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [hiddenDomains, setHiddenDomains] = useState<string[]>([])
  const [hiddenRelations, setHiddenRelations] = useState<string[]>([])
  const topologyDomains = useMemo(() => countTopologyOptions(referenceTopology.nodes, referenceNodeDomain), [referenceTopology.nodes])
  const relationOptions = useMemo(() => countTopologyOptions(referenceTopology.edges, (edge) => edge.label), [referenceTopology.edges])
  const visibleNodes = useMemo(() => referenceTopology.nodes.filter((item) => !hiddenDomains.includes(referenceNodeDomain(item))), [hiddenDomains, referenceTopology.nodes])
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((item) => item.id)), [visibleNodes])
  const visibleEdges = useMemo(() => referenceTopology.edges.filter((edge) => visibleNodeIds.has(edge.source.id) && visibleNodeIds.has(edge.target.id) && !hiddenRelations.includes(edge.label)), [hiddenRelations, referenceTopology.edges, visibleNodeIds])
  const selectedId = selectedNode?.id
  const selectedInstanceItem = selectedId
    ? visibleNodes.find((item) => item.instances.some((node) => node.id === selectedId)) || null
    : null
  const selectedAggregateItem = selectedAggregateId
    ? visibleNodes.find((item) => item.id === selectedAggregateId) || null
    : null
  const activePanelItem = selectedInstanceItem || selectedAggregateItem
  const isInstanceDetailOpen = Boolean(selectedNode && selectedInstanceItem)
  const [zoom, setZoom] = useState(10)
  const zoomScale = zoom / 10
  const focusedZoomScale = activePanelItem ? zoomScale * 2.9 : zoomScale
  const zoomDisplay = Math.round(zoomScale * 98)
  const zoomProgress = (zoom - 10) / 36
  const focusCenterX = activePanelItem ? activePanelItem.x + activePanelItem.width / 2 : 0
  const focusCenterY = activePanelItem ? activePanelItem.y + activePanelItem.height / 2 : 0
  const sceneX = activePanelItem ? 1239 - focusCenterX * focusedZoomScale : -2550 * zoomProgress
  const sceneY = activePanelItem ? 619 - focusCenterY * focusedZoomScale : -425 * zoomProgress
  const sceneTransform = `translate(${sceneX} ${sceneY}) scale(${focusedZoomScale})`
  const selectAggregate = (item: ReferenceTopologyNode) => {
    setSelectedAggregateId(item.id)
    onFocusType(item.type)
    if (!item.instances.some((node) => node.id === selectedNode?.id)) onSelectNode(null)
  }
  const selectInstance = (node: TopologyNode) => {
    setSelectedAggregateId('')
    onSelectNode(node)
    onFocusType(node.type)
  }
  const changeZoom = (direction: 1 | -1) => {
    setZoom((value) => Math.max(10, Math.min(46, value + direction * 6)))
  }
  const zoomOut = () => changeZoom(-1)
  const zoomIn = () => changeZoom(1)
  const handleWheelZoom = (event: WheelEvent<HTMLElement>) => {
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 1 : -1)
  }
  const toggleDomainFilter = (domain: string) => {
    setHiddenDomains((current) => current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain])
    setSelectedAggregateId('')
    onSelectNode(null)
  }
  const toggleRelationFilter = (relation: string) => {
    setHiddenRelations((current) => current.includes(relation) ? current.filter((item) => item !== relation) : [...current, relation])
  }
  const resetTopologyFilters = () => {
    setHiddenDomains([])
    setHiddenRelations([])
  }

  return (
    <section className={activePanelItem ? `entity-topology-split ${isInstanceDetailOpen ? 'has-instance-detail' : 'has-detail'}` : 'entity-topology-split'}>
      <div className="entity-topology-full" onWheel={handleWheelZoom}>
        <div className="entity-topology-zoom">
          <button className="entity-topology-zoom-action" type="button" data-zoom-action="out" aria-label="缩小拓扑" onClick={zoomOut}>−</button>
          <b>{zoomDisplay}%</b>
          <button className="entity-topology-zoom-action" type="button" data-zoom-action="in" aria-label="放大拓扑" onClick={zoomIn}>＋</button>
          <button className="entity-topology-zoom-action" type="button" data-zoom-action="fit" aria-label="适应画布" onClick={() => setZoom(10)}>⌖</button>
        </div>
        <button
          className={filterOpen || hiddenDomains.length > 0 || hiddenRelations.length > 0 ? 'entity-topology-filter active' : 'entity-topology-filter'}
          type="button"
          aria-label="过滤拓扑"
          aria-expanded={filterOpen}
          onClick={() => setFilterOpen((open) => !open)}
        >
          <Filter size={25} />
        </button>
        {filterOpen && (
          <div className="entity-topology-filter-panel" role="group" aria-label="拓扑过滤条件">
            <header>
              <strong>过滤拓扑</strong>
              <button type="button" onClick={resetTopologyFilters} disabled={hiddenDomains.length === 0 && hiddenRelations.length === 0}>重置</button>
            </header>
            <section>
              <span>实体Domain</span>
              <div>
                {topologyDomains.map((item) => {
                  const active = !hiddenDomains.includes(item.key)
                  const disabled = active && topologyDomains.length - hiddenDomains.length <= 1
                  return (
                    <button key={item.key} type="button" className={active ? 'active' : ''} disabled={disabled} onClick={() => toggleDomainFilter(item.key)}>
                      {item.key} <b>{item.count}</b>
                    </button>
                  )
                })}
              </div>
            </section>
            <section>
              <span>关系类型</span>
              <div>
                {relationOptions.length === 0 && <em>暂无关系</em>}
                {relationOptions.map((item) => {
                  const active = !hiddenRelations.includes(item.key)
                  const disabled = active && relationOptions.length - hiddenRelations.length <= 1
                  return (
                    <button key={item.key} type="button" className={active ? 'active' : ''} disabled={disabled} onClick={() => toggleRelationFilter(item.key)}>
                      {item.key} <b>{item.count}</b>
                    </button>
                  )
                })}
              </div>
            </section>
            <footer>{visibleNodes.length} / {referenceTopology.nodes.length} 类实体，{visibleEdges.length} / {referenceTopology.edges.length} 条关系</footer>
          </div>
        )}
        <svg className="entity-cms-reference-graph" viewBox="0 0 2478 1238" preserveAspectRatio="xMinYMin meet" role="img" aria-label={'\u5b9e\u4f53\u62d3\u6251\u5173\u7cfb\u56fe'}>
          <defs>
            <pattern id="entity-reference-dot-grid" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="1.2" cy="1.2" r="1" fill="#e7ebf1" />
            </pattern>
            <marker id="entity-reference-arrow" markerWidth="5" markerHeight="5" refX="4.6" refY="2.5" orient="auto">
              <path d="M0,0 L5,2.5 L0,5 Z" fill="#c3c8d0" />
            </marker>
          </defs>
          <rect width="2478" height="1238" fill="#fff" />
          <rect width="2478" height="1238" fill="url(#entity-reference-dot-grid)" opacity="0.52" />
          <g className="entity-reference-scene" transform={sceneTransform}>
            <g className="entity-reference-links">
              {visibleEdges.map((edge) => (
                <g key={edge.id}>
                  <path d={referenceEdgePath(edge)} markerEnd="url(#entity-reference-arrow)" />
                  {edge.showLabel && (() => {
                    const labelX = (edge.source.x + edge.target.x) / 2
                    const labelY = (edge.source.y + edge.target.y) / 2 - 4
                    const labelWidth = Math.min(126, Math.max(74, edge.label.length * 12 + 28))
                    return (
                      <g className="entity-reference-link-label">
                        <rect x={labelX - labelWidth / 2} y={labelY - 20} width={labelWidth} height="28" rx="3" />
                        <text x={labelX} y={labelY}>{edge.label}</text>
                      </g>
                    )
                  })()}
                </g>
              ))}
            </g>
            <g className="entity-reference-nodes">
              {visibleNodes.map((item, index) => (
                <g
                  key={item.id}
                  className={activePanelItem?.id === item.id ? 'selected' : ''}
                  transform={`translate(${item.x} ${item.y})`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${item.title}，${item.instances.length} 个实例，点击查看实例列表`}
                  aria-pressed={activePanelItem?.id === item.id}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    selectAggregate(item)
                  }}
                  onClick={() => {
                    selectAggregate(item)
                  }}
                >
                  <clipPath id={`entity-reference-title-clip-${index}`}>
                    <rect x="52" y="17" width={Math.max(112, item.width - 136)} height="30" />
                  </clipPath>
                  <clipPath id={`entity-reference-subtitle-clip-${index}`}>
                    <rect x="52" y={item.height - 32} width={Math.max(120, item.width - 70)} height="24" />
                  </clipPath>
                  <rect className="entity-reference-card-fill" width={item.width} height={item.height} rx="10" fill={item.color} />
                  <rect className="entity-reference-card" width={item.width} height={item.height} rx="10" fill="none" stroke={item.color} />
                  <rect className="entity-reference-card-bar" x={(item.width - item.barWidth) / 2} y="0" width={item.barWidth} height="6" rx="3" fill={item.color} />
                  <path className="entity-reference-card-icon" d={referenceIconPath(item.title)} transform="translate(18 23) scale(1.05)" fill="none" stroke={item.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  <text x="52" y="35" className="title" clipPath={`url(#entity-reference-title-clip-${index})`}>{item.title}</text>
                  <text x={item.width - 18} y="35" className="count" textAnchor="end">数量: {item.instances.length}</text>
                  <text x="52" y={item.height - 15} className="muted" clipPath={`url(#entity-reference-subtitle-clip-${index})`}>类型: {item.subtitle}</text>
                </g>
              ))}
            </g>
          </g>
        </svg>
        <div className="entity-cms-minimap" aria-hidden="true">
          <svg viewBox="0 0 2478 1238">
            <rect width="2478" height="1238" fill="#fff" />
            <g transform="translate(0 0)">
              {visibleNodes.map((item) => (
                <rect key={item.id} x={item.x} y={item.y} width="12" height="4" fill="#cfd5dd" opacity="0.75" />
              ))}
            </g>
            <rect x="430" y="80" width="1080" height="720" fill="none" stroke="#e0e5ec" strokeWidth="34" />
          </svg>
        </div>
      </div>
      {activePanelItem && (
        selectedNode && selectedInstanceItem
          ? (
            <EntityInstanceDetailPanel
              data={data}
              item={selectedInstanceItem}
              node={selectedNode}
              onBack={() => {
                setSelectedAggregateId(selectedInstanceItem.id)
                onSelectNode(null)
              }}
              onSelectNode={selectInstance}
            />
          )
          : <EntityAggregatePanel item={activePanelItem} onSelectNode={selectInstance} />
      )}
    </section>
  )
}

function EntityAggregatePanel({ item, onSelectNode }: { item: ReferenceTopologyNode; onSelectNode: (node: TopologyNode) => void }) {
  const [queryDraft, setQueryDraft] = useState('')
  const [query, setQuery] = useState('')
  const [tagFilterOpen, setTagFilterOpen] = useState(false)
  const [selectedTagKeys, setSelectedTagKeys] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<EntityAggregateSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const tagOptions = useMemo(() => createAggregateTagOptions(item.instances), [item.instances])
  const filteredInstances = useMemo(() => {
    const search = query.trim().toLowerCase()
    return item.instances.filter((node) => {
      const matchesSearch = !search || [
        node.label,
        node.id,
        node.type,
        valueText(node.properties.__domain__),
        valueText(node.properties.instanceId),
        valueText(node.properties.instance_id),
        valueText(node.properties.region),
      ].join(' ').toLowerCase().includes(search)
      const matchesTags = selectedTagKeys.length === 0 || selectedTagKeys.every((key) => valueText(node.properties[key]))
      return matchesSearch && matchesTags
    })
  }, [item.instances, query, selectedTagKeys])
  const sortedInstances = useMemo(() => [...filteredInstances].sort((left, right) => {
    const leftValue = aggregateSortValue(left, sortKey)
    const rightValue = aggregateSortValue(right, sortKey)
    const result = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? result : -result
  }), [filteredInstances, sortDirection, sortKey])
  const rows = sortedInstances.slice(0, 10)
  const runInstanceQuery = () => setQuery(queryDraft)
  const toggleTagFilter = (key: string) => setSelectedTagKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  const clearTagFilters = () => setSelectedTagKeys([])
  const changeSort = (key: EntityAggregateSortKey) => {
    setSortKey((currentKey) => {
      if (currentKey === key) {
        setSortDirection((currentDirection) => currentDirection === 'asc' ? 'desc' : 'asc')
        return currentKey
      }
      setSortDirection('asc')
      return key
    })
  }

  useEffect(() => {
    setQuery('')
    setQueryDraft('')
    setSelectedTagKeys([])
    setTagFilterOpen(false)
  }, [item.id])

  return (
    <aside className="entity-topology-detail-panel" aria-label={`${item.title}实例列表`}>
      <div className="entity-topology-panel-toolbar">
        <button type="button" className="entity-type-filter">{item.subtitle}</button>
        <label>
          <Search size={15} />
          <input
            aria-label="请输入实体关键词（至少 4 个字符）"
            value={queryDraft}
            onChange={(event) => setQueryDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') runInstanceQuery()
            }}
            placeholder="请输入实体关键词（至少 4 个字符）"
          />
        </label>
        <div className="entity-topology-tag-filter" onBlur={() => window.setTimeout(() => setTagFilterOpen(false), 120)}>
          <button
            type="button"
            className={tagFilterOpen || selectedTagKeys.length > 0 ? 'active' : ''}
            aria-haspopup="menu"
            aria-expanded={tagFilterOpen}
            onClick={() => setTagFilterOpen((open) => !open)}
          >
            标签过滤{selectedTagKeys.length > 0 && <b>{selectedTagKeys.length}</b>}
          </button>
          {tagFilterOpen && (
            <div className="entity-topology-tag-menu" role="menu" aria-label="标签过滤">
              <header>
                <strong>标签过滤</strong>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={clearTagFilters} disabled={selectedTagKeys.length === 0}>清空</button>
              </header>
              {tagOptions.length === 0 && <p>暂无可过滤标签</p>}
              {tagOptions.map((option) => {
                const active = selectedTagKeys.includes(option.key)
                return (
                  <button
                    key={option.key}
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={active}
                    className={active ? 'active' : ''}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => toggleTagFilter(option.key)}
                  >
                    <span>{option.label}</span>
                    <b>{option.count}</b>
                  </button>
                )
              })}
              <footer>{filteredInstances.length} / {item.instances.length} 个实例</footer>
            </div>
          )}
        </div>
        <button type="button" className="primary" onClick={runInstanceQuery}>查询</button>
      </div>
      <div className="entity-topology-detail-table-wrap">
        <table className="entity-topology-detail-table">
          <thead>
            <tr>
              <th aria-sort={sortKey === 'name' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('name')}>
                  {item.title}名称 <span className={`entity-topology-sort ${sortKey === 'name' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'tags' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('tags')}>
                  标签 <span className="entity-topology-info">?</span> <span className={`entity-topology-sort ${sortKey === 'tags' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'probe' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('probe')}>
                  探针类型 <span className="entity-topology-info">?</span> <span className={`entity-topology-sort ${sortKey === 'probe' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'language' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('language')}>
                  语言 <span className={`entity-topology-sort ${sortKey === 'language' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'region' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('region')}>
                  区域 <span className={`entity-topology-sort ${sortKey === 'region' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'latency' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('latency')}>
                  平均耗时 <span className={`entity-topology-sort ${sortKey === 'latency' ? sortDirection : ''}`} />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="entity-topology-empty-row">
                <td colSpan={6}>暂无匹配实体</td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={row.id}>
                <td><a href="#entity-topology-detail" onClick={(event) => { event.preventDefault(); onSelectNode(row) }}>{row.label}</a></td>
                <td>{entityTagCount(row)}</td>
                <td>{valueText(row.properties.__method__) || 'EntityStore'}</td>
                <td>{valueText(row.properties.language) || '-'}</td>
                <td>{valueText(row.properties.region) || valueText(row.properties.__domain__) || '-'}</td>
                <td>{Number(row.properties.relationCount || 0) > 0 ? `${18 + Number(row.properties.relationCount || 0)} ms` : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="entity-topology-detail-footer">
          <span>每页显示:</span>
          <button type="button">10 <ChevronDown size={14} /></button>
          <span>总数: {filteredInstances.length}</span>
          <button type="button" disabled>‹ 上一页</button>
          <button type="button" className="active">1</button>
          {filteredInstances.length > 10 && <button type="button">2</button>}
          <button type="button">下一页 ›</button>
        </div>
      </div>
    </aside>
  )
}

function createAggregateTagOptions(nodes: TopologyNode[]) {
  const counts = new Map<string, number>()
  nodes.forEach((node) => {
    Object.entries(node.properties).forEach(([key, value]) => {
      if (key.startsWith('__') || !valueText(value)) return
      counts.set(key, (counts.get(key) || 0) + 1)
    })
  })
  return [...counts.entries()]
    .map(([key, count]) => ({ key, label: key, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
    .slice(0, 12)
}

function aggregateSortValue(node: TopologyNode, key: EntityAggregateSortKey) {
  if (key === 'name') return node.label
  if (key === 'tags') return entityTagCount(node)
  if (key === 'probe') return valueText(node.properties.__method__) || 'EntityStore'
  if (key === 'language') return valueText(node.properties.language) || ''
  if (key === 'region') return valueText(node.properties.region) || valueText(node.properties.__domain__) || ''
  return Number(node.properties.relationCount || 0) > 0 ? 18 + Number(node.properties.relationCount || 0) : -1
}

function EntityInstanceDetailPanel({
  data,
  item,
  node,
  onBack,
  onSelectNode,
}: {
  data: TopologyExplorerData
  item: ReferenceTopologyNode
  node: TopologyNode
  onBack: () => void
  onSelectNode: (node: TopologyNode) => void
}) {
  const [activeTab, setActiveTab] = useState<EntityInstanceTab>('detail')
  const [relationFilter, setRelationFilter] = useState<EntityRelationFilter>('all')
  const relatedLinks = useMemo(() => relatedLinksForInstance(data, node), [data, node])
  const neighbors = relatedLinks.map((link) => link.neighbor)
  const providedLinks = relatedLinks.filter((link) => link.direction === 'out')
  const dependencyLinks = relatedLinks.filter((link) => link.direction === 'in')
  const filteredRelationLinks = relationFilter === 'provided'
    ? providedLinks
    : relationFilter === 'dependency'
      ? dependencyLinks
      : relatedLinks
  const relationTitle = relationFilter === 'provided' ? '提供服务' : relationFilter === 'dependency' ? '依赖服务' : '关联项'
  const propertyRows = entityDetailProperties(node)
  const tabs: Array<{ key: EntityInstanceTab; label: string; count?: number; dropdown?: boolean }> = [
    { key: 'detail', label: '\u5b9e\u4f53\u8be6\u60c5' },
    { key: 'topology', label: '\u5173\u8054\u62d3\u6251', dropdown: true },
    { key: 'trace', label: '\u4f1a\u8bdd\u8ffd\u8e2a' },
    { key: 'page', label: '\u9875\u9762\u8bbf\u95ee' },
    { key: 'heatmap', label: '\u70ed\u529b\u56fe\u5206\u6790' },
    { key: 'resource', label: '\u8d44\u6e90\u52a0\u8f7d' },
    { key: 'api', label: 'API\u8bf7\u6c42' },
    { key: 'exception', label: '\u5f02\u5e38\u7edf\u8ba1' },
    { key: 'customEvent', label: '\u81ea\u5b9a\u4e49\u4e8b\u4ef6' },
    { key: 'customLog', label: '\u81ea\u5b9a\u4e49\u65e5\u5fd7' },
    { key: 'settings', label: '\u5e94\u7528\u8bbe\u7f6e', dropdown: true },
    { key: 'logSearch', label: '\u65e5\u5fd7\u63a2\u7d22', count: relatedLinks.length, dropdown: true },
    { key: 'related', label: '\u5173\u8054\u9879', dropdown: true },
  ]

  useEffect(() => {
    setActiveTab('detail')
    setRelationFilter('all')
  }, [node.id])

  return (
    <aside className="entity-instance-detail-panel" aria-label={node.label + '\u5b9e\u4f53\u8be6\u60c5'}>
      <header className="entity-instance-head reference-like">
        <span className="entity-instance-kind-icon" style={{ color: node.color, borderColor: node.color }}>
          <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(node)} label={node.type} size={18} />
        </span>
        <div className="entity-instance-title-block">
          <strong>{node.label}</strong>
          <span className="entity-instance-type-pill">
            {entityTypeDisplayName(node.type)}
            <i aria-hidden="true" />
          </span>
        </div>
        <button className="entity-instance-star" type="button" aria-label={'\u5173\u6ce8\u5b9e\u4f53'}>
          <Star size={18} />
        </button>
        <div className="entity-instance-time-range" aria-label="time range">
          <span>15min</span>
          <b>{'\u6700\u8fd115\u5206\u949f'}</b>
        </div>
        <button className="entity-instance-icon-action" type="button" aria-label={'\u5237\u65b0'}>
          <RefreshCw size={16} />
        </button>
        <button className="entity-instance-assistant" type="button" aria-label={'\u667a\u80fd\u52a9\u624b'}>
          <Sparkles size={18} />
        </button>
        <button className="entity-instance-back" type="button" onClick={onBack} aria-label={'\u8fd4\u56de\u5217\u8868'} title={'\u8fd4\u56de\u5217\u8868'}>
          <ArrowLeft size={16} />
        </button>
        <button className="entity-instance-close" type="button" onClick={onBack} aria-label={'\u5173\u95ed'}>
          <X size={16} />
        </button>
      </header>
      <nav className="entity-instance-tabs">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'active' : ''}
            aria-label={typeof tab.count === 'number' ? `${tab.label}\uff08${tab.count}\uff09` : tab.label}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {typeof tab.count === 'number' && <em>{'\uff08'}{tab.count}{'\uff09'}</em>}
            {tab.dropdown && <ChevronDown size={14} />}
          </button>
        ))}
      </nav>
      {activeTab === 'topology' && (
        <div className="entity-instance-tab-menu entity-instance-topology-menu">
          <button className="active" type="button">{'\u5173\u8054\u5b9e\u4f53\u62d3\u6251'}</button>
          <button type="button">UModel {'\u63a2\u7d22'}</button>
        </div>
      )}
      {activeTab === 'settings' && (
        <div className="entity-instance-tab-menu entity-instance-settings-menu">
          <button className="active" type="button">{'\u5e94\u7528\u8bbe\u7f6e'}</button>
          <button type="button">{'\u91c7\u96c6\u914d\u7f6e'}</button>
          <button type="button">{'\u544a\u8b66\u914d\u7f6e'}</button>
        </div>
      )}
      {activeTab === 'logSearch' && (
        <div className="entity-instance-tab-menu entity-instance-log-menu">
          <button className="active" type="button">{'\u65e5\u5fd7\u63a2\u7d22'}</button>
          <button type="button">{'\u539f\u59cb\u65e5\u5fd7'}</button>
          <button type="button">{'\u5173\u8054\u65e5\u5fd7'}</button>
        </div>
      )}
      {activeTab === 'related' && (
        <div className="entity-instance-tab-menu entity-instance-related-menu">
          <button className={relationFilter === 'all' ? 'active' : ''} type="button" onClick={() => setRelationFilter('all')}>{'\u5173\u8054\u9879'}</button>
          <button className={relationFilter === 'provided' ? 'active' : ''} type="button" onClick={() => setRelationFilter('provided')}>{'\u63d0\u4f9b\u670d\u52a1'} {providedLinks.length}</button>
          <button className={relationFilter === 'dependency' ? 'active' : ''} type="button" onClick={() => setRelationFilter('dependency')}>{'\u4f9d\u8d56\u670d\u52a1'} {dependencyLinks.length}</button>
        </div>
      )}
      {activeTab === 'detail' && (
        <section className="entity-instance-reference-properties">
          <dl>
            {propertyRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd title={row.value}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {activeTab === 'topology' && <EntityRelatedTopologyCanvas node={node} links={relatedLinks} onSelectNode={onSelectNode} />}
      {activeTab === 'trace' && (
        <EntityTracePanel node={node} links={relatedLinks} />
      )}
      {activeTab === 'exception' && (
        <EntityInstanceHealthPanel node={node} links={relatedLinks} />
      )}
      {activeTab === 'related' && (
        <EntityRelationList title={relationTitle} emptyText={relationFilter === 'provided' ? '暂无提供服务' : relationFilter === 'dependency' ? '暂无依赖服务' : '暂无关联项'} links={filteredRelationLinks} onSelectNode={onSelectNode} />
      )}
      {activeTab === 'page' && <EntityInstanceEmptyTab title={'\u9875\u9762\u8bbf\u95ee'} description={'\u5f53\u524d\u5b9e\u4f53\u6682\u65e0\u9875\u9762\u8bbf\u95ee\u6570\u636e'} />}
      {activeTab === 'heatmap' && <EntityInstanceEmptyTab title={'\u70ed\u529b\u56fe\u5206\u6790'} description={'\u5f53\u524d\u5b9e\u4f53\u6682\u65e0\u70ed\u529b\u56fe\u6570\u636e'} />}
      {activeTab === 'resource' && <EntityInstanceEmptyTab title={'\u8d44\u6e90\u52a0\u8f7d'} description={'\u5f53\u524d\u5b9e\u4f53\u6682\u65e0\u8d44\u6e90\u52a0\u8f7d\u660e\u7ec6'} />}
      {activeTab === 'api' && <EntityInstanceEmptyTab title={'API\u8bf7\u6c42'} description={'\u5f53\u524d\u5b9e\u4f53\u6682\u65e0 API \u8bf7\u6c42\u660e\u7ec6'} />}
      {activeTab === 'customEvent' && <EntityInstanceEmptyTab title={'\u81ea\u5b9a\u4e49\u4e8b\u4ef6'} description={'\u5f53\u524d\u5b9e\u4f53\u6682\u65e0\u81ea\u5b9a\u4e49\u4e8b\u4ef6'} />}
      {activeTab === 'customLog' && <EntityInstanceEmptyTab title={'\u81ea\u5b9a\u4e49\u65e5\u5fd7'} description={'\u5f53\u524d\u5b9e\u4f53\u6682\u65e0\u81ea\u5b9a\u4e49\u65e5\u5fd7'} />}
      {activeTab === 'settings' && <EntityInstanceEmptyTab title={'\u5e94\u7528\u8bbe\u7f6e'} description={'\u8bf7\u5728\u5de5\u4f5c\u7a7a\u95f4\u7ba1\u7406\u4e2d\u914d\u7f6e\u8be5\u5b9e\u4f53\u7684\u5e94\u7528\u8bbe\u7f6e'} />}
      {activeTab === 'logSearch' && <EntityLogSearchPanel node={node} links={relatedLinks} />}
    </aside>
  )
}

function EntityLogSearchPanel({ node, links }: { node: TopologyNode; links: EntityRelatedLink[] }) {
  const conditions = entityLogConditions(node)
  const relatedConditions = links.slice(0, 6).map((link) => ({
    label: `${link.direction === 'out' ? '下游' : '上游'}：${link.neighbor.label}`,
    value: `__entity_id__="${link.neighbor.id}"`,
    type: link.edge.type,
  }))
  const query = createEntityLogQuery(node)
  return (
    <section className="entity-log-search-panel">
      <header>
        <div>
          <strong>日志探索</strong>
          <span>基于当前实体属性生成查询条件</span>
        </div>
        <button type="button" onClick={() => navigator.clipboard?.writeText(query)}>复制 SPL</button>
      </header>
      <div className="entity-log-query-card">
        <span>SPL</span>
        <code>{query}</code>
      </div>
      <div className="entity-log-search-grid">
        <section>
          <h4>实体条件</h4>
          {conditions.map((item) => (
            <article key={item.key}>
              <span>{item.label}</span>
              <code>{item.value}</code>
            </article>
          ))}
        </section>
        <section>
          <h4>关联实体</h4>
          {relatedConditions.length === 0 && <p>暂无关联实体条件</p>}
          {relatedConditions.map((item) => (
            <article key={item.value}>
              <span>{item.label}</span>
              <code>{item.value}</code>
              <em>{item.type}</em>
            </article>
          ))}
        </section>
      </div>
    </section>
  )
}

function EntityInstanceEmptyTab({ title, description }: { title: string; description: string }) {  return (
    <section className="entity-instance-empty-tab">
      <strong>{title}</strong>
      <span>{description}</span>
    </section>
  )
}

function entityLogConditions(node: TopologyNode) {
  const props = node.properties
  const rows = [
    { key: 'entityId', label: '实体 ID', value: `__entity_id__="${node.id}"` },
    { key: 'domain', label: '实体Domain', value: `__domain__="${valueText(props.__domain__) || valueText(props.domain) || node.cluster || '-'}"` },
    { key: 'type', label: '实体类型', value: `__entity_type__="${node.type}"` },
  ]
  const candidates = ['id', 'name', 'display_name', 'instanceId', 'instance_id', 'environment', 'region', 'namespace']
  candidates.forEach((key) => {
    const value = valueText(props[key])
    if (value) rows.push({ key, label: key, value: `${key}="${value}"` })
  })
  return rows
}

function createEntityLogQuery(node: TopologyNode) {
  const props = node.properties
  const domain = valueText(props.__domain__) || valueText(props.domain) || node.cluster || '*'
  const name = valueText(props.name) || valueText(props.display_name) || node.label
  return `.entity with(domain='${escapeSplString(domain)}', name='${escapeSplString(node.type)}', query='${escapeSplString(name)}') | entity-call get_logs('${escapeSplString(domain)}', '${escapeSplString(domain)}.log.service', query='__entity_id__ = "${escapeSplString(node.id)}"')`
}

function escapeSplString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"')
}

function entityDetailProperties(node: TopologyNode) {  const props = node.properties
  const baseRows = [
    { label: '\u5b9e\u4f53ID', value: node.id },
    { label: '\u5b9e\u4f53Domain', value: valueText(props.__domain__) || valueText(props.domain) || node.cluster || '-' },
    { label: '\u5b9e\u4f53\u7c7b\u578b', value: node.type },
    { label: '\u5b9e\u4f8b ID', value: valueText(props.instanceId) || valueText(props.instance_id) || valueText(props.id) || node.id },
    { label: '\u5b9e\u4f8b\u540d\u79f0', value: node.label },
    { label: '\u533a\u57df', value: valueText(props.region) || valueText(props.zone) || '-' },
    { label: '\u8d44\u6e90\u7ec4 ID', value: valueText(props.resourceGroupId) || valueText(props.resource_group_id) || '-' },
    { label: '\u521b\u5efa\u65f6\u95f4', value: valueText(props.created_at) || valueText(props.createTime) || '-' },
    { label: '\u5b9e\u4f8b\u72b6\u6001', value: valueText(props.status) || valueText(props.state) || 'Available' },
    { label: '\u9996\u6b21\u89c2\u6d4b\u65f6\u95f4', value: formatLastSeen(props.__first_observed_time__) || '-' },
    { label: '\u6700\u540e\u89c2\u6d4b\u65f6\u95f4', value: formatLastSeen(props.__last_observed_time__) || formatLastSeen(props.updated_at) || '-' },
  ]
  const seen = new Set(baseRows.map((row) => row.label))
  const extraRows = Object.entries(props)
    .filter(([key, value]) => !key.startsWith('__') && valueText(value))
    .slice(0, 10)
    .map(([key, value]) => ({ label: key, value: String(value) }))
    .filter((row) => {
      if (seen.has(row.label)) return false
      seen.add(row.label)
      return true
    })
  return [...baseRows, ...extraRows]
}

function EntityInstanceHealthPanel({ node, links }: { node: TopologyNode; links: EntityRelatedLink[] }) {
  const health = entityStatus(node, entitySequence({ id: node.id } as EntityRecord))
  const relatedNodes = links.map((link) => link.neighbor)
  const relationCount = Number(node.properties.relationCount || links.length)
  const warningCount = relatedNodes.filter((item, index) => entityStatus(item, index + 1) !== 'normal').length
  const healthScore = health === 'critical' ? 42 : health === 'warning' ? 76 : Math.max(92, 99 - warningCount * 4)
  const rows = [node, ...relatedNodes].slice(0, 8).map((item, index) => {
    const status = index === 0 ? health : entityStatus(item, index + 1)
    return {
      id: item.id,
      name: item.label,
      type: item.type,
      status,
      events: status === 'critical' ? 2 : status === 'warning' ? 1 : 0,
      lastSeen: formatLastSeen(item.properties.__last_observed_time__) || formatLastSeen(item.properties.updated_at) || '-',
    }
  })
  const normalRows = rows.filter((row) => row.status === 'normal').length
  const warningRows = rows.filter((row) => row.status === 'warning').length
  const criticalRows = rows.filter((row) => row.status === 'critical').length
  const distribution = [
    { key: 'normal' as const, label: statusMeta.normal.label, count: normalRows },
    { key: 'warning' as const, label: statusMeta.warning.label, count: warningRows },
    { key: 'critical' as const, label: statusMeta.critical.label, count: criticalRows },
  ]
  const maxCount = Math.max(1, ...distribution.map((item) => item.count))

  return (
    <section className="entity-instance-health-panel">
      <div className="entity-instance-health-summary">
        <MetricSummaryCard title={'\u5065\u5eb7\u8bc4\u5206'} value={String(healthScore)} trend={statusMeta[health].label} tone={health === 'critical' ? 'danger' : 'normal'} />
        <MetricSummaryCard title={'\u672a\u6062\u590d\u4e8b\u4ef6'} value={String(criticalRows * 2 + warningRows)} trend={warningRows || criticalRows ? '\u9700\u5173\u6ce8' : '\u6682\u65e0\u5f02\u5e38'} tone={criticalRows > 0 ? 'danger' : 'normal'} />
        <MetricSummaryCard title={'\u76f4\u63a5\u5173\u7cfb'} value={String(relationCount)} trend={`${links.length} \u6761\u62d3\u6251\u5173\u7cfb`} />
      </div>
      <div className="entity-instance-health-bars">
        {distribution.map((item) => (
          <div key={item.key}>
            <span><i style={{ background: statusMeta[item.key].color }} />{item.label}</span>
            <b>{item.count}</b>
            <em><i style={{ width: `${Math.max(6, (item.count / maxCount) * 100)}%`, background: statusMeta[item.key].color }} /></em>
          </div>
        ))}
      </div>
      <table className="entity-instance-health-table">
        <thead>
          <tr>
            <th>{'\u5b9e\u4f53'}</th>
            <th>Domain</th>
            <th>{'\u5065\u5eb7'}</th>
            <th>{'\u4e8b\u4ef6'}</th>
            <th>{'\u6700\u8fd1\u4e0a\u62a5'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td title={row.name}>
                <b>{row.name}</b>
                <small>{row.type}</small>
              </td>
              <td>{row.type.split('.')[0] || '-'}</td>
              <td><span className="entity-status-pill" style={{ background: statusMeta[row.status].color }}>{statusMeta[row.status].label}</span></td>
              <td>{row.events}</td>
              <td>{row.lastSeen}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function EntityTracePanel({ node, links }: { node: TopologyNode; links: EntityRelatedLink[] }) {
  const rows = createTraceRows(node, links)
  const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0)
  const totalErrors = rows.reduce((sum, row) => sum + row.errors, 0)
  const avgLatency = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.latency, 0) / rows.length) : 0

  return (
    <section className="entity-trace-panel">
      <div className="entity-trace-summary">
        <MetricSummaryCard title={'\u8c03\u7528\u6b21\u6570'} value={String(totalCalls)} trend={'\u6700\u8fd115\u5206\u949f'} />
        <MetricSummaryCard title={'\u9519\u8bef\u6570'} value={String(totalErrors)} trend={totalErrors ? '\u9700\u5173\u6ce8' : '\u6682\u65e0\u5f02\u5e38'} tone={totalErrors > 0 ? 'danger' : 'normal'} />
        <MetricSummaryCard title={'\u5e73\u5747\u8017\u65f6'} value={`${avgLatency}ms`} trend={`${rows.length} \u6761\u8c03\u7528\u94fe`} />
      </div>
      <div className="entity-trace-flow" aria-label={'\u8c03\u7528\u94fe\u8def\u5f84'}>
        {rows.length === 0 ? (
          <div className="entity-trace-empty">{'\u6682\u65e0\u8c03\u7528\u94fe\u6570\u636e'}</div>
        ) : (
          rows.slice(0, 4).map((row, index) => (
            <article key={row.id}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <b>{row.source}</b>
              <em>{row.operation}</em>
              <b>{row.target}</b>
              <small>{row.latency}ms</small>
            </article>
          ))
        )}
      </div>
      <table className="entity-trace-table">
        <thead>
          <tr>
            <th>{'\u8c03\u7528\u94fe'}</th>
            <th>{'\u5173\u7cfb'}</th>
            <th>{'\u8c03\u7528\u6b21\u6570'}</th>
            <th>{'\u9519\u8bef'}</th>
            <th>{'\u5e73\u5747\u8017\u65f6'}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td title={`${row.source} -> ${row.target}`}>
                <b>{row.source}</b>
                <small>{row.target}</small>
              </td>
              <td>{row.operation}</td>
              <td>{row.calls}</td>
              <td>{row.errors}</td>
              <td>{row.latency}ms</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function createTraceRows(node: TopologyNode, links: EntityRelatedLink[]) {
  return links.slice(0, 8).map((link, index) => {
    const source = link.direction === 'out' ? node : link.neighbor
    const target = link.direction === 'out' ? link.neighbor : node
    const edgeProps = edgeProperties(link.edge)
    const calls = Math.max(1, Number(edgeProps.calls || edgeProps.count || source.properties.relationCount || 1))
    const errors = Number(edgeProps.errors || 0)
    const latency = Number(edgeProps.latency || edgeProps.duration || 18 + ((index + 1) * 7) + calls)
    return {
      id: link.edge.id,
      source: source.label,
      target: target.label,
      operation: link.edge.type,
      calls,
      errors,
      latency,
    }
  })
}

function edgeProperties(edge: TopologyEdge) {
  return ((edge as unknown as { properties?: Record<string, unknown> }).properties || {}) as Record<string, unknown>
}

function EntityRelationList({
  title,
  emptyText,
  links,
  onSelectNode,
}: {
  title: string
  emptyText: string
  links: EntityRelatedLink[]
  onSelectNode: (node: TopologyNode) => void
}) {
  const rows = links.map((link, index) => {
    const edgeProps = edgeProperties(link.edge)
    const calls = Math.max(1, Number(edgeProps.calls || edgeProps.count || link.neighbor.properties.relationCount || 1))
    const errors = Number(edgeProps.errors || 0)
    const latency = Number(edgeProps.latency || edgeProps.duration || 16 + (index + 1) * 9 + calls)
    return { link, calls, errors, latency }
  })
  const totalCalls = rows.reduce((sum, row) => sum + row.calls, 0)
  const totalErrors = rows.reduce((sum, row) => sum + row.errors, 0)
  const avgLatency = rows.length ? Math.round(rows.reduce((sum, row) => sum + row.latency, 0) / rows.length) : 0

  return (
    <section className="entity-instance-relation-list">
      <header>
        <strong>{title}</strong>
        <span>{links.length} {'\u4e2a\u5173\u8054\u5b9e\u4f53'}</span>
      </header>
      {links.length === 0 ? (
        <p>{emptyText}</p>
      ) : (
        <>
          <div className="entity-relation-summary">
            <MetricSummaryCard title={'\u5173\u8054\u6570'} value={String(links.length)} trend={title} />
            <MetricSummaryCard title={'\u8c03\u7528\u6b21\u6570'} value={String(totalCalls)} trend={'\u6700\u8fd115\u5206\u949f'} />
            <MetricSummaryCard title={'\u5e73\u5747\u8017\u65f6'} value={`${avgLatency}ms`} trend={totalErrors ? `${totalErrors} \u4e2a\u9519\u8bef` : '\u6682\u65e0\u5f02\u5e38'} tone={totalErrors > 0 ? 'danger' : 'normal'} />
          </div>
          <table className="entity-relation-table">
            <thead>
              <tr>
                <th>{'\u5b9e\u4f53'}</th>
                <th>{'\u5173\u7cfb'}</th>
                <th>{'\u8c03\u7528\u6b21\u6570'}</th>
                <th>{'\u9519\u8bef'}</th>
                <th>{'\u5e73\u5747\u8017\u65f6'}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ link, calls, errors, latency }) => (
                <tr key={link.edge.id} onClick={() => onSelectNode(link.neighbor)}>
                  <td title={link.neighbor.label}>
                    <span className="entity-type-icon" style={{ color: link.neighbor.color, borderColor: link.neighbor.color }}>
                      <TopologyPresetIcon preset={resolveTopologyNodeIconPreset(link.neighbor)} label={link.neighbor.type} size={15} />
                    </span>
                    <b>{link.neighbor.label}</b>
                    <small>{link.neighbor.type}</small>
                  </td>
                  <td><em>{link.edge.type}</em></td>
                  <td>{calls}</td>
                  <td>{errors}</td>
                  <td>{latency}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}

function EntityRelatedTopologyCanvas({
  node,
  links,
  onSelectNode,
}: {
  node: TopologyNode
  links: EntityRelatedLink[]
  onSelectNode: (node: TopologyNode) => void
}) {
  const [zoom, setZoom] = useState(100)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showIncoming, setShowIncoming] = useState(true)
  const [showOutgoing, setShowOutgoing] = useState(true)
  const incomingTotal = links.filter((link) => link.direction === 'in').length
  const outgoingTotal = links.filter((link) => link.direction === 'out').length
  const filteredLinks = links.filter((link) => link.direction === 'in' ? showIncoming : showOutgoing)
  const visibleLinks = filteredLinks.slice(0, 12)
  const incoming = visibleLinks.filter((link) => link.direction === 'in')
  const outgoing = visibleLinks.filter((link) => link.direction === 'out')
  const width = 760
  const height = 360
  const centerX = incoming.length > 0 && outgoing.length === 0
    ? width * 0.62
    : outgoing.length > 0 && incoming.length === 0
      ? width * 0.38
      : width / 2
  const center = { x: centerX, y: height / 2 }
  const domainBand = { x: 42, y: center.y - 58, width: width - 84, height: 116 }
  const upstreamLayout = layoutRelatedColumn(incoming, 150, height)
  const downstreamLayout = layoutRelatedColumn(outgoing, width - 150, height)
  const layout = [...upstreamLayout, ...downstreamLayout]
  const legendItems = uniqueRelatedLegend([node, ...visibleLinks.map((link) => link.neighbor)])
  const domain = valueText(node.properties.__domain__) || valueText(node.properties.domain) || 'domain'
  const zoomScale = zoom / 100
  const graphTransform = 'translate(' + center.x + ' ' + center.y + ') scale(' + zoomScale + ') translate(' + (-center.x) + ' ' + (-center.y) + ')'
  const zoomOut = () => setZoom((current) => Math.max(50, current - 10))
  const zoomIn = () => setZoom((current) => Math.min(160, current + 10))
  const resetZoom = () => setZoom(100)
  const fitCanvas = () => setZoom(90)

  return (
    <section className="entity-related-topology-tab">
      <div className="entity-related-topology-head">
        <strong>{'\u5173\u8054\u5b9e\u4f53\u62d3\u6251'}</strong>
        <span>{filteredLinks.length} / {links.length} {'\u6761\u76f4\u63a5\u5173\u7cfb'}</span>
      </div>
      <div className="entity-related-topology-canvas">
        {visibleLinks.length === 0 ? (
          <div className="entity-related-topology-empty">{'\u6682\u65e0\u76f4\u63a5\u5173\u8054\u62d3\u6251'}</div>
        ) : (
          <>
            <div className="entity-related-toolbar">
              <button type="button" aria-label="缩小" onClick={zoomOut} disabled={zoom <= 50}>-</button>
              <b aria-label={'当前缩放 ' + zoom + '%'}>{zoom}%</b>
              <button type="button" aria-label="放大" onClick={zoomIn} disabled={zoom >= 160}>+</button>
              <button type="button" aria-label="适应画布" onClick={fitCanvas}><Maximize2 size={13} /></button>
              <button type="button" aria-label="回到中心" onClick={resetZoom}><Home size={13} /></button>
              <button type="button" aria-label="重置布局" onClick={resetZoom}><RotateCcw size={13} /></button>
              <button
                type="button"
                className={filterOpen ? 'active' : ''}
                aria-label="筛选关系"
                aria-expanded={filterOpen}
                onClick={() => setFilterOpen((open) => !open)}
              >
                <SlidersHorizontal size={13} />
              </button>
            </div>
            {filterOpen && (
              <div className="entity-related-filter-panel" role="group" aria-label="关系筛选">
                <button
                  type="button"
                  className={showIncoming && incomingTotal > 0 ? 'active' : ''}
                  disabled={incomingTotal === 0 || (showIncoming && !showOutgoing)}
                  onClick={() => setShowIncoming((current) => !current)}
                >
                  上游关系 <b>{incomingTotal}</b>
                </button>
                <button
                  type="button"
                  className={showOutgoing && outgoingTotal > 0 ? 'active' : ''}
                  disabled={outgoingTotal === 0 || (showOutgoing && !showIncoming)}
                  onClick={() => setShowOutgoing((current) => !current)}
                >
                  下游关系 <b>{outgoingTotal}</b>
                </button>
              </div>
            )}
            <svg viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={node.label + '\u5173\u8054\u62d3\u6251'}>
              <defs>
                <pattern id="entity-related-grid" width="16" height="16" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#dfe7f1" />
                </pattern>
                <marker id="entity-related-arrow" markerWidth="9" markerHeight="9" refX="8.2" refY="4.5" orient="auto">
                  <path d="M0,0 L9,4.5 L0,9 Z" fill="#7b8797" />
                </marker>
              </defs>
              <rect width={width} height={height} fill="#fff" />
              <rect width={width} height={height} fill="url(#entity-related-grid)" opacity="0.78" />
              <g className="entity-related-viewport" transform={graphTransform} data-zoom={zoom}>
              <rect className="entity-related-domain-band" x={domainBand.x} y={domainBand.y} width={domainBand.width} height={domainBand.height} />
              <text className="entity-related-domain-label" x={domainBand.x + 14} y={domainBand.y + 24}>{domain}</text>
              <g className="entity-related-edges">
                {layout.map(({ link, x, y }) => {
                  const source = link.direction === 'out' ? center : { x, y }
                  const target = link.direction === 'out' ? { x, y } : center
                  const elbowOffset = link.direction === 'out' ? 72 : -72
                  const path = 'M ' + source.x + ' ' + source.y
                    + ' C ' + (source.x + elbowOffset) + ' ' + source.y
                    + ', ' + (target.x - elbowOffset) + ' ' + target.y
                    + ', ' + target.x + ' ' + target.y
                  const midX = (source.x + target.x) / 2
                  const midY = (source.y + target.y) / 2
                  const labelWidth = Math.min(64, Math.max(42, link.edge.type.length * 6 + 16))
                  return (
                    <g key={link.edge.id}>
                      <path d={path} markerEnd="url(#entity-related-arrow)" />
                      <rect x={midX - labelWidth / 2} y={midY - 10} width={labelWidth} height="20" rx="2" />
                      <text x={midX} y={midY + 4}>{link.edge.type}</text>
                    </g>
                  )
                })}
              </g>
              <g className="entity-related-nodes">
                {layout.map(({ link, x, y }) => (
                  <RelatedTopologyNodeCard key={link.edge.id} node={link.neighbor} x={x} y={y} onSelect={() => onSelectNode(link.neighbor)} />
                ))}
                <RelatedTopologyNodeCard node={node} x={center.x} y={center.y} current />
              </g>
              </g>
            </svg>
            <div className="entity-related-minimap" aria-hidden="true">
              <svg viewBox={'0 0 ' + width + ' ' + height}>
                <rect width={width} height={height} />
                {layout.map(({ link, x, y }) => <rect key={link.edge.id} x={x - 20} y={y - 8} width="40" height="16" />)}
                <rect className="current" x={center.x - 24} y={center.y - 10} width="48" height="20" />
              </svg>
            </div>
            <div className="entity-related-legend">
              {legendItems.map((item) => (
                <span key={item.type}>
                  <i style={{ background: item.color }} />
                  {entityTypeDisplayName(item.type)}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
      {links.length > visibleLinks.length && (
        <p className="entity-related-topology-more">{'\u5df2\u5c55\u793a\u524d'} {visibleLinks.length} {'\u6761\u76f4\u63a5\u5173\u7cfb\uff0c\u5171'} {links.length} {'\u6761\u3002'}</p>
      )}
    </section>
  )
}

function RelatedTopologyNodeCard({
  node,
  x,
  y,
  current = false,
  onSelect,
}: {
  node: TopologyNode
  x: number
  y: number
  current?: boolean
  onSelect?: () => void
}) {
  const width = current ? 184 : 158
  const height = current ? 64 : 58
  const relationCount = Number(node.properties.relationCount || 0)
  const stackDepth = Math.min(2, Math.max(0, relationCount - 1))
  return (
    <g className={current ? 'current' : onSelect ? 'selectable' : ''} transform={'translate(' + (x - width / 2) + ' ' + (y - height / 2) + ')'} onClick={onSelect}>
      {stackDepth > 1 && <rect className="stack" x="8" y="-8" width={width} height={height} rx="2" style={{ stroke: node.color }} />}
      {stackDepth > 0 && <rect className="stack" x="4" y="-4" width={width} height={height} rx="2" style={{ stroke: node.color }} />}
      <rect width={width} height={height} rx="2" style={{ stroke: node.color }} />
      <rect className="accent" x="0" y="0" width={width} height="4" style={{ fill: node.color }} />
      <circle cx="20" cy="21" r="8" fill={node.color} />
      <text className="title" x="36" y="22">{truncateSvgText(node.label, current ? 18 : 15)}</text>
      <text className="count" x={width - 12} y="22" textAnchor="end">{'\u6570\u91cf: '}{relationCount}</text>
      <text className="type" x="14" y={height - 13}>{'\u7c7b\u578b: '}{truncateSvgText(node.type, current ? 24 : 20)}</text>
    </g>
  )
}

function layoutRelatedColumn(links: EntityRelatedLink[], x: number, height: number) {
  const total = Math.max(links.length, 1)
  const available = Math.min(260, Math.max(90, total * 70))
  const startY = height / 2 - available / 2
  return links.map((link, index) => ({
    link,
    x,
    y: startY + ((index + 0.5) * available) / total,
  }))
}

function uniqueRelatedLegend(nodes: TopologyNode[]) {
  const byType = new Map<string, { type: string; color: string }>()
  nodes.forEach((node) => {
    if (!byType.has(node.type)) byType.set(node.type, { type: node.type, color: node.color })
  })
  return [...byType.values()].slice(0, 6)
}

function MetricSummaryCard({ title, value, trend, tone = 'normal' }: { title: string; value: string; trend: string; tone?: 'normal' | 'danger' }) {
  return (
    <article className={`entity-instance-metric-card ${tone}`}>
      <span>{title}</span>
      <b>{value}</b>
      <small>{trend}</small>
    </article>
  )
}

function EntityHealthGrid({ records, onSelect }: { records: EntityRecord[]; onSelect: (record: EntityRecord) => void }) {
  const [healthFilter, setHealthFilter] = useState<EntityStatus | 'all'>('all')
  const stats = summarizeEntities(records)
  const total = Math.max(records.length, 1)
  const score = Math.round((stats.normal / total) * 100)
  const buckets: Array<{ key: EntityStatus | 'all'; label: string; count: number; color: string }> = [
    { key: 'all', label: '全部', count: records.length, color: '#94a3b8' },
    { key: 'normal', label: '正常', count: stats.normal, color: statusMeta.normal.color },
    { key: 'warning', label: '警告', count: stats.warning, color: statusMeta.warning.color },
    { key: 'critical', label: '严重', count: stats.critical, color: statusMeta.critical.color },
  ]
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.count))
  const visibleRecords = healthFilter === 'all' ? records : records.filter((record) => record.status === healthFilter)
  return (
    <div className="entity-health-grid">
      <div className="entity-health-overview">
        <div>
          <span>健康分</span>
          <b>{score}</b>
          <small>{stats.normal} / {records.length} 正常实体</small>
        </div>
        <div>
          <span>未恢复事件</span>
          <b>{stats.openEvents}</b>
          <small>{stats.criticalEvents} 严重 · {stats.warningEvents} 警告</small>
        </div>
        <div>
          <span>异常实体</span>
          <b>{stats.warning + stats.critical}</b>
          <small>{stats.critical} 严重 · {stats.warning} 警告</small>
        </div>
      </div>
      <div className="entity-health-toolbar">
        <div className="entity-health-bars">
          {buckets.map((bucket) => (
            <button
              key={bucket.key}
              type="button"
              className={healthFilter === bucket.key ? 'active' : ''}
              onClick={() => setHealthFilter(bucket.key)}
            >
              <span><i style={{ background: bucket.color }} />{bucket.label}</span>
              <b>{bucket.count.toLocaleString()}</b>
              <em><i style={{ width: `${Math.max(8, Math.round((bucket.count / maxBucket) * 100))}%`, background: bucket.color }} /></em>
            </button>
          ))}
        </div>
        <span>当前显示 {visibleRecords.length.toLocaleString()} 个实体 · 目前仅已接入实体参与健康度计算</span>
      </div>
      <table className="entity-health-table">
        <thead>
          <tr>
            <th aria-label="选择实体"><input type="checkbox" aria-label="选择全部健康实体" /></th>
            <th>实体</th>
            <th>实体类型</th>
            <th>实例 ID</th>
            <th>健康度</th>
            <th>未恢复事件</th>
            <th>关联数</th>
            <th>最近上报</th>
          </tr>
        </thead>
        <tbody>
          {visibleRecords.map((record) => (
            <tr key={record.id} onClick={() => onSelect(record)}>
              <td onClick={(event) => event.stopPropagation()}>
                <input type="checkbox" aria-label={`选择 ${record.label}`} readOnly />
              </td>
              <td>
                <div className="entity-row-title">
                  <button
                    className={record.starred ? 'entity-row-star active' : 'entity-row-star'}
                    type="button"
                    aria-label={record.starred ? '已关注实体' : '关注实体'}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Star size={14} />
                  </button>
                  <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
                    <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={16} />
                  </span>
                  <span>
                    <b>{record.label}</b>
                    <small>{record.domain}</small>
                  </span>
                </div>
              </td>
              <td><span className="entity-type-tag">{record.type}</span></td>
              <td title={entityInstanceId(record)}>{entityInstanceId(record)}</td>
              <td><StatusPill status={record.status} /></td>
              <td><span className={record.events > 0 ? 'entity-event-count warning' : 'entity-event-count'}>{record.events}</span></td>
              <td>{Number(record.properties.relationCount || 0)}</td>
              <td>{record.lastSeen}</td>
            </tr>
          ))}
          {visibleRecords.length === 0 && (
            <tr className="entity-health-empty-row">
              <td colSpan={8}>暂无{healthFilter === 'all' ? '' : statusMeta[healthFilter].label}实体</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function EntityDetail({
  record,
  data,
  onClose,
  onSelectNode,
}: {
  record: EntityRecord | null
  data: TopologyExplorerData
  onClose: () => void
  onSelectNode: (node: TopologyNode) => void
}) {
  const [activeTab, setActiveTab] = useState<EntityDetailTab>('detail')
  const [relationFilter, setRelationFilter] = useState<EntityRelationFilter>('all')
  const node = record ? data.nodesById.get(record.id) || null : null
  const relatedLinks = useMemo(() => node ? relatedLinksForInstance(data, node) : [], [data, node])

  useEffect(() => {
    setActiveTab('detail')
    setRelationFilter('all')
  }, [record?.id])

  if (!record) return null

  const providedLinks = relatedLinks.filter((link) => link.direction === 'out')
  const dependencyLinks = relatedLinks.filter((link) => link.direction === 'in')
  const filteredRelationLinks = relationFilter === 'provided'
    ? providedLinks
    : relationFilter === 'dependency'
      ? dependencyLinks
      : relatedLinks
  const relationTitle = relationFilter === 'provided' ? '提供服务' : relationFilter === 'dependency' ? '依赖服务' : '关联项'
  const tabs: Array<{ key: EntityDetailTab; label: string; count?: number; disabled?: boolean; dropdown?: boolean }> = [
    { key: 'detail', label: '实体详情' },
    { key: 'topology', label: '关联拓扑', count: relatedLinks.length, disabled: !node, dropdown: true },
    { key: 'trace', label: '会话追踪', disabled: !node },
    { key: 'page', label: '页面访问', disabled: !node },
    { key: 'heatmap', label: '热力图分析', disabled: !node },
    { key: 'resource', label: '资源加载', disabled: !node },
    { key: 'api', label: 'API请求', disabled: !node },
    { key: 'exception', label: '异常统计', disabled: !node },
    { key: 'customEvent', label: '自定义事件', disabled: !node },
    { key: 'customLog', label: '自定义日志', disabled: !node },
    { key: 'settings', label: '应用设置', disabled: !node, dropdown: true },
    { key: 'logSearch', label: '日志探索', count: relatedLinks.length, disabled: !node, dropdown: true },
    { key: 'related', label: '关联项', count: relatedLinks.length, disabled: !node, dropdown: true },
  ]

  return (
    <aside className="entity-detail">
      <div className="entity-detail-head">
        <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
          <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={24} />
        </span>
        <div className="entity-detail-title">
          <strong>{record.label}</strong>
          <span>{record.type}</span>
        </div>
        <div className="entity-detail-actions">
          <button className="entity-detail-time-range" type="button" aria-label="时间范围 最近15分钟">
            <em>15min</em>
            <b>最近15分钟</b>
          </button>
          <button className="entity-detail-icon-action" type="button" aria-label="刷新实体详情" title="刷新">
            <RefreshCw size={16} />
          </button>
          <button className="entity-detail-assistant" type="button" aria-label="智能助手" title="智能助手">
            <Sparkles size={17} />
          </button>
          <button className="entity-detail-close" type="button" onClick={onClose} aria-label="关闭实体详情" title="关闭">
            <X size={16} />
          </button>
        </div>
      </div>
      <div className="entity-detail-meta">
        <StatusPill status={record.status} />
        <span>{relatedLinks.length} 条直接关系</span>
      </div>
      <nav className="entity-detail-tabs" aria-label="实体详情视图">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? 'active' : ''}
            disabled={tab.disabled}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            {typeof tab.count === 'number' && <em>{tab.count}</em>}
            {tab.dropdown && <ChevronDown size={14} />}
          </button>
        ))}
      </nav>
      {activeTab === 'topology' && (
        <div className="entity-detail-tab-menu">
          <button className="active" type="button">关联实体拓扑</button>
          <button type="button">UModel 探索</button>
        </div>
      )}
      {activeTab === 'settings' && (
        <div className="entity-detail-tab-menu">
          <button className="active" type="button">应用设置</button>
          <button type="button">采集配置</button>
          <button type="button">告警配置</button>
        </div>
      )}
      {activeTab === 'logSearch' && (
        <div className="entity-detail-tab-menu">
          <button className="active" type="button">日志探索</button>
          <button type="button">原始日志</button>
          <button type="button">关联日志</button>
        </div>
      )}
      {activeTab === 'related' && (
        <div className="entity-detail-tab-menu">
          <button className={relationFilter === 'all' ? 'active' : ''} type="button" onClick={() => setRelationFilter('all')}>关联项</button>
          <button className={relationFilter === 'provided' ? 'active' : ''} type="button" onClick={() => setRelationFilter('provided')}>提供服务 {providedLinks.length}</button>
          <button className={relationFilter === 'dependency' ? 'active' : ''} type="button" onClick={() => setRelationFilter('dependency')}>依赖服务 {dependencyLinks.length}</button>
        </div>
      )}
      <div className="entity-detail-body">
        {activeTab === 'detail' && (
          <dl>
            <dt>Domain</dt><dd>{record.domain}</dd>
            <dt>应用</dt><dd>{record.app}</dd>
            <dt>IP</dt><dd>{record.properties.ip}</dd>
            <dt>Host</dt><dd>{record.properties.host}</dd>
            <dt>连接数</dt><dd>{record.properties.relationCount}</dd>
            <dt>未恢复事件</dt><dd>{record.events}</dd>
            <dt>最近上报</dt><dd>{record.lastSeen}</dd>
          </dl>
        )}
        {activeTab === 'topology' && node && (
          <EntityRelatedTopologyCanvas node={node} links={relatedLinks} onSelectNode={onSelectNode} />
        )}
        {activeTab === 'trace' && node && (
          <EntityTracePanel node={node} links={relatedLinks} />
        )}
        {activeTab === 'exception' && node && (
          <EntityInstanceHealthPanel node={node} links={relatedLinks} />
        )}
        {activeTab === 'related' && node && (
          <EntityRelationList title={relationTitle} emptyText={relationFilter === 'provided' ? '暂无提供服务' : relationFilter === 'dependency' ? '暂无依赖服务' : '暂无关联项'} links={filteredRelationLinks} onSelectNode={onSelectNode} />
        )}
        {activeTab === 'page' && node && <EntityInstanceEmptyTab title="页面访问" description="当前实体暂无页面访问数据" />}
        {activeTab === 'heatmap' && node && <EntityInstanceEmptyTab title="热力图分析" description="当前实体暂无热力图数据" />}
        {activeTab === 'resource' && node && <EntityInstanceEmptyTab title="资源加载" description="当前实体暂无资源加载明细" />}
        {activeTab === 'api' && node && <EntityInstanceEmptyTab title="API请求" description="当前实体暂无 API 请求明细" />}
        {activeTab === 'customEvent' && node && <EntityInstanceEmptyTab title="自定义事件" description="当前实体暂无自定义事件" />}
        {activeTab === 'customLog' && node && <EntityInstanceEmptyTab title="自定义日志" description="当前实体暂无自定义日志" />}
        {activeTab === 'settings' && node && <EntityInstanceEmptyTab title="应用设置" description="请在工作空间管理中配置该实体的应用设置" />}
        {activeTab === 'logSearch' && node && <EntityLogSearchPanel node={node} links={relatedLinks} />}
        {activeTab !== 'detail' && !node && (
          <EntityInstanceEmptyTab title="关联拓扑" description="当前实体暂未匹配到后端拓扑节点" />
        )}
      </div>
    </aside>
  )
}

function StatusPill({ status }: { status: EntityStatus }) {
  const meta = statusMeta[status]
  return <span className={`entity-status-pill status-${status}`}><i style={{ background: meta.color }} />{meta.label}</span>
}

interface ReferenceTopologyNode {
  id: string
  type: string
  instances: TopologyNode[]
  x: number
  y: number
  width: number
  height: number
  title: string
  subtitle: string
  color: string
  access: number
  barWidth: number
}

interface ReferenceTopologyEdge {
  id: string
  source: ReferenceTopologyNode
  target: ReferenceTopologyNode
  label: string
  showLabel?: boolean
}

interface EntityRelatedLink {
  edge: TopologyEdge
  neighbor: TopologyNode
  direction: 'in' | 'out'
}

function createReferenceStyleTopology(data: TopologyExplorerData, focusedTypes: string[]) {
  const focused = new Set(focusedTypes)
  const sourceNodes = focusedTypes.length > 0
    ? data.nodes.filter((node) => focused.has(stripSyntheticType(node.type)))
    : data.nodes
  const grouped = new Map<string, TopologyNode[]>()
  sourceNodes.forEach((node) => {
    const instances = grouped.get(node.type) || []
    instances.push(node)
    grouped.set(node.type, instances)
  })
  const coordinates = referenceTopologyCoordinates()
  const nodes = [...grouped.entries()].slice(0, 90).map(([type, instances], index) => {
    const sample = instances[0]
    const coordinate = coordinates[index] || fallbackReferenceCoordinate(index)
    const width = Math.max(290, Math.min(380, (coordinate.width || 43) * 6.8, type.length * 9 + 150))
    return {
      id: type,
      type,
      instances,
      x: coordinate.x,
      y: coordinate.y,
      width,
      height: Math.max(74, (coordinate.height || 18) * 4.4),
      title: entityTypeDisplayName(type),
      subtitle: type,
      color: sample?.color || '#5b9df1',
      access: instances.reduce((sum, node) => sum + Number(node.properties.relationCount || 0), 0),
      barWidth: Math.max(86, Math.min(128, width * 0.42)),
    }
  })
  const edges: ReferenceTopologyEdge[] = []
  const nodesByType = new Map(nodes.map((item) => [item.type, item]))
  data.edges.forEach((edge) => {
    const sourceNode = data.nodesById.get(edge.source)
    const targetNode = data.nodesById.get(edge.target)
    if (!sourceNode || !targetNode) return
    const source = nodesByType.get(sourceNode.type)
    const target = nodesByType.get(targetNode.type)
    if (!source || !target || source.id === target.id) return
    edges.push({ id: edge.id, source, target, label: edge.type, showLabel: edges.length < 4 })
  })
  return { nodes, edges }
}

function relatedLinksForInstance(data: TopologyExplorerData, node: TopologyNode): EntityRelatedLink[] {
  return data.edges.reduce<EntityRelatedLink[]>((links, edge) => {
    if (edge.source === node.id) {
      const neighbor = data.nodesById.get(edge.target)
      if (neighbor) links.push({ edge, neighbor, direction: 'out' })
    } else if (edge.target === node.id) {
      const neighbor = data.nodesById.get(edge.source)
      if (neighbor) links.push({ edge, neighbor, direction: 'in' })
    }
    return links
  }, [])
}

function truncateSvgText(text: string, limit: number) {
  return text.length > limit ? `${text.slice(0, Math.max(0, limit - 1))}...` : text
}

function entityTagCount(node: TopologyNode) {
  return Object.keys(node.properties).filter((key) => !key.startsWith('__') && valueText(node.properties[key])).length
}

function referenceNodeDomain(node: ReferenceTopologyNode) {
  return node.type.split('.')[0] || node.type
}

function countTopologyOptions<T>(items: T[], getKey: (item: T) => string) {
  const counts = new Map<string, number>()
  items.forEach((item) => {
    const key = getKey(item) || '-'
    counts.set(key, (counts.get(key) || 0) + 1)
  })
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
}

function entityTypeDisplayName(type: string) {  const tail = type.split('.').filter(Boolean).slice(-1)[0] || type
  return tail
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function fallbackReferenceCoordinate(index: number) {
  const column = index % 10
  const row = Math.floor(index / 10)
  return {
    x: 620 + column * 124,
    y: 120 + row * 68,
    width: 43,
    height: 18,
  }
}

function referenceTopologyCoordinates() {
  return [
    { x: 590, y: 99 }, { x: 1042, y: 142, width: 41 }, { x: 619, y: 230, width: 41, height: 13 },
    { x: 732, y: 186, width: 39, height: 13 }, { x: 775, y: 230, width: 41, height: 13 },
    { x: 850, y: 230, height: 17 }, { x: 737, y: 273, width: 39 }, { x: 678, y: 317, width: 41 },
    { x: 743, y: 317, height: 17 }, { x: 694, y: 360, width: 41 }, { x: 678, y: 404 },
    { x: 728, y: 404, width: 41 }, { x: 693, y: 448, height: 17 }, { x: 743, y: 448, height: 17 },
    { x: 906, y: 448, height: 17 }, { x: 956, y: 448, width: 41, height: 17 },
    { x: 1032, y: 448, height: 17 }, { x: 693, y: 491 }, { x: 743, y: 491 },
    { x: 830, y: 491, width: 41 }, { x: 931, y: 491 }, { x: 981, y: 491, width: 41 },
    { x: 1032, y: 491 }, { x: 673, y: 535, width: 41 }, { x: 880, y: 535, width: 41 },
    { x: 931, y: 535, height: 17 }, { x: 649, y: 578, height: 13 }, { x: 1043, y: 578, width: 41 },
    { x: 896, y: 579, height: 17 }, { x: 746, y: 643, width: 41 }, { x: 867, y: 643 },
    { x: 967, y: 643, width: 41, height: 13 }, { x: 1063, y: 687, width: 39, height: 13 },
    { x: 1119, y: 643, height: 13 }, { x: 1237, y: 687, height: 13 }, { x: 1358, y: 687, height: 13 },
    { x: 866, y: 731, width: 41, height: 17 }, { x: 1240, y: 731, height: 13 },
    { x: 1320, y: 731, height: 13 }, { x: 1410, y: 731, width: 41, height: 17 },
    { x: 1118, y: 796, width: 41, height: 17 }, { x: 1480, y: 731, height: 17 },
    { x: 1378, y: 767, height: 17 }, { x: 967, y: 796, height: 13 },
    { x: 1018, y: 796, height: 13 }, { x: 1169, y: 796, height: 17 },
    { x: 1219, y: 796, width: 41, height: 17 }, { x: 1269, y: 796, width: 41, height: 13 },
    { x: 1335, y: 796, height: 17 }, { x: 1400, y: 796, height: 17 }, { x: 1480, y: 796, height: 17 },
    { x: 1219, y: 839, width: 41 }, { x: 1270, y: 839 }, { x: 1367, y: 839, width: 41 },
    { x: 697, y: 875, width: 41, height: 13 }, { x: 830, y: 948, width: 41 },
    { x: 1195, y: 948, width: 41 }, { x: 1510, y: 904 }, { x: 1610, y: 948, width: 41 },
    { x: 1661, y: 904 }, { x: 1711, y: 904, width: 41 }, { x: 1762, y: 904 },
    { x: 1661, y: 948, height: 13 }, { x: 1761, y: 948, width: 41 },
    { x: 1812, y: 948 }, { x: 1913, y: 948 }, { x: 1963, y: 948, width: 41 },
    { x: 2013, y: 948 }, { x: 2064, y: 948 }, { x: 1580, y: 1036 },
    { x: 1635, y: 1038 }, { x: 1690, y: 1040 }, { x: 1745, y: 1042 },
    { x: 1800, y: 1044 }, { x: 1855, y: 1046 }, { x: 1910, y: 1048 },
    { x: 1965, y: 1050 }, { x: 2020, y: 1052 }, { x: 2075, y: 1054 },
    { x: 2130, y: 1056 }, { x: 2185, y: 1058 }, { x: 1605, y: 1100 },
    { x: 1660, y: 1102 }, { x: 1715, y: 1104 }, { x: 1770, y: 1106 },
    { x: 1825, y: 1108 }, { x: 1880, y: 1110 }, { x: 1935, y: 1112 },
    { x: 1990, y: 1114 }, { x: 2045, y: 1116 },
  ]
}

function referenceEdgePath(edge: ReferenceTopologyEdge) {
  const sourceCenterX = edge.source.x + edge.source.width / 2
  const sourceCenterY = edge.source.y + edge.source.height / 2
  const targetCenterX = edge.target.x + edge.target.width / 2
  const targetCenterY = edge.target.y + edge.target.height / 2
  const vertical = Math.abs(targetCenterY - sourceCenterY) > Math.abs(targetCenterX - sourceCenterX) * 0.35
  const sourceX = sourceCenterX
  const sourceY = vertical && targetCenterY > sourceCenterY ? edge.source.y + edge.source.height : vertical ? edge.source.y : sourceCenterY
  const targetX = targetCenterX
  const targetY = vertical && targetCenterY > sourceCenterY ? edge.target.y : vertical ? edge.target.y + edge.target.height : targetCenterY
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const curve = Math.max(48, Math.min(330, Math.abs(dx) * 0.48 + Math.abs(dy) * 0.12))
  const direction = dx >= 0 ? 1 : -1
  const lift = Math.max(-150, Math.min(150, dy * 0.18))
  const bow = Math.max(-88, Math.min(88, dx * 0.065))
  return `M ${sourceX} ${sourceY} C ${sourceX + curve * direction} ${sourceY + lift - bow}, ${targetX - curve * direction} ${targetY - lift + bow}, ${targetX} ${targetY}`
}

function referenceIconPath(type: string) {
  if (type.includes('database') || type.includes('Database') || type.includes('RDS') || type.includes('ClickHouse')) return 'M2 4 C2 2 14 2 14 4 V12 C14 14 2 14 2 12 Z M2 4 C2 6 14 6 14 4 M2 8 C2 10 14 10 14 8'
  if (type.includes('Kafka') || type.includes('消息')) return 'M8 2 L14 5.5 V12.5 L8 16 L2 12.5 V5.5 Z M8 2 V8 M2 5.5 L8 8 L14 5.5'
  if (type.includes('API') || type.includes('接口')) return 'M3 8 H13 M8 3 V13 M4 4 L12 12 M12 4 L4 12'
  if (type.includes('Agent') || type.includes('模型') || type.includes('工具')) return 'M3 12 C4 6 12 6 13 12 M5 12 H11 M8 3 V6 M5 15 L11 15'
  return 'M3 3 H13 V13 H3 Z M5 6 H11 M5 9 H11'
}

function createEntityRecords(nodes: TopologyNode[]): EntityRecord[] {
  return nodes.map((node, index) => toEntityRecord(node, index + 1))
}

function toEntityRecord(node: TopologyNode, sequence: number): EntityRecord {
  const status = entityStatus(node, sequence)
  const events = status === 'critical' ? 2 : status === 'warning' ? 1 : 0
  const domain = valueText(node.properties.__domain__) || valueText(node.properties.domain) || 'unknown'
  const app = valueText(node.properties.app)
    || valueText(node.properties.application)
    || valueText(node.properties.service)
    || valueText(node.properties.namespace)
    || valueText(node.properties.environment)
    || '-'
  const relationCount = Number(node.properties.relationCount || 0)
  return {
    id: node.id,
    label: node.label || node.id,
    type: node.type,
    color: node.color,
    iconPreset: node.iconPreset,
    properties: {
      ...node.properties,
      id: node.id,
      ip: valueText(node.properties.ip) || '-',
      host: valueText(node.properties.host) || valueText(node.properties.hostname) || '-',
      relationCount,
    },
    domain,
    app,
    status,
    events,
    changeEvents: Number(node.properties.changeEvents || node.properties.change_events || 0),
    lastSeen: formatLastSeen(node.properties.__last_observed_time__) || formatLastSeen(node.properties.updated_at) || '-',
    starred: booleanProperty(node.properties.starred) || booleanProperty(node.properties.favorite),
  }
}

function summarizeEntities(records: EntityRecord[]) {
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
    domainCount: domainsSeen.size,
    typeCount: typesSeen.size,
    critical,
    warning,
    normal,
    criticalEvents,
    errorEvents: 0,
    warningEvents,
    infoEvents,
    openEvents: criticalEvents + warningEvents + infoEvents,
    changeEvents: records.reduce((sum, record) => sum + record.changeEvents, 0),
  }
}

function filterRecordsForDrilldown(records: EntityRecord[], drilldown: EntityDrilldown | null) {
  if (!drilldown) return records
  const token = drilldown.token.toLowerCase()
  return records.filter((record) => {
    if (drilldown.kind === 'domain') return record.domain.toLowerCase() === token
    return [record.type, record.label, record.domain, record.app].join(' ').toLowerCase().includes(token)
  })
}

function createCatalogDomainGroups(records: EntityRecord[], query: string): EntityCatalogDomainGroup[] {
  const grouped = new Map<string, { count: number; types: Map<string, EntityCatalogTypeItem> }>()
  records.forEach((record) => {
    const domain = record.domain || 'unknown'
    const domainGroup = grouped.get(domain) || { count: 0, types: new Map<string, EntityCatalogTypeItem>() }
    const typeItem = domainGroup.types.get(record.type) || {
      key: record.type,
      label: entityTypeDisplayName(record.type),
      count: 0,
      color: record.color,
      iconPreset: resolveEntityIconPreset(record),
    }
    typeItem.count += 1
    domainGroup.count += 1
    domainGroup.types.set(record.type, typeItem)
    grouped.set(domain, domainGroup)
  })

  const search = query.trim().toLowerCase()
  return [...grouped.entries()]
    .map(([domain, group]) => {
      const items = [...group.types.values()]
        .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
      const visibleItems = search
        ? items.filter((item) => [domain, item.key, item.label].join(' ').toLowerCase().includes(search))
        : items
      return {
        key: domain,
        title: domain,
        summary: `${visibleItems.length.toLocaleString()} 类实体`,
        count: group.count,
        items: visibleItems,
      }
    })
    .filter((group) => group.items.length > 0 || group.title.toLowerCase().includes(search))
    .sort((left, right) => right.count - left.count || left.title.localeCompare(right.title))
}

function createEntityScopeTabs(records: EntityRecord[]): EntityScopeTab[] {
  const presets: Array<{ key: EntityScopePreset; label: string }> = [
    { key: 'all', label: '所有实体' },
    { key: 'applications', label: '应用列表' },
    { key: 'k8s', label: 'K8s集群' },
    { key: 'ecs', label: 'ECS 列表' },
    { key: 'rds', label: 'RDS 列表' },
    { key: 'rum', label: 'RUM 应用' },
  ]
  return presets.map((preset) => {
    if (preset.key === 'all') return { ...preset, count: records.length }
    return {
      ...preset,
      count: records.filter((record) => matchesEntityScopePreset(record, preset.key)).length,
    }
  })
}

function matchesEntityScopePreset(record: EntityRecord, preset: EntityScopePreset) {
  if (preset === 'all') return true
  const text = [
    record.label,
    record.type,
    stripSyntheticType(record.type),
    record.domain,
    record.app,
  ].join(' ').toLowerCase()
  if (preset === 'applications') return ['service', 'application', ' app', 'apm', '应用'].some((keyword) => text.includes(keyword))
  if (preset === 'k8s') return ['k8s', 'kubernetes', 'cluster', 'workload', 'pod'].some((keyword) => text.includes(keyword))
  if (preset === 'ecs') return ['ecs', 'compute', 'host', 'vm', 'server'].some((keyword) => text.includes(keyword))
  if (preset === 'rds') return ['rds', 'database', 'mysql', 'postgres', 'redis', 'mongodb'].some((keyword) => text.includes(keyword))
  return ['rum', 'browser', 'frontend', 'webapp'].some((keyword) => text.includes(keyword))
}

function createEntityMetricRows(records: EntityRecord[]) {
  return records.slice(0, 10).map((record, index) => {
    const sequence = entitySequence(record)
    const relationCount = Number(record.properties.relationCount || 0)
    const active = record.status !== 'normal' || relationCount > 0
    return {
      name: record.label,
      probe: valueText(record.properties.__method__) || 'EntityStore',
      language: valueText(record.properties.language) || '-',
      region: valueText(record.properties.region) || record.domain,
      calls: relationCount ? String(relationCount) : String(Math.max(0, sequence % 7)),
      errors: record.status === 'critical' ? '1' : '0',
      latency: active ? `${18 + ((sequence + index) % 82)} ms` : '0',
      tokens: active ? `${Math.max(1, (sequence + relationCount) % 99)}K` : '0',
      active,
    }
  })
}

function entitySequence(record: EntityRecord) {
  let hash = 0
  for (let index = 0; index < record.id.length; index += 1) {
    hash = ((hash << 5) - hash) + record.id.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash) + 1
}

function entityStatus(node: TopologyNode, sequence: number): EntityStatus {
  const explicit = valueText(node.properties.status || node.properties.health || node.properties.state).toLowerCase()
  if (['critical', 'severe', 'error', 'failed'].includes(explicit)) return 'critical'
  if (['warning', 'warn', 'degraded'].includes(explicit)) return 'warning'
  if (Number(node.properties.events || 0) > 1) return 'warning'
  if (sequence % 97 === 0) return 'critical'
  if (sequence % 17 === 0) return 'warning'
  return 'normal'
}

function formatLastSeen(value: unknown) {
  const text = valueText(value)
  if (!text) return ''
  const numeric = Number(text)
  if (Number.isFinite(numeric) && numeric > 0) {
    const timestamp = numeric > 1_000_000_000_000 ? numeric : numeric * 1000
    const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000))
    if (minutes < 1) return '刚刚'
    if (minutes < 60) return `${minutes} \u5206\u949f\u524d`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours} \u5c0f\u65f6\u524d`
    const days = Math.round(hours / 24)
    if (days < 30) return `${days} \u5929\u524d`
    const months = Math.round(days / 30)
    return `${months} \u4e2a\u6708\u524d`
  }
  return text
}

function valueText(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

function booleanProperty(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase())
  if (typeof value === 'number') return value !== 0
  return false
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
  if (view === 'health') return '\u5065\u5eb7\u5ea6\u89c6\u56fe'
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
