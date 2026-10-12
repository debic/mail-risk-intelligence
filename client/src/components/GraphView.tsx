import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ForceGraph2D, { type ForceGraphMethods, type LinkObject, type NodeObject } from 'react-force-graph-2d'
import type { EntityType, GraphNode, RiskLevel } from '../../../shared/types'
import { useGraph } from '../hooks/useGraph'
import { EmptyState } from './EmptyState'
import styles from './GraphView.module.css'

type Node = NodeObject<GraphNode>
type Link = LinkObject<GraphNode, { id: number; type: string; emailId: string }>

const TYPE_LABEL: Record<EntityType, string> = {
  person: 'Person',
  organization: 'Organization',
  account: 'Account',
  amount: 'Amount',
  location: 'Location',
  other: 'Other',
}

// Short glyph drawn inside each node so the type is visible without color.
const TYPE_GLYPH: Record<EntityType, string> = {
  person: 'P',
  organization: 'O',
  account: '#',
  amount: '$',
  location: 'L',
  other: '•',
}

const RISK_ORDER: RiskLevel[] = ['high', 'medium', 'low', 'none']
const RISK_RANK: Record<RiskLevel, number> = { high: 3, medium: 2, low: 1, none: 0 }

// Keyboard-browsable entity list, grouped like the email detail view.
const TYPE_GROUPS: { type: EntityType; label: string }[] = [
  { type: 'person', label: 'People' },
  { type: 'organization', label: 'Organizations' },
  { type: 'account', label: 'Accounts' },
  { type: 'amount', label: 'Amounts' },
  { type: 'location', label: 'Locations' },
  { type: 'other', label: 'Other' },
]
const RISK_LABEL: Record<RiskLevel, string> = { high: 'High', medium: 'Medium', low: 'Low', none: 'None' }

const humanize = (relation: string) => relation.replace(/_/g, ' ')
const endpointId = (end: Link['source']) => (typeof end === 'object' ? (end as Node).id : end) as number

/** Risk colors come from the design tokens, so the graph matches the rest of the UI. */
function readPalette() {
  const css = getComputedStyle(document.documentElement)
  const v = (name: string) => css.getPropertyValue(name).trim()
  return {
    risk: {
      high: v('--risk-high-marker'),
      medium: v('--risk-medium-marker'),
      low: v('--risk-low-marker'),
      none: v('--risk-none-marker'),
    } as Record<RiskLevel, string>,
    unknown: v('--color-border-strong'),
    text: v('--color-text'),
    link: v('--color-border-strong'),
    accent: v('--color-accent'),
    surface: v('--color-surface'),
  }
}

/** Cut long names in the middle so the distinguishing end stays visible ("routing 0440…ending 9902"). */
function shortenMiddle(text: string, max: number): string {
  if (text.length <= max) return text
  let tail = text.slice(-Math.ceil((max - 1) * 0.55))
  // Start the tail at a word boundary when one is close ("unt ending 9902" -> "ending 9902").
  const space = tail.indexOf(' ')
  if (space !== -1 && space < 6) tail = tail.slice(space + 1)
  return `${text.slice(0, max - 1 - tail.length).trimEnd()}…${tail}`
}

const nodeRadius = (node: GraphNode) => 5 + Math.sqrt(node.emailIds.length) * 3

interface GraphViewProps {
  onOpenEmail: (id: string) => void
}

