import { useState } from 'react'
import { Grid2X2, Monitor, Network, RefreshCw, Search, Settings, Sparkles, Star } from 'lucide-react'
import './cmsTopologyReplica.css'

type CmsView = 'table' | 'topology' | 'health'

const tabs = [
  ['所有实体', '19869'],
  ['应用列表', '218'],
  ['K8s 集群子...', '1'],
  ['ECS 列表', '348'],
  ['RDS 列表', '27'],
  ['RUM...', '4'],
]

const nodeTypes = [
  ['app', '#6aa8e8'],
  ['k8s', '#8ccf87'],
  ['ecs', '#66b7e8'],
  ['rds', '#f0a35c'],
  ['slb', '#b594e8'],
  ['pai', '#70c7b1'],
] as const

const graphNodes = createGraphNodes()
const graphEdges = createGraphEdges(graphNodes)

export function CmsTopologyReplicaPage() {
  const [view, setView] = useState<CmsView>('topology')

  return (
    <div className="cms-replica-page">
      <main className="cms-replica-main">
        <header className="cms-entity-tabs">
          <div className="cms-title">
            <Network size={18} />
            <strong>实体探索</strong>
          </div>
          <nav>
            {tabs.map(([label, count], index) => (
              <button key={label} className={index === 0 ? 'active' : ''} type="button">
                {label}<b>{count}</b>
              </button>
            ))}
          </nav>
          <div className="cms-timebar">
            <span>15min</span>
            <strong>最近15分钟</strong>
            <button type="button"><RefreshCw size={15} /></button>
            <button className="purple" type="button"><Sparkles size={15} /></button>
          </div>
        </header>

        <div className="cms-query-row">
          <div className="cms-mode-tabs">
            <button className="active" type="button"><Search size={14} /> USearch</button>
            <button type="button">▣ SPL</button>
          </div>
          <button className="cms-square" type="button"><Grid2X2 size={16} /></button>
          <button className="cms-square" type="button">▽</button>
          <label className="cms-search">
            <Search size={16} />
            <input placeholder="请输入实体关键词（至少 4 个字符）" />
          </label>
          <button className="cms-primary" type="button">查询</button>
          <div className="cms-view-tabs">
            <button className={view === 'table' ? 'active' : ''} type="button" onClick={() => setView('table')}>表格</button>
            <button className={view === 'topology' ? 'active' : ''} type="button" onClick={() => setView('topology')}>拓扑</button>
            <button className={view === 'health' ? 'active' : ''} type="button" onClick={() => setView('health')}>健康度</button>
          </div>
        </div>

        {view === 'table' && <TableReplica />}
        {view === 'topology' && <TopologyReplica />}
        {view === 'health' && <HealthReplica />}
      </main>
    </div>
  )
}

