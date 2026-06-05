import type { UModelElement } from './types'

const domains = ['cms', 'k8s', 'ecs', 'arms', 'sls', 'pai', 'aiops', 'network', 'security', 'billing']
const entityNames = [
  'Kubernetes 集群',
  'Kubernetes Pod',
  'Kubernetes Deployment',
  'ACK API Server',
  'K8s Nginx Ingress',
  'ECS 主机事件',
  'ECS 实例',
  '云服务器 ECS',
  'AI 应用',
  'GenAI 模型指标',
  '应用',
  '接口',
  '实例',
  '节点监控',
  'K8s 事件',
  'cn-hongkong',
]
const metricNames = [
  '集群 CPU 监控',
  '集群 Pod 监控',
  '集群 GPU 监控',
  '节点监控指标',
  'GPU 节点指标',
  'CoreDNS 节点指标',
  'K8s 容器指标',
  'LLM 指标(v1)',
  'LLM 指标(v0)',
  '异常指标',
  'SLOang 指标',
  'JVM 指标',
  '工具流量指标',
  '大模型流量指标',
  'Detail Metric',
]
const logNames = [
  'k8s-log-ca5',
  'Ingress 部署日志',
  'AI Agent 调用日志',
  'AI Agent 流量日志',
  '应用访问日志',
  'ECS 主机事件日志',
  'ACK API Server 日志',
  'K8s Nginx 日志',
]
const explorerNames = [
  '节点监控Top',
  '集群守护进程',
  '无状态应用监控',
  '工作负载指标',
  '运维巡检',
  'AI 应用分析',
  '模型服务流量',
  '云产品洞察',
]
const runbookNames = [
  'Pod 异常处理',
  'CPU 飙高排查',
  'GPU 节点排查',
  'Ingress 故障恢复',
  'LLM 延迟排查',
  'ECS 主机修复',
  '日志缺失排查',
  '告警收敛策略',
]

export interface MockDataset {
  elements: UModelElement[]
  nodeCount: number
  linkCount: number
}

export function createMockUModelDataset(_nodeTarget = 749): MockDataset {
  const nodes: UModelElement[] = []
  const links: UModelElement[] = []
  let linkSeq = 1

  const entityNodes = createNodes(79, 'entity_set', entityNames, createEntitySet)
  const metricNodes = createNodes(299, 'metric_set', metricNames, createMetricSet)
  const logNodes = createNodes(52, 'log_set', logNames, createLogSet)
  const slsLogNodes = createNodes(90, 'sls_logstore', ['SLS LogStore', 'k8s-log-ca5', 'Ingress 日志库', 'AI 调用日志库'], createLogSet)
  const slsMetricNodes = createNodes(3, 'sls_metricstore', ['SLS MetricStore'], createMetricSet)
  const prometheusNodes = createNodes(34, 'aliyun_prometheus', ['Prometheus 服务', 'ACK Prometheus', 'K8s 指标采集'], createMetricSet)
  const runbookNodes = createNodes(106, 'runbook_set', runbookNames, createRunbookSet)
  const profileNodes = createNodes(1, 'profile_set', ['Profiling 分析'], createProfileSet)
  const traceNodes = createNodes(1, 'trace_set', ['链路追踪'], createTraceSet)
  const eventNodes = createNodes(3, 'event_set', ['K8s 事件', 'ECS 事件', '告警事件'], createEventSet)
  const explorerNodes = createNodes(81, 'explorer', explorerNames, createExplorerSet)

  nodes.push(
    ...entityNodes,
    ...metricNodes,
    ...logNodes,
    ...slsLogNodes,
    ...slsMetricNodes,
    ...prometheusNodes,
    ...runbookNodes,
    ...profileNodes,
    ...traceNodes,
    ...eventNodes,
    ...explorerNodes,
  )

  const hubs = entityNodes.slice(0, 18)
  const majorHub = entityNodes[0]
  const k8sHub = entityNodes[1]
  const aiHub = entityNodes[8]
  const appHub = entityNodes[10]

  function addLink(kind: LinkKind, source: UModelElement, target: UModelElement, relation: string) {
    links.push(createLink(kind, source, target, relation, linkSeq))
    linkSeq += 1
  }

  function addFanout(kind: LinkKind, sources: UModelElement[], targets: UModelElement[], relation: string, count: number) {
    for (let index = 0; index < count; index += 1) {
      const source = sources[index % sources.length]
      const target = targets[(index * 7 + Math.floor(index / sources.length)) % targets.length]
      addLink(kind, source, target, relation)
    }
  }

  addFanout('entity_set_link', [majorHub, k8sHub], entityNodes.slice(1), 'contains', 132)
  addFanout('entity_set_link', hubs, entityNodes, 'depends_on', 132)
  addFanout('data_link', hubs, metricNodes, 'observes_metric', 299)
  addFanout('data_link', hubs.slice(0, 10), logNodes, 'emits_log', 120)
  addFanout('storage_link', logNodes, slsLogNodes, 'stored_in_logstore', 180)
  addFanout('storage_link', metricNodes, slsMetricNodes, 'stored_in_metricstore', 120)
  addFanout('data_link', prometheusNodes, metricNodes, 'scrapes_metric', 210)
  addFanout('explorer_link', explorerNodes, [...entityNodes, ...metricNodes, ...logNodes], 'visualizes', 260)
  addFanout('runbook_link', runbookNodes, [...entityNodes, ...metricNodes, ...logNodes, ...eventNodes], 'remediates', 245)
  addFanout('data_link', [aiHub, appHub], metricNodes.slice(0, 80), 'ai_metric', 110)
  addFanout('data_link', [aiHub, appHub], logNodes.concat(slsLogNodes).slice(0, 80), 'ai_log', 80)
  addFanout('data_link', eventNodes, [...entityNodes, ...metricNodes], 'triggers', 60)
  addFanout('data_link', [profileNodes[0], traceNodes[0]], [...entityNodes, ...metricNodes, ...logNodes], 'diagnoses', 56)

  while (links.length < 1767) {
    const index = links.length
    const sourcePool = index % 3 === 0 ? entityNodes : index % 3 === 1 ? explorerNodes : runbookNodes
    const targetPool = index % 4 === 0 ? metricNodes : index % 4 === 1 ? slsLogNodes : index % 4 === 2 ? logNodes : entityNodes
    addLink('data_link', sourcePool[index % sourcePool.length], targetPool[(index * 11) % targetPool.length], 'related_to')
  }

  return {
    elements: [...nodes, ...links.slice(0, 1767)],
    nodeCount: nodes.length,
    linkCount: 1767,
  }
}

