import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor from '@monaco-editor/react'
import {
  AlertCircle,
  Braces,
  CheckCircle2,
  CircleDot,
  Copy,
  Eraser,
  Plug,
  RefreshCw,
  Search,
  ServerCog,
  TerminalSquare,
  Unplug,
  Wrench,
} from 'lucide-react'
import { Badge, Button, IconButton } from '../../design/components'
import { disableMonacoEditContext } from '../../lib/preloadMonaco'
import './mcpDebugger.css'

disableMonacoEditContext()

const DEFAULT_MCP_ENDPOINT = 'http://127.0.0.1:8080/mcp'
const DEFAULT_PROTOCOL_VERSION = '2025-06-18'
const endpointStorageKey = 'standalone.umodel.mcpEndpoint'

type ConnectionState = 'disconnected' | 'connecting' | 'connected'
type InspectorView = 'response' | 'logs'

interface McpTool {
  name: string
  title?: string
  description?: string
  inputSchema?: JsonSchema
}

interface JsonSchema {
  type?: string
  title?: string
  description?: string
  required?: string[]
  properties?: Record<string, JsonSchema & { default?: unknown; enum?: unknown[] }>
  items?: JsonSchema
  [key: string]: unknown
}

interface JsonRpcMessage {
  jsonrpc?: string
  id?: number | string | null
  result?: unknown
  error?: {
    code?: number
    message?: string
    data?: unknown
  }
  method?: string
  params?: unknown
}

interface RpcExecution {
  message: JsonRpcMessage | null
  durationMs: number
  status: number
}

interface McpLogEntry {
  id: number
  time: string
  direction: 'request' | 'response' | 'error'
  method: string
  durationMs?: number
  status?: number
  payload: unknown
}

