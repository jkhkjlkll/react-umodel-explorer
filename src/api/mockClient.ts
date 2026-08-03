import type { UModelApiClient } from './client'
import { createMockUModelDataset } from './mockData'
import type {
  AgentDiscovery,
  AgentResourceReadResult,
  AgentToolCallResult,
  CreateWorkspaceRequest,
  EntityWriteBatch,
  ExpireRequest,
  HealthResponse,
  Page,
  QueryExplain,
  QueryRequest,
  QueryResult,
  RelationWriteBatch,
  SampleImportResult,
  UModelElement,
  UModelImportRequest,
  UModelImportResult,
  UpdateWorkspaceRequest,
  ValidationResult,
  WorkspaceMetadata,
  WriteResult,
} from './types'

function elementId(element: UModelElement): string {
  return [element.domain, element.name, element.kind].filter(Boolean).join('/')
}

function nowIso() {
  return new Date().toISOString()
}

export class MockUModelApi implements UModelApiClient {
  readonly baseUrl = 'mock://local'
  private elements: UModelElement[]
  private workspaces = new Map<string, WorkspaceMetadata>()
  private entityRows: Array<Record<string, unknown>> = []
  private relationRows: Array<Record<string, unknown>> = []

  constructor(nodeTarget = 360) {
    this.elements = createMockUModelDataset(nodeTarget).elements
    this.rebuildRuntimeRows()
  }

  async health(): Promise<HealthResponse> {
    return {
      status: 'ok',
      graphstore: {
        provider: 'mock.memory',
        status: 'ok',
        message: 'Standalone mock data source',
      },
    }
  }

  async listWorkspaces(options: { includeDeleted?: boolean; includeConflicts?: boolean } = {}): Promise<Page<WorkspaceMetadata>> {
    this.ensureWorkspace('demo')
    const items = [...this.workspaces.values()].filter((workspace) => {
      if (workspace.status === 'deleted' && !options.includeDeleted) return false
      if (workspace.status === 'conflicted' && !options.includeConflicts) return false
      return true
    })
    return { items }
  }

  async createWorkspace(payload: CreateWorkspaceRequest): Promise<WorkspaceMetadata> {
    const workspace = makeWorkspace(payload.id, payload.name || payload.id, {
      description: payload.description,
      labels: payload.labels,
      config: payload.config,
    })
    this.workspaces.set(workspace.id, workspace)
    return workspace
  }

  async getWorkspace(workspace: string): Promise<WorkspaceMetadata> {
    return this.ensureWorkspace(workspace)
  }

  async updateWorkspace(workspace: string, payload: UpdateWorkspaceRequest): Promise<WorkspaceMetadata> {
    const current = this.ensureWorkspace(workspace)
    const next: WorkspaceMetadata = {
      ...current,
      name: payload.name ?? current.name,
      description: payload.description ?? current.description,
      labels: payload.replace_labels ? payload.labels || {} : { ...(current.labels || {}), ...(payload.labels || {}) },
      config: payload.replace_config ? payload.config || {} : { ...(current.config || {}), ...(payload.config || {}) },
      resource_version: current.resource_version + 1,
      updated_at: nowIso(),
    }
    this.workspaces.set(workspace, next)
    return next
  }

  async deleteWorkspace(workspace: string): Promise<WorkspaceMetadata> {
    const current = this.ensureWorkspace(workspace)
    const next: WorkspaceMetadata = {
      ...current,
      status: 'deleted',
      resource_version: current.resource_version + 1,
      updated_at: nowIso(),
      deleted_at: nowIso(),
    }
    this.workspaces.set(workspace, next)
    return next
  }

  async query(_workspace: string, payload: QueryRequest): Promise<QueryResult> {
    const source = detectQuerySource(payload.query)
    const limit = payload.limit || extractLimit(payload.query) || 1000
    if (source === '.topo') return this.topoResult(limit)
    if (source === '.entity') return this.entityResult(limit)
    if (source === '.runbook_set') return this.runbookResult(limit, payload.query)
    return this.umodelResult(limit, extractKindFilter(payload.query))
  }