type NodeFactory = (kind: string, domain: string, name: string, index: number) => UModelElement
type LinkKind = 'data_link' | 'entity_set_link' | 'storage_link' | 'explorer_link' | 'runbook_link'

function createNodes(count: number, kind: string, names: string[], factory: NodeFactory) {
  const nodes: UModelElement[] = []
  for (let index = 0; index < count; index += 1) {
    const domain = domains[index % domains.length]
    const baseName = names[index % names.length]
    const suffix = String(index + 1).padStart(3, '0')
    nodes.push(factory(kind, domain, `${baseName}_${suffix}`, index + 1))
  }
  return nodes
}

function createEntitySet(kind: string, domain: string, name: string, index: number): UModelElement {
  return {
    kind,
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${domain} 域 ${name} 观测对象。` },
      primary_key_fields: ['id'],
      fields: [
        field('id', 'string', '主键'),
        field('name', 'string', '名称'),
        field('status', 'string', '状态'),
        field('region', 'string', '区域'),
        field(`dimension_${index % 9}`, 'string', '维度'),
      ],
      labels: { domain, tier: String((index % 5) + 1), scene: 'cmsdemo' },
    },
  }
}

function createMetricSet(kind: string, domain: string, name: string, index: number): UModelElement {
  return {
    kind,
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${domain} 域指标 ${name}` },
      metrics: [
        field('cpu_usage', 'number', 'CPU 使用率'),
        field('memory_usage', 'number', '内存使用率'),
        field('request_total', 'number', '请求量'),
        field(`metric_${index}`, 'number', '业务指标'),
      ],
      dimensions: ['entity_id', 'cluster', 'namespace', 'region'],
      time_field: 'timestamp',
    },
  }
}

function createLogSet(kind: string, domain: string, name: string, index: number): UModelElement {
  return {
    kind,
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${domain} 域日志 ${name}` },
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

function createRunbookSet(kind: string, domain: string, name: string, index: number): UModelElement {
  return {
    kind,
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${name} 自动化处置流程。` },
      steps: [{ name: 'inspect', action: 'query' }, { name: 'repair', action: 'runbook' }],
      labels: { severity: String((index % 4) + 1) },
    },
  }
}

function createExplorerSet(kind: string, domain: string, name: string, index: number): UModelElement {
  return {
    kind,
    domain,
    name,
    version: 'v1.0.0',
    spec: {
      description: { zh_cn: `${name} 探索视图。` },
      view_type: index % 2 === 0 ? 'topology' : 'dashboard',
      labels: { source: 'mock-cmsdemo' },
    },
  }
}

function createProfileSet(kind: string, domain: string, name: string): UModelElement {
  return { kind, domain, name, version: 'v1.0.0', spec: { description: { zh_cn: `${name} profile 数据。` } } }
}

function createTraceSet(kind: string, domain: string, name: string): UModelElement {
  return { kind, domain, name, version: 'v1.0.0', spec: { description: { zh_cn: `${name} trace 数据。` } } }
}

function createEventSet(kind: string, domain: string, name: string): UModelElement {
  return { kind, domain, name, version: 'v1.0.0', spec: { description: { zh_cn: `${name} event 数据。` } } }
}

function createLink(kind: LinkKind, source: UModelElement, target: UModelElement, relation: string, seq: number): UModelElement {
  const typeField = kind === 'entity_set_link'
    ? 'entity_link_type'
    : kind === 'storage_link'
      ? 'storage_link_type'
      : kind === 'explorer_link'
        ? 'explorer_link_type'
        : kind === 'runbook_link'
          ? 'runbook_link_type'
          : 'data_link_type'
  return {
    kind,
    domain: source.domain || target.domain || 'cms',
    name: `${String(seq).padStart(4, '0')}_${source.name}_${relation}_${target.name}`.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]+/g, '_'),
    version: 'v1.0.0',
    spec: {
      [typeField]: relation,
      src: { domain: source.domain, kind: source.kind, name: source.name },
      dest: { domain: target.domain, kind: target.kind, name: target.name },
      description: { zh_cn: `${source.name} ${relation} ${target.name}` },
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