function TableReplica() {
  return (
    <section className="cms-table-view">
      <div className="cms-summary-grid">
        <section className="cms-summary-card cms-entity-card">
          <strong>实体</strong>
          <div>
            <span><b>19,969</b><small>实体总数</small></span>
            <span><b>7</b><small>实体Domain</small></span>
            <span><b>101</b><small>实体类型</small></span>
          </div>
        </section>
        <section className="cms-summary-card cms-event-card">
          <strong>事件</strong>
          <div className="cms-event-counts">
            <span><b>393</b><small>未恢复事件</small></span>
            <span><b>30,147</b><small>Change 事件</small></span>
          </div>
          <div className="cms-event-bar"><i /><i /><i /><i /></div>
          <div className="cms-event-legend">
            <span><i />严重 347</span><span><i />错误 0</span><span><i />警告 1</span><span><i />提示 116</span>
          </div>
        </section>
        <section className="cms-summary-card cms-health-card">
          <strong>健康度</strong>
          <div className="cms-health-body">
            <div className="cms-health-ring"><b>90%</b><small>正常</small></div>
            <div className="cms-health-list">
              <span><i />正常 <b>197</b></span>
              <span><i />警告 <b>0</b></span>
              <span><i />严重 <b>21</b></span>
              <span><i />总计 <b>218</b></span>
            </div>
          </div>
        </section>
      </div>
      <div className="cms-table-lower">
        <aside className="cms-filter-card">
          <header><strong>过滤器</strong><span>19,969 个实体</span><button type="button">|←</button></header>
          <section>
            <strong>实体范围</strong>
            <button className="active" type="button"><span>所有实体</span><b>19,969</b></button>
            <button type="button"><span>最近访问</span><b>0</b></button>
            <button type="button"><span>关注实体</span><b>8</b></button>
          </section>
          <section>
            <div className="cms-domain-tabs"><button className="active" type="button">实体Domain</button><button type="button">应用</button></div>
            {[
              ['全部实体域', '19,969'],
              ['apm', '774'],
              ['acs', '3,430'],
              ['k8s', '13,538'],
              ['rum', '7'],
              ['synthetics', '9'],
            ].map(([name, count], index) => (
              <button key={name} className={index === 0 ? 'active' : ''} type="button"><span>{name}</span><b>{count}</b></button>
            ))}
          </section>
        </aside>
        <section className="cms-catalog-card">
          <header>
            <strong>实体目录</strong>
            <label><Search size={15} /><input placeholder="搜索实体目录" /></label>
            <button type="button">搜索</button>
          </header>
          <div className="cms-recent-title"><strong>最近访问</strong><span>0 条记录</span></div>
          <div className="cms-catalog-group"><span>apm</span><small>14 类实体</small></div>
          <div className="cms-catalog-grid">
            {[
              ['AI 应用', '已接入 82', '#3e9bd8', true],
              ['AI Agent', '已接入 17', '#3e9bd8', false],
              ['大模型', '已接入 14', '#679a31', false],
              ['工具', '已接入 43', '#679a31', false],
              ['模型服务', '已接入 4', '#679a31', true],
              ['应用', '已接入 218', '#4e81dc', true],
              ['接口', '已接入 174', '#c9862d', false],
              ['实例', '已接入 128', '#4a9f9a', false],
              ['数据库', '已接入 4', '#af42bf', false],
              ['NoSQL 数据库', '已接入 8', '#679a31', false],
              ['消息服务', '已接入 3', '#8d6bf7', false],
              ['HTTP 客户端', '已接入 61', '#679a31', false],
              ['RPC 服务', '已接入 17', '#679a31', false],
              ['其他外部服务', '已接入 1', '#679a31', false],
            ].map(([name, meta, color, starred]) => (
              <button key={name as string} type="button">
                <i style={{ background: color as string }} />
                <span><b>{name}</b><small>{meta}</small></span>
                <Star size={15} className={starred ? 'filled' : ''} />
              </button>
            ))}
          </div>
        </section>
      </div>
    </section>
  )
}

function TopologyReplica() {
  return (
    <section className="cms-graph-stage">
      <div className="cms-zoom">
        <button type="button">－</button>
        <span>13%</span>
        <button type="button">＋</button>
        <button type="button">⌗</button>
      </div>
      <svg className="cms-edges" viewBox="0 0 1600 820" preserveAspectRatio="none" aria-hidden>
        {graphEdges.map((edge) => <path key={edge.id} d={edge.path} />)}
      </svg>
      <div className="cms-node-layer">
        {graphNodes.map((node) => (
          <button
            key={node.id}
            className="cms-graph-node"
            style={{ left: `${node.x}%`, top: `${node.y}%`, ['--node-color' as string]: node.color }}
            type="button"
          >
            <b>{node.title}</b>
            <small>{node.detail}</small>
          </button>
        ))}
      </div>
      <div className="cms-minimap">
        <div>
          {graphNodes.filter((_, index) => index % 2 === 0).map((node) => (
            <i key={node.id} style={{ left: `${node.x}%`, top: `${node.y}%` }} />
          ))}
        </div>
      </div>
    </section>
  )
}

function HealthReplica() {
  const sections = [
    { title: 'AI Agent 可观测', total: 17, normal: 17, warning: 0, critical: 0, rows: 2, red: 0 },
    { title: '应用监控', total: 215, normal: 194, warning: 0, critical: 21, rows: 5, red: 14 },
  ]
  return (
    <section className="cms-health-view">
      {sections.map((section) => (
        <section key={section.title} className="cms-health-panel">
          <header>
            <div><Monitor size={18} /><strong>{section.title}</strong></div>
            <nav><button type="button">阈值设置</button><Settings size={17} /><button type="button">巡检配置</button><Settings size={17} /></nav>
          </header>
          <div className="cms-health-tiles" style={{ ['--rows' as string]: section.rows }}>
            {Array.from({ length: section.rows * 11 }).map((_, index) => {
              const danger = index < section.red
              const labels = ['main', 'qoder-cli', 'DashScopeRe...', 'Hermes', 'insights-serve...', 'qwen38b', 'currency', 'fraud-detection', 'openclaw-writer', 'order-service', 'frontend', 'payment']
              return <button key={index} className={danger ? 'danger' : ''} type="button">{labels[index % labels.length]}</button>
            })}
          </div>
          <footer>
            <span>总计 {section.total} 实体</span>
            <span>正常 <b>{section.normal}</b></span>
            <span>警告 <i>{section.warning}</i></span>
            <span>严重 <em>{section.critical}</em></span>
            <button type="button">⌄ 查看全部</button>
          </footer>
        </section>
      ))}
    </section>
  )
}