  async explain(_workspace: string, payload: QueryRequest): Promise<QueryExplain> {
    const source = detectQuerySource(payload.query)
    return {
      source,
      provider: 'mock.memory',
      storage_provider: 'mock.memory',
      cypher_dialect: source === '.topo' && payload.query.includes('cypher') ? 'mock-cypher' : undefined,
      cypher_engine: source === '.topo' && payload.query.includes('cypher') ? 'mock' : undefined,
      pushdown: ['limit'],
      fallback: [],
      operators: payload.query.split('|').map((part) => part.trim()).filter(Boolean),
      limit: payload.limit || extractLimit(payload.query),
      timeout_ms: payload.timeout_ms,
      time_range_applied: Boolean(payload.time_range?.from || payload.time_range?.to),
    }
  }

  async listUModel(_workspace: string, limit = 1000): Promise<QueryResult> {
    return this.umodelResult(limit)
  }

  async importUModel(workspace: string, payload: UModelImportRequest): Promise<UModelImportResult> {
    this.ensureWorkspace(workspace)
    return {
      workspace,
      source: payload.path,
      imported: 0,
      skipped: 0,
      elements: [],
    }
  }

  async importSampleData(workspace = 'mock', sample = 'large-mock-graph'): Promise<SampleImportResult> {
    const dataset = createMockUModelDataset()
    this.elements = dataset.elements
    this.rebuildRuntimeRows()
    this.ensureWorkspace(workspace)
    return {
      workspace,
      sample,
      umodel: {
        workspace,
        source: 'mock://large-mock-graph',
        imported: dataset.elements.length,
        skipped: 0,
        elements: dataset.elements,
      },
      entities: { accepted: dataset.nodeCount, failed: 0 },
      relations: { accepted: dataset.linkCount, failed: 0 },
      entity_count: dataset.nodeCount,
      relation_count: dataset.linkCount,
    }
  }

  async validateUModel(_workspace: string, elements: UModelElement[]): Promise<ValidationResult> {
    const errors = elements.flatMap((element, index) => {
      const prefix = `elements[${index}]`
      return [
        !element.kind ? { field: `${prefix}.kind`, reason: 'kind is required' } : null,
        !element.domain ? { field: `${prefix}.domain`, reason: 'domain is required' } : null,
        !element.name ? { field: `${prefix}.name`, reason: 'name is required' } : null,
      ].filter(Boolean) as Array<{ field: string; reason: string }>
    })
    return errors.length > 0 ? { valid: false, errors } : { valid: true }
  }

  async putUModel(_workspace: string, elements: UModelElement[]): Promise<WriteResult> {
    const byId = new Map(this.elements.map((element) => [elementId(element), element]))
    for (const element of elements) byId.set(elementId(element), element)
    this.elements = [...byId.values()]
    this.rebuildRuntimeRows()
    return { accepted: elements.length, failed: 0 }
  }

  async deleteUModel(_workspace: string, ids: string[]): Promise<WriteResult> {
    const idSet = new Set(ids)
    const before = this.elements.length
    this.elements = this.elements.filter((element) => !idSet.has(elementId(element)))
    this.rebuildRuntimeRows()
    return { accepted: before - this.elements.length, failed: 0 }
  }

  async writeEntities(_workspace: string, payload: EntityWriteBatch): Promise<WriteResult> {
    this.entityRows = mergeRowsByStableId(this.entityRows, payload.entities, stableEntityId)
    return { accepted: payload.entities.length, failed: 0 }
  }

  async expireEntities(_workspace: string, payload: ExpireRequest): Promise<WriteResult> {
    const idSet = new Set(payload.ids)
    const before = this.entityRows.length
    this.entityRows = this.entityRows.filter((row) => !idSet.has(stableEntityId(row)))
    return { accepted: before - this.entityRows.length, failed: 0 }
  }

  async writeRelations(_workspace: string, payload: RelationWriteBatch): Promise<WriteResult> {
    this.relationRows = mergeRowsByStableId(this.relationRows, payload.relations, stableRelationId)
    return { accepted: payload.relations.length, failed: 0 }
  }

  async expireRelations(_workspace: string, payload: ExpireRequest): Promise<WriteResult> {
    const idSet = new Set(payload.ids)
    const before = this.relationRows.length
    this.relationRows = this.relationRows.filter((row) => !idSet.has(stableRelationId(row)))
    return { accepted: before - this.relationRows.length, failed: 0 }
  }

