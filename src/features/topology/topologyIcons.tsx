import type { CSSProperties } from 'react'
import type { TopologyNode } from './topologyModel'

export type TopologyIconPreset =
  | 'default'
  | 'service'
  | 'application'
  | 'deployment'
  | 'instance'
  | 'database'
  | 'redis'
  | 'network'
  | 'loadbalancer'
  | 'endpoint'
  | 'pod'

export function resolveTopologyNodeIconPreset(node: Pick<TopologyNode, 'type' | 'label' | 'iconPreset'>) {
  return normalizeTopologyIconPreset(node.iconPreset) || inferTopologyIconPreset(`${node.type} ${node.label}`)
}

export function TopologyPresetIcon({
  preset,
  label,
  size = 16,
  strokeWidth = 1.9,
  style,
}: {
  preset?: TopologyIconPreset
  label: string
  size?: number
  strokeWidth?: number
  style?: CSSProperties
}) {
  const kind = normalizeTopologyIconPreset(preset) || inferTopologyIconPreset(label)
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    style,
  }

  if (kind === 'pod') {
    return (
      <svg {...props}>
        <path d="M12 3.2 19 7.2v9.6l-7 4-7-4V7.2l7-4Z" />
        <path d="m5 7.4 7 4 7-4M12 11.4v9.2" />
      </svg>
    )
  }
  if (kind === 'service') {
    return (
      <svg {...props}>
        <path d="M12 4v6M6 18l6-8 6 8" />
        <circle cx="12" cy="4" r="2.1" />
        <circle cx="6" cy="18" r="2.1" />
        <circle cx="18" cy="18" r="2.1" />
      </svg>
    )
  }
  if (kind === 'deployment' || kind === 'application') {
    return (
      <svg {...props}>
        <rect x="5" y="5" width="14" height="14" rx="2.4" />
        <path d="M9 9h2.8M9 12h6M9 15h4.6" />
      </svg>
    )
  }
  if (kind === 'instance') {
    return (
      <svg {...props}>
        <rect x="5" y="4.8" width="14" height="14.4" rx="2.2" />
        <path d="M8.5 10h7M8.5 14h7" />
      </svg>
    )
  }
  if (kind === 'database') {
    return (
      <svg {...props}>
        <ellipse cx="12" cy="6.5" rx="6.4" ry="3.2" />
        <path d="M5.6 6.5v10.6c0 1.8 2.9 3.2 6.4 3.2s6.4-1.4 6.4-3.2V6.5M5.6 12c0 1.8 2.9 3.2 6.4 3.2s6.4-1.4 6.4-3.2" />
      </svg>
    )
  }
  if (kind === 'redis') {
    return (
      <svg {...props}>
        <path d="m5 8 7-3.8L19 8l-7 3.8L5 8Z" />
        <path d="m5 12.2 7 3.8 7-3.8M5 16.2l7 3.8 7-3.8" />
      </svg>
    )
  }
  if (kind === 'network') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M3.8 12h16.4M12 3.8c2.3 2.3 3.4 5 3.4 8.2s-1.1 5.9-3.4 8.2M12 3.8c-2.3 2.3-3.4 5-3.4 8.2s1.1 5.9 3.4 8.2" />
      </svg>
    )
  }
  if (kind === 'loadbalancer') {
    return (
      <svg {...props}>
        <path d="M12 5v5M12 10 6.5 17M12 10l5.5 7" />
        <rect x="9" y="3" width="6" height="4" rx="1.2" />
        <rect x="3.5" y="16" width="6" height="4" rx="1.2" />
        <rect x="14.5" y="16" width="6" height="4" rx="1.2" />
      </svg>
    )
  }
  if (kind === 'endpoint') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="7.5" />
        <path d="M8.5 12h7M13 8.5l3.5 3.5-3.5 3.5" />
      </svg>
    )
  }
  return <span style={{ fontSize: Math.max(10, size * 0.78), fontWeight: 700, lineHeight: 1 }}>{abbrevFromLabel(label)}</span>
}

