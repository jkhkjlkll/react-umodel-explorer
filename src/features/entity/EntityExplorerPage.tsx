import { type CSSProperties, type MouseEvent, type PointerEvent, type WheelEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
type EntityAggregateSortKey = 'name' | 'tags' | 'probe' | 'language' | 'region' | 'latency' | 'instanceId' | 'type' | 'created' | 'updated'
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
  initialView = 'table',
  topologyOnly = false,
  openTopologyToken = 0,
}: {
  api: UModelApiClient
  workspaceId: string
  refreshToken: number
  initialView?: EntityView
  topologyOnly?: boolean
  openTopologyToken?: number
}) {
  const [data, setData] = useState<TopologyExplorerData>(emptyEntityTopologyData)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const records = useMemo(() => createEntityRecords(data.nodes), [data.nodes])
  const [view, setView] = useState<EntityView>(initialView)
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

  useEffect(() => {
    if (!openTopologyToken) return
    setDrilldown(null)
    setQuery('')
    setQueryDraft('')
    setMainSuggestOpen(false)
    setSearchCategoryOpen(false)
    setCatalogSuggestOpen(false)
    setView('topology')
  }, [openTopologyToken])

  useEffect(() => {
    if (!topologyOnly) return
    setDrilldown(null)
    setView('topology')
  }, [topologyOnly])

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
    return []
  }, [selectedType])
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
    <div className={topologyOnly ? 'entity-page topology-only' : 'entity-page'}>
      <main className="entity-main">
        {!topologyOnly && (
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
        )}

        <section className="entity-content">
          {drilldown ? (
            <EntityDrilldownResult
              data={data}
              selection={drilldown}
              records={drilldownRecords}
              selected={selected}
              onBack={clearDrilldown}
              onSelect={(record) => {
                setSelected(record)
                setSelectedTopoNode(data.nodesById.get(record.id) || null)
              }}
            />
          ) : view === 'topology' ? (
            <EntityTopologyView
              data={data}
              focusedTypes={topologyTypes}
              focusSelection={!topologyOnly}
              overlayPanel={topologyOnly}
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
              onResetFocus={() => {
                setSelectedTopScope('all')
                setSelectedDomain('all')
                setSelectedType('all')
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

              <div className={view === 'health' ? 'entity-lower-grid with-result-panel' : 'entity-lower-grid'}>
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
  const warningPercent = Math.round((stats.warning / Math.max(1, stats.total)) * 100)
  const criticalPercent = Math.round((stats.critical / Math.max(1, stats.total)) * 100)
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
        <div
          className="entity-health-score"
          style={{
            background: `conic-gradient(${statusMeta.normal.color} 0 ${normalPercent}%, ${statusMeta.warning.color} ${normalPercent}% ${normalPercent + warningPercent}%, ${statusMeta.critical.color} ${normalPercent + warningPercent}% ${normalPercent + warningPercent + criticalPercent}%, #edf1f7 0)`,
          }}
        >
          <span className="entity-health-score-inner">
            <b>{normalPercent}%</b>
            <small>正常</small>
          </span>
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
                <span className="entity-catalog-recent-meta">
                  <em>{entityTypeDisplayName(record.type)}</em>
                  <small>{record.lastSeen || '-'}</small>
                </span>
                <span className="entity-catalog-recent-body">
                  <b>{record.label}</b>
                  <small>{entityInstanceId(record)}</small>
                </span>
              </button>
            ))}
          </div>
        )}
        {groups.map((group) => (
          <div className="entity-catalog-group" key={group.key}>
            <div className="entity-catalog-group-title">
              <span className="entity-catalog-domain-icon">
                <Box size={14} />
              </span>
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
                <span className="entity-catalog-type-dot" style={{ background: item.color }} />
                <span className="entity-catalog-type-text">
                  <b>{item.label}</b>
                  <small>{'\u5df2\u63a5\u5165'} {item.count.toLocaleString()}</small>
                </span>
                <Star className={item.count > 1 ? 'filled' : ''} size={15} />
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

function EntityDrilldownResult({
  data,
  selection,
  records,
  selected,
  onBack,
  onSelect,
}: {
  data: TopologyExplorerData
  selection: EntityDrilldown
  records: EntityRecord[]
  selected: EntityRecord | null
  onBack: () => void
  onSelect: (record: EntityRecord) => void
}) {
  const [sortKey, setSortKey] = useState<EntityAggregateSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const sortedRecords = useMemo(() => [...records].sort((left, right) => {
    const leftNode = data.nodesById.get(left.id)
    const rightNode = data.nodesById.get(right.id)
    const leftValue = aggregateRecordSortValue(left, leftNode, sortKey)
    const rightValue = aggregateRecordSortValue(right, rightNode, sortKey)
    const result = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue), 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? result : -result
  }), [data.nodesById, records, sortDirection, sortKey])
  const visibleRows = sortedRecords.slice(0, 20)
  const normalCount = records.filter((record) => record.status === 'normal').length
  const warningCount = records.filter((record) => record.status === 'warning').length
  const criticalCount = records.filter((record) => record.status === 'critical').length
  const relationCount = records.reduce((sum, record) => {
    const node = data.nodesById.get(record.id)
    return sum + (node ? relatedLinksForInstance(data, node).length : Number(record.properties.relationCount || 0))
  }, 0)
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
  const sortState = (key: EntityAggregateSortKey) => sortKey === key ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'
  const sortClass = (key: EntityAggregateSortKey) => `entity-topology-sort ${sortKey === key ? sortDirection : ''}`

  return (
    <section className="entity-drilldown-result">
      <header className="entity-drilldown-head">
        <button type="button" onClick={onBack}>
          <ArrowLeft size={15} />
          实体目录
        </button>
        <div>
          <strong>{selection.label}</strong>
          <span>{selection.kind === 'domain' ? '实体 Domain 聚合' : '实体类型聚合'} · {records.length.toLocaleString()} 个实例</span>
        </div>
      </header>
      <div className="entity-drilldown-summary">
        <article>
          <span>实例总数</span>
          <b>{records.length.toLocaleString()}</b>
          <small>{selection.token}</small>
        </article>
        <article>
          <span>健康分布</span>
          <b>{normalCount.toLocaleString()}</b>
          <small>{warningCount} 警告 / {criticalCount} 严重</small>
        </article>
        <article>
          <span>直接关系</span>
          <b>{relationCount.toLocaleString()}</b>
          <small>点击实例查看关联拓扑</small>
        </article>
      </div>
      <div className="entity-drilldown-table-wrap">
        <table className="entity-drilldown-table">
          <thead>
            <tr>
              <th aria-sort={sortState('name')}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('name')}>
                  实例名称 <span className={sortClass('name')} />
                </button>
              </th>
              <th>实体类型</th>
              <th aria-sort={sortState('tags')}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('tags')}>
                  标签 <span className="entity-topology-info">?</span> <span className={sortClass('tags')} />
                </button>
              </th>
              <th aria-sort={sortState('probe')}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('probe')}>
                  采集方式 <span className={sortClass('probe')} />
                </button>
              </th>
              <th aria-sort={sortState('region')}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('region')}>
                  区域/Domain <span className={sortClass('region')} />
                </button>
              </th>
              <th>健康度</th>
              <th aria-sort={sortState('latency')}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('latency')}>
                  直接关系 <span className={sortClass('latency')} />
                </button>
              </th>
              <th>最近上报</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 && (
              <tr className="entity-drilldown-empty-row">
                <td colSpan={8}>暂无匹配实体实例</td>
              </tr>
            )}
            {visibleRows.map((record) => {
              const node = data.nodesById.get(record.id)
              const links = node ? relatedLinksForInstance(data, node) : []
              return (
                <tr key={record.id} className={selected?.id === record.id ? 'active' : ''} onClick={() => onSelect(record)}>
                  <td>
                    <span className="entity-drilldown-name">
                      <span className="entity-type-icon" style={{ color: record.color, borderColor: record.color }}>
                        <TopologyPresetIcon preset={resolveEntityIconPreset(record)} label={record.type} size={15} />
                      </span>
                      <span>
                        <b>{record.label}</b>
                        <small>{entityInstanceId(record)}</small>
                      </span>
                    </span>
                  </td>
                  <td><span className="entity-type-tag">{record.type}</span></td>
                  <td>{node ? entityTagCount(node) : 0}</td>
                  <td>{valueText(record.properties.__method__) || 'EntityStore'}</td>
                  <td>{entityLocationText(record.properties) || record.domain}</td>
                  <td><StatusPill status={record.status} /></td>
                  <td>{links.length || Number(record.properties.relationCount || 0)}</td>
                  <td>{record.lastSeen}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="entity-drilldown-footer">
        <span>每页显示：</span>
        <button type="button">20 <ChevronDown size={14} /></button>
        <span>总数: {records.length.toLocaleString()}</span>
        <button type="button" disabled>上一页</button>
        <button type="button" className="active">1</button>
        {records.length > 20 && <button type="button">2</button>}
        <button type="button" disabled={records.length <= 20}>下一页</button>
        <span>点击实例打开实体详情，可在右侧查看关联拓扑</span>
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

function entityInstanceId(record: { id: string; properties: Record<string, unknown> }) {
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
  focusSelection = true,
  overlayPanel = false,
  selectedNode,
  onSelectNode,
  onFocusType,
  onResetFocus,
}: {
  data: TopologyExplorerData
  focusedTypes: string[]
  focusSelection?: boolean
  overlayPanel?: boolean
  selectedNode: TopologyNode | null
  onSelectNode: (node: TopologyNode | null) => void
  onFocusType: (type: string) => void
  onResetFocus: () => void
}) {
  const [selectedRegions, setSelectedRegions] = useState<string[]>([])
  const referenceTopology = useMemo(() => createReferenceStyleTopology(data, focusedTypes, selectedRegions), [data, focusedTypes, selectedRegions])
  const svgRef = useRef<SVGSVGElement | null>(null)
  const sceneRef = useRef<SVGGElement | null>(null)
  const dragStateRef = useRef<{
    nodeId: string
    pointerId: number
    startX: number
    startY: number
    nodeX: number
    nodeY: number
    moved: boolean
  } | null>(null)
  const dragCaptureRef = useRef<SVGGElement | null>(null)
  const panStateRef = useRef<{ pointerId: number; clientX: number; clientY: number; moved: boolean } | null>(null)
  const suppressClickRef = useRef(false)
  const [selectedAggregateId, setSelectedAggregateId] = useState<string>('')
  const [filterOpen, setFilterOpen] = useState(false)
  const [hiddenDomains, setHiddenDomains] = useState<string[]>([])
  const [hiddenRelations, setHiddenRelations] = useState<string[]>([])
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [draggingNodeId, setDraggingNodeId] = useState('')
  const [dragSceneTransform, setDragSceneTransform] = useState<string | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  useEffect(() => {
    const availableIds = new Set(referenceTopology.nodes.map((item) => item.id))
    setNodePositions((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => availableIds.has(id)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [referenceTopology.nodes])
  const positionedNodes = useMemo(() => referenceTopology.nodes.map((item) => {
    const position = nodePositions[item.id]
    return position ? { ...item, x: position.x, y: position.y } : item
  }), [nodePositions, referenceTopology.nodes])
  const positionedNodeById = useMemo(() => new Map(positionedNodes.map((item) => [item.id, item])), [positionedNodes])
  const positionedEdges = useMemo<ReferenceTopologyEdge[]>(() => referenceTopology.edges.flatMap((edge) => {
    const source = positionedNodeById.get(edge.source.id)
    const target = positionedNodeById.get(edge.target.id)
    return source && target ? [{ ...edge, source, target }] : []
  }), [positionedNodeById, referenceTopology.edges])
  const topologyDomains = useMemo(() => countTopologyOptions(positionedNodes, referenceNodeDomain), [positionedNodes])
  const topologyRegions = useMemo(() => countTopologyOptions(
    data.nodes.filter((node) => focusedTypes.length === 0 || focusedTypes.includes(stripSyntheticType(node.type))),
    topologyNodeRegineCode,
  ).filter((item) => item.key !== '-'), [data.nodes, focusedTypes])
  const relationOptions = useMemo(() => countTopologyOptions(positionedEdges, (edge) => edge.label), [positionedEdges])
  const visibleNodes = useMemo(() => positionedNodes.filter((item) => !hiddenDomains.includes(referenceNodeDomain(item))), [hiddenDomains, positionedNodes])
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((item) => item.id)), [visibleNodes])
  const visibleEdges = useMemo(() => positionedEdges.filter((edge) => visibleNodeIds.has(edge.source.id) && visibleNodeIds.has(edge.target.id) && !hiddenRelations.includes(edge.label)), [hiddenRelations, positionedEdges, visibleNodeIds])
  const regionBoxes = useMemo(() => selectedRegions.length > 0 ? createTopologyRegionBoxes(visibleNodes) : [], [selectedRegions.length, visibleNodes])
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
  const minZoom = selectedRegions.length > 1 ? 2 : 10
  const zoomScale = zoom / 10
  const shouldFocusSelection = focusSelection && selectedRegions.length === 0 && Boolean(activePanelItem)
  const focusedZoomScale = shouldFocusSelection ? zoomScale * 2.9 : zoomScale
  const zoomDisplay = Math.round(zoomScale * 98)
  const zoomProgress = (zoom - 10) / 36
  const focusCenterX = activePanelItem ? activePanelItem.x + activePanelItem.width / 2 : 0
  const focusCenterY = activePanelItem ? activePanelItem.y + activePanelItem.height / 2 : 0
  const sceneX = shouldFocusSelection ? 1239 - focusCenterX * focusedZoomScale : -2550 * zoomProgress
  const sceneY = shouldFocusSelection ? 619 - focusCenterY * focusedZoomScale : -425 * zoomProgress
  const sceneTranslateX = sceneX + pan.x
  const sceneTranslateY = sceneY + pan.y
  const sceneTransform = `translate(${sceneTranslateX} ${sceneTranslateY}) scale(${focusedZoomScale})`
  const effectiveSceneTransform = dragSceneTransform || sceneTransform
  const minimapViewport = useMemo(() => {
    const width = 2478 / focusedZoomScale
    const height = 1238 / focusedZoomScale
    const x = -sceneTranslateX / focusedZoomScale
    const y = -sceneTranslateY / focusedZoomScale
    return { x, y, width, height }
  }, [focusedZoomScale, sceneTranslateX, sceneTranslateY])
  const minimap = useMemo(() => {
    const width = 220
    const height = 150
    const padding = 10
    const bounds = visibleNodes.reduce((box, node) => ({
      minX: Math.min(box.minX, node.x),
      minY: Math.min(box.minY, node.y),
      maxX: Math.max(box.maxX, node.x + node.width),
      maxY: Math.max(box.maxY, node.y + node.height),
    }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
    if (!Number.isFinite(bounds.minX)) {
      return { width, height, scale: 1, offsetX: 0, offsetY: 0, nodes: [], edges: [], viewport: { x: 0, y: 0, width, height } }
    }
    const graphWidth = Math.max(1, bounds.maxX - bounds.minX)
    const graphHeight = Math.max(1, bounds.maxY - bounds.minY)
    const scale = Math.min((width - padding * 2) / graphWidth, (height - padding * 2) / graphHeight)
    const offsetX = (width - graphWidth * scale) / 2 - bounds.minX * scale
    const offsetY = (height - graphHeight * scale) / 2 - bounds.minY * scale
    const mapX = (value: number) => value * scale + offsetX
    const mapY = (value: number) => value * scale + offsetY
    const nodes = visibleNodes.map((node) => ({
      id: node.id,
      x: mapX(node.x),
      y: mapY(node.y),
      width: Math.max(16, node.width * scale),
      height: Math.max(6, node.height * scale),
      color: node.color,
    }))
    const edges = visibleEdges.map((edge) => ({
      id: edge.id,
      x1: mapX(edge.source.x + edge.source.width / 2),
      y1: mapY(edge.source.y + edge.source.height / 2),
      x2: mapX(edge.target.x + edge.target.width / 2),
      y2: mapY(edge.target.y + edge.target.height / 2),
    }))
    const viewport = {
      x: mapX(minimapViewport.x),
      y: mapY(minimapViewport.y),
      width: minimapViewport.width * scale,
      height: minimapViewport.height * scale,
    }
    return { width, height, scale, offsetX, offsetY, nodes, edges, viewport }
  }, [minimapViewport, visibleEdges, visibleNodes])
  const selectAggregate = (item: ReferenceTopologyNode) => {
    setSelectedAggregateId(item.id)
    if (focusSelection && selectedRegions.length === 0) onFocusType(item.type)
    if (!item.instances.some((node) => node.id === selectedNode?.id)) onSelectNode(null)
  }
  const selectInstance = (node: TopologyNode) => {
    setSelectedAggregateId('')
    onSelectNode(node)
    if (focusSelection && selectedRegions.length === 0) onFocusType(node.type)
  }
  const changeZoom = (direction: 1 | -1) => {
    setZoom((value) => Math.max(minZoom, Math.min(46, value + direction * 6)))
  }
  const zoomOut = () => changeZoom(-1)
  const zoomIn = () => changeZoom(1)
  const resetViewport = () => {
    setZoom(10)
    setPan({ x: 0, y: 0 })
  }
  useEffect(() => {
    if (selectedRegions.length <= 1) {
      setZoom((current) => Math.max(10, current))
      return
    }
    if (referenceTopology.nodes.length === 0) return
    const bounds = boundsForReferenceNodes(referenceTopology.nodes, 96, 80)
    if (bounds.width <= 0 || bounds.height <= 0) return
    const targetScale = Math.max(0.2, Math.min(1, (2478 * 0.9) / bounds.width, (1238 * 0.86) / bounds.height))
    const targetZoom = Math.max(minZoom, Math.min(10, Math.floor(targetScale * 10)))
    const targetZoomScale = targetZoom / 10
    const targetZoomProgress = (targetZoom - 10) / 36
    const targetSceneX = -2550 * targetZoomProgress
    const targetSceneY = -425 * targetZoomProgress
    setZoom(targetZoom)
    setPan({
      x: 1239 - (bounds.x + bounds.width / 2) * targetZoomScale - targetSceneX,
      y: 619 - (bounds.y + bounds.height / 2) * targetZoomScale - targetSceneY,
    })
  }, [minZoom, referenceTopology.nodes, selectedRegions.length])
  const finishZoomAction = (event: MouseEvent<HTMLButtonElement>, action: () => void) => {
    action()
    event.currentTarget.blur()
  }
  const handleWheelZoom = (event: WheelEvent<HTMLElement>) => {
    event.preventDefault()
    changeZoom(event.deltaY < 0 ? 1 : -1)
  }
  const toGraphDelta = (deltaX: number, deltaY: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return { x: deltaX, y: deltaY }
    return {
      x: deltaX * (2478 / rect.width),
      y: deltaY * (1238 / rect.height),
    }
  }
  const isTopologyInteractiveTarget = (target: EventTarget | null) => (
    target instanceof Element
    && Boolean(target.closest('.entity-topology-zoom, .entity-topology-filter, .entity-topology-filter-panel, .entity-cms-minimap, .entity-reference-nodes g'))
  )
  const blurTopologyControls = () => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && activeElement.closest('.entity-topology-zoom, .entity-topology-filter')) {
      activeElement.blur()
    }
  }
  const clearTopologyTextSelection = () => {
    window.getSelection()?.removeAllRanges()
  }
  const startCanvasPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (isTopologyInteractiveTarget(event.target)) return
    event.preventDefault()
    blurTopologyControls()
    clearTopologyTextSelection()
    suppressClickRef.current = false
    panStateRef.current = { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY, moved: false }
    setIsPanning(true)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveCanvasPan = (event: PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current
    if (!panState || panState.pointerId !== event.pointerId) return
    event.preventDefault()
    const deltaX = event.clientX - panState.clientX
    const deltaY = event.clientY - panState.clientY
    if (!panState.moved && Math.hypot(deltaX, deltaY) > 3) panState.moved = true
    const graphDelta = toGraphDelta(deltaX, deltaY)
    setPan((current) => ({ x: current.x + graphDelta.x, y: current.y + graphDelta.y }))
    panStateRef.current = { ...panState, clientX: event.clientX, clientY: event.clientY }
  }
  const stopCanvasPan = (event: PointerEvent<HTMLDivElement>) => {
    const panState = panStateRef.current
    if (!panState || panState.pointerId !== event.pointerId) return
    clearTopologyTextSelection()
    suppressClickRef.current = panState.moved
    panStateRef.current = null
    setIsPanning(false)
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }
  const handleCanvasClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isTopologyInteractiveTarget(event.target)) return
    blurTopologyControls()
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setSelectedAggregateId('')
    onSelectNode(null)
    onResetFocus()
    if (!overlayPanel) resetViewport()
  }
  const focusMinimapPoint = (event: PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return
    event.preventDefault()
    event.stopPropagation()
    const miniX = (event.clientX - rect.left) * (minimap.width / rect.width)
    const miniY = (event.clientY - rect.top) * (minimap.height / rect.height)
    const graphX = (miniX - minimap.offsetX) / minimap.scale
    const graphY = (miniY - minimap.offsetY) / minimap.scale
    setPan({
      x: 1239 - graphX * focusedZoomScale - sceneX,
      y: 619 - graphY * focusedZoomScale - sceneY,
    })
  }
  const toggleDomainFilter = (domain: string) => {
    setHiddenDomains((current) => current.includes(domain) ? current.filter((item) => item !== domain) : [...current, domain])
    setSelectedAggregateId('')
    onSelectNode(null)
  }
  const toggleRelationFilter = (relation: string) => {
    setHiddenRelations((current) => current.includes(relation) ? current.filter((item) => item !== relation) : [...current, relation])
  }
  const toggleRegionFilter = (region: string) => {
    setSelectedRegions((current) => current.includes(region) ? current.filter((item) => item !== region) : [...current, region])
    setSelectedAggregateId('')
    onSelectNode(null)
  }
  const resetTopologyFilters = () => {
    setSelectedRegions([])
    setHiddenDomains([])
    setHiddenRelations([])
  }
  const scenePointFromEvent = <T extends Element>(event: PointerEvent<T>) => {
    const svg = svgRef.current
    const scene = sceneRef.current
    const matrix = scene?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const scenePoint = point.matrixTransform(matrix.inverse())
    return { x: scenePoint.x, y: scenePoint.y }
  }
  const handleNodePointerDown = (event: PointerEvent<SVGGElement>, item: ReferenceTopologyNode) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const startPoint = scenePointFromEvent(event)
    if (!startPoint) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
    dragStateRef.current = {
      nodeId: item.id,
      pointerId: event.pointerId,
      startX: startPoint.x,
      startY: startPoint.y,
      nodeX: item.x,
      nodeY: item.y,
      moved: false,
    }
    dragCaptureRef.current = event.currentTarget
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDragSceneTransform(sceneTransform)
    setDraggingNodeId(item.id)
  }
  const handleTopologyPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const dragState = dragStateRef.current
    if (!dragState) return
    const point = scenePointFromEvent(event)
    if (!point) return
    event.preventDefault()
    const dx = point.x - dragState.startX
    const dy = point.y - dragState.startY
    if (!dragState.moved) {
      if (Math.hypot(dx, dy) <= 4) return
      dragState.moved = true
    }
    const node = positionedNodeById.get(dragState.nodeId)
    const nextX = Math.max(24, Math.min(2454 - (node?.width || 320), dragState.nodeX + dx))
    const nextY = Math.max(24, Math.min(1214 - (node?.height || 82), dragState.nodeY + dy))
    setNodePositions((current) => {
      const currentPosition = current[dragState.nodeId]
      if (currentPosition && Math.abs(currentPosition.x - nextX) < 0.5 && Math.abs(currentPosition.y - nextY) < 0.5) return current
      return { ...current, [dragState.nodeId]: { x: nextX, y: nextY } }
    })
  }
  const finishTopologyDrag = () => {
    const dragState = dragStateRef.current
    if (!dragState) return
    suppressClickRef.current = dragState.moved
    if (dragCaptureRef.current?.hasPointerCapture(dragState.pointerId)) {
      dragCaptureRef.current.releasePointerCapture(dragState.pointerId)
    }
    dragStateRef.current = null
    dragCaptureRef.current = null
    setDraggingNodeId('')
    setDragSceneTransform(null)
  }

  return (
    <section
      className={[
        'entity-topology-split',
        overlayPanel ? 'overlay-panel' : '',
        activePanelItem ? (isInstanceDetailOpen ? 'has-instance-detail' : 'has-detail') : '',
      ].filter(Boolean).join(' ')}
    >
      <div
        className={`entity-topology-full ${isPanning ? 'is-panning' : ''}`}
        onPointerDown={startCanvasPan}
        onPointerMove={moveCanvasPan}
        onPointerUp={stopCanvasPan}
        onPointerCancel={stopCanvasPan}
        onClick={handleCanvasClick}
        onWheel={handleWheelZoom}
      >
        <div className="entity-topology-zoom">
          <button className="entity-topology-zoom-action" type="button" data-zoom-action="out" aria-label="缩小拓扑" onClick={(event) => finishZoomAction(event, zoomOut)}>−</button>
          <b>{zoomDisplay}%</b>
          <button className="entity-topology-zoom-action" type="button" data-zoom-action="in" aria-label="放大拓扑" onClick={(event) => finishZoomAction(event, zoomIn)}>＋</button>
          <button className="entity-topology-zoom-action" type="button" data-zoom-action="fit" aria-label="适应画布" onClick={(event) => finishZoomAction(event, resetViewport)}>⌖</button>
        </div>
        <button
          className={filterOpen || selectedRegions.length > 0 || hiddenDomains.length > 0 || hiddenRelations.length > 0 ? 'entity-topology-filter active' : 'entity-topology-filter'}
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
              <button type="button" onClick={resetTopologyFilters} disabled={selectedRegions.length === 0 && hiddenDomains.length === 0 && hiddenRelations.length === 0}>重置</button>
            </header>
            <section>
              <span>regine_code 区域</span>
              <div>
                {topologyRegions.length === 0 && <em>暂无区域</em>}
                {topologyRegions.map((item) => {
                  const active = selectedRegions.includes(item.key)
                  return (
                    <button key={item.key} type="button" className={active ? 'active' : ''} onClick={() => toggleRegionFilter(item.key)}>
                      {item.key} <b>{item.count}</b>
                    </button>
                  )
                })}
              </div>
            </section>
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
        <svg
          ref={svgRef}
          className="entity-cms-reference-graph"
          viewBox="0 0 2478 1238"
          preserveAspectRatio="xMinYMin meet"
          role="img"
          aria-label={'\u5b9e\u4f53\u62d3\u6251\u5173\u7cfb\u56fe'}
          onPointerMove={handleTopologyPointerMove}
          onPointerUp={finishTopologyDrag}
          onPointerCancel={finishTopologyDrag}
        >
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
          <g ref={sceneRef} className="entity-reference-scene" transform={effectiveSceneTransform}>
            {regionBoxes.length > 0 && (
              <g className="entity-reference-region-boxes">
                {regionBoxes.map((region) => {
                  const title = `Region ${region.label}`
                  const titleWidth = Math.max(168, title.length * 9 + 64)
                  const titleX = region.x + 14
                  return (
                    <g key={region.key} className="entity-reference-region-box">
                      <rect x={region.x} y={region.y} width={region.width} height={region.height} rx="10" />
                      <g className="entity-reference-region-title" transform={`translate(${titleX} ${region.y})`}>
                        <rect x="0" y="-28" width={titleWidth} height="28" rx="5" />
                        <text x="38" y="-14">{title}</text>
                        <path d="M14 -22 H24 M14 -16 H24 M14 -10 H22 M10 -25 H29 V-4 H10 Z" />
                      </g>
                    </g>
                  )
                })}
              </g>
            )}
            <g className="entity-reference-links">
              {visibleEdges.map((edge, index) => {
                const label = referenceEdgeLabel(edge, index)
                return (
                  <g key={edge.id}>
                    <path d={referenceEdgePath(edge)} markerEnd="url(#entity-reference-arrow)" />
                    <g className="entity-reference-link-label" transform={`translate(${label.x} ${label.y})`}>
                      <rect x={-label.width / 2} y="-16" width={label.width} height="24" rx="3" />
                      <text y="0">{edge.label}</text>
                    </g>
                  </g>
                )
              })}
            </g>
            <g className="entity-reference-nodes">
              {visibleNodes.map((item) => (
                <g
                  key={item.id}
                  className={[
                    activePanelItem?.id === item.id ? 'selected' : '',
                    draggingNodeId === item.id ? 'dragging' : '',
                  ].filter(Boolean).join(' ')}
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
                  onPointerDown={(event) => handleNodePointerDown(event, item)}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false
                      return
                    }
                    selectAggregate(item)
                  }}
                >
                  <foreignObject className="entity-reference-node-foreign" width={item.width} height={item.height}>
                    <div
                      className="entity-reference-node-card"
                      style={{ '--node-color': item.color } as CSSProperties}
                    >
                      <div className="entity-reference-node-body">
                        <div className="entity-reference-node-stripe" />
                        <div className="entity-reference-node-content">
                          <div className="entity-reference-node-meta">
                            <span>实体</span>
                            <code>{referenceNodeLocationLabel(item) || referenceNodeDomain(item)}</code>
                          </div>
                          <strong>{item.title}</strong>
                          <p>{item.subtitle}</p>
                        </div>
                        <div className="entity-reference-node-count">
                          <b>{item.instances.length}</b>
                          <span>实例</span>
                        </div>
                      </div>
                    </div>
                  </foreignObject>
                </g>
              ))}
            </g>
          </g>
        </svg>
        <div className="topo-minimap entity-cms-minimap" aria-hidden="true">
          <svg className="topo-minimap-svg" viewBox={`0 0 ${minimap.width} ${minimap.height}`} onPointerDown={focusMinimapPoint}>
            <defs>
              <filter id="entity-minimap-soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#0f172a" floodOpacity="0.12" />
              </filter>
            </defs>
            <g className="topo-minimap-edges">
              {minimap.edges.map((edge) => (
                <line key={edge.id} className="topo-minimap-edge" x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} />
              ))}
            </g>
            <g className="topo-minimap-nodes">
              {minimap.nodes.map((item) => (
                <rect
                  key={item.id}
                  className="topo-minimap-node"
                  x={item.x}
                  y={item.y}
                  width={item.width}
                  height={item.height}
                  rx="1.5"
                  fill={item.color}
                  filter="url(#entity-minimap-soft-shadow)"
                />
              ))}
            </g>
            <rect
              className="topo-minimap-viewport"
              x={minimap.viewport.x}
              y={minimap.viewport.y}
              width={minimap.viewport.width}
              height={minimap.viewport.height}
              rx="2.5"
            />
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
  const [currentPage, setCurrentPage] = useState(1)
  const pageSize = 10
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
        valueText(node.properties.regine_code),
        valueText(node.properties.az_code),
        valueText(node.properties.region),
        valueText(node.properties.created_at),
        valueText(node.properties.createTime),
        valueText(node.properties.updated_at),
        valueText(node.properties.updateTime),
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
  const pageCount = Math.max(1, Math.ceil(sortedInstances.length / pageSize))
  const pageButtons = useMemo(() => {
    const start = Math.max(1, Math.min(currentPage - 2, pageCount - 4))
    const end = Math.min(pageCount, start + 4)
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
  }, [currentPage, pageCount])
  const rows = sortedInstances.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const runInstanceQuery = () => {
    setCurrentPage(1)
    setQuery(queryDraft)
  }
  const toggleTagFilter = (key: string) => {
    setCurrentPage(1)
    setSelectedTagKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  }
  const clearTagFilters = () => {
    setCurrentPage(1)
    setSelectedTagKeys([])
  }
  const changeSort = (key: EntityAggregateSortKey) => {
    setCurrentPage(1)
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
    setCurrentPage(1)
  }, [item.id])

  useEffect(() => {
    setCurrentPage((page) => Math.min(Math.max(1, page), pageCount))
  }, [pageCount])

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
                  实例名称 <span className={`entity-topology-sort ${sortKey === 'name' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'instanceId' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('instanceId')}>
                  实例ID <span className={`entity-topology-sort ${sortKey === 'instanceId' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'region' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('region')}>
                  区域 <span className={`entity-topology-sort ${sortKey === 'region' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'type' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('type')}>
                  实体类型 <span className={`entity-topology-sort ${sortKey === 'type' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'created' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('created')}>
                  创建时间 <span className={`entity-topology-sort ${sortKey === 'created' ? sortDirection : ''}`} />
                </button>
              </th>
              <th aria-sort={sortKey === 'updated' ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}>
                <button type="button" className="entity-topology-sort-header" onClick={() => changeSort('updated')}>
                  更新时间 <span className={`entity-topology-sort ${sortKey === 'updated' ? sortDirection : ''}`} />
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
                <td title={entityInstanceId(row)}>{entityInstanceId(row)}</td>
                <td>{entityLocationText(row.properties) || valueText(row.properties.__domain__) || '-'}</td>
                <td title={row.type}>{row.type}</td>
                <td>{entityCreatedTime(row.properties)}</td>
                <td>{entityUpdatedTime(row.properties)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="entity-topology-detail-footer">
          <span>每页显示:</span>
          <button type="button">{pageSize} <ChevronDown size={14} /></button>
          <span>总数: {filteredInstances.length}</span>
          <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}>‹ 上一页</button>
          {pageButtons[0] > 1 && <button type="button" onClick={() => setCurrentPage(1)}>1</button>}
          {pageButtons[0] > 2 && <span>...</span>}
          {pageButtons.map((page) => (
            <button key={page} type="button" className={page === currentPage ? 'active' : ''} onClick={() => setCurrentPage(page)}>{page}</button>
          ))}
          {pageButtons[pageButtons.length - 1] < pageCount - 1 && <span>...</span>}
          {pageButtons[pageButtons.length - 1] < pageCount && <button type="button" onClick={() => setCurrentPage(pageCount)}>{pageCount}</button>}
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}>下一页 ›</button>
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
  if (key === 'instanceId') return entityInstanceId(node)
  if (key === 'name') return node.label
  if (key === 'type') return node.type
  if (key === 'tags') return entityTagCount(node)
  if (key === 'probe') return valueText(node.properties.__method__) || 'EntityStore'
  if (key === 'language') return valueText(node.properties.language) || ''
  if (key === 'region') return entityLocationText(node.properties) || valueText(node.properties.__domain__) || ''
  if (key === 'created') return entityTimeSortValue(node.properties.created_at) || entityTimeSortValue(node.properties.createTime) || 0
  if (key === 'updated') return entityTimeSortValue(node.properties.updated_at) || entityTimeSortValue(node.properties.updateTime) || entityTimeSortValue(node.properties.__last_observed_time__) || 0
  return Number(node.properties.relationCount || 0) > 0 ? 18 + Number(node.properties.relationCount || 0) : -1
}

