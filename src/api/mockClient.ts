import type { UModelApiClient } from './client'
import { createMockUModelDataset } from './mockData'
import type {
  HealthResponse,
  MonitoringDashboardResponse,
  QueryRequest,
  QueryResult,
  SampleImportResult,
  UModelElement,
  ValidationResult,
  WorkspaceMetadata,
  WriteResult,
} from './types'

function elementId(element: UModelElement): string {
  return [element.domain, element.name, element.kind].filter(Boolean).join('/')
}

export class MockUModelApi implements UModelApiClient {
  readonly baseUrl = 'mock://local'
  private elements: UModelElement[]

  constructor(nodeTarget = 360) {
    this.elements = createMockUModelDataset(nodeTarget).elements
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

  async getWorkspace(workspace: string): Promise<WorkspaceMetadata> {
    const now = new Date().toISOString()
    return {
      id: workspace,
      name: workspace,
      description: 'Standalone mock workspace for OModel Explorer migration.',
      labels: { source: 'mock', portable: 'true' },
      paths: { root: 'mock://standalone' },
      status: 'active',
      resource_version: 1,
      created_at: now,
      updated_at: now,
    }
  }

  async listUModel(_workspace: string, limit = 1000): Promise<QueryResult> {
    const rows = this.elements.slice(0, limit).map((element) => ({
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
        total: this.elements.length,
        has_more: this.elements.length > limit,
      },
    }
  }

  async query(workspace: string, payload: QueryRequest): Promise<QueryResult> {
    if (payload.query.includes('.umodel')) {
      return this.listUModel(workspace, payload.limit || 1000)
    }
    return {
      columns: [],
      rows: [],
      page: {
        limit: payload.limit,
        total: 0,
        has_more: false,
      },
    }
  }

  async getMonitoringDashboard(workspace: string, entityId: string, timeRange = '15m'): Promise<MonitoringDashboardResponse> {
    const values = Array.from({ length: timeRange === '6h' ? 72 : 46 }, (_, index) => Number((52 + Math.sin(index / 4) * 12 + (index % 5)).toFixed(2)))
    return {
      workspace,
      entity_id: entityId,
      entity_type: 'mock.entity',
      domain: 'mock',
      time_range: timeRange,
      updated_at: new Date().toISOString(),
      filters: [
        { key: 'entityId', label: 'entityId', value: entityId },
        { key: 'entityName', label: 'entityName', value: entityId },
      ],
      charts: [
        {
          id: 'mock_health',
          title: '健康分',
          series: [{ name: 'health_score', color: '#79ad6f', values }],
        },
        {
          id: 'mock_requests',
          title: '请求量',
          series: [{ name: 'requests', color: '#ebb735', values: values.map((value) => Number((value * 3.4).toFixed(2))) }],
        },
      ],
    }
  }

  async importSampleData(): Promise<SampleImportResult> {
    const dataset = createMockUModelDataset()
    this.elements = dataset.elements
    return {
      workspace: 'mock',
      sample: 'large-mock-graph',
      umodel: {
        workspace: 'mock',
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
    return { accepted: elements.length, failed: 0 }
  }

  async deleteUModel(_workspace: string, ids: string[]): Promise<WriteResult> {
    const idSet = new Set(ids)
    const before = this.elements.length
    this.elements = this.elements.filter((element) => !idSet.has(elementId(element)))
    return { accepted: before - this.elements.length, failed: 0 }
  }
}