export function drawTopologyPresetGlyph(
  context: CanvasRenderingContext2D,
  preset: TopologyIconPreset | undefined,
  label: string,
  x: number,
  y: number,
  size: number,
) {
  const kind = normalizeTopologyIconPreset(preset) || inferTopologyIconPreset(label)
  const s = size / 24
  context.save()
  context.translate(x - size / 2, y - size / 2)
  context.scale(s, s)
  context.lineCap = 'round'
  context.lineJoin = 'round'
  context.lineWidth = 1.85
  context.strokeStyle = context.fillStyle as string

  if (kind === 'pod') {
    strokePath(context, [['M', 12, 3.2], ['L', 19, 7.2], ['L', 19, 16.8], ['L', 12, 20.8], ['L', 5, 16.8], ['L', 5, 7.2], ['Z']])
    strokePath(context, [['M', 5, 7.4], ['L', 12, 11.4], ['L', 19, 7.4]])
    strokePath(context, [['M', 12, 11.4], ['L', 12, 20.6]])
  } else if (kind === 'service') {
    strokePath(context, [['M', 12, 4], ['L', 12, 10], ['M', 6, 18], ['L', 12, 10], ['L', 18, 18]])
    strokeCircle(context, 12, 4, 2.1)
    strokeCircle(context, 6, 18, 2.1)
    strokeCircle(context, 18, 18, 2.1)
  } else if (kind === 'deployment' || kind === 'application') {
    strokeRoundRect(context, 5, 5, 14, 14, 2.4)
    strokePath(context, [['M', 9, 9], ['L', 11.8, 9], ['M', 9, 12], ['L', 15, 12], ['M', 9, 15], ['L', 13.6, 15]])
  } else if (kind === 'instance') {
    strokeRoundRect(context, 5, 4.8, 14, 14.4, 2.2)
    strokePath(context, [['M', 8.5, 10], ['L', 15.5, 10], ['M', 8.5, 14], ['L', 15.5, 14]])
  } else if (kind === 'database') {
    strokeEllipse(context, 12, 6.5, 6.4, 3.2)
    strokePath(context, [['M', 5.6, 6.5], ['L', 5.6, 17.1]])
    strokePath(context, [['M', 18.4, 6.5], ['L', 18.4, 17.1]])
    strokeEllipseArc(context, 12, 17.1, 6.4, 3.2, 0, Math.PI)
    strokeEllipseArc(context, 12, 12, 6.4, 3.2, 0, Math.PI)
  } else if (kind === 'redis') {
    strokePath(context, [['M', 5, 8], ['L', 12, 4.2], ['L', 19, 8], ['L', 12, 11.8], ['Z']])
    strokePath(context, [['M', 5, 12.2], ['L', 12, 16], ['L', 19, 12.2]])
    strokePath(context, [['M', 5, 16.2], ['L', 12, 20], ['L', 19, 16.2]])
  } else if (kind === 'network') {
    strokeCircle(context, 12, 12, 8.2)
    strokePath(context, [['M', 3.8, 12], ['L', 20.2, 12]])
    strokePath(context, [['M', 12, 3.8], ['C', 14.3, 6.1, 15.4, 8.8, 15.4, 12], ['C', 15.4, 15.2, 14.3, 17.9, 12, 20.2]])
    strokePath(context, [['M', 12, 3.8], ['C', 9.7, 6.1, 8.6, 8.8, 8.6, 12], ['C', 8.6, 15.2, 9.7, 17.9, 12, 20.2]])
  } else if (kind === 'loadbalancer') {
    strokePath(context, [['M', 12, 5], ['L', 12, 10], ['M', 12, 10], ['L', 6.5, 17], ['M', 12, 10], ['L', 17.5, 17]])
    strokeRoundRect(context, 9, 3, 6, 4, 1.2)
    strokeRoundRect(context, 3.5, 16, 6, 4, 1.2)
    strokeRoundRect(context, 14.5, 16, 6, 4, 1.2)
  } else if (kind === 'endpoint') {
    strokeCircle(context, 12, 12, 7.5)
    strokePath(context, [['M', 8.5, 12], ['L', 15.5, 12], ['M', 13, 8.5], ['L', 16.5, 12], ['L', 13, 15.5]])
  } else {
    context.font = '700 14px var(--om-cjk-font)'
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(abbrevFromLabel(label), 12, 12.5)
  }
  context.restore()
}