function createGraphNodes() {
  const seeds = [
    { cx: 35, cy: 5, rows: 3, cols: 2, gapX: 3.2, gapY: 4.4 },
    { cx: 50, cy: 28, rows: 6, cols: 4, gapX: 4.1, gapY: 4.1 },
    { cx: 38, cy: 36, rows: 2, cols: 8, gapX: 3.8, gapY: 4.3 },
    { cx: 27, cy: 61, rows: 4, cols: 7, gapX: 4.1, gapY: 4 },
    { cx: 67, cy: 34, rows: 5, cols: 3, gapX: 4.1, gapY: 4.2 },
    { cx: 81, cy: 72, rows: 2, cols: 8, gapX: 4, gapY: 4.1 },
    { cx: 73, cy: 56, rows: 3, cols: 2, gapX: 4.2, gapY: 4.4 },
    { cx: 55, cy: 66, rows: 3, cols: 4, gapX: 4, gapY: 4.2 },
  ]
  let sequence = 0
  return seeds.flatMap((seed, seedIndex) => {
    const nodes = []
    for (let row = 0; row < seed.rows; row += 1) {
      for (let col = 0; col < seed.cols; col += 1) {
        sequence += 1
        const [type, color] = nodeTypes[(sequence + seedIndex) % nodeTypes.length]
        nodes.push({
          id: `cms-node-${sequence}`,
          title: titleFor(type, sequence),
          detail: detailFor(type, sequence),
          color,
          x: seed.cx + (col - (seed.cols - 1) / 2) * seed.gapX + Math.sin(sequence * 1.7) * 0.55,
          y: seed.cy + row * seed.gapY + Math.cos(sequence * 1.1) * 0.45,
        })
      }
    }
    return nodes
  })
}

function createGraphEdges(nodes: ReturnType<typeof createGraphNodes>) {
  const edges: Array<{ id: string; path: string }> = []
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pairs = [
    [1, 5], [5, 18], [18, 43], [43, 61], [61, 88], [88, 97],
    [8, 28], [14, 31], [24, 49], [31, 67], [39, 78], [50, 92],
    [57, 71], [66, 82], [76, 98], [91, 108], [3, 47], [11, 54],
    [20, 75], [33, 64], [45, 86], [58, 112], [70, 118], [83, 103],
    [94, 124], [100, 130], [112, 136], [118, 139], [121, 140],
  ]
  for (const [left, right] of pairs) {
    const source = byId.get(`cms-node-${left}`)
    const target = byId.get(`cms-node-${right}`)
    if (!source || !target) continue
    const x1 = source.x * 16
    const y1 = source.y * 8.2
    const x2 = target.x * 16
    const y2 = target.y * 8.2
    const bend = Math.max(24, Math.abs(x2 - x1) * 0.12)
    edges.push({
      id: `edge-${left}-${right}`,
      path: `M ${x1} ${y1} C ${x1 + bend} ${y1 + 18}, ${x2 - bend} ${y2 - 18}, ${x2} ${y2}`,
    })
  }
  return edges
}

function titleFor(type: string, sequence: number) {
  if (type === 'ecs') return `10.179.${90 + (sequence % 40)}.${12 + (sequence % 180)}`
  if (type === 'rds') return '百炼工作空间'
  if (type === 'slb') return '负载均衡'
  if (type === 'pai') return 'PAI-EAS'
  if (type === 'k8s') return '云原生AP'
  return '应用'
}

function detailFor(type: string, sequence: number) {
  if (type === 'ecs') return `i-${String(sequence).padStart(6, '0')}`
  if (type === 'rds') return 'rds / mysql'
  if (type === 'slb') return 'slb / ingress'
  if (type === 'pai') return '模型服务'
  if (type === 'k8s') return 'Kubernetes'
  return 'service'
}
