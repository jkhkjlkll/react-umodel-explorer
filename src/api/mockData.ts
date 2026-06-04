import type { UModelElement } from './types'

const domains = ['devops', 'k8s', 'payments', 'iot', 'retail', 'security', 'supplychain', 'aiops']
const entityPrefixes = ['service', 'instance', 'cluster', 'pipeline', 'order', 'device', 'alert', 'job']
const relationTypes = ['contains', 'runs_on', 'depends_on', 'routes_to', 'owns', 'observes', 'triggers', 'impacts']

export interface MockDataset {
  elements: UModelElement[]
  nodeCount: number
  linkCount: number
}

export function createMockUModelDataset(nodeTarget = 360): MockDataset {
  const elements: UModelElement[] = []
  const entityNodes: UModelElement[] = []
  const perDomain = Math.max(12, Math.floor(nodeTarget / domains.length))

  for (const domain of domains) {
    for (let index = 1; index <= perDomain; index += 1) {
      const prefix = entityPrefixes[index % entityPrefixes.length]
      const name = `${prefix}_${String(index).padStart(3, '0')}`
      const node = createEntitySet(domain, name, index)
      elements.push(node)
      entityNodes.push(node)
    }
  }

  for (const domain of domains) {
    for (let index = 1; index <= 14; index += 1) {
      elements.push(createMetricSet(domain, `metric_stream_${String(index).padStart(2, '0')}`, index))
      elements.push(createLogSet(domain, `log_stream_${String(index).padStart(2, '0')}`, index))
    }
  }

  const nodesByDomain = new Map(domains.map((domain) => [domain, entityNodes.filter((node) => node.domain === domain)]))
  const links: UModelElement[] = []

  for (const domain of domains) {
    const nodes = nodesByDomain.get(domain) || []
    for (let index = 0; index < nodes.length; index += 1) {
      const source = nodes[index]
      const target = nodes[(index + 1 + (index % 5)) % nodes.length]
      links.push(createEntitySetLink(source, target, relationTypes[index % relationTypes.length]))
      if (index % 4 === 0) links.push(createEntitySetLink(source, nodes[(index + 7) % nodes.length], 'related_to'))
    }
  }

  for (let index = 0; index < domains.length * 4; index += 1) {
    const sourceDomain = domains[index % domains.length]
    const targetDomain = domains[(index + 1) % domains.length]
    const source = nodesByDomain.get(sourceDomain)?.[index % perDomain]
    const target = nodesByDomain.get(targetDomain)?.[(index * 3) % perDomain]
    if (source && target) links.push(createEntitySetLink(source, target, 'cross_domain'))
  }

  elements.push(...links)
  return {
    elements,
    nodeCount: elements.filter((element) => element.kind !== 'entity_set_link').length,
    linkCount: links.length,
  }
}

function createEntitySet(domain: string, name: string, index: number): UModelElement {
  return {
    kind: 'entity_set',
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: {
        zh_cn: `${domain} 域 ${name} 示例实体，用于内网移植前的大图联调。`,
        en_us: `Mock entity ${domain}.${name} for standalone Explorer integration.`,
      },
      primary_key_fields: ['id'],
      fields: [
        field('id', 'string', '主键'),
        field('name', 'string', '名称'),
        field('status', 'string', '状态'),
        field('owner', 'string', '负责人'),
        field('region', 'string', '区域'),
        field('updated_at', 'datetime', '更新时间'),
        field(`mock_attr_${index % 9}`, 'string', '模拟属性'),
      ],
      labels: {
        domain,
        mock: 'true',
        tier: String((index % 5) + 1),
      },
    },
  }
}

function createMetricSet(domain: string, name: string, index: number): UModelElement {
  return {
    kind: 'metric_set',
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${domain} 域指标集 ${name}` },
      metrics: [
        field('request_count', 'number', '请求量'),
        field('error_count', 'number', '错误量'),
        field('latency_p95', 'number', 'P95 延迟'),
        field(`custom_metric_${index}`, 'number', '自定义指标'),
      ],
      dimensions: ['entity_id', 'region', 'status'],
      time_field: 'timestamp',
    },
  }
}

function createLogSet(domain: string, name: string, index: number): UModelElement {
  return {
    kind: 'log_set',
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${domain} 域日志集 ${name}` },
      fields: [
        field('timestamp', 'datetime', '时间'),
        field('level', 'string', '级别'),
        field('message', 'string', '内容'),
        field(`trace_${index}`, 'string', '链路字段'),
      ],
      time_field: 'timestamp',
    },
  }
}

function createEntitySetLink(source: UModelElement, target: UModelElement, relation: string): UModelElement {
  return {
    kind: 'entity_set_link',
    domain: source.domain,
    name: `${source.name}_${relation}_${target.domain}_${target.name}`.replace(/[^a-zA-Z0-9_]+/g, '_'),
    version: 'v1.0.0',
    spec: {
      entity_link_type: relation,
      src: { domain: source.domain, kind: source.kind, name: source.name },
      dest: { domain: target.domain, kind: target.kind, name: target.name },
      description: {
        zh_cn: `${source.domain}.${source.name} ${relation} ${target.domain}.${target.name}`,
      },
    },
  }
}

function field(name: string, type: string, description: string) {
  return {
    name,
    type,
    display_name: { zh_cn: description, en_us: name },
    short_description: { zh_cn: description },
  }
}
