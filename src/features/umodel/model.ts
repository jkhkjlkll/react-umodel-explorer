import type { UModelElement } from '../../api/types'

export type ViewMode = 'graph' | 'table'
export type ZoomLevel = 'mini' | 'compact' | 'full'
export type DraftStatus = 'added' | 'modified'
export type BackgroundStyle = 'dots' | 'lines' | 'cross' | 'none'
export type EntitySetLinkDisplay = 'absolute_node' | 'relative_link'

export interface KindColor {
  color: string
  bg: string
  text: string
  dot: string
  label: string
  abbrev: string
}

export interface SearchEntry {
  id: string
  title: string
  subtitle: string
  tokens: string[]
  element: UModelElement
}

export interface SearchToken {
  token: string
  count: number
}

export interface SearchIndex {
  entries: SearchEntry[]
  topTokens: SearchToken[]
  kinds: string[]
  domains: string[]
}

export interface DraftDiff {
  added: UModelElement[]
  modified: UModelElement[]
  deleted: UModelElement[]
}

export const nodeWidth = 250
export const nodeMinHeight = 64
export const maxVisibleTags = 3

export const kindColors: Record<string, KindColor> = {
  entity_set: { color: '#8b5cf6', bg: '#f3f0ff', text: '#6d28d9', dot: '#8b5cf6', label: 'EntitySet', abbrev: 'ES' },
  metric_set: { color: '#f97316', bg: '#fff7ed', text: '#c2410c', dot: '#f97316', label: 'MetricSet', abbrev: 'MS' },
  log_set: { color: '#22c55e', bg: '#f0fdf4', text: '#15803d', dot: '#22c55e', label: 'LogSet', abbrev: 'LS' },
  sls_logstore: { color: '#0891b2', bg: '#ecfeff', text: '#0e7490', dot: '#0891b2', label: 'SLSLogStore', abbrev: 'SL' },
  sls_metricstore: { color: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8', dot: '#3b82f6', label: 'SLSMetricStore', abbrev: 'SM' },
  aliyun_prometheus: { color: '#10b981', bg: '#ecfdf5', text: '#047857', dot: '#10b981', label: 'Prometheus', abbrev: 'PR' },
  trace_set: { color: '#0ea5e9', bg: '#f0f9ff', text: '#0369a1', dot: '#0ea5e9', label: 'TraceSet', abbrev: 'TS' },
  event_set: { color: '#14b8a6', bg: '#f0fdfa', text: '#0f766e', dot: '#14b8a6', label: 'EventSet', abbrev: 'EV' },
  profile_set: { color: '#64748b', bg: '#f8fafc', text: '#475569', dot: '#64748b', label: 'ProfileSet', abbrev: 'PS' },
  runbook_set: { color: '#ec4899', bg: '#fdf2f8', text: '#be185d', dot: '#ec4899', label: 'RunbookSet', abbrev: 'RB' },
  explorer: { color: '#0ea5e9', bg: '#f0f9ff', text: '#0369a1', dot: '#0ea5e9', label: 'Explorer', abbrev: 'EX' },
  entity_set_link: { color: '#6366f1', bg: '#eef2ff', text: '#4338ca', dot: '#6366f1', label: 'EntitySetLink', abbrev: 'EL' },
  data_link: { color: '#64748b', bg: '#f8fafc', text: '#475569', dot: '#64748b', label: 'DataLink', abbrev: 'DL' },
  storage_link: { color: '#06b6d4', bg: '#ecfeff', text: '#0e7490', dot: '#06b6d4', label: 'StorageLink', abbrev: 'SL' },
  explorer_link: { color: '#0ea5e9', bg: '#f0f9ff', text: '#0369a1', dot: '#0ea5e9', label: 'ExplorerLink', abbrev: 'XL' },
  runbook_link: { color: '#ec4899', bg: '#fdf2f8', text: '#be185d', dot: '#ec4899', label: 'RunbookLink', abbrev: 'RL' },
}

export const defaultKindColor: KindColor = {
  color: '#94a3b8',
  bg: '#f8fafc',
  text: '#64748b',
  dot: '#94a3b8',
  label: 'OModel',
  abbrev: 'OM',
}

export const nodeKindOrder = [
  'entity_set',
  'metric_set',
  'log_set',
  'sls_logstore',
  'sls_metricstore',
  'aliyun_prometheus',
  'runbook_set',
  'profile_set',
  'trace_set',
  'event_set',
  'explorer',
  'entity_set_link',
]

export const linkKindOrder = ['data_link', 'entity_set_link', 'storage_link', 'explorer_link', 'runbook_link']
export const linkKinds = new Set(linkKindOrder)
export const nodeKindOptions = [
  { value: 'entity_set', label: 'EntitySet' },
  { value: 'metric_set', label: 'MetricSet' },
  { value: 'log_set', label: 'LogSet' },
  { value: 'sls_logstore', label: 'SLSLogStore' },
  { value: 'sls_metricstore', label: 'SLSMetricStore' },
  { value: 'aliyun_prometheus', label: 'Prometheus' },
  { value: 'runbook_set', label: 'RunbookSet' },
  { value: 'trace_set', label: 'TraceSet' },
  { value: 'profile_set', label: 'ProfileSet' },
  { value: 'event_set', label: 'EventSet' },
] as const

const runbookSectionKeys = ['knowledge', 'observations', 'actions', 'automations', 'automation', 'skills', 'steps'] as const
const dataSetKinds = new Set(['metric_set', 'log_set', 'trace_set', 'event_set', 'profile_set'])
const storageKinds = new Set(['sls_logstore', 'sls_metricstore', 'aliyun_prometheus', 'prometheus', 'elasticsearch', 'local.ladybug'])

export function buildElementId(kind: unknown, domain?: string, name?: string) {
  return [domain, name, kind].filter(Boolean).join('/')
}

export function elementKey(element: UModelElement): string {
  return buildElementId(element.kind, element.domain, element.name)
}

export function filterElements(
  elements: UModelElement[],
  fullTextFilters: string[],
  kinds: string[],
  domains: string[],
  focusIds: string[],
  filterStacking: boolean,
  currentView: ViewMode,
  entitySetLinkDisplay: EntitySetLinkDisplay,
) {
  if (currentView === 'graph') {
    return filterGraphElements(elements, fullTextFilters, kinds, domains, focusIds, filterStacking, entitySetLinkDisplay)
  }
  return filterFlatElements(elements, fullTextFilters, kinds, domains, focusIds, filterStacking)
}

export function filterFlatElements(
  elements: UModelElement[],
  fullTextFilters: string[],
  kinds: string[],
  domains: string[],
  focusIds: string[],
  filterStacking: boolean,
) {
  const focusSet = focusIds.length > 0 ? relatedElementIds(elements, focusIds) : null
  return elements.filter((element) => {
    const key = elementKey(element)
    if (focusSet && !focusSet.has(key)) return false
    if (focusSet && !filterStacking) return true
    if (kinds.length > 0 && !kinds.includes(element.kind)) return false
    if (domains.length > 0 && !domains.includes(element.domain || 'unknown')) return false
    const needles = fullTextFilters.flatMap(splitWords)
    if (needles.length === 0) return true
    const tokens = tokensForElement(element).map((value) => value.toLowerCase())
    return needles.every((needle) => tokens.some((value) => value.includes(needle)))
  })
}

export function filterGraphElements(
  elements: UModelElement[],
  fullTextFilters: string[],
  kinds: string[],
  domains: string[],
  focusIds: string[],
  filterStacking: boolean,
  entitySetLinkDisplay: EntitySetLinkDisplay,
) {
  const graphNodeElements = elements.filter((element) => elementActsAsGraphNode(element, entitySetLinkDisplay))
  const linkElements = elements.filter(isLinkElement)
  const alias = aliasForElements(graphNodeElements)
  const focusSet = focusIds.length > 0 ? relatedElementIds(elements, focusIds) : null
  const graphKindFilters = kinds.filter((kind) => kindActsAsGraphNode(kind, entitySetLinkDisplay))
  const selectedNodeIds = new Set<string>()

  for (const element of graphNodeElements) {
    const key = elementKey(element)
    if (focusSet && !focusSet.has(key)) continue
    if (focusSet && !filterStacking) {
      selectedNodeIds.add(key)
      continue
    }
    if (!elementMatchesFlatFilters(element, fullTextFilters, graphKindFilters, domains)) continue
    selectedNodeIds.add(key)
  }

  for (const element of graphNodeElements) {
    const key = elementKey(element)
    if (!isEntitySetLinkElement(element) || !selectedNodeIds.has(key)) continue
    const source = alias.get(endpointId(linkSourceEndpoint(element))) || endpointId(linkSourceEndpoint(element))
    const target = alias.get(endpointId(linkTargetEndpoint(element))) || endpointId(linkTargetEndpoint(element))
    if (source) selectedNodeIds.add(source)
    if (target) selectedNodeIds.add(target)
  }

  const visibleNodeIds = new Set(selectedNodeIds)
  const visibleLinks = new Map<string, UModelElement>()

  for (const link of linkElements) {
    const key = elementKey(link)
    const source = alias.get(endpointId(linkSourceEndpoint(link))) || endpointId(linkSourceEndpoint(link))
    const target = alias.get(endpointId(linkTargetEndpoint(link))) || endpointId(linkTargetEndpoint(link))
    const touchesSelectedNode = Boolean(
      (source && selectedNodeIds.has(source)) ||
      (target && selectedNodeIds.has(target)) ||
      (isEntitySetLinkElement(link) && selectedNodeIds.has(key)),
    )
    if (!touchesSelectedNode) continue
    if (source) visibleNodeIds.add(source)
    if (target) visibleNodeIds.add(target)
    visibleLinks.set(key, link)
  }

  const result = new Map<string, UModelElement>()
  for (const element of graphNodeElements) {
    const key = elementKey(element)
    if (visibleNodeIds.has(key)) result.set(key, element)
  }

  for (const [key, link] of visibleLinks) {
    result.set(key, link)
  }

  return [...result.values()]
}

function elementMatchesFlatFilters(
  element: UModelElement,
  fullTextFilters: string[],
  kinds: string[],
  domains: string[],
) {
  if (kinds.length > 0 && !kinds.includes(element.kind)) return false
  if (domains.length > 0 && !domains.includes(element.domain || 'unknown')) return false
  const needles = fullTextFilters.flatMap(splitWords)
  if (needles.length === 0) return true
  const tokens = tokensForElement(element).map((value) => value.toLowerCase())
  return needles.every((needle) => tokens.some((value) => value.includes(needle)))
}

export function summarize(elements: UModelElement[]) {
  const byKind = new Map<string, number>()
  const byDomain = new Map<string, number>()
  let links = 0
  for (const element of elements) {
    byKind.set(element.kind, (byKind.get(element.kind) || 0) + 1)
    byDomain.set(element.domain || 'unknown', (byDomain.get(element.domain || 'unknown') || 0) + 1)
    if (isLinkElement(element)) links++
  }
  const kindEntries = [...byKind.entries()].sort((left, right) => kindRank(left[0]) - kindRank(right[0]))
  const domainEntries = [...byDomain.entries()].sort((left, right) => right[1] - left[1])
  return { nodes: elements.length - links, links, kindEntries, domainEntries }
}

const recommendationStopWords = new Set([
  'the', 'a', 'an', 'is', 'in', 'on', 'of', 'to', 'for', 'and', 'or', 'with', 'from', 'by', 'at', 'as', 'be', 'was',
  'link', 'set', 'data', 'related', 'related_to', 'name', 'type', 'id', 'info', 'value', 'key', 'keys', 'list',
  'log', 'metric', 'entity', 'node', 'field', 'fields', 'spec', 'metadata', 'src', 'dest', 'kind', 'domain',
  'description', 'display', 'display_name', 'short_description', 'common', 'schema', 'default', 'config',
  'status', 'time', 'count', 'index', 'service', 'instance', 'version', 'labels', 'filter', 'dynamic',
  'en_us', 'zh_cn', 'string', 'number', 'object', 'array', 'boolean', 'true', 'false', 'null', 'undefined',
  'raw', 'primary', 'ordered', 'first', 'last', 'observed', 'time_field', 'primary_key_fields', 'ordered_fields',
  'entity_set', 'metric_set', 'log_set', 'data_link', 'entity_set_link', 'runbook_set', 'runbook_link',
  'runbook', 'knowledge', 'observations', 'observation', 'actions', 'action', 'automations', 'automation', 'skills', 'skill',
  'sls_logstore', 'sls_metricstore', 'aliyun_prometheus', 'explorer', 'storage',
])

export function buildSearchIndex(elements: UModelElement[]): SearchIndex {
  const tokenCounts = new Map<string, number>()
  const allKinds = new Set(elements.map((element) => element.kind.toLowerCase()))
  const allDomains = new Set(elements.map((element) => (element.domain || 'unknown').toLowerCase()))
  const entries = elements.map((element) => {
    const tokens = tokensForElement(element)
    const recommendationTokens = new Set(recommendationTokensForElement(element).flatMap(splitWords))
    for (const token of recommendationTokens) {
      if (!isRecommendationToken(token, allKinds, allDomains)) continue
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1)
    }
    return {
      id: elementKey(element),
      title: titleForElement(element),
      subtitle: `${element.domain || 'unknown'} · ${labelForKind(element.kind)}`,
      tokens,
      element,
    }
  })
  const topTokens = [...tokenCounts.entries()]
    .sort((left, right) => tokenQuality(right[0]) - tokenQuality(left[0]) || right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 200)
    .map(([token, count]) => ({ token, count }))
  const kinds = [...new Set(elements.map((element) => element.kind))].sort()
  const domains = [...new Set(elements.map((element) => element.domain || 'unknown'))].sort()
  return { entries, topTokens, kinds, domains }
}