  async discoverAgent(workspace: string): Promise<AgentDiscovery> {
    return {
      workspace,
      tools: [
        { name: 'query.execute', description: 'Execute a mock UModel query.', enabled: true },
        { name: 'workspace.inspect', description: 'Inspect mock workspace metadata.', enabled: true },
      ],
      resources: [
        {
          uri: `umodel://workspace/${workspace}/summary`,
          name: 'Workspace summary',
          kind: 'summary',
          description: 'Mock workspace overview.',
          mime_type: 'application/json',
          read_only: true,
        },
      ],
      next_actions: [
        {
          id: 'inspect-topology',
          title: 'Inspect topology',
          description: 'Read sample topology rows.',
          tool: 'query.execute',
          query_api: {
            method: 'POST',
            path: `/api/v1/query/${workspace}/execute`,
            body: { query: '.topo | limit 100', limit: 100 },
          },
        },
      ],
    }
  }

  async readAgentResource(workspace: string, uri: string): Promise<AgentResourceReadResult> {
    return {
      uri,
      mime_type: 'application/json',
      content: {
        workspace,
        nodes: this.entityRows.length,
        relations: this.relationRows.length,
      },
    }
  }

  async executeAgentTool(workspace: string, name: string, args: Record<string, unknown>): Promise<AgentToolCallResult> {
    return {
      name,
      ok: true,
      output: {
        workspace,
        arguments: args,
        rows: this.topoResult(5).rows,
      },
    }
  }

  private ensureWorkspace(workspace: string) {
    const existing = this.workspaces.get(workspace)
    if (existing) return existing
    const next = makeWorkspace(workspace, workspace, {
      description: 'Standalone mock workspace for OModel Explorer migration.',
      labels: { source: 'mock', portable: 'true' },
    })
    this.workspaces.set(workspace, next)
    return next
  }

  private rebuildRuntimeRows() {
    const nodeElements = this.elements.filter((element) => !isLinkElement(element))
    this.entityRows = nodeElements.map((element, index) => entityRowFromElement(element, index))
    this.relationRows = this.elements.filter(isLinkElement).map((element, index) => relationRowFromLink(element, index))
  }

  private umodelResult(limit: number, kindFilter?: string): QueryResult {
    const elements = kindFilter ? this.elements.filter((element) => element.kind === kindFilter) : this.elements
    const rows = elements.slice(0, limit).map((element) => ({
      kind: element.kind,
      domain: element.domain,
      name: element.name,
      version: element.version,
      spec: element.spec,
      metadata: {
        domain: element.domain,
        name: element.name,
        version: element.version,
      },
    }))
    return {
      columns: ['kind', 'domain', 'name', 'version', 'spec', 'metadata'],
      rows,
      page: {
        limit,
        total: elements.length,
        has_more: elements.length > limit,
      },
    }
  }

  private entityResult(limit: number): QueryResult {
    const rows = this.entityRows.slice(0, limit)
    return {
      columns: ['__domain__', '__entity_type__', '__entity_id__', 'display_name', 'status', 'region', 'kind'],
      rows,
      page: {
        limit,
        total: this.entityRows.length,
        has_more: this.entityRows.length > limit,
      },
    }
  }

  private topoResult(limit: number): QueryResult {
    const rows = this.relationRows.slice(0, limit)
    return {
      columns: ['src', 'relation', 'dest'],
      rows,
      page: {
        limit,
        total: this.relationRows.length,
        has_more: this.relationRows.length > limit,
      },
    }
  }

