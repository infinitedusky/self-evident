/**
 * The graph: one node per code sub-issue, one edge per thing it waits on (an explicit dependency, or issue order),
 * laid out left to right by dagre so prerequisites read left and dependents right. A file more than one open
 * sub-issue claims is a node of its own between them (the action-graph shape: builds and files, like Bazel's actions
 * and artifacts): the sub-issue that has it points at the file, the file points at the ones waiting; with nobody holding
 * it yet, the claimants hang off it undecided. Layout re-runs only when the topology changes; status, held
 * reasons, runs and steps are props on the nodes, so live updates never jump.
 */
import dagre from '@dagrejs/dagre'
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps, Background, Handle, type Node, type NodeProps, Panel, Position, ReactFlow, ReactFlowProvider, type Edge, MarkerType, useNodesState, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useEffect, useMemo, useState } from 'react'
import type { BuildStatus, FlowNode, GraphFile, GraphSubIssue } from '../engine'
import { useWorkspace } from '../workspace'
import { Badge, type Tone } from './Badge'
import { plannedSteps } from '../planned-steps'

export const STATUS_TONE: Record<BuildStatus, Tone> = {
  queued: 'neutral', ready: 'accent', running: 'accent', awaiting_answer: 'warn', merging: 'accent', testing: 'accent',
  done: 'ok', failed: 'bad', cancelled: 'neutral',
}
const LIVE: BuildStatus[] = ['running', 'merging', 'testing', 'awaiting_answer']

type PhaseNodeData = { phase: GraphSubIssue; label?: string }

/**
 * A sub-task's progress through its steps, on its node: one segment per step, how many are done of how many, and the
 * one it is on (Sandy, 2026-11-14: "can we add the step count to the subtask nodes … what it's working on and how many
 * there are total"). While it builds, the steps are the builder's own list as it keeps it. Before that they are the
 * ones the planner wrote in its brief, so the total is known from the start.
 */
export function stepProgress(phase: { steps?: { text: string; status: string }[]; brief?: string | null; status: string }) {
  const own = phase.steps ?? []
  const planned = own.length ? [] : plannedSteps(phase.brief)
  const total = own.length || planned.length
  // Built: its agent has finished and it is landing, or it has landed. With no steps reported, that is all that is
  // known, and it is enough to say every planned step is behind it.
  const landed = ['done', 'merging', 'testing'].includes(phase.status)
  const done = own.length ? own.filter((s) => s.status === 'completed').length : landed ? total : 0
  const at = own.findIndex((s) => s.status === 'in_progress')
  const marks = Array.from({ length: total }, (_, i) => (own.length ? (own[i].status === 'completed' ? 'done' : own[i].status === 'in_progress' ? 'now' : 'todo') : landed ? 'done' : 'todo'))
  // What it is doing when its agent has reported no steps: said in words, so an empty bar is not read as "stuck on step one".
  const doing = own.length ? null : phase.status === 'running' ? 'Building. Its agent has not said which step it is on.' : phase.status === 'merging' || phase.status === 'testing' ? 'Built. Merging it in now.' : null
  return { total, done, marks, current: at >= 0 ? { n: at + 1, text: own[at].text } : null, planned: !own.length && total > 0 && !landed, doing }
}

const GHOST_STATUS = { todo: 'queued', doing: 'running', done: 'done', failed: 'failed' } as const

/**
 * A checklist task's flow as the nodes of its graph (Sandy, 2026-11-17: "we should always show the workflow in nodes
 * before it starts … it would be obvious"): each sub-task that exists, joined to what it follows, and each stage
 * still to come as a node of its own, so the whole path is drawn from the first look.
 */
export function flowGraph(flow: FlowNode[], subs: GraphSubIssue[]): GraphSubIssue[] {
  const known = new Set(flow.map((n) => n.id))
  return flow.flatMap((n): GraphSubIssue[] => {
    const real = n.sub ? subs.find((s) => s.id === n.sub) : undefined
    if (n.sub && !real) return [] // the graph has not caught up with the list yet: it will on its next read
    if (real) return [{ ...real, dependsOn: (n.after ?? real.dependsOn).filter((id) => known.has(id)), orderedAfter: [] }]
    return [{
      id: n.id, ghost: true, title: n.title, heldReason: n.detail || null, status: GHOST_STATUS[n.state], dependsOn: n.after ?? [],
      identifier: '', number: 0, appId: '', kind: 'code', parentId: null, projectId: null, cycleId: null, ideaId: null, description: null, brief: null, state: n.state === 'done' ? 'done' : 'todo', priority: 0, estimate: null, sortOrder: 0,
      assignee: null, delegate: null, waitingOn: null, source: 'agent', reason: null, createdBy: null, createdAt: '', startedAt: null, completedAt: null, canceledAt: null,
      attempt: 0, maxAttempts: 0, branch: null, files: [], lastRun: null,
    }]
  })
}