function isRecommendationToken(token: string, allKinds: Set<string>, allDomains: Set<string>) {
  if (token.length < 2 || token.length > 48) return false
  if (/^\d+$/.test(token)) return false
  if (recommendationStopWords.has(token)) return false
  if (allKinds.has(token) || allDomains.has(token)) return false
  return true
}

function tokenQuality(token: string) {
  if (token.length >= 4 && token.length <= 20) return 4
  if (token.length >= 3) return 3
  return 1
}

export function searchIndexSearch(index: SearchIndex, query: string, limit = 20): SearchEntry[] {
  const needles = splitWords(query)
  if (needles.length === 0) return index.entries.slice(0, 8)
  const ranked = index.entries
    .map((entry) => {
      let score = 0
      let allNeedlesHit = true
      const lowerTitle = entry.title.toLowerCase()
      const lowerName = (entry.element.name || '').toLowerCase()
      for (const needle of needles) {
        let termScore = 0
        if (lowerTitle.includes(needle)) termScore = 15
        else if (lowerName.includes(needle)) termScore = 10
        else if (entry.element.kind.toLowerCase().includes(needle)) termScore = 7
        else if ((entry.element.domain || '').toLowerCase().includes(needle)) termScore = 7
        else if (entry.tokens.some((token) => token.toLowerCase() === needle)) termScore = 5
        else if (entry.tokens.some((token) => token.toLowerCase().startsWith(needle))) termScore = 3
        else if (entry.tokens.some((token) => token.toLowerCase().includes(needle))) termScore = 1
        if (termScore === 0) allNeedlesHit = false
        score += termScore
      }
      score += Math.max(0, 10 - kindRank(entry.element.kind)) * 0.1
      return { entry, score, allNeedlesHit }
    })
    .filter((item) => item.score > 0 && item.allNeedlesHit)
    .sort((left, right) => right.score - left.score || left.entry.title.localeCompare(right.entry.title))
    .map((item) => item.entry)
  return diversifySearchEntries(ranked, limit)
}