  private runbookResult(limit: number, query: string): QueryResult {
    const domainFilter = extractStringFilter(query, 'domain')
    const typeFilter = normalizeRunbookType(extractStringFilter(query, 'type'))
    const search = extractStringFilter(query, 'query').toLowerCase()
    const rows = this.elements
      .filter((element) => element.kind === 'runbook_set')
      .filter((element) => !domainFilter || element.domain === domainFilter)
      .flatMap((element) => runbookRowsFromElement(element))
      .filter((row) => !typeFilter || normalizeRunbookType(stringValue(row.type)) === typeFilter)
      .map((row) => {
        const text = `${row.title} ${row.content} ${row.name}`.toLowerCase()
        const score = search ? tokenOverlapScore(search, text) : 1
        return { row: { ...row, __score__: score }, score }
      })
      .filter((item) => !search || item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, limit)
      .map((item) => item.row)
    return {
      columns: ['type', 'source', 'domain', 'kind', 'name', 'section', 'title', 'content', 'spec', '__score__'],
      rows,
      page: {
        limit,
        total: rows.length,
        has_more: false,
      },
    }
  }
}

function makeWorkspace(
  id: string,
  name: string,
  overrides: Partial<Pick<WorkspaceMetadata, 'description' | 'labels' | 'config'>> = {},
): WorkspaceMetadata {
  const timestamp = nowIso()
  return {
    id,
    name,
    description: overrides.description,
    labels: overrides.labels || {},
    config: overrides.config || {},
    paths: { root: 'mock://standalone' },
    status: 'active',
    resource_version: 1,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

function detectQuerySource(query: string): '.umodel' | '.entity' | '.topo' | '.runbook_set' {
  const normalized = query.toLowerCase()
  if (normalized.includes('.runbook_set')) return '.runbook_set'
  if (normalized.includes('.topo') || normalized.includes('graph-call')) return '.topo'
  if (normalized.includes('.entity ') || normalized.startsWith('.entity') || normalized.includes('.entity_set')) return '.entity'
  return '.umodel'
}

function extractLimit(query: string) {
  const match = query.match(/\blimit\s+(\d+)/i)
  if (!match) return undefined
  const value = Number.parseInt(match[1], 10)
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function extractKindFilter(query: string) {
  const sourceMatch = query.match(/^\s*\.(entity_set|metric_set|log_set|runbook_set|data_link|entity_set_link|storage_link|explorer_link|runbook_link)\b/i)
  if (sourceMatch) return sourceMatch[1]
  const kindMatch = query.match(/with\s*\(\s*kind\s*=\s*['"]([^'"]+)['"]/i)
  return kindMatch?.[1]
}

function extractStringFilter(query: string, key: string) {
  const match = query.match(new RegExp(`${key}\\s*=\\s*['"]([^'"]*)['"]`, 'i'))
  return match?.[1] || ''
}

function isLinkElement(element: UModelElement) {
  return Boolean(linkSpec(element).src && linkSpec(element).dest)
}

function linkSpec(element: UModelElement) {
  return asRecord(element.spec)
}

function relationRowFromLink(element: UModelElement, index: number): Record<string, unknown> {
  const spec = linkSpec(element)
  const src = endpointRow(asRecord(spec.src), element.domain, index, 'src')
  const dest = endpointRow(asRecord(spec.dest), element.domain, index, 'dest')
  const relationType = relationTypeFromSpec(element)
  return {
    src,
    relation: {
      __relation_id__: elementId(element),
      __relation_type__: relationType,
      relation_type: relationType,
      type: relationType,
      kind: element.kind,
      name: element.name,
    },
    dest,
  }
}

function entityRowFromElement(element: UModelElement, index: number): Record<string, unknown> {
  return {
    __domain__: element.domain || 'mock',
    __entity_type__: element.name || element.kind,
    __entity_id__: element.name || `${element.kind}-${index + 1}`,
    display_name: element.name || `${element.kind}-${index + 1}`,
    status: index % 13 === 0 ? 'warning' : 'normal',
    region: ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-hongkong'][index % 4],
    kind: element.kind,
    version: element.version,
  }
}

function endpointRow(endpoint: Record<string, unknown>, fallbackDomain: string, index: number, side: 'src' | 'dest') {
  const domain = stringValue(endpoint.domain) || fallbackDomain || 'mock'
  const entityType = stringValue(endpoint.name) || stringValue(endpoint.kind) || 'unknown'
  const entityId = stringValue(endpoint.name) || `${side}-${index + 1}`
  return {
    __domain__: domain,
    __entity_type__: entityType,
    __entity_id__: entityId,
    display_name: entityType,
    kind: stringValue(endpoint.kind) || 'entity_set',
    status: index % 17 === 0 ? 'warning' : 'normal',
    region: ['cn-hangzhou', 'cn-shanghai', 'cn-beijing', 'cn-hongkong'][index % 4],
  }
}

function relationTypeFromSpec(element: UModelElement) {
  const spec = linkSpec(element)
  const candidates = [
    spec.entity_link_type,
    spec.storage_link_type,
    spec.explorer_link_type,
    spec.runbook_link_type,
    spec.data_link_type,
    spec.relation_type,
    spec.type,
  ]
  return candidates.map(stringValue).find(Boolean) || element.kind || 'related_to'
}

function runbookRowsFromElement(element: UModelElement): Array<Record<string, unknown>> {
  const spec = asRecord(element.spec)
  const rows: Array<Record<string, unknown>> = []
  for (const section of ['knowledge', 'observations', 'actions', 'automations', 'automation', 'skills', 'steps']) {
    const items = asArray(spec[section])
    items.forEach((item, index) => {
      const itemMap = asRecord(item)
      const title = stringValue(itemMap.title) || stringValue(itemMap.name) || `${section}[${index}]`
      rows.push({
        type: section === 'automation' ? 'automations' : section,
        source: `${element.domain}.runbook_set`,
        domain: element.domain,
        kind: element.kind,
        name: element.name,
        section: `${section}[${index}]`,
        title,
        content: typeof item === 'string' ? item : JSON.stringify(item),
        spec,
      })
    })
  }
  if (rows.length === 0) {
    rows.push({
      type: 'runbook',
      source: `${element.domain}.runbook_set`,
      domain: element.domain,
      kind: element.kind,
      name: element.name,
      section: 'spec',
      title: element.name,
      content: JSON.stringify(spec),
      spec,
    })
  }
  return rows
}

function normalizeRunbookType(value: string) {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return ''
  const aliases: Record<string, string> = {
    knowledge: 'knowledge',
    observation: 'observations',
    observations: 'observations',
    action: 'actions',
    actions: 'actions',
    automation: 'automations',
    automations: 'automations',
    skill: 'skills',
    skills: 'skills',
    step: 'steps',
    steps: 'steps',
  }
  return aliases[normalized] || normalized
}

function tokenOverlapScore(query: string, text: string) {
  const tokens = query.split(/\s+/).map((token) => token.trim()).filter(Boolean)
  if (tokens.length === 0) return 1
  return tokens.reduce((score, token) => score + (text.includes(token) ? 1 : 0), 0)
}

function mergeRowsByStableId(
  current: Array<Record<string, unknown>>,
  incoming: Array<Record<string, unknown>>,
  getId: (row: Record<string, unknown>) => string,
) {
  const rowsById = new Map(current.map((row) => [getId(row), row]))
  for (const row of incoming) rowsById.set(getId(row), row)
  return [...rowsById.values()]
}

function stableEntityId(row: Record<string, unknown>) {
  return (
    stringValue(row.__stable_id__) ||
    [row.__domain__, row.__entity_type__, row.__entity_id__].map(stringValue).filter(Boolean).join('/') ||
    JSON.stringify(row)
  )
}

function stableRelationId(row: Record<string, unknown>) {
  const relation = asRecord(row.relation)
  const src = asRecord(row.src)
  const dest = asRecord(row.dest)
  return (
    stringValue(row.__stable_id__) ||
    stringValue(row.__relation_id__) ||
    stringValue(relation.__relation_id__) ||
    [
      stringValue(row.__src_domain__) || stringValue(src.__domain__),
      stringValue(row.__src_entity_type__) || stringValue(src.__entity_type__),
      stringValue(row.__src_entity_id__) || stringValue(src.__entity_id__),
      stringValue(row.__relation_type__) || stringValue(relation.__relation_type__) || stringValue(relation.type),
      stringValue(row.__dest_domain__) || stringValue(dest.__domain__),
      stringValue(row.__dest_entity_type__) || stringValue(dest.__entity_type__),
      stringValue(row.__dest_entity_id__) || stringValue(dest.__entity_id__),
    ].filter(Boolean).join('/') ||
    JSON.stringify(row)
  )
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null || value === '') return []
  return [value]
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