function PhaseNode({ data }: NodeProps<Node<PhaseNodeData>>) {
  const { phase } = data
  if (phase.ghost) { // a stage to come (or one that is not a sub-task, like the test run): its name and where it stands
    const live = phase.status === 'running'
    return (
      <div className={`task-node ghost ${live ? 'live' : ''} ${phase.status}`} data-component="PhaseNode" data-ghost>
        <Handle type="target" position={Position.Left} />
        <div className="task-node-head">
          <span className="mono faint">{phase.status === 'queued' ? 'to come' : 'by itself'}</span>
          {phase.status !== 'queued' && <Badge tone={STATUS_TONE[phase.status]} dot={live}>{phase.status === 'running' ? 'now' : phase.status}</Badge>}
        </div>
        <div className="task-node-title">{phase.title}</div>
        {phase.heldReason && <div className="task-node-note">{phase.heldReason}</div>}
        <Handle type="source" position={Position.Right} />
      </div>
    )
  }
  const live = LIVE.includes(phase.status)
  const p = stepProgress(phase)
  return (
    <div className={`task-node ${live ? 'live' : ''} ${phase.status}`} data-component="PhaseNode">
      <Handle type="target" position={Position.Left} />
      <div className="task-node-head">
        <span className="mono faint">{phase.identifier}{data.label ? <span className="task-node-project"> · {data.label}</span> : null}</span>
        <Badge tone={STATUS_TONE[phase.status]} dot={live}>{phase.status.replace('_', ' ')}</Badge>
      </div>
      <div className="task-node-title">{phase.title}</div>
      {phase.heldReason && phase.status !== 'done' && <div className="task-node-note">{phase.heldReason}</div>}
      {p.total > 0 && (
        <div className={`task-node-steps ${p.planned ? 'planned' : ''}`} data-component="StepProgress" title={p.planned ? `${p.total} steps planned; progress is not known` : `${p.done} of ${p.total} steps done`}>
          <span className="task-node-bar" aria-hidden="true">{p.marks.map((m, i) => <i key={i} className={m} />)}</span>
          <span className="mono">{p.planned ? `${p.total} planned` : `${p.done}/${p.total}`}</span>
        </div>
      )}
      {live && p.current && <div className="task-node-note task-node-now">Step {p.current.n} of {p.total}: {p.current.text}</div>}
      {live && !p.current && p.doing && <div className="task-node-note task-node-now">{p.doing}</div>}
      {phase.lastRun && (
        <div className="task-node-run mono">
          {`attempt ${phase.lastRun.attempt}${phase.lastRun.model ? ` · ${phase.lastRun.model.replace('claude-', '')}` : ''}${phase.lastRun.costUsd ? ` · $${Number(phase.lastRun.costUsd).toFixed(2)}` : ''}`}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

type FileNodeData = { file: GraphFile; holder?: GraphSubIssue }

/** A shared file: its name, and who has it. Dashed while nobody does. */
function FileNode({ data }: NodeProps<Node<FileNodeData>>) {
  const { file, holder } = data
  return (
    <div className={`file-node ${holder ? 'held' : ''}`} title={file.path} data-component="FileNode">
      <Handle type="target" position={Position.Left} />
      <span className="mono">{file.path.split('/').pop()}</span>
      <span className="file-node-who faint">{holder ? `${holder.identifier} has it` : `${file.subIssues.length} want it`}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

/** An unanswered question, and the sub-issues of the task that asked it. */
export interface GraphQuestion { id: string; text: string; cost: string | null; subIssues: string[] }
type QuestionNodeData = { question: GraphQuestion }

/**
 * An open question: a node of its own, like a shared file, pointing at the work it stands over (Sandy, 2026-11-14:
 * "could we put … an unanswered question into the graph … a different type of icon"). It leads to Build, where it
 * is answered.
 */
function QuestionNode({ data }: NodeProps<Node<QuestionNodeData>>) {
  const { question: q } = data
  return (
    <a className={`question-node ${q.cost ?? ''}`} href="/build" title={`${q.text}${q.cost ? ` (${q.cost})` : ''}. Answer it on Build.`} data-component="QuestionNode">
      <span className="question-node-mark" aria-hidden="true">?</span>
      <span className="question-node-text">{q.text}</span>
      <Handle type="source" position={Position.Right} />
    </a>
  )
}

/** The open questions, each with the sub-issues it stands over: its own when a sub-issue asked, else every sub-issue of the task that did. */
export function asked(questions: { id: string; issueId: string | null; text: string; cost: string | null; status: string }[], subIssues: { id: string; parentId?: string | null }[]): GraphQuestion[] {
  return questions.filter((q) => q.status === 'open' && q.issueId).map((q) => ({
    id: q.id, text: q.text, cost: q.cost,
    subIssues: subIssues.filter((x) => x.id === q.issueId || x.parentId === q.issueId).map((x) => x.id),
  }))
}

const nodeTypes = { phase: PhaseNode, file: FileNode, question: QuestionNode }

/** An arrow that says why on hover: the dependency or issue order, and any files the two sub-issues share. */
function WhyEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data }: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition })
  const [hover, setHover] = useState(false)
  const why = (data as { why?: string[] } | undefined)?.why ?? []
  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={{ ...style, ...(hover ? { stroke: 'var(--ink)', strokeWidth: 2 } : {}) }} />
      <path d={path} fill="none" stroke="transparent" strokeWidth={16} style={{ pointerEvents: 'stroke', cursor: 'help' }}
        onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} />
      {hover && why.length > 0 && (
        <EdgeLabelRenderer>
          <div className="edge-why" style={{ transform: `translate(-50%, -100%) translate(${labelX}px, ${labelY - 8}px)` }}>
            {why.map((w) => <div key={w}>{w}</div>)}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
const edgeTypes = { why: WhyEdge }
const W = 240, H = 156 // tall enough for a two-line title, a held reason, the step bar and the run line
const FW = 170, FH = 40
const fileId = (f: GraphFile) => `file:${f.path}`
const questionId = (q: GraphQuestion) => `question:${q.id}`
const QW = 190, QH = 44

/** Everything a sub-issue waits on: its explicit dependencies and issue order. Both are edges, so it sits to their right. */
const waitsOn = (p: GraphSubIssue) => [...p.dependsOn, ...(p.orderedAfter ?? []).filter((d) => !p.dependsOn.includes(d))]

function layout(phases: GraphSubIssue[], files: GraphFile[], questions: GraphQuestion[] = []): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  // A sub-issue sits as far left as its prerequisites allow: column = longest chain of things it waits on. Dagre's
  // longest-path ranker counts from the sinks, so feed it the edges reversed and lay out right-to-left; the
  // positions come out with prerequisites left, dependents right, and anything free to start in the first column.
  g.setGraph({ rankdir: 'RL', ranker: 'longest-path', nodesep: 24, ranksep: 80, marginx: 16, marginy: 16 })
  g.setDefaultEdgeLabel(() => ({}))
  for (const p of phases) g.setNode(p.id, { width: W, height: H })
  for (const p of phases) for (const d of waitsOn(p)) if (phases.some((x) => x.id === d)) g.setEdge(p.id, d)
  // A held file sits between its holder and the ones waiting; an unheld one sits after all its claimants.
  for (const f of files) {
    g.setNode(fileId(f), { width: FW, height: FH })
    for (const id of f.subIssues) if (phases.some((x) => x.id === id)) {
      if (!f.heldBy || id === f.heldBy) g.setEdge(fileId(f), id) // the file sits after its holder (or after every claimant, undecided)
      else g.setEdge(id, fileId(f)) // and before the ones waiting on it
    }
  }
  // An open question sits before the work it stands over.
  for (const q of questions) {
    g.setNode(questionId(q), { width: QW, height: QH })
    for (const id of q.subIssues) if (phases.some((x) => x.id === id)) g.setEdge(id, questionId(q))
  }
  dagre.layout(g)
  const at = (id: string, w: number, h: number) => { const n = g.node(id); return { x: n.x - w / 2, y: n.y - h / 2 } }
  return new Map([...phases.map((p) => [p.id, at(p.id, W, H)] as const), ...files.map((f) => [fileId(f), at(fileId(f), FW, FH)] as const), ...questions.map((q) => [questionId(q), at(questionId(q), QW, QH)] as const)])
}

type Pos = { x: number; y: number }
/** Where the viewer dragged nodes to, remembered in this browser only (a convenience, never state). */
const loadMoved = (key?: string): Record<string, Pos> => { try { return key ? JSON.parse(localStorage.getItem(`graph.moved.${key}`) ?? '{}') : {} } catch { return {} } }
const saveMoved = (key: string | undefined, moved: Record<string, Pos>) => { try { if (key) localStorage.setItem(`graph.moved.${key}`, JSON.stringify(moved)) } catch { /* private window: it just doesn't stick */ } }

export interface PlanGraphViewProps {
  subIssues: GraphSubIssue[]
  files?: GraphFile[] // shared files, drawn as nodes between the sub-issues that claim them
  questions?: GraphQuestion[] // unanswered questions, drawn as nodes before the sub-issues of the task that asked
  storageKey?: string // the project or app: dragged positions are remembered per key, in this browser
  onSelect?: (p: GraphSubIssue) => void
  selectedId?: string
  labels?: Record<string, string> // e.g. the issue (or project · issue) each sub-issue belongs to
  tall?: boolean
}

const NO_FILES: GraphFile[] = [] // one array, not a new one each render: the layout effect keys on it
const NO_QUESTIONS: GraphQuestion[] = []

export function PlanGraphView({ subIssues: phases, files = NO_FILES, questions = NO_QUESTIONS, onSelect, selectedId, labels, tall, storageKey }: PlanGraphViewProps) {
  const ws = useWorkspace()
  // A shared file is drawn only where it is what keeps sub-issues from building side by side: between claimants that no
  // path of arrows already orders. Where an arrow already connects them, the file is part of that arrow's why.
  const ancestors = useMemo(() => {
    const byId = new Map(phases.map((p) => [p.id, p]))
    const memo = new Map<string, Set<string>>()
    const up = (id: string): Set<string> => {
      if (memo.has(id)) return memo.get(id)!
      const out = new Set<string>(); memo.set(id, out)
      for (const d of waitsOn(byId.get(id)!)) if (byId.has(d)) { out.add(d); for (const a of up(d)) out.add(a) }
      return out
    }
    for (const p of phases) up(p.id)
    return memo
  }, [phases])
  const ordered = (a: string, b: string) => !!ancestors.get(a)?.has(b) || !!ancestors.get(b)?.has(a)
  const shared = useMemo(() => files.map((f) => {
    const mine = f.subIssues.filter((id) => phases.some((x) => x.id === id))
    const free = mine.filter((id) => mine.some((o) => o !== id && !ordered(id, o)))
    return { ...f, subIssues: free, heldBy: f.heldBy && free.includes(f.heldBy) ? f.heldBy : null }
  }).filter((f) => f.subIssues.length > 1), [files, phases, ancestors]) // eslint-disable-line react-hooks/exhaustive-deps
  const filesBetween = (a: string, b: string) => files.filter((f) => f.subIssues.includes(a) && f.subIssues.includes(b)).map((f) => f.path.split('/').pop()!)
  const asked = useMemo(() => questions.map((q) => ({ ...q, subIssues: q.subIssues.filter((id) => phases.some((x) => x.id === id)) })).filter((q) => q.subIssues.length > 0), [questions, phases])
  const topology = [...phases.map((p) => `${p.id}:${waitsOn(p).join(',')}`), ...shared.map((f) => `${f.path}:${f.heldBy ?? ''}:${f.subIssues.join(',')}`), ...asked.map((q) => `q:${q.id}:${q.subIssues.join(',')}`)].join('|')
  const positions = useMemo(() => layout(phases, shared, asked), [topology]) // eslint-disable-line react-hooks/exhaustive-deps
  // Nodes can be dragged; a dragged node keeps its place through live updates and re-layouts until "Tidy up".
  // React Flow owns the node state (so a drag never waits on a React round-trip, which showed as flicker); every
  // live update is merged into it, keeping the place of anything dragged or mid-drag.
  const [moved, setMoved] = useState<Record<string, Pos>>(() => loadMoved(storageKey))
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<PhaseNodeData | FileNodeData | QuestionNodeData>>([])
  const tidy = () => { setMoved({}); saveMoved(storageKey, {}) }
  const built = useMemo((): Node<PhaseNodeData | FileNodeData | QuestionNodeData>[] => [
    ...phases.map((p): Node<PhaseNodeData> => ({
      id: p.id, type: 'phase', position: positions.get(p.id) ?? { x: 0, y: 0 }, data: { phase: p, label: labels?.[p.id] }, selected: p.id === selectedId,
    })),
    ...shared.map((f): Node<FileNodeData> => ({
      id: fileId(f), type: 'file', position: positions.get(fileId(f)) ?? { x: 0, y: 0 }, data: { file: f, holder: phases.find((x) => x.id === f.heldBy) }, selectable: false,
    })),
    ...asked.map((q): Node<QuestionNodeData> => ({
      id: questionId(q), type: 'question', position: positions.get(questionId(q)) ?? { x: 0, y: 0 }, data: { question: q }, selectable: false,
    })),
  ], [phases, shared, asked, positions, labels, selectedId])
  useEffect(() => {
    setNodes((prev) => {
      const was = new Map(prev.map((n) => [n.id, n]))
      let same = prev.length === built.length
      const next = built.map((n) => {
        const p = was.get(n.id)
        const position = p?.dragging ? p.position : moved[n.id] ?? n.position
        if (p && p.position.x === position.x && p.position.y === position.y && p.data === n.data && p.selected === n.selected) return p
        same = false
        return { ...n, ...(p ?? {}), ...n, position }
      })
      return same ? prev : next // the same array when nothing changed, or React Flow and this effect would feed each other
    })
  }, [built, moved, setNodes])
  const edges: Edge[] = [
    ...phases.flatMap((p) => waitsOn(p).filter((d) => phases.some((x) => x.id === d)).map((d): Edge => ({
      id: `${d}->${p.id}`, source: d, target: p.id, animated: LIVE.includes(p.status), type: 'why',
      data: { why: whyEdge(phases.find((x) => x.id === d)!, p, filesBetween(d, p.id)) },
      markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--ink-faint)' },
    }))),
    // A question points at the work it stands over.
    ...asked.flatMap((q) => q.subIssues.map((id): Edge => ({ id: `${questionId(q)}->${id}`, source: questionId(q), target: id, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--warn)', strokeDasharray: '4 3' } }))),
    // The holder points at the file; the file points at everyone waiting on it. Nobody holding it: claimants hang off it, undecided.
    ...shared.flatMap((f) => f.subIssues.filter((id) => phases.some((x) => x.id === id)).map((id): Edge => id === f.heldBy
      ? { id: `${id}->${fileId(f)}`, source: id, target: fileId(f), animated: true, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--accent)' } }
      : f.heldBy
        ? { id: `${fileId(f)}->${id}`, source: fileId(f), target: id, markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: 'var(--accent)', strokeDasharray: '4 3' } }
        : { id: `${id}->${fileId(f)}`, source: id, target: fileId(f), style: { stroke: 'var(--ink-faint)', strokeDasharray: '4 3' } })),
  ]
  return (
    <div className={`graph-canvas ${tall ? 'tall' : ''}`} data-component="PlanGraphView">
      <ReactFlowProvider>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} onNodesChange={onNodesChange}
          onNodeDragStop={(_, n) => { const next = { ...moved, [n.id]: n.position }; setMoved(next); saveMoved(storageKey, next) }}
          onNodeClick={(_, n) => {
            if (n.type !== 'phase') return
            const p = (n.data as PhaseNodeData).phase
            onSelect?.(p)
            // A node is a sub-task's build: pressing it opens that build beside the graph, with its status, its steps and what its agent is saying and doing, live (Sandy, 2026-11-17: "click on a node and … see what the agent is doing … like I would if I was building something directly within VS Code"). A step drawn before it exists has nothing to open.
            if (ws && !p.id.startsWith('flow:')) ws.open({ kind: 'build', issueId: p.id }, { split: 'right' })
          }} nodesConnectable={false} proOptions={{ hideAttribution: true }}
          panOnScroll zoomOnScroll={false} zoomActivationKeyCode="Meta" panOnDrag={false} selectionOnDrag={false} zoomOnPinch zoomOnDoubleClick={false}>
          <Background gap={20} color="var(--line)" />
          {Object.keys(moved).length > 0 && <Panel position="top-right"><button type="button" className="graph-tidy" onClick={tidy}>Tidy up</button></Panel>}
          <FitOnChange topology={topology} />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  )
}

/** Re-fit the view when the set of nodes or edges changes (and once after the first measurement). */
function FitOnChange({ topology }: { topology: string }) {
  const { fitView } = useReactFlow()
  useEffect(() => {
    const id = window.setTimeout(() => void fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 50)
    return () => window.clearTimeout(id)
  }, [topology, fitView])
  return null
}

/** Why one sub-issue waits on another, in words. */
function whyEdge(from: GraphSubIssue, to: GraphSubIssue, shared: string[]): string[] {
  const out = [to.dependsOn.includes(from.id) ? `${to.identifier} builds on ${from.identifier}` : `${to.identifier} starts after ${from.identifier}: its task comes later in the project`]
  if (shared.length) out.push(`both touch ${shared.slice(0, 3).join(', ')}${shared.length > 3 ? ` +${shared.length - 3}` : ''}`)
  return out
}