function entityCreatedTime(props: Record<string, unknown>) {
  return valueText(props.created_at) || valueText(props.createTime) || valueText(props.createdTime) || '-'
}

function entityUpdatedTime(props: Record<string, unknown>) {
  return formatLastSeen(props.updated_at)
    || formatLastSeen(props.updateTime)
    || formatLastSeen(props.updatedTime)
    || formatLastSeen(props.__last_observed_time__)
    || '-'
}

function entityTimeSortValue(value: unknown) {
  const text = valueText(value)
  if (!text) return 0
  const numeric = Number(text)
  if (Number.isFinite(numeric)) return numeric
  const timestamp = Date.parse(text)
  return Number.isFinite(timestamp) ? timestamp : text
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
    { key: 'topology', label: '\u5173\u8054\u62d3\u6251' },
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
      {activeTab === 'topology' && <EntityRelatedTopologyCanvas data={data} node={node} links={relatedLinks} onSelectNode={onSelectNode} />}
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
    { label: '\u533a\u57df', value: entityLocationText(props) || '-' },
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
  data,
  node,
  links,
  onSelectNode,
}: {
  data: TopologyExplorerData
  node: TopologyNode
  links: EntityRelatedLink[]
  onSelectNode: (node: TopologyNode) => void
}) {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const viewportRef = useRef<SVGGElement | null>(null)
  const dragStateRef = useRef<{
    key: string
    pointerId: number
    startX: number
    startY: number
    nodeX: number
    nodeY: number
    moved: boolean
  } | null>(null)
  const dragCaptureRef = useRef<SVGGElement | null>(null)
  const suppressNodeClickRef = useRef(false)
  const [zoom, setZoom] = useState(100)
  const [filterOpen, setFilterOpen] = useState(false)
  const [showIncoming, setShowIncoming] = useState(true)
  const [showOutgoing, setShowOutgoing] = useState(true)
  const [nodePositions, setNodePositions] = useState<Record<string, { x: number; y: number }>>({})
  const [draggingNodeKey, setDraggingNodeKey] = useState('')
  const [expandedNodeIds, setExpandedNodeIds] = useState<string[]>([])
  const incomingTotal = links.filter((link) => link.direction === 'in').length
  const outgoingTotal = links.filter((link) => link.direction === 'out').length
  const graph = useMemo(
    () => createRelatedInstanceGraph(data, node, links, expandedNodeIds, showIncoming, showOutgoing),
    [data, expandedNodeIds, links, node, showIncoming, showOutgoing],
  )
  const baseLayout = useMemo(() => layoutRelatedInstanceGraph(graph.nodes, graph.edges, node.id), [graph.edges, graph.nodes, node.id])
  const layout = graph.nodes.map((item) => {
    const base = baseLayout.positions.get(item.id) || { x: baseLayout.width / 2, y: baseLayout.height / 2 }
    const position = nodePositions[item.id]
    return { node: item, x: position?.x ?? base.x, y: position?.y ?? base.y }
  })
  const nodeById = useMemo(() => new Map(layout.map((item) => [item.node.id, item])), [layout])
  const width = baseLayout.width
  const height = baseLayout.height
  const canvasCenter = baseLayout.center
  const center = nodeById.get(node.id) || { node, x: canvasCenter.x, y: canvasCenter.y }
  const domainBand = { x: 42, y: Math.max(56, canvasCenter.y - 130), width: width - 84, height: Math.max(190, height - 112) }
  const legendItems = uniqueRelatedLegend(graph.nodes)
  const domain = valueText(node.properties.__domain__) || valueText(node.properties.domain) || 'domain'
  const zoomScale = zoom / 100
  const graphTransform = 'translate(' + canvasCenter.x + ' ' + canvasCenter.y + ') scale(' + zoomScale + ') translate(' + (-canvasCenter.x) + ' ' + (-canvasCenter.y) + ')'
  useEffect(() => {
    const availableKeys = new Set(graph.nodes.map((item) => item.id))
    setNodePositions((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([key]) => availableKeys.has(key)))
      return Object.keys(next).length === Object.keys(current).length ? current : next
    })
  }, [graph.nodes])
  useEffect(() => {
    setExpandedNodeIds([])
    setNodePositions({})
  }, [node.id])
  const zoomOut = () => setZoom((current) => Math.max(50, current - 10))
  const zoomIn = () => setZoom((current) => Math.min(160, current + 10))
  const handleRelatedWheelZoom = (event: WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const delta = event.deltaY < 0 ? 8 : -8
    setZoom((current) => Math.max(50, Math.min(160, current + delta)))
  }
  const resetZoom = () => setZoom(100)
  const fitCanvas = () => setZoom(90)
  const resetLayout = () => {
    setZoom(100)
    setNodePositions({})
  }
  const toggleExpandNode = (targetNode: TopologyNode) => {
    setExpandedNodeIds((current) => current.includes(targetNode.id)
      ? current.filter((id) => id !== targetNode.id)
      : [...current, targetNode.id])
  }
  const scenePointFromEvent = (event: PointerEvent<SVGGElement | SVGSVGElement>) => {
    const svg = svgRef.current
    const matrix = viewportRef.current?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = svg.createSVGPoint()
    point.x = event.clientX
    point.y = event.clientY
    const scenePoint = point.matrixTransform(matrix.inverse())
    return { x: scenePoint.x, y: scenePoint.y }
  }
  const startNodeDrag = (event: PointerEvent<SVGGElement>, key: string, x: number, y: number) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const startPoint = scenePointFromEvent(event)
    if (!startPoint) return
    event.preventDefault()
    event.stopPropagation()
    suppressNodeClickRef.current = false
    dragStateRef.current = {
      key,
      pointerId: event.pointerId,
      startX: startPoint.x,
      startY: startPoint.y,
      nodeX: x,
      nodeY: y,
      moved: false,
    }
    dragCaptureRef.current = event.currentTarget
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDraggingNodeKey(key)
  }
  const moveNodeDrag = (event: PointerEvent<SVGSVGElement>) => {
    const dragState = dragStateRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const point = scenePointFromEvent(event)
    if (!point) return
    event.preventDefault()
    const dx = point.x - dragState.startX
    const dy = point.y - dragState.startY
    if (!dragState.moved && Math.hypot(dx, dy) > 4) dragState.moved = true
    const nextX = Math.max(-140, Math.min(width + 140, dragState.nodeX + dx))
    const nextY = Math.max(-100, Math.min(height + 100, dragState.nodeY + dy))
    setNodePositions((current) => {
      const position = current[dragState.key]
      if (position && Math.abs(position.x - nextX) < 0.5 && Math.abs(position.y - nextY) < 0.5) return current
      return { ...current, [dragState.key]: { x: nextX, y: nextY } }
    })
  }
  const finishNodeDrag = () => {
    const dragState = dragStateRef.current
    if (!dragState) return
    suppressNodeClickRef.current = dragState.moved
    if (dragCaptureRef.current?.hasPointerCapture(dragState.pointerId)) {
      dragCaptureRef.current.releasePointerCapture(dragState.pointerId)
    }
    dragStateRef.current = null
    dragCaptureRef.current = null
    setDraggingNodeKey('')
  }

  return (
    <section className="entity-related-topology-tab">
      <div className="entity-related-topology-head">
        <strong aria-hidden="true" />
        <span>{graph.edges.length} / {links.length} {'\u6761\u5173\u7cfb'}</span>
      </div>
      <div className="entity-related-topology-canvas" onWheel={handleRelatedWheelZoom}>
        {graph.edges.length === 0 ? (
          <div className="entity-related-topology-empty">{'\u6682\u65e0\u76f4\u63a5\u5173\u8054\u62d3\u6251'}</div>
        ) : (
          <>
            <div className="entity-related-toolbar">
              <button type="button" aria-label="缩小" onClick={zoomOut} disabled={zoom <= 50}>-</button>
              <b aria-label={'当前缩放 ' + zoom + '%'}>{zoom}%</b>
              <button type="button" aria-label="放大" onClick={zoomIn} disabled={zoom >= 160}>+</button>
              <button type="button" aria-label="适应画布" onClick={fitCanvas}><Maximize2 size={13} /></button>
              <button type="button" aria-label="回到中心" onClick={resetZoom}><Home size={13} /></button>
              <button type="button" aria-label="重置布局" onClick={resetLayout}><RotateCcw size={13} /></button>
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
            <svg
              ref={svgRef}
              viewBox={'0 0 ' + width + ' ' + height}
              role="img"
              aria-label={node.label + '\u5173\u8054\u62d3\u6251'}
              onPointerMove={moveNodeDrag}
              onPointerUp={finishNodeDrag}
              onPointerCancel={finishNodeDrag}
            >
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
              <g ref={viewportRef} className="entity-related-viewport" transform={graphTransform} data-zoom={zoom}>
              <rect className="entity-related-domain-band" x={domainBand.x} y={domainBand.y} width={domainBand.width} height={domainBand.height} />
              <text className="entity-related-domain-label" x={domainBand.x + 14} y={domainBand.y + 24}>{domain}</text>
              <g className="entity-related-edges">
                {graph.edges.map((edge) => {
                  const sourceNode = nodeById.get(edge.source.id)
                  const targetNode = nodeById.get(edge.target.id)
                  if (!sourceNode || !targetNode) return null
                  const forward = targetNode.x >= sourceNode.x
                  const source = relatedNodeEdgeAnchor(sourceNode, forward ? 'right' : 'left', sourceNode.node.id === node.id)
                  const target = relatedNodeEdgeAnchor(targetNode, forward ? 'left' : 'right', targetNode.node.id === node.id)
                  const elbowOffset = Math.max(-92, Math.min(92, (target.x - source.x) * 0.32))
                  const path = 'M ' + source.x + ' ' + source.y
                    + ' C ' + (source.x + elbowOffset) + ' ' + source.y
                    + ', ' + (target.x - elbowOffset) + ' ' + target.y
                    + ', ' + target.x + ' ' + target.y
                  const midX = (source.x + target.x) / 2
                  const midY = (source.y + target.y) / 2
                  const labelWidth = Math.min(80, Math.max(42, edge.label.length * 6 + 16))
                  return (
                    <g key={edge.id}>
                      <path d={path} markerEnd="url(#entity-related-arrow)" />
                      <rect x={midX - labelWidth / 2} y={midY - 10} width={labelWidth} height="20" rx="2" />
                      <text x={midX} y={midY + 4}>{edge.label}</text>
                    </g>
                  )
                })}
              </g>
              <g className="entity-related-nodes">
                {layout.map(({ node: item, x, y }) => (
                  <RelatedTopologyNodeCard
                    key={item.id}
                    node={item}
                    x={x}
                    y={y}
                    current={item.id === node.id}
                    expanded={expandedNodeIds.includes(item.id)}
                    expandable={item.id !== node.id && relatedLinksForInstance(data, item).length > 0}
                    dragging={draggingNodeKey === item.id}
                    onPointerDown={(event) => startNodeDrag(event, item.id, x, y)}
                    onExpand={item.id === node.id ? undefined : () => toggleExpandNode(item)}
                    onSelect={() => {
                      if (suppressNodeClickRef.current) {
                        suppressNodeClickRef.current = false
                        return
                      }
                      if (item.id !== node.id) onSelectNode(item)
                    }}
                  />
                ))}
              </g>
              </g>
            </svg>
            <div className="entity-related-minimap" aria-hidden="true">
              <svg viewBox={'0 0 ' + width + ' ' + height}>
                <rect width={width} height={height} />
                {layout.map(({ node: item, x, y }) => (
                  <rect key={item.id} className={item.id === node.id ? 'current' : ''} x={x - 3} y={y - 3} width="6" height="6" rx="3" />
                ))}
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
      {graph.truncated && (
        <p className="entity-related-topology-more">{'\u5df2\u5c55\u793a\u524d'} {graph.edges.length} {'\u6761\u5173\u7cfb\uff0c\u53ef\u901a\u8fc7\u8282\u70b9\u53f3\u4fa7\u6309\u94ae\u7ee7\u7eed\u5c55\u5f00\u3002'}</p>
      )}
    </section>
  )
}

function RelatedTopologyNodeCard({
  node,
  x,
  y,
  current = false,
  dragging = false,
  expanded = false,
  expandable = false,
  onPointerDown,
  onSelect,
  onExpand,
}: {
  node: TopologyNode
  x: number
  y: number
  current?: boolean
  dragging?: boolean
  expanded?: boolean
  expandable?: boolean
  onPointerDown?: (event: PointerEvent<SVGGElement>) => void
  onSelect?: () => void
  onExpand?: () => void
}) {
  const width = current ? 190 : 168
  const height = 78
  const instanceId = entityInstanceId(node)
  const labelLimit = current ? 20 : 17
  const typeText = entityTypeDisplayName(node.type)
  return (
    <g
      className={[
        current ? 'current' : '',
        onSelect ? 'selectable' : '',
        onPointerDown ? 'draggable' : '',
        dragging ? 'dragging' : '',
      ].filter(Boolean).join(' ')}
      transform={'translate(' + (x - width / 2) + ' ' + (y - height / 2) + ')'}
      onPointerDown={onPointerDown}
      onClick={onSelect}
    >
      <circle className="node-halo" cx={width / 2} cy="18" r={current ? 17 : 15} style={{ stroke: node.color }} />
      <circle className="node-core" cx={width / 2} cy="18" r={current ? 11 : 10} style={{ fill: node.color }} />
      <path className="node-icon" transform={`translate(${width / 2 - 5} 13)`} d="M1 2.5 L5 0.3 L9 2.5 V7.5 L5 9.7 L1 7.5 Z M5 0.3 V4.9 M1 2.5 L5 4.9 L9 2.5" />
      {expandable && (
        <g
          className={expanded ? 'expand-control expanded' : 'expand-control'}
          transform={`translate(${width / 2 + (current ? 18 : 16)} 18)`}
          role="button"
          aria-label={expanded ? '收起上下游' : '展开上下游'}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onExpand?.()
          }}
        >
          <circle r="7" style={{ fill: node.color }} />
          <path d={expanded ? 'M-3 0 H3' : 'M-3 0 H3 M0 -3 V3'} />
        </g>
      )}
      <text className="title" x={width / 2} y="48" textAnchor="middle">{truncateSvgText(node.label, labelLimit)}</text>
      <text className="instance" x={width / 2} y="63" textAnchor="middle">{truncateSvgText(instanceId, current ? 22 : 18)}</text>
      <text className="type" x={width / 2} y="76" textAnchor="middle">{truncateSvgText(typeText, current ? 24 : 20)}</text>
    </g>
  )
}