export function countEntries(entries: SearchEntry[], getKey: (entry: SearchEntry) => string) {
  const counts = new Map<string, number>()
  for (const entry of entries) counts.set(getKey(entry), (counts.get(getKey(entry)) || 0) + 1)
  return counts
}

export function rotateList<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return []
  const offset = seed % items.length
  return [...items.slice(offset), ...items.slice(0, offset)]
}

export function diversifySearchEntries(entries: SearchEntry[], limit: number): SearchEntry[] {
  if (entries.length <= limit) return entries
  const output: SearchEntry[] = []
  const buckets = new Map<string, SearchEntry[]>()
  for (const entry of entries) {
    const kind = entry.element.kind
    if (!buckets.has(kind)) buckets.set(kind, [])
    buckets.get(kind)!.push(entry)
  }
  const kindOrder = [...buckets.keys()].sort((left, right) => kindRank(left) - kindRank(right))
  if (entries[0]) output.push(entries[0])
  let round = 0
  while (output.length < limit) {
    let added = false
    for (const kind of kindOrder) {
      const bucket = buckets.get(kind)!
      const index = kind === entries[0]?.element.kind ? round + 1 : round
      const entry = bucket[index]
      if (entry && !output.includes(entry)) {
        output.push(entry)
        added = true
        if (output.length >= limit) break
      }
    }
    if (!added) break
    round += 1
  }
  return output
}