export function McpDebuggerPage() {
  const [endpoint, setEndpoint] = useState(() => window.localStorage.getItem(endpointStorageKey) || DEFAULT_MCP_ENDPOINT)
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected')
  const [protocolVersion, setProtocolVersion] = useState(DEFAULT_PROTOCOL_VERSION)
  const [sessionId, setSessionId] = useState('')
  const [serverInfo, setServerInfo] = useState<{ name?: string; version?: string }>({})
  const [tools, setTools] = useState<McpTool[]>([])
  const [toolFilter, setToolFilter] = useState('')
  const [selectedToolName, setSelectedToolName] = useState('')
  const [argumentsText, setArgumentsText] = useState('{}')
  const [callResult, setCallResult] = useState<unknown>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [logs, setLogs] = useState<McpLogEntry[]>([])
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null)
  const [inspectorView, setInspectorView] = useState<InspectorView>('response')
  const requestIdRef = useRef(0)
  const logIdRef = useRef(0)
  const sessionIdRef = useRef('')
  const protocolVersionRef = useRef(DEFAULT_PROTOCOL_VERSION)

  const selectedTool = useMemo(
    () => tools.find((tool) => tool.name === selectedToolName) || null,
    [selectedToolName, tools],
  )
  const filteredTools = useMemo(() => {
    const needle = toolFilter.trim().toLowerCase()
    if (!needle) return tools
    return tools.filter((tool) => `${tool.name} ${tool.title || ''} ${tool.description || ''}`.toLowerCase().includes(needle))
  }, [toolFilter, tools])
  const selectedLog = useMemo(() => logs.find((entry) => entry.id === selectedLogId) || logs[0] || null, [logs, selectedLogId])

  const appendLog = useCallback((entry: Omit<McpLogEntry, 'id' | 'time'>) => {
    const nextEntry: McpLogEntry = {
      ...entry,
      id: ++logIdRef.current,
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    }
    setLogs((current) => [nextEntry, ...current].slice(0, 80))
    setSelectedLogId(nextEntry.id)
  }, [])

  const executeRpc = useCallback(async (
    method: string,
    params?: Record<string, unknown>,
    notification = false,
  ): Promise<RpcExecution> => {
    const id = notification ? undefined : ++requestIdRef.current
    const payload: JsonRpcMessage = {
      jsonrpc: '2.0',
      ...(id === undefined ? {} : { id }),
      method,
      ...(params ? { params } : {}),
    }
    appendLog({ direction: 'request', method, payload })
    const started = performance.now()
    try {
      const response = await sendMcpHttpRequest({
        endpoint: endpoint.trim(),
        payload,
        protocolVersion: protocolVersionRef.current,
        sessionId: sessionIdRef.current,
      })
      const durationMs = Math.max(1, Math.round(performance.now() - started))
      const nextSessionId = response.sessionId
      if (nextSessionId && nextSessionId !== sessionIdRef.current) {
        sessionIdRef.current = nextSessionId
        setSessionId(nextSessionId)
      }
      appendLog({
        direction: 'response',
        method,
        durationMs,
        status: response.status,
        payload: response.message ?? { status: response.status },
      })
      if (response.message?.error) {
        const rpcError = response.message.error
        throw new Error(`${rpcError.code ?? 'MCP'}: ${rpcError.message || 'MCP request failed'}`)
      }
      return { message: response.message, durationMs, status: response.status }
    } catch (nextError) {
      const message = formatMcpError(nextError)
      appendLog({ direction: 'error', method, durationMs: Math.max(1, Math.round(performance.now() - started)), payload: { error: message } })
      throw new Error(message)
    }
  }, [appendLog, endpoint])

  const selectTool = useCallback((tool: McpTool) => {
    setSelectedToolName(tool.name)
    setArgumentsText(JSON.stringify(createDefaultArguments(tool.inputSchema), null, 2))
    setCallResult(null)
    setError('')
  }, [])

  const refreshTools = useCallback(async () => {
    const execution = await executeRpc('tools/list', {})
    const result = isRecord(execution.message?.result) ? execution.message.result : {}
    const nextTools = Array.isArray(result.tools) ? result.tools.filter(isMcpTool) : []
    setTools(nextTools)
    setSelectedToolName((current) => {
      if (nextTools.some((tool) => tool.name === current)) return current
      return nextTools[0]?.name || ''
    })
    if (nextTools.length > 0 && !nextTools.some((tool) => tool.name === selectedToolName)) {
      setArgumentsText(JSON.stringify(createDefaultArguments(nextTools[0]?.inputSchema), null, 2))
    }
    return nextTools
  }, [executeRpc, selectedToolName])

  const connect = useCallback(async () => {
    setError('')
    setBusy(true)
    setConnectionState('connecting')
    setCallResult(null)
    setTools([])
    setSelectedToolName('')
    sessionIdRef.current = ''
    protocolVersionRef.current = DEFAULT_PROTOCOL_VERSION
    setSessionId('')
    setProtocolVersion(DEFAULT_PROTOCOL_VERSION)
    try {
      validateMcpEndpoint(endpoint)
      window.localStorage.setItem(endpointStorageKey, endpoint.trim())
      const initialization = await executeRpc('initialize', {
        protocolVersion: DEFAULT_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'umodel-mcp-debugger', version: '0.1.0' },
      })
      const result = isRecord(initialization.message?.result) ? initialization.message.result : {}
      const nextProtocolVersion = typeof result.protocolVersion === 'string' ? result.protocolVersion : DEFAULT_PROTOCOL_VERSION
      protocolVersionRef.current = nextProtocolVersion
      setProtocolVersion(nextProtocolVersion)
      setServerInfo(isRecord(result.serverInfo) ? {
        name: typeof result.serverInfo.name === 'string' ? result.serverInfo.name : undefined,
        version: typeof result.serverInfo.version === 'string' ? result.serverInfo.version : undefined,
      } : {})
      await executeRpc('notifications/initialized', undefined, true)
      await refreshTools()
      setConnectionState('connected')
    } catch (nextError) {
      setConnectionState('disconnected')
      setError(formatMcpError(nextError))
    } finally {
      setBusy(false)
    }
  }, [endpoint, executeRpc, refreshTools])

  const disconnect = useCallback(() => {
    setConnectionState('disconnected')
    setTools([])
    setSelectedToolName('')
    setCallResult(null)
    setError('')
    sessionIdRef.current = ''
    setSessionId('')
    setServerInfo({})
  }, [])

  const callTool = useCallback(async () => {
    if (!selectedTool) return
    setBusy(true)
    setError('')
    try {
      const parsedArguments = argumentsText.trim() ? JSON.parse(argumentsText) : {}
      if (!isRecord(parsedArguments)) throw new Error('工具参数必须是 JSON 对象。')
      const execution = await executeRpc('tools/call', { name: selectedTool.name, arguments: parsedArguments })
      setCallResult(execution.message?.result ?? null)
      setInspectorView('response')
    } catch (nextError) {
      setError(formatMcpError(nextError))
    } finally {
      setBusy(false)
    }
  }, [argumentsText, executeRpc, selectedTool])

  useEffect(() => {
    if (!selectedTool) return
    if (!argumentsText.trim()) setArgumentsText(JSON.stringify(createDefaultArguments(selectedTool.inputSchema), null, 2))
  }, [argumentsText, selectedTool])

  return (
    <div className="mcp-debugger">
      <header className="mcp-debug-head">
        <div className="mcp-debug-title">
          <ServerCog size={18} />
          <strong>MCP 调试</strong>
          <Badge tone="indigo">Streamable HTTP</Badge>
        </div>
        <form className="mcp-connection-form" onSubmit={(event) => { event.preventDefault(); void connect() }}>
          <label className="mcp-endpoint-field">
            <CircleDot size={14} />
            <input
              aria-label="MCP 服务地址"
              value={endpoint}
              disabled={connectionState === 'connecting'}
              onChange={(event) => setEndpoint(event.target.value)}
              placeholder="http://127.0.0.1:8080/mcp"
              spellCheck={false}
            />
          </label>
          {connectionState === 'connected' ? (
            <Button type="button" size="sm" onClick={disconnect}><Unplug size={14} />断开</Button>
          ) : (
            <Button className="mcp-connect-button" type="submit" variant="primary" size="sm" disabled={busy || !endpoint.trim()}>
              <Plug size={14} />{connectionState === 'connecting' ? '连接中' : '连接'}
            </Button>
          )}
        </form>
      </header>

      <div className={`mcp-connection-strip ${connectionState}`}>
        <span><i />{connectionState === 'connected' ? '已连接' : connectionState === 'connecting' ? '正在初始化' : '未连接'}</span>
        <code>{serverInfo.name || 'MCP Server'}{serverInfo.version ? ` ${serverInfo.version}` : ''}</code>
        <span>协议 {protocolVersion}</span>
        {sessionId && <span className="mcp-session-id" title={sessionId}>Session {sessionId}</span>}
      </div>

      {error && <div className="mcp-debug-error"><AlertCircle size={15} /><span>{error}</span></div>}

      <div className="mcp-debug-layout">
        <aside className="mcp-tool-panel">
          <div className="mcp-panel-heading">
            <div><Wrench size={15} /><strong>工具</strong><span>{tools.length}</span></div>
            <IconButton
              label="刷新工具列表"
              size="sm"
              disabled={connectionState !== 'connected' || busy}
              onClick={() => void refreshTools().catch((nextError) => setError(formatMcpError(nextError)))}
            >
              <RefreshCw size={14} />
            </IconButton>
          </div>
          <label className="mcp-tool-search">
            <Search size={14} />
            <input value={toolFilter} onChange={(event) => setToolFilter(event.target.value)} placeholder="搜索工具" />
          </label>
          <div className="mcp-tool-list">
            {filteredTools.length > 0 ? filteredTools.map((tool) => (
              <button key={tool.name} className={tool.name === selectedToolName ? 'active' : ''} type="button" onClick={() => selectTool(tool)}>
                <Wrench size={14} />
                <span><strong>{tool.title || tool.name}</strong><small>{tool.description || tool.name}</small></span>
              </button>
            )) : (
              <div className="mcp-tool-empty">{connectionState === 'connected' ? '没有可用工具' : '等待连接'}</div>
            )}
          </div>
        </aside>

        <main className="mcp-request-panel">
          <div className="mcp-panel-heading mcp-request-heading">
            <div>
              <Braces size={15} />
              <span><strong>{selectedTool?.title || selectedTool?.name || '工具调用'}</strong><small>{selectedTool?.description || '选择一个工具查看参数'}</small></span>
            </div>
            <Button
              className="mcp-call-button"
              variant="primary"
              size="sm"
              disabled={!selectedTool || connectionState !== 'connected' || busy}
              onClick={() => void callTool()}
            >
              <TerminalSquare size={14} />{busy ? '执行中' : '调用工具'}
            </Button>
          </div>
          <section className="mcp-editor-section mcp-arguments-section">
            <div className="mcp-section-title"><strong>Arguments</strong><span>JSON</span></div>
            <JsonCodeEditor value={argumentsText} onChange={setArgumentsText} />
          </section>
          <section className="mcp-editor-section mcp-schema-section">
            <div className="mcp-section-title"><strong>Input Schema</strong><span>只读</span></div>
            <JsonCodeEditor value={JSON.stringify(selectedTool?.inputSchema || {}, null, 2)} readOnly />
          </section>
        </main>

        <section className="mcp-inspector-panel">
          <div className="mcp-inspector-tabs">
            <button className={inspectorView === 'response' ? 'active' : ''} type="button" onClick={() => setInspectorView('response')}>响应</button>
            <button className={inspectorView === 'logs' ? 'active' : ''} type="button" onClick={() => setInspectorView('logs')}>会话日志 <span>{logs.length}</span></button>
            <IconButton label="清空日志" size="sm" onClick={() => { setLogs([]); setSelectedLogId(null) }}><Eraser size={14} /></IconButton>
          </div>
          {inspectorView === 'response' ? (
            <div className="mcp-response-view">
              <div className="mcp-response-summary">
                {callResult === null ? <span>暂无调用结果</span> : <span><CheckCircle2 size={14} />调用完成</span>}
                <IconButton
                  label="复制响应"
                  size="sm"
                  disabled={callResult === null}
                  onClick={() => void navigator.clipboard.writeText(JSON.stringify(callResult, null, 2))}
                >
                  <Copy size={14} />
                </IconButton>
              </div>
              <JsonCodeEditor value={JSON.stringify(callResult ?? {}, null, 2)} readOnly />
            </div>
          ) : (
            <div className="mcp-log-view">
              <div className="mcp-log-list">
                {logs.map((entry) => (
                  <button key={entry.id} className={`${entry.direction} ${entry.id === selectedLog?.id ? 'active' : ''}`} type="button" onClick={() => setSelectedLogId(entry.id)}>
                    <span>{entry.direction === 'request' ? '→' : entry.direction === 'response' ? '←' : '!'}</span>
                    <strong>{entry.method}</strong>
                    <small>{entry.status ? `${entry.status} · ` : ''}{entry.durationMs ? `${entry.durationMs}ms · ` : ''}{entry.time}</small>
                  </button>
                ))}
                {logs.length === 0 && <div className="mcp-log-empty">暂无会话日志</div>}
              </div>
              <div className="mcp-log-payload">
                <JsonCodeEditor value={JSON.stringify(selectedLog?.payload ?? {}, null, 2)} readOnly />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function JsonCodeEditor({ value, onChange, readOnly = false }: { value: string; onChange?: (value: string) => void; readOnly?: boolean }) {
  return (
    <Editor
      height="100%"
      language="json"
      theme="vs"
      value={value}
      onChange={(nextValue) => onChange?.(nextValue || '')}
      options={{
        automaticLayout: true,
        minimap: { enabled: false },
        readOnly,
        lineNumbers: 'on',
        lineNumbersMinChars: 3,
        folding: true,
        fontSize: 12,
        glyphMargin: false,
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        padding: { top: 10, bottom: 10 },
        renderLineHighlight: readOnly ? 'none' : 'line',
        overviewRulerBorder: false,
        overviewRulerLanes: 0,
      }}
    />
  )
}

async function sendMcpHttpRequest({
  endpoint,
  payload,
  protocolVersion,
  sessionId,
}: {
  endpoint: string
  payload: JsonRpcMessage
  protocolVersion: string
  sessionId: string
}) {
  validateMcpEndpoint(endpoint)
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 30000)
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
      'MCP-Protocol-Version': protocolVersion,
    }
    if (sessionId) headers['Mcp-Session-Id'] = sessionId
    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    const responseText = await response.text()
    const message = parseMcpResponse(responseText, response.headers.get('content-type') || '', payload.id)
    if (!response.ok) {
      const detail = message?.error?.message || responseText.trim() || response.statusText
      throw new Error(`HTTP ${response.status}: ${detail}`)
    }
    return {
      message,
      sessionId: response.headers.get('Mcp-Session-Id') || sessionId,
      status: response.status,
    }
  } finally {
    window.clearTimeout(timeout)
  }
}