export function GraphView({ onOpenEmail }: GraphViewProps) {
  const { graph, error, loading, reload } = useGraph()
  const graphRef = useRef<ForceGraphMethods<Node, Link> | undefined>(undefined)
  const canvasBoxRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const palette = useMemo(readPalette, [])
  const panelRef = useRef<HTMLElement>(null)
  const entityHeadingRef = useRef<HTMLHeadingElement>(null)
  // Selections from the list, search or connections move focus into the panel; canvas clicks don't.
  const moveFocusRef = useRef(false)
  const returnToListRef = useRef<number | null>(null)

  // The library mutates node/link objects (positions), so give it its own copies.
  const data = useMemo(
    () =>
      graph
        ? {
            nodes: graph.nodes.map((node) => ({ ...node })) as Node[],
            links: graph.edges.map((edge) => ({ ...edge })) as Link[],
          }
        : { nodes: [], links: [] },
    [graph],
  )

  const nodesById = useMemo(() => new Map(data.nodes.map((node) => [node.id as number, node])), [data])

  const neighbors = useMemo(() => {
    if (selectedId === null) return null
    const ids = new Set<number>([selectedId])
    for (const link of data.links) {
      const source = endpointId(link.source)
      const target = endpointId(link.target)
      if (source === selectedId) ids.add(target)
      if (target === selectedId) ids.add(source)
    }
    return ids
  }, [data, selectedId])

  // Canvas size follows its container (responsive).
  useEffect(() => {
    const box = canvasBoxRef.current
    if (!box) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: Math.floor(entry.contentRect.width), height: Math.floor(entry.contentRect.height) })
    })
    observer.observe(box)
    return () => observer.disconnect()
  }, [graph])

  // Spread nodes out more than the library default so labels have room.
  useEffect(() => {
    const fg = graphRef.current
    if (!fg || size.width === 0) return
    // Short-range repulsion keeps clusters readable without pushing unrelated clusters far apart.
    const charge = fg.d3Force('charge') as unknown as
      | { strength: (n: number) => { distanceMax: (n: number) => void } }
      | undefined
    charge?.strength(-90).distanceMax(140)
    ;(fg.d3Force('link') as unknown as { distance: (n: number) => void } | undefined)?.distance(45)
    fg.d3ReheatSimulation()
    // Frame the whole graph once the layout has mostly settled.
    const timer = setTimeout(() => fg.zoomToFit(500, 56), 1500)
    return () => clearTimeout(timer)
  }, [data, size.width])

  const focusNode = useCallback(
    (id: number, moveFocus = true) => {
      moveFocusRef.current = moveFocus
      setSelectedId(id)
      const node = nodesById.get(id)
      if (node?.x !== undefined && node.y !== undefined) {
        graphRef.current?.centerAt(node.x, node.y, 600)
        graphRef.current?.zoom(2.5, 600)
      }
    },
    [nodesById],
  )

  // Keyboard and screen reader users land on the selected entity's name, and back on the
  // list item when they return to "All entities".
  useEffect(() => {
    if (selectedId !== null && moveFocusRef.current) {
      moveFocusRef.current = false
      entityHeadingRef.current?.focus()
    } else if (selectedId === null && returnToListRef.current !== null) {
      const id = returnToListRef.current
      returnToListRef.current = null
      panelRef.current?.querySelector<HTMLButtonElement>(`[data-entity-id="${id}"]`)?.focus()
    }
  }, [selectedId])

  const showAllEntities = () => {
    returnToListRef.current = selectedId
    setSelectedId(null)
  }

  const entityGroups = useMemo(
    () =>
      TYPE_GROUPS.map((group) => ({
        ...group,
        items: data.nodes
          .filter((node) => node.type === group.type)
          .sort(
            (a, b) =>
              (b.maxRisk ? RISK_RANK[b.maxRisk] : -1) - (a.maxRisk ? RISK_RANK[a.maxRisk] : -1) ||
              b.emailIds.length - a.emailIds.length ||
              a.name.localeCompare(b.name),
          ),
      })).filter((group) => group.items.length > 0),
    [data],
  )

  const drawNode = useCallback(
    (node: Node, ctx: CanvasRenderingContext2D, scale: number) => {
      const r = nodeRadius(node)
      const dimmed = neighbors !== null && !neighbors.has(node.id as number)
      const selected = node.id === selectedId
      ctx.globalAlpha = dimmed ? 0.15 : 1

      ctx.beginPath()
      ctx.arc(node.x!, node.y!, r, 0, 2 * Math.PI)
      ctx.fillStyle = node.maxRisk ? palette.risk[node.maxRisk] : palette.unknown
      ctx.fill()
      ctx.lineWidth = selected ? 3 / scale + 1 : 1.5
      ctx.strokeStyle = selected ? palette.accent : palette.surface
      ctx.stroke()

      ctx.fillStyle = '#ffffff'
      ctx.font = `600 ${r}px Inter Variable, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(TYPE_GLYPH[node.type], node.x!, node.y! + 0.5)

      ctx.globalAlpha = 1
    },
    [neighbors, selectedId, palette],
  )

  // Labels are drawn after all nodes, most important first, and each one takes the first free
  // spot around its node (below, above, right, left). A label that would overlap another is
  // skipped: the entity is still listed in the side panel and shown on hover.
  const drawLabels = useCallback(
    (ctx: CanvasRenderingContext2D, scale: number) => {
      const candidates = data.nodes
        .filter((node) => (neighbors !== null ? neighbors.has(node.id as number) : scale > 2.2))
        .sort(
          (a, b) =>
            Number(b.id === selectedId) - Number(a.id === selectedId) || b.emailIds.length - a.emailIds.length,
        )
      const fontSize = Math.max(11 / scale, 2.5)
      const pad = 2 / scale
      // Labeled nodes' own circles count as occupied space, so a label never covers a node.
      const placed: { x: number; y: number; w: number; h: number }[] = candidates
        .filter((node) => node.x !== undefined && node.y !== undefined)
        .map((node) => {
          const r = nodeRadius(node)
          return { x: node.x! - r, y: node.y! - r, w: r * 2, h: r * 2 }
        })
      const overlaps = (r: (typeof placed)[number]) =>
        placed.some((p) => r.x < p.x + p.w && r.x + r.w > p.x && r.y < p.y + p.h && r.y + r.h > p.y)

      for (const node of candidates) {
        if (node.x === undefined || node.y === undefined) continue
        const selected = node.id === selectedId
        ctx.font = `${selected ? 600 : 500} ${fontSize}px Inter Variable, sans-serif`
        const label = shortenMiddle(node.name, 28)
        const w = ctx.measureText(label).width + pad * 2
        const h = fontSize + pad * 2
        const r = nodeRadius(node) + pad
        const spots = [
          { x: node.x - w / 2, y: node.y + r },
          { x: node.x - w / 2, y: node.y - r - h },
          { x: node.x + r, y: node.y - h / 2 },
          { x: node.x - r - w, y: node.y - h / 2 },
        ].map((spot) => ({ ...spot, w, h }))
        const spot = spots.find((candidate) => !overlaps(candidate))
        if (!spot) continue
        placed.push(spot)
        ctx.fillStyle = 'rgba(255,255,255,0.9)'
        ctx.fillRect(spot.x, spot.y, spot.w, spot.h)
        ctx.fillStyle = palette.text
        ctx.textAlign = 'left'
        ctx.textBaseline = 'top'
        ctx.fillText(label, spot.x + pad, spot.y + pad)
      }
    },
    [data, neighbors, selectedId, palette],
  )

  const zoomBy = (factor: number) => {
    const fg = graphRef.current
    if (fg) fg.zoom(fg.zoom() * factor, 250)
  }

  const linkIsActive = (link: Link) =>
    selectedId !== null && (endpointId(link.source) === selectedId || endpointId(link.target) === selectedId)

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return data.nodes.filter((node) => node.name.toLowerCase().includes(q)).slice(0, 8)
  }, [data, query])

  if (loading) return <EmptyState icon="◎" title="Loading the knowledge graph…" />
  if (error)
    return (
      <EmptyState icon="!" title="Couldn't load the knowledge graph">
        <p>{error}</p>
        <button type="button" className={styles.button} onClick={() => void reload()}>
          Try again
        </button>
      </EmptyState>
    )
  if (data.nodes.length === 0)
    return (
      <EmptyState icon="◎" title="No entities yet">
        The graph fills in as emails are analyzed.
      </EmptyState>
    )

  const selected = selectedId !== null ? nodesById.get(selectedId) : undefined
  const connections = selected
    ? data.links
        .filter(linkIsActive)
        .map((link) => {
          const outgoing = endpointId(link.source) === selectedId
          const other = nodesById.get(outgoing ? endpointId(link.target) : endpointId(link.source))!
          return { link, outgoing, other }
        })
    : []

  return (
    <div className={styles.layout}>
      <div className={styles.toolbar}>
        <h1 className={styles.heading}>Knowledge graph</h1>
        <div className={styles.search}>
          <label htmlFor="graph-search" className="visually-hidden">
            Find an entity
          </label>
          <input
            id="graph-search"
            type="search"
            className={styles.searchInput}
            placeholder="Find a person, company, account…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && searchResults[0]) {
                focusNode(searchResults[0].id as number)
                setQuery('')
              }
            }}
            aria-controls={searchResults.length > 0 ? 'graph-search-results' : undefined}
            autoComplete="off"
          />
          {searchResults.length > 0 && (
            <ul id="graph-search-results" className={styles.results} aria-label="Matching entities">
              {searchResults.map((node) => (
                <li key={node.id}>
                  <button
                    type="button"
                    className={styles.result}
                    onClick={() => {
                      focusNode(node.id as number)
                      setQuery('')
                    }}
                  >
                    <span className={styles.dot} data-risk={node.maxRisk ?? 'unknown'} aria-hidden="true" />
                    <span className={styles.resultName}>{node.name}</span>
                    <span className={styles.resultType}>{TYPE_LABEL[node.type]}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <ul className={styles.legend} aria-label="Node color shows the highest risk among its emails">
          {RISK_ORDER.map((level) => (
            <li key={level}>
              <span className={styles.dot} data-risk={level} aria-hidden="true" />
              {RISK_LABEL[level]}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.canvasBox} ref={canvasBoxRef}>
        {size.width > 0 && (
          <ForceGraph2D<GraphNode, { id: number; type: string; emailId: string }>
            ref={graphRef}
            graphData={data}
            width={size.width}
            height={size.height}
            backgroundColor="rgba(0,0,0,0)"
            nodeId="id"
            nodeLabel={(node) => `${node.name} (${TYPE_LABEL[node.type]})`}
            nodeCanvasObject={drawNode}
            onRenderFramePost={drawLabels}
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color
              ctx.beginPath()
              ctx.arc(node.x!, node.y!, nodeRadius(node) + 2, 0, 2 * Math.PI)
              ctx.fill()
            }}
            linkColor={(link) => (linkIsActive(link) ? palette.accent : palette.link)}
            linkWidth={(link) => (linkIsActive(link) ? 2 : 1)}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={0.92}
            linkLabel={(link) => humanize(link.type)}
            linkVisibility={(link) => selectedId === null || linkIsActive(link)}
            onNodeClick={(node) => focusNode(node.id as number, false)}
            onBackgroundClick={() => setSelectedId(null)}
            cooldownTicks={120}
            onEngineStop={() => {
              if (selectedId === null) graphRef.current?.zoomToFit(400, 48)
            }}
          />
        )}
        <div className={styles.zoomControls}>
          <button type="button" className={styles.iconButton} aria-label="Zoom in" onClick={() => zoomBy(1.4)}>
            +
          </button>
          <button type="button" className={styles.iconButton} aria-label="Zoom out" onClick={() => zoomBy(1 / 1.4)}>
            −
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Fit graph to screen"
            onClick={() => graphRef.current?.zoomToFit(400, 48)}
          >
            ⤢
          </button>
        </div>
        <p className={styles.hint}>Drag to pan · scroll or pinch to zoom · click a node to see its connections</p>
      </div>

      <aside className={styles.panel} aria-label="Entities" ref={panelRef}>
        {selected ? (
          <>
            <button type="button" className={styles.backLink} onClick={showAllEntities}>
              <span aria-hidden="true">←</span> All entities
            </button>
            <div className={styles.panelHeader}>
              <span className={styles.dot} data-risk={selected.maxRisk ?? 'unknown'} aria-hidden="true" />
              <div>
                <h2 ref={entityHeadingRef} tabIndex={-1} className={styles.entityName}>
                  {selected.name}
                </h2>
                <p className={styles.entityMeta}>
                  {TYPE_LABEL[selected.type]}
                  {selected.maxRisk && ` · highest risk: ${RISK_LABEL[selected.maxRisk].toLowerCase()}`}
                </p>
              </div>
            </div>

            <section className={styles.panelSection}>
              <h3 className={styles.panelTitle}>
                Appears in {selected.emailIds.length} email{selected.emailIds.length === 1 ? '' : 's'}
              </h3>
              <div className={styles.emailButtons}>
                {selected.emailIds.map((id) => (
                  <button key={id} type="button" className={styles.button} onClick={() => onOpenEmail(id)}>
                    Open {id}
                  </button>
                ))}
              </div>
            </section>

            <section className={styles.panelSection}>
              <h3 className={styles.panelTitle}>Connections ({connections.length})</h3>
              {connections.length === 0 ? (
                <p className={styles.muted}>No relationships recorded for this entity.</p>
              ) : (
                <ul className={styles.connections}>
                  {connections.map(({ link, outgoing, other }) => (
                    <li key={link.id}>
                      <span className={styles.verb}>
                        {outgoing ? '→' : '←'} {humanize(link.type)}
                      </span>
                      <button
                        type="button"
                        className={styles.connectionNode}
                        onClick={() => focusNode(other.id as number)}
                      >
                        {other.name}
                      </button>
                      <span className={styles.muted}>in {link.emailId}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        ) : (
          <div className={styles.panelEmpty}>
            <h2 className={styles.panelEmptyTitle}>
              {data.nodes.length} entities · {data.links.length} relationships
            </h2>
            <p className={styles.muted}>
              Pick an entity here, in the graph or with the search box to see where it appears and how it connects.
              Highest risk first.
            </p>
            {entityGroups.map((group) => (
              <section key={group.type} className={styles.panelSection}>
                <h3 className={styles.panelTitle}>
                  {group.label} ({group.items.length})
                </h3>
                <ul className={styles.entityList}>
                  {group.items.map((node) => (
                    <li key={node.id}>
                      <button
                        type="button"
                        className={styles.entityButton}
                        data-entity-id={node.id}
                        onClick={() => focusNode(node.id as number)}
                      >
                        <span className={styles.dot} data-risk={node.maxRisk ?? 'unknown'} aria-hidden="true" />
                        <span className={styles.entityButtonName}>{node.name}</span>
                        <span className={styles.entityButtonMeta}>
                          {node.maxRisk && <span className="visually-hidden">{RISK_LABEL[node.maxRisk]} risk, </span>}
                          {node.emailIds.length} email{node.emailIds.length === 1 ? '' : 's'}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </aside>
    </div>
  )
}