export function suggestTokens(index: SearchIndex, partial: string, limit = 8): SearchToken[] {
  const lower = partial.trim().toLowerCase()
  if (!lower) return []
  return index.topTokens
    .filter(({ token }) => token.startsWith(lower) || token.includes(lower) || lower.includes(token))
    .slice(0, limit)
}

export function tokensForElement(element: UModelElement): string[] {
  return [
    elementKey(element),
    element.kind,
    element.domain,
    element.name,
    element.version,
    descriptionForElement(element),
    detailShort(element),
    ...tagsForElement(element),
    JSON.stringify(element.spec || {}),
  ]
    .filter(Boolean)
    .map(String)
}

function recommendationTokensForElement(element: UModelElement): string[] {
  const spec = element.spec || {}
  return [
    elementKey(element),
    element.name,
    descriptionForElement(element),
    detailShort(element),
    ...tagsForElement(element),
    ...namedSpecValues(spec),
  ]
    .filter(Boolean)
    .map(String)
}

function namedSpecValues(spec: Record<string, unknown>): string[] {
  const values: string[] = []
  for (const key of ['entity_link_type', 'link_type', 'project', 'store', 'region', 'instance_id', 'service', 'operation', 'name']) {
    const value = optionalString(spec[key])
    if (value) values.push(value)
  }
  for (const key of ['fields', 'metrics', 'dimensions', 'keys', 'primary_key_fields', 'ordered_fields', ...runbookSectionKeys]) {
    for (const item of asUnknownArray(spec[key])) {
      if (typeof item === 'string') {
        values.push(item)
      } else if (isObject(item)) {
        for (const field of ['name', 'type', 'example', 'title', 'summary', 'action', 'action_type', 'compatibility']) {
          const value = optionalString(item[field])
          if (value) values.push(value)
        }
        values.push(...localizedValues(item.display_name))
        values.push(...localizedValues(item.description))
        values.push(...localizedValues(item.short_description))
      }
    }
  }
  return values
}