function parseMcpResponse(text: string, contentType: string, requestId?: number | string | null): JsonRpcMessage | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  if (contentType.includes('text/event-stream') || trimmed.startsWith('event:') || trimmed.startsWith('data:')) {
    const messages = trimmed
      .split(/\r?\n\r?\n/)
      .map((eventBlock) => eventBlock.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n'))
      .filter(Boolean)
      .map((data) => JSON.parse(data) as JsonRpcMessage)
    return messages.find((message) => requestId !== undefined && message.id === requestId) || messages[messages.length - 1] || null
  }
  return JSON.parse(trimmed) as JsonRpcMessage
}

function createDefaultArguments(schema?: JsonSchema) {
  if (!schema?.properties) return {}
  const required = new Set(schema.required || [])
  return Object.entries(schema.properties).reduce<Record<string, unknown>>((result, [name, property]) => {
    if ('default' in property) {
      result[name] = property.default
      return result
    }
    if (!required.has(name)) return result
    if (property.enum?.length) result[name] = property.enum[0]
    else if (property.type === 'number' || property.type === 'integer') result[name] = 0
    else if (property.type === 'boolean') result[name] = false
    else if (property.type === 'array') result[name] = []
    else if (property.type === 'object') result[name] = {}
    else result[name] = ''
    return result
  }, {})
}

function validateMcpEndpoint(endpoint: string) {
  let parsed: URL
  try {
    parsed = new URL(endpoint.trim())
  } catch {
    throw new Error('请输入有效的 MCP HTTP 地址。')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('当前调试器仅支持 HTTP 或 HTTPS MCP 地址。')
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isMcpTool(value: unknown): value is McpTool {
  return isRecord(value) && typeof value.name === 'string'
}

function formatMcpError(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') return '连接超时，请检查 MCP 服务状态。'
  const message = error instanceof Error ? error.message : String(error)
  if (message === 'Failed to fetch' || message.includes('NetworkError')) {
    return '无法访问 MCP 服务，请检查地址、服务状态和 CORS 配置。'
  }
  return message
}