function relatedNodeEdgeAnchor(
  item: { x: number; y: number },
  side: 'left' | 'right',
  current: boolean,
) {
  const radius = current ? 17 : 15
  return {
    x: item.x + (side === 'right' ? radius : -radius),
    y: item.y - 21,
  }
}

interface RelatedInstanceEdge {
  id: string
  source: TopologyNode
  target: TopologyNode
  label: string
}

function createRelatedInstanceGraph(
  data: TopologyExplorerData,
  root: TopologyNode,
  rootLinks: EntityRelatedLink[],
  expandedNodeIds: string[],
  showIncoming: boolean,
  showOutgoing: boolean,
) {
  const nodeMap = new Map<string, TopologyNode>([[root.id, root]])
  const edgeMap = new Map<string, RelatedInstanceEdge>()
  const maxEdges = 36
  let truncated = false
  const addLink = (anchor: TopologyNode, link: EntityRelatedLink) => {
    if (edgeMap.size >= maxEdges) {
      truncated = true
      return
    }
    if (link.direction === 'in' && !showIncoming) return
    if (link.direction === 'out' && !showOutgoing) return
    const source = link.direction === 'out' ? anchor : link.neighbor
    const target = link.direction === 'out' ? link.neighbor : anchor
    if (source.id === target.id) return
    nodeMap.set(source.id, source)
    nodeMap.set(target.id, target)
    edgeMap.set(link.edge.id, { id: link.edge.id, source, target, label: link.edge.type })
  }

  rootLinks.forEach((link) => addLink(root, link))
  expandedNodeIds.forEach((id) => {
    const expandedNode = nodeMap.get(id) || data.nodesById.get(id)
    if (!expandedNode) return
    relatedLinksForInstance(data, expandedNode).forEach((link) => addLink(expandedNode, link))
  })

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    truncated,
  }
}