export function normalizeTopologyIconPreset(value?: string): TopologyIconPreset | undefined {
  if (!value) return undefined
  const normalized = value.toLowerCase()
  const allowed: TopologyIconPreset[] = ['default', 'service', 'application', 'deployment', 'instance', 'database', 'redis', 'network', 'loadbalancer', 'endpoint', 'pod']
  return allowed.includes(normalized as TopologyIconPreset) ? (normalized as TopologyIconPreset) : undefined
}

function inferTopologyIconPreset(value: string): TopologyIconPreset {
  const text = value.toLowerCase()
  if (text.includes('service') || text.includes('服务')) return 'service'
  if (text.includes('operation') || text.includes('endpoint') || text.includes('http') || text.includes('api') || text.includes('网关')) return 'endpoint'
  if (text.includes('database') || text.includes('db') || text.includes('数据库') || text.includes('nosql') || text.includes('rds')) return 'database'
  if (text.includes('redis')) return 'redis'
  if (text.includes('instance') || text.includes('host') || text.includes('node') || text.includes('ecs') || text.includes('服务器') || text.includes('主机')) return 'instance'
  if (text.includes('pod') || text.includes('kubernetes') || text.includes('容器')) return 'pod'
  if (text.includes('network') || text.includes('vpc') || text.includes('网络')) return 'network'
  if (text.includes('load') || text.includes('slb') || text.includes('alb') || text.includes('balancer') || text.includes('负载均衡')) return 'loadbalancer'
  if (text.includes('deployment') || text.includes('应用') || text.includes('workspace') || text.includes('工作空间') || text.includes('pai')) return 'application'
  return 'default'
}

function abbrevFromLabel(label: string) {
  return (label || '?').trim().slice(0, 1).toUpperCase()
}

function strokePath(context: CanvasRenderingContext2D, commands: Array<[string, ...number[]]>) {
  context.beginPath()
  for (const [type, ...values] of commands) {
    if (type === 'M') context.moveTo(values[0], values[1])
    if (type === 'L') context.lineTo(values[0], values[1])
    if (type === 'C') context.bezierCurveTo(values[0], values[1], values[2], values[3], values[4], values[5])
    if (type === 'Z') context.closePath()
  }
  context.stroke()
}

function strokeCircle(context: CanvasRenderingContext2D, x: number, y: number, radius: number) {
  context.beginPath()
  context.arc(x, y, radius, 0, Math.PI * 2)
  context.stroke()
}

function strokeEllipse(context: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number) {
  context.beginPath()
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2)
  context.stroke()
}

function strokeEllipseArc(context: CanvasRenderingContext2D, x: number, y: number, radiusX: number, radiusY: number, start: number, end: number) {
  context.beginPath()
  context.ellipse(x, y, radiusX, radiusY, 0, start, end)
  context.stroke()
}

function strokeRoundRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.lineTo(x + width - radius, y)
  context.quadraticCurveTo(x + width, y, x + width, y + radius)
  context.lineTo(x + width, y + height - radius)
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  context.lineTo(x + radius, y + height)
  context.quadraticCurveTo(x, y + height, x, y + height - radius)
  context.lineTo(x, y + radius)
  context.quadraticCurveTo(x, y, x + radius, y)
  context.closePath()
  context.stroke()
}