function localizedValues(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (!isObject(value)) return []
  return Object.values(value).filter((item): item is string => typeof item === 'string' && item.length > 0)
}

export function splitWords(value: string): string[] {
  const normalized = value.trim().toLowerCase()
  return normalized ? [normalized] : []
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function diffElements(serverElements: UModelElement[], draftElements: UModelElement[]): DraftDiff {
  const serverById = new Map(serverElements.map((element) => [elementKey(element), element]))
  const draftById = new Map(draftElements.map((element) => [elementKey(element), element]))
  const added = draftElements.filter((element) => !serverById.has(elementKey(element)))
  const modified = draftElements.filter((element) => {
    const original = serverById.get(elementKey(element))
    return original ? stableStringify(original) !== stableStringify(element) : false
  })
  const deleted = serverElements.filter((element) => !draftById.has(elementKey(element)))
  return { added, modified, deleted }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (isObject(value)) {
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function relatedElementIds(elements: UModelElement[], ids: string[]): Set<string> {
  const nodeElements = elements.filter((element) => !isLinkElement(element))
  const alias = aliasForElements(nodeElements)
  const related = new Set(ids)
  for (const element of elements.filter(isLinkElement)) {
    const key = elementKey(element)
    const source = endpointId(linkSourceEndpoint(element))
    const target = endpointId(linkTargetEndpoint(element))
    const sourceId = alias.get(source) || source
    const targetId = alias.get(target) || target
    if (related.has(key) || related.has(sourceId) || related.has(targetId)) {
      related.add(key)
      related.add(sourceId)
      related.add(targetId)
    }
  }
  return related
}

export function focusIdsForElements(elements: UModelElement[], allElements: UModelElement[]) {
  const nodeElements = allElements.filter((element) => !isLinkElement(element))
  const alias = aliasForElements(nodeElements)
  const ids = new Set<string>()
  for (const element of elements) {
    ids.add(elementKey(element))
    if (isLinkElement(element)) {
      const source = alias.get(endpointId(linkSourceEndpoint(element))) || endpointId(linkSourceEndpoint(element))
      const target = alias.get(endpointId(linkTargetEndpoint(element))) || endpointId(linkTargetEndpoint(element))
      if (source) ids.add(source)
      if (target) ids.add(target)
    }
  }
  return [...ids]
}

export function linkTouchesElement(link: UModelElement, element: UModelElement, elements: UModelElement[]) {
  const alias = aliasForElements(elements.filter((item) => !isLinkElement(item)))
  const source = endpointId(linkSourceEndpoint(link))
  const target = endpointId(linkTargetEndpoint(link))
  const key = elementKey(element)
  return (alias.get(source) || source) === key || (alias.get(target) || target) === key
}

export function aliasForElements(elements: UModelElement[]) {
  const alias = new Map<string, string>()
  for (const element of elements) {
    const key = elementKey(element)
    alias.set(key, key)
    if (element.name) alias.set(element.name, key)
    if (element.domain && element.name) alias.set(`${element.domain}.${element.name}`, key)
  }
  return alias
}

export function cloneElements(elements: UModelElement[]): UModelElement[] {
  return elements.map((element) => JSON.parse(JSON.stringify(element)) as UModelElement)
}

export function cloneElementForDraft(element: UModelElement): UModelElement {
  const suffix = Math.random().toString(36).slice(2, 7)
  const copy = JSON.parse(JSON.stringify(element)) as UModelElement
  copy.name = `${element.name || elementKey(element)}_copy_${suffix}`
  return copy
}

export function cloneLinkForDraft(link: UModelElement, original: UModelElement, copy: UModelElement): UModelElement {
  const linkCopy = cloneElementForDraft(link)
  const spec = { ...(linkCopy.spec || {}) }
  const sourceKey = spec.src !== undefined ? 'src' : 'source'
  const targetKey = spec.dest !== undefined ? 'dest' : 'target'
  spec[sourceKey] = rewriteEndpointForCopy(spec[sourceKey], original, copy)
  spec[targetKey] = rewriteEndpointForCopy(spec[targetKey], original, copy)
  linkCopy.spec = spec
  return linkCopy
}

function rewriteEndpointForCopy(value: unknown, original: UModelElement, copy: UModelElement): unknown {
  if (!endpointMatchesElement(value, original)) return value
  if (typeof value === 'string') return copy.domain && copy.name ? `${copy.domain}.${copy.name}` : elementKey(copy)
  if (isObject(value)) {
    return {
      ...value,
      domain: copy.domain,
      kind: copy.kind,
      name: copy.name || elementKey(copy),
    }
  }
  return value
}

function endpointMatchesElement(value: unknown, element: UModelElement): boolean {
  const endpoint = endpointId(value)
  if (!endpoint) return false
  return [elementKey(element), element.name, element.domain && element.name ? `${element.domain}.${element.name}` : '']
    .filter(Boolean)
    .includes(endpoint)
}

export function upsertById(items: UModelElement[], element: UModelElement): UModelElement[] {
  const key = elementKey(element)
  const exists = items.some((item) => elementKey(item) === key)
  return exists ? items.map((item) => (elementKey(item) === key ? element : item)) : [...items, element]
}

export function defaultNewNode(kind = 'entity_set'): UModelElement {
  const domain = 'demo'
  const nameBase = formatKindLabel(kind).replace(/Set$/, '').toLowerCase() || 'custom'
  const name = `custom_${nameBase}`
  const common = {
    kind,
    domain,
    name,
    version: 'v0.1.0',
  }
  if (kind === 'metric_set' || kind === 'sls_metricstore' || kind === 'aliyun_prometheus') {
    return {
      ...common,
      spec: {
        description: `Draft ${labelForKind(kind)}`,
        metrics: [{ name: 'requests_total', type: 'counter' }],
        dimensions: [{ name: 'service', type: 'string' }],
      },
    }
  }
  if (kind === 'log_set' || kind === 'sls_logstore' || kind === 'trace_set' || kind === 'event_set' || kind === 'profile_set') {
    return {
      ...common,
      spec: {
        description: `Draft ${labelForKind(kind)}`,
        fields: [
          { name: 'timestamp', type: 'timestamp' },
          { name: 'message', type: 'string' },
        ],
      },
    }
  }
  if (kind === 'runbook_set') {
    return {
      ...common,
      spec: {
        display_name: { zh_cn: '自定义 Runbook', en_us: 'Custom Runbook' },
        description: { zh_cn: '用于实体故障定位和处置的 Runbook。', en_us: 'Runbook for entity diagnosis and remediation.' },
        knowledge: [
          {
            name: 'initial-diagnosis',
            title: '初始诊断',
            summary: '结合实体指标、日志和拓扑关系判断影响范围。',
            actions: ['检查关键指标', '查看错误日志', '确认上下游拓扑'],
          },
        ],
        observations: [
          { name: 'latency-or-error-spike', description: '延迟或错误率升高时优先关联依赖关系和最近变更。' },
        ],
        actions: [
          { name: 'collect_entity_context', action_type: 'query', description: '收集实体指标、日志和邻居节点上下文。' },
        ],
        automations: [
          { name: 'prepare_rca_context', description: '生成 RCA 所需的实体、关系、遥测和 Runbook 上下文。' },
        ],
        skills: [
          { name: 'umodel-rca', title: 'UModel RCA', description: '使用 UModel 查询链路进行根因分析。' },
        ],
      },
    }
  }
  return {
    ...common,
    spec: {
      description: `Draft ${labelForKind(kind)}`,
      fields: [{ name: 'id', type: 'string' }],
      primary_key_fields: ['id'],
    },
  }
}

export function createElementLink(source: UModelElement, target: UModelElement): UModelElement {
  const plan = linkPlanForElements(source, target)
  const sourceName = plan.source.name || elementKey(plan.source)
  const targetName = plan.target.name || elementKey(plan.target)
  const name = `${sourceName}_to_${targetName}`.replace(/[^a-zA-Z0-9_]+/g, '_')
  const spec: Record<string, unknown> = {
    [plan.typeField]: plan.relation,
    src: { domain: plan.source.domain, kind: plan.source.kind, name: plan.source.name || elementKey(plan.source) },
    dest: { domain: plan.target.domain, kind: plan.target.kind, name: plan.target.name || elementKey(plan.target) },
  }
  if (plan.kind === 'runbook_link') {
    spec.token_replace = {
      entity_id: '${__entity_id__}',
      entity_name: '${display_name}',
    }
    spec.fields_mapping = {
      id: 'entity_id',
      name: 'entity_name',
    }
  }
  return {
    kind: plan.kind,
    domain: plan.source.domain || plan.target.domain || 'default',
    name,
    version: plan.source.version || plan.target.version || 'v0.1.0',
    spec,
  }
}

export const createDataLink = createElementLink

export function columnForKind(kind: string) {
  if (kind === 'entity_set') return 0
  if (kind === 'entity_set_link') return 1
  if (kind === 'metric_set') return 2
  if (kind === 'log_set' || kind === 'trace_set' || kind === 'event_set' || kind === 'profile_set') return 3
  if (kind === 'runbook_set' || kind === 'explorer') return 4
  return Math.max(0, kindRank(kind))
}

export function endpointId(value: unknown): string {
  if (typeof value === 'string') return value
  if (!isObject(value)) return ''
  const name = typeof value.name === 'string' ? value.name : ''
  const domain = typeof value.domain === 'string' ? value.domain : ''
  if (domain && name) return `${domain}.${name}`
  if (name) return name
  return ''
}

export function linkSourceEndpoint(element: UModelElement): unknown {
  const spec = element.spec || {}
  return spec.src ?? spec.source
}

export function linkTargetEndpoint(element: UModelElement): unknown {
  const spec = element.spec || {}
  return spec.dest ?? spec.target
}

export function isLinkElement(element: UModelElement): boolean {
  return linkKinds.has(element.kind) || Boolean(linkSourceEndpoint(element) && linkTargetEndpoint(element))
}

export function isEntitySetLinkElement(element: UModelElement): boolean {
  return element.kind === 'entity_set_link'
}

export function kindActsAsGraphNode(kind: string, entitySetLinkDisplay: EntitySetLinkDisplay): boolean {
  return !linkKinds.has(kind) || (entitySetLinkDisplay === 'relative_link' && kind === 'entity_set_link')
}

export function elementActsAsGraphNode(element: UModelElement, entitySetLinkDisplay: EntitySetLinkDisplay): boolean {
  return !isLinkElement(element) || (entitySetLinkDisplay === 'relative_link' && isEntitySetLinkElement(element))
}

export function kindRank(kind: string) {
  const index = nodeKindOrder.indexOf(kind)
  if (index >= 0) return index
  const linkIndex = linkKindOrder.indexOf(kind)
  if (linkIndex >= 0) return nodeKindOrder.length + linkIndex + 1
  return nodeKindOrder.length
}

export function colorForKind(kind: string): KindColor {
  return kindColors[kind] || { ...defaultKindColor, label: formatKindLabel(kind), abbrev: formatKindLabel(kind).slice(0, 2).toUpperCase() }
}

export function labelForKind(kind: string): string {
  return kindColors[kind]?.label || formatKindLabel(kind)
}

export function formatKindLabel(kind: string): string {
  return kind.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join('')
}

export function titleForElement(element: UModelElement): string {
  return element.name || elementKey(element)
}

export function descriptionForElement(element: UModelElement): string {
  const description = (element.spec || {}).description
  if (typeof description === 'string') return description
  if (isObject(description)) return optionalString(description.zh_cn) || optionalString(description.en_us) || ''
  return ''
}

export function tableSortValue(element: UModelElement, key: 'name' | 'domain' | 'kind' | 'description'): string {
  if (key === 'name') return titleForElement(element).toLowerCase()
  if (key === 'domain') return (element.domain || '').toLowerCase()
  if (key === 'kind') return labelForKind(element.kind).toLowerCase()
  return descriptionForElement(element).toLowerCase()
}

export function paginationItems(page: number, totalPages: number): Array<number | '...'> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const items: Array<number | '...'> = [1]
  if (page > 3) items.push('...')
  for (let next = Math.max(2, page - 1); next <= Math.min(totalPages - 1, page + 1); next += 1) items.push(next)
  if (page < totalPages - 2) items.push('...')
  items.push(totalPages)
  return items
}

export function tagsForElement(element: UModelElement): string[] {
  const spec = element.spec || {}
  const fields = asUnknownArray(spec.fields)
  const metrics = asUnknownArray(spec.metrics)
  const pk = asUnknownArray(spec.primary_key_fields)
  const runbookItems = runbookSectionItems(spec)
  const source = fields.length > 0 ? fields : metrics.length > 0 ? metrics : pk.length > 0 ? pk : runbookItems
  return source
    .map((item) => {
      if (typeof item === 'string') return item
      if (isObject(item)) return optionalString(item.name) || optionalString(item.title) || optionalString(item.type) || ''
      return ''
    })
    .filter(Boolean)
    .slice(0, 8)
}

export function tagCountForElement(element: UModelElement): number {
  const spec = element.spec || {}
  return Math.max(
    asUnknownArray(spec.fields).length,
    asUnknownArray(spec.metrics).length,
    asUnknownArray(spec.primary_key_fields).length,
    runbookSectionItems(spec).length,
    tagsForElement(element).length,
  )
}

export function detailShort(element: UModelElement, labels: { fields: string; metrics: string } = { fields: 'fields', metrics: 'metrics' }): string {
  if (isLinkElement(element)) {
    const src = endpointId(linkSourceEndpoint(element))
    const dest = endpointId(linkTargetEndpoint(element))
    return src && dest ? `${src} -> ${dest}` : ''
  }
  const fields = asUnknownArray((element.spec || {}).fields).length
  const metrics = asUnknownArray((element.spec || {}).metrics).length
  const runbookItems = runbookSectionItems(element.spec || {}).length
  if (fields) return `${fields} ${labels.fields}`
  if (metrics) return `${metrics} ${labels.metrics}`
  if (runbookItems) return `${runbookItems} runbook items`
  return element.version || ''
}

export function entityLinkTypeForEdge(element: UModelElement): string {
  const spec = element.spec || {}
  return optionalString(spec.entity_link_type)
    || optionalString(spec.runbook_link_type)
    || optionalString(spec.data_link_type)
    || optionalString(spec.storage_link_type)
    || optionalString(spec.explorer_link_type)
    || optionalString(spec.link_type)
    || optionalString(spec.type)
    || labelForKind(element.kind)
}

export function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function linkPlanForElements(source: UModelElement, target: UModelElement) {
  if (source.kind === 'entity_set' && target.kind === 'runbook_set') {
    return {
      kind: 'runbook_link',
      source,
      target,
      typeField: 'runbook_link_type',
      relation: 'guides',
    }
  }
  if (source.kind === 'runbook_set' && target.kind === 'entity_set') {
    return {
      kind: 'runbook_link',
      source: target,
      target: source,
      typeField: 'runbook_link_type',
      relation: 'guides',
    }
  }
  if (dataSetKinds.has(source.kind) && storageKinds.has(target.kind)) {
    return {
      kind: 'storage_link',
      source,
      target,
      typeField: 'storage_link_type',
      relation: 'stored_in',
    }
  }
  if (storageKinds.has(source.kind) && dataSetKinds.has(target.kind)) {
    return {
      kind: 'storage_link',
      source: target,
      target: source,
      typeField: 'storage_link_type',
      relation: 'stored_in',
    }
  }
  if (source.kind === 'explorer' || target.kind === 'explorer') {
    return {
      kind: 'explorer_link',
      source,
      target,
      typeField: 'explorer_link_type',
      relation: 'visualizes',
    }
  }
  return {
    kind: 'data_link',
    source,
    target,
    typeField: 'data_link_type',
    relation: 'related_to',
  }
}

function runbookSectionItems(spec: Record<string, unknown>): unknown[] {
  return runbookSectionKeys.flatMap((key) => asUnknownArray(spec[key]))
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function toggleValue(items: string[], value: string) {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value]
}