function layoutRelatedInstanceGraph(nodes: TopologyNode[], edges: RelatedInstanceEdge[], rootId: string) {
  const levelById = new Map<string, number>([[rootId, 0]])
  for (let pass = 0; pass < Math.max(2, nodes.length); pass += 1) {
    let changed = false
    edges.forEach((edge) => {
      const sourceLevel = levelById.get(edge.source.id)
      const targetLevel = levelById.get(edge.target.id)
      if (sourceLevel !== undefined && targetLevel === undefined) {
        levelById.set(edge.target.id, sourceLevel + 1)
        changed = true
      } else if (targetLevel !== undefined && sourceLevel === undefined) {
        levelById.set(edge.source.id, targetLevel - 1)
        changed = true
      }
    })
    if (!changed) break
  }

  nodes.forEach((node) => {
    if (!levelById.has(node.id)) levelById.set(node.id, 0)
  })
  const levels = [...new Set(nodes.map((node) => levelById.get(node.id) || 0))].sort((left, right) => left - right)
  const minLevel = Math.min(0, ...levels)
  const maxLevel = Math.max(0, ...levels)
  const columnGap = 260
  const rowGap = 112
  const sidePadding = 150
  const topPadding = 108
  const maxRows = Math.max(1, ...levels.map((level) => nodes.filter((node) => (levelById.get(node.id) || 0) === level).length))
  const width = Math.max(760, sidePadding * 2 + (maxLevel - minLevel) * columnGap + 180)
  const height = Math.max(360, topPadding * 2 + (maxRows - 1) * rowGap)
  const center = {
    x: sidePadding + (0 - minLevel) * columnGap + 90,
    y: height / 2,
  }
  const positions = new Map<string, { x: number; y: number }>()
  levels.forEach((level) => {
    const layerNodes = nodes
      .filter((node) => (levelById.get(node.id) || 0) === level)
      .sort((left, right) => {
        if (left.id === rootId) return -1
        if (right.id === rootId) return 1
        return left.label.localeCompare(right.label, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
      })
    const x = sidePadding + (level - minLevel) * columnGap + 90
    const startY = height / 2 - ((layerNodes.length - 1) * rowGap) / 2
    layerNodes.forEach((node, index) => {
      positions.set(node.id, {
        x,
        y: node.id === rootId ? center.y : startY + index * rowGap,
      })
    })
  })
  return { positions, width, height, center }
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
    { key: 'topology', label: '关联拓扑', count: relatedLinks.length, disabled: !node },
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
          <EntityRelatedTopologyCanvas data={data} node={node} links={relatedLinks} onSelectNode={onSelectNode} />
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
  regineCode: string
  azCode: string
  instances: TopologyNode[]
  x: number
  y: number
  width: number
  height: number
  title: string
  subtitle: string
  color: string
  access: number
}

interface ReferenceTopologyEdge {
  id: string
  source: ReferenceTopologyNode
  target: ReferenceTopologyNode
  label: string
}

interface TopologyRegionBox {
  key: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

interface EntityRelatedLink {
  edge: TopologyEdge
  neighbor: TopologyNode
  direction: 'in' | 'out'
}

function createReferenceStyleTopology(data: TopologyExplorerData, focusedTypes: string[], selectedRegions: string[]) {
  const focused = new Set(focusedTypes)
  const regionFocused = new Set(selectedRegions)
  const groupByRegion = selectedRegions.length > 0
  const sourceNodes = (focusedTypes.length > 0
    ? data.nodes.filter((node) => focused.has(stripSyntheticType(node.type)))
    : data.nodes)
    .filter((node) => !groupByRegion || regionFocused.has(topologyNodeRegineCode(node)))
  const groupIdForNode = (node: TopologyNode) => groupByRegion
    ? `${node.type}::${topologyNodeRegineCode(node)}`
    : node.type
  const grouped = new Map<string, TopologyNode[]>()
  sourceNodes.forEach((node) => {
    const groupId = groupIdForNode(node)
    const instances = grouped.get(groupId) || []
    instances.push(node)
    grouped.set(groupId, instances)
  })
  const topologyGroups = [...grouped.entries()].slice(0, 90)
  const layoutEdges = createTypeLevelEdges(data, new Set(topologyGroups.map(([groupId]) => groupId)), groupIdForNode)
  const layoutByType = createLayeredTypeLayout(topologyGroups, layoutEdges)
  const nodes = topologyGroups.map(([groupId, instances]) => {
    const sample = instances[0]
    const type = sample?.type || groupId
    const regineCode = commonTopologyValue(instances, topologyNodeRegineCode)
    const coordinate = layoutByType.get(groupId) || fallbackReferenceCoordinate(0)
    const title = entityTypeDisplayName(type)
    const subtitle = groupByRegion
      ? [type, regineCode].filter(Boolean).join(' · ')
      : type
    return {
      id: groupId,
      type,
      regineCode,
      azCode: '',
      instances,
      x: coordinate.x,
      y: coordinate.y,
      width: coordinate.width,
      height: coordinate.height,
      title,
      subtitle,
      color: sample?.color || '#5b9df1',
      access: instances.reduce((sum, node) => sum + Number(node.properties.relationCount || 0), 0),
    }
  })
  const edges: ReferenceTopologyEdge[] = []
  const edgeKeys = new Set<string>()
  const nodesByGroupId = new Map(nodes.map((item) => [item.id, item]))
  data.edges.forEach((edge) => {
    const sourceNode = data.nodesById.get(edge.source)
    const targetNode = data.nodesById.get(edge.target)
    if (!sourceNode || !targetNode) return
    const source = nodesByGroupId.get(groupIdForNode(sourceNode))
    const target = nodesByGroupId.get(groupIdForNode(targetNode))
    if (!source || !target || source.id === target.id) return
    const edgeKey = `${source.id}->${target.id}:${edge.type}`
    if (edgeKeys.has(edgeKey)) return
    edgeKeys.add(edgeKey)
    edges.push({ id: edgeKey, source, target, label: edge.type })
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

function referenceNodeLocationLabel(node: ReferenceTopologyNode) {
  if (!node.regineCode) return ''
  return node.regineCode
}

function topologyNodeRegineCode(node: TopologyNode) {
  return valueText(node.properties.regine_code) || valueText(node.properties.region) || simulatedTopologyLocation(node)[0]
}

function topologyNodeAzCode(node: TopologyNode) {
  return valueText(node.properties.az_code) || valueText(node.properties.zone) || simulatedTopologyLocation(node)[1]
}

function simulatedTopologyLocation(node: TopologyNode): [string, string] {
  const text = [
    node.id,
    node.label,
    node.type,
    valueText(node.properties.name),
    valueText(node.properties.display_name),
    valueText(node.properties.namespace),
    valueText(node.properties.cluster),
  ].join(' ').toLowerCase()
  if (text.includes('payment') || text.includes('redis') || text.includes('profile')) return ['cn-shanghai', 'cn-shanghai-b']
  if (text.includes('inventory') || text.includes('sync') || text.includes('kafka') || text.includes('topic')) return ['cn-beijing', 'cn-beijing-a']
  if (text.includes('notification') || text.includes('catalog')) return ['cn-shanghai', 'cn-shanghai-a']
  if (text.includes('order') || text.includes('mysql') || text.includes('rds')) return ['cn-hangzhou', 'cn-hangzhou-b']
  return ['cn-hangzhou', 'cn-hangzhou-a']
}

function commonTopologyValue(nodes: TopologyNode[], getValue: (node: TopologyNode) => string) {
  const values = [...new Set(nodes.map(getValue).filter((value) => value && value !== '-'))]
  return values.length === 1 ? values[0] : ''
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

function createTypeLevelEdges(
  data: TopologyExplorerData,
  visibleGroups: Set<string>,
  getGroupId: (node: TopologyNode) => string = (node) => node.type,
) {
  const edgeKeys = new Set<string>()
  const edges: Array<{ source: string; target: string }> = []
  data.edges.forEach((edge) => {
    const sourceNode = data.nodesById.get(edge.source)
    const targetNode = data.nodesById.get(edge.target)
    const source = sourceNode ? getGroupId(sourceNode) : ''
    const target = targetNode ? getGroupId(targetNode) : ''
    if (!source || !target || source === target || !visibleGroups.has(source) || !visibleGroups.has(target)) return
    const key = `${source}->${target}`
    if (edgeKeys.has(key)) return
    edgeKeys.add(key)
    edges.push({ source, target })
  })
  return edges
}

function createLayeredTypeLayout(
  groups: Array<[string, TopologyNode[]]>,
  edges: Array<{ source: string; target: string }>,
) {
  const types = groups.map(([type]) => type)
  const typeSet = new Set(types)
  const incoming = new Map(types.map((type) => [type, 0]))
  const outgoing = new Map(types.map((type) => [type, 0]))
  const adjacency = new Map(types.map((type) => [type, [] as string[]]))
  edges.forEach((edge) => {
    if (!typeSet.has(edge.source) || !typeSet.has(edge.target)) return
    incoming.set(edge.target, (incoming.get(edge.target) || 0) + 1)
    outgoing.set(edge.source, (outgoing.get(edge.source) || 0) + 1)
    adjacency.get(edge.source)?.push(edge.target)
  })

  const sortByTopologyWeight = (left: string, right: string) => {
    const leftScore = (outgoing.get(left) || 0) - (incoming.get(left) || 0)
    const rightScore = (outgoing.get(right) || 0) - (incoming.get(right) || 0)
    return rightScore - leftScore
      || (outgoing.get(right) || 0) - (outgoing.get(left) || 0)
      || left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' })
  }

  const downstreamDistance = new Map<string, number>()
  const visiting = new Set<string>()
  const distanceToSink = (type: string): number => {
    const cached = downstreamDistance.get(type)
    if (typeof cached === 'number') return cached
    if (visiting.has(type)) return 0
    visiting.add(type)
    const targets = (adjacency.get(type) || []).filter((target) => typeSet.has(target))
    const distance = targets.length === 0
      ? 0
      : 1 + Math.max(...targets.map((target) => distanceToSink(target)))
    visiting.delete(type)
    downstreamDistance.set(type, distance)
    return distance
  }
  types.forEach(distanceToSink)

  const maxDistance = Math.max(0, ...types.map((type) => downstreamDistance.get(type) || 0))
  const levels = new Map(types.map((type) => [type, maxDistance - (downstreamDistance.get(type) || 0)]))

  const normalizedLevels = [...new Set(types.map((type) => levels.get(type) || 0))].sort((left, right) => left - right)
  const levelIndex = new Map(normalizedLevels.map((level, index) => [level, index]))
  const layers = new Map<number, string[]>()
  types.forEach((type) => {
    const layer = levelIndex.get(levels.get(type) || 0) || 0
    const list = layers.get(layer) || []
    list.push(type)
    layers.set(layer, list)
  })

  const canvasWidth = 2478
  const layerTop = 120
  const layerGap = 190
  const sidePadding = 120
  const layout = new Map<string, { x: number; y: number; width: number; height: number }>()
  const regionMode = groups.some(([groupId]) => groupId.includes('::'))
  if (regionMode) {
    const groupRegion = new Map(groups.map(([groupId, instances]) => [
      groupId,
      commonTopologyValue(instances, topologyNodeRegineCode) || 'unknown',
    ]))
    const regions = [...new Set(groups.map(([groupId]) => groupRegion.get(groupId) || 'unknown'))]
      .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN', { numeric: true, sensitivity: 'base' }))
    const regionGap = 96
    const regionSidePadding = 72
    const regionInnerPadding = 42
    const groupInstances = new Map(groups)
    const regionWidths = new Map(regions.map((region) => {
      const maxLayerCount = Math.max(1, ...[...layers.values()].map((layerTypes) => (
        layerTypes.filter((groupId) => groupRegion.get(groupId) === region).length
      )))
      const width = Math.max(360, regionInnerPadding * 2 + maxLayerCount * 220 + Math.max(0, maxLayerCount - 1) * 34)
      return [region, width] as const
    }))
    const totalRegionWidth = regions.reduce((sum, region) => sum + (regionWidths.get(region) || 360), 0)
      + regionGap * Math.max(0, regions.length - 1)
    const regionStartX = Math.max(regionSidePadding, (canvasWidth - totalRegionWidth) / 2)
    const regionX = new Map<string, number>()
    regions.reduce((x, region) => {
      regionX.set(region, x)
      return x + (regionWidths.get(region) || 360) + regionGap
    }, regionStartX)
    ;[...layers.entries()].sort(([left], [right]) => left - right).forEach(([layer, layerTypes]) => {
      regions.forEach((region) => {
        const ordered = layerTypes
          .filter((groupId) => groupRegion.get(groupId) === region)
          .sort(sortByTopologyWeight)
        if (ordered.length === 0) return
        const regionWidth = regionWidths.get(region) || 360
        const available = regionWidth - regionInnerPadding * 2
        const gap = ordered.length <= 1 ? 0 : Math.max(16, Math.min(42, available / ordered.length * 0.14))
        const nodeWidth = Math.max(170, Math.min(280, Math.floor((available - gap * Math.max(0, ordered.length - 1)) / ordered.length)))
        const rowWidth = ordered.length * nodeWidth + gap * Math.max(0, ordered.length - 1)
        const startX = (regionX.get(region) || 0) + (regionWidth - rowWidth) / 2
        ordered.forEach((groupId, index) => {
          const instances = groupInstances.get(groupId) || []
          const height = 82
          layout.set(groupId, {
            x: startX + index * (nodeWidth + gap),
            y: layerTop + layer * layerGap,
            width: nodeWidth,
            height: height + Math.min(16, Math.max(0, instances.length - 1) * 2),
          })
        })
      })
    })
    return layout
  }
  ;[...layers.entries()].sort(([left], [right]) => left - right).forEach(([layer, layerTypes]) => {
    const ordered = layerTypes.sort(sortByTopologyWeight)
    const gap = ordered.length <= 1 ? 0 : Math.max(28, Math.min(118, (canvasWidth - sidePadding * 2) / Math.max(1, ordered.length) * 0.22))
    const availableWidth = canvasWidth - sidePadding * 2 - gap * Math.max(0, ordered.length - 1)
    const layerNodeWidth = Math.max(220, Math.min(340, Math.floor(availableWidth / Math.max(1, ordered.length))))
    const layerWidth = ordered.length * layerNodeWidth + Math.max(0, ordered.length - 1) * gap
    const startX = (canvasWidth - layerWidth) / 2
    ordered.forEach((type, index) => {
      const instances = groups.find(([groupType]) => groupType === type)?.[1] || []
      const height = 82
      const x = startX + index * (layerNodeWidth + gap)
      const y = layerTop + layer * layerGap
      layout.set(type, { x, y, width: layerNodeWidth, height: height + Math.min(16, Math.max(0, instances.length - 1) * 2) })
    })
  })
  return layout
}

function fallbackReferenceCoordinate(index: number) {
  const column = index % 10
  const row = Math.floor(index / 10)
  return {
    x: 620 + column * 124,
    y: 120 + row * 68,
    width: 300,
    height: 82,
  }
}

function createTopologyRegionBoxes(nodes: ReferenceTopologyNode[]): TopologyRegionBox[] {
  const regionGroups = new Map<string, ReferenceTopologyNode[]>()
  nodes.forEach((node) => {
    const region = node.regineCode || 'unknown'
    const list = regionGroups.get(region) || []
    list.push(node)
    regionGroups.set(region, list)
  })

  return [...regionGroups.entries()]
    .map(([region, regionNodes]) => {
      const regionBounds = boundsForReferenceNodes(regionNodes, 48, 54)
      return {
        key: region,
        label: region,
        ...regionBounds,
      }
    })
    .sort((left, right) => left.x - right.x || left.y - right.y)
}

function boundsForReferenceNodes(nodes: ReferenceTopologyNode[], paddingX: number, paddingY: number) {
  const bounds = nodes.reduce((box, node) => ({
    minX: Math.min(box.minX, node.x),
    minY: Math.min(box.minY, node.y),
    maxX: Math.max(box.maxX, node.x + node.width),
    maxY: Math.max(box.maxY, node.y + node.height),
  }), { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity })
  if (!Number.isFinite(bounds.minX)) return { x: 0, y: 0, width: 0, height: 0 }
  return {
    x: Math.max(8, bounds.minX - paddingX),
    y: Math.max(8, bounds.minY - paddingY),
    width: bounds.maxX - bounds.minX + paddingX * 2,
    height: bounds.maxY - bounds.minY + paddingY * 2,
  }
}

function referenceEdgeAnchors(edge: ReferenceTopologyEdge) {
  const sourceCenterX = edge.source.x + edge.source.width / 2
  const sourceCenterY = edge.source.y + edge.source.height / 2
  const targetCenterX = edge.target.x + edge.target.width / 2
  const targetCenterY = edge.target.y + edge.target.height / 2
  const vertical = Math.abs(targetCenterY - sourceCenterY) > Math.abs(targetCenterX - sourceCenterX) * 0.35
  return {
    sourceX: sourceCenterX,
    sourceY: vertical && targetCenterY > sourceCenterY ? edge.source.y + edge.source.height : vertical ? edge.source.y : sourceCenterY,
    targetX: targetCenterX,
    targetY: vertical && targetCenterY > sourceCenterY ? edge.target.y : vertical ? edge.target.y + edge.target.height : targetCenterY,
    vertical,
  }
}

function referenceEdgePath(edge: ReferenceTopologyEdge) {
  const { sourceX, sourceY, targetX, targetY, vertical } = referenceEdgeAnchors(edge)
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  if (vertical) {
    const midY = sourceY + dy * 0.5
    const bend = Math.max(-90, Math.min(90, dx * 0.08))
    return `M ${sourceX} ${sourceY} C ${sourceX + bend} ${midY}, ${targetX - bend} ${midY}, ${targetX} ${targetY}`
  }
  const curve = Math.max(68, Math.min(260, Math.abs(dx) * 0.42))
  const direction = dx >= 0 ? 1 : -1
  return `M ${sourceX} ${sourceY} C ${sourceX + curve * direction} ${sourceY}, ${targetX - curve * direction} ${targetY}, ${targetX} ${targetY}`
}

function referenceEdgeLabel(edge: ReferenceTopologyEdge, index: number) {
  const { sourceX, sourceY, targetX, targetY, vertical } = referenceEdgeAnchors(edge)
  const duplicateOffset = ((index % 3) - 1) * 9
  return {
    x: (sourceX + targetX) / 2 + (vertical ? duplicateOffset : 0),
    y: (sourceY + targetY) / 2 - 8 + (vertical ? 0 : duplicateOffset),
    width: Math.min(150, Math.max(58, edge.label.length * 9 + 24)),
  }
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
  const [regineCode, azCode] = simulatedTopologyLocation(node)
  return {
    id: node.id,
    label: node.label || node.id,
    type: node.type,
    color: node.color,
    iconPreset: node.iconPreset,
    properties: {
      ...node.properties,
      id: node.id,
      regine_code: valueText(node.properties.regine_code) || valueText(node.properties.region) || regineCode,
      az_code: valueText(node.properties.az_code) || valueText(node.properties.zone) || azCode,
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

function aggregateRecordSortValue(record: EntityRecord, node: TopologyNode | undefined, key: EntityAggregateSortKey) {
  if (key === 'instanceId') return record.id
  if (key === 'name') return record.label
  if (key === 'type') return record.type
  if (key === 'tags') return node ? entityTagCount(node) : 0
  if (key === 'probe') return valueText(record.properties.__method__) || 'EntityStore'
  if (key === 'language') return valueText(record.properties.language) || ''
  if (key === 'region') return entityLocationText(record.properties) || record.domain
  if (key === 'created') return entityTimeSortValue(record.properties.created_at) || entityTimeSortValue(record.properties.createTime) || 0
  if (key === 'updated') return entityTimeSortValue(record.properties.updated_at) || entityTimeSortValue(record.properties.updateTime) || entityTimeSortValue(record.properties.__last_observed_time__) || 0
  return Number(record.properties.relationCount || 0)
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

function entityLocationText(props: Record<string, unknown>) {
  const regine = valueText(props.regine_code) || valueText(props.region)
  const az = valueText(props.az_code) || valueText(props.zone)
  return [regine, az].filter(Boolean).join(' / ')
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
