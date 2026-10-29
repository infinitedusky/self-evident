# The core engine: parallel execution as a task graph

Research for Idea Factory's first build, 2026-10-20. Sources: InDusk's unbuilt `run-the-graph` plan and its
session/worktree/run-record code (read-only study), a public survey of open-source parallel agent runners and
graph engines, and Lightsprint's public docs, task-sync plugin and n8n node (data model, section 5). Rule: borrow where
the licence allows; write only what nobody ships.

## 1. The short version

- **Nobody ships "task graph + parallel worktrees + PRs" as one unit.** Every open-source runner is a flat list or
  a parent/child tree. The only dependency-gated schedulers are Beads (Go, an issue tracker) and Claude Code's agent
  teams (not programmable). This is open ground.
- **InDusk designed the graph four times and never built it.** The design is sound and small; the scheduler code
  doesn't exist. The executor underneath (session manager, run records) does, and is worth lifting.
- **Why InDusk's build failed: task status lived in versioned files**, so every finishing agent merged its status
  into the same document ("two phases appending to one shared doc conflicted every time"). The retrofit to a
  database stalled. **Founding rule here: git holds code, Postgres holds state, one engine server is the single
  writer** (SHAPE.md).
- **Merge is the measured risk:** cross-agent PRs conflict 42% vs 20% same-agent (arXiv 2607.04697, 142k agent
  PRs); LLM conflict resolution is ~50/50 on real conflicts. Factory and Cognition both landed on "writes stay
  single-threaded". So: parallel *work*, serial *landing*.

## 2. From InDusk (`/Users/the_dusky/code/sandbox/dusk`)

**The `run-the-graph` design** (`.indusk/planning/run-the-graph/{brief,adr}.md`, accepted 2026-10-19, never built;
`src/lib/graph/` doesn't exist):
- Nodes are tasks (their "phases"). Each declares **Depends on** and **Files** (globs). Two tasks that share a
  file never run together — the only conflict protection designed. No files line = "shares with everyone" = runs
  alone. Unknown names and cycles stop the run.
- **One pure scheduler function** `pickPhasesToStart({graph, running, stopped, waitingOn, room})`: no clock, no
  reads, picks one at a time so two tasks freed together never claim the same file, and gives a reason for every
  task held back (dependency, shared file, cap, question, blocker).
- **One launch pass per plan at a time**; a task ending, a join finishing or a 30 s tick only *requests* a pass.
- **One worktree and branch per task** (`phase/<plan>/build-<n>`), cut from the plan's branch. **Join:** merge the
  plan's branch into the task → run tests on the merged commit → `--ff-only` into the plan's branch, retrying if it
  moved. Three failures stop the task; dependents wait; the rest continue.
- Results: an append-only event log (`run-started`, `launched`, `ended`, `join`, `stopped`) — the right shape, in
  the wrong place (a file). Here it's a table.

**Lift nearly as-is** (`apps/indusk-mcp/src/lib/`): `session/protocol.ts` (stream-json → typed events),
`start.ts`, `permissions.ts` (allow inside worktree roots, refuse outside; refuse AskUserQuestion when
unattended), `trust.ts`, `rate-limit.ts` (429 → 15/45/90 s); `run-record/record.ts` + `liveness.ts` (running only
if *its own* `claude` pid is alive and matches); `process-identity.ts`; the VS Code extension's reader/webview shape.
**Adapt:** `session/manager.ts` (rekey plan→(run, task); persist events to the DB instead of memory);
`createPlanWorktree` → `createTaskWorktree`. **Drop:** workbench worktree files, gate hooks, `impl.md` section-merge,
Dawn, build-admission rules.

**What actually went wrong** (git log and `.claude/lessons/`): design churn (49 commits in four days, two cold
reads each finding "twenty-odd problems"); two processes each holding a SessionManager, so a task could launch
twice; the runner racing its own timer; cap holes across plans; orphan daemons. All of it is state and ownership,
not graph theory — and all of it is what "one server, one database, pure scheduler" removes.

## 3. From open source (licences checked 2026-10-20)

| What | Pick | Why |
|---|---|---|
| Executor | **`@anthropic-ai/claude-agent-sdk`** (same binary as `claude -p`; Anthropic commercial terms, users bring their own key) | Typed `SDKMessage` stream, `resume`, `forkSession`, `canUseTool`, `maxBudgetUsd`, cost per run, `worktree_resume_refused`. `-p` only for non-TS hosts |
| Scheduler | **Write it (~300 lines)**; copy p-graph's ready-set loop (MIT, archived), `p-limit` for the cap, `dependency-graph` for cycle detection | Graph engines (LangGraph, Temporal, Mastra, Inngest, Trigger.dev) assume they can checkpoint *inside* a step; ours are opaque 5–60 min processes, so resume is "re-spawn or `--resume <session>`" regardless. Steal LangGraph's `retryPolicy` shape, Dagster's event-log-as-truth, Symphony's run-phase vocabulary |
| Worktrees/git | Ideas from Vibe Kanban's `worktree-manager` and `git` crates (Apache-2.0, Rust) | Claude Code's `--worktree` can't take an arbitrary base branch; we create worktrees ourselves and pass `cwd` |
| Landing | `git rebase` → **mergiraf** (GPL, subprocess) → a fresh agent with both diffs and both intents → park for a human; `git merge-tree` dry-run before dispatch | Tiers by cost; the LLM tier is a coin flip, so it's third |
| PRs | `gh` (shell-out): GitHub **native stacked PRs** (GA 2026-10-06) + merge queue / `gh pr merge --auto` | A plan's tasks publish as one stack |
| VS Code view | Webview + **`@xyflow/react` 12 + `@dagrejs/dagre`** (both MIT); state host-side, snapshot replay on reopen | Nx Console's architecture; re-layout only on topology change |
| Ideas to borrow | Symphony (config keys, stall timeout), Gas Town/Beads (`ready` = no open blockers; Bors-style merge queue), SuperPlane (verify gates loop back to the agent), agent teams (task JSON: a pending task with unresolved dependencies can't be claimed) | — |
| Ignore | Crystal (deprecated), Claude Squad (AGPL), Conductor (proprietary), heavy orchestration servers | — |

**Terms** (Anthropic legal page, verbatim): products "including those using the Agent SDK, should use API key
authentication"; "Anthropic does not permit… routing requests through Free, Pro, or Max plan credentials on behalf
of their users." Our development on a subscription is ordinary individual use; the product never touches
subscription credentials.

## 4. Design decisions

1. **Git holds code and authored inputs; Postgres holds all state; the engine is one server process and the
   single writer.** Agents emit events; they never write status. Clients (CLI, VS Code, UI) talk to the server
   over HTTP and a live stream (`LISTEN/NOTIFY` on the event table → WebSocket/SSE). Same code local and hosted.
2. **Plans are made of tasks; tasks form the graph.** A task declares `depends_on` and `files`. The scheduler is a
   pure function over DB rows; one dispatch pass per plan at a time; every held task carries a reason.
3. **Parallel work, serial landing.** Per-plan integration branch. A ready task's worktree branches from it *at
   dispatch*. A single in-process landing step rebases and fast-forwards finished tasks one at a time
   (merge → test → ff, three attempts). **Dependents dispatch only after their parents land** — a stack by
   construction. File claims plus a `merge-tree` dry-run gate dispatch.
4. **Executor = Agent SDK**, wrapped: spawn in the task's worktree with `cwd`, normalise `SDKMessage` to our
   events, `--resume` the session after a crash, permissions confined to the worktree, budget cap per task.
5. **Resume = re-spawn.** The event log and task rows are the truth; on restart the server reaps orphans (pid +
   program + start time), marks their tasks `interrupted`, and the scheduler picks up.
6. **The VS Code view is a client**, reading the same stream as everyone else.

## 5. Data model (from Lightsprint's public docs, task-sync plugin and n8n node)

**Sandy's hypothesis confirmed:** Lightsprint is a database-driven application working on repos. Every stateful
thing is a row (their plugin's own design spec names the tables: `tasks`, `cc_sessions`, `cc_session_events`,
`plans`, `githubPullRequests`); the repo receives only agent inputs and the PR. Two nuances: (a) GitHub is the
*authority* for exactly one transition, PR merged → Done, which arrives by webhook and the DB mirrors; (b) two
things cross into GitHub as **mirrors, never sources** — the branch name (`ls/<taskNumber>-<slug>-<id>`, which
their auto-linker keys on) and PR comments (Verification, an "On it → Done" status comment edited in place).
`plan-handoff.md` is a task *attachment*, not a commit; sandbox files are scratch ("a key the agent added to .env
is gone next session"). **No status in git.** Git → DB only via webhooks and the branch convention.

**Their entities** (fields as far as the sources show): workspace (plan, seats, credit pool, commit identity,
egress mode) · user/membership (roles incl. `member_no_merge`; per-user BYO subscription) · **stack** = the app
(member repos with base-branch override and writable flag; sandbox size; setup/test commands; services ≤15;
env ≤500 keys → `/tmp/.env`; snapshot with stale flag; primary sandbox; per-task budget cap) · repo · project
(cross-stack tag) · **task** (displayId `PREFIX-NNN`; status `backlog/todo/in_progress/in_review/done`;
complexity, priority, size S–XL, `requiresSchemaChange`, todo list, related files, **dependencies as join rows**,
`autoMerge` tri-state, branch; transitions: launch → in_progress, PR linked and idle → in_review, merge → done) ·
comment/activity (one interleaved timeline) · cloud agent run (provider, model, baseRef; pill
Starting/Working/Ready/Completed/Failed/Stopped; one active run per task per provider; ~2 h turn cap; budget cap)
· session (transcript, tool rows, **shared ordered message queue**, "Send now" interrupts) · cc_session + events
(external Claude Code sessions reporting in) · sandbox/preview (pause ~20 min idle, retire 7 days after Done;
per-service unguessable URL; DB branch per task when needed) · **verification** (captures tagged Feature/Entry,
*named, same name replaces*; mirrored to a PR comment) · pr/review hub (signals by category ci/review/deployment/
bot/human; `readiness_score` 0–100 with section summaries, cached by signals hash; auto-merge at 100 with CI
settled) · plan (methods; **decision cards** with lettered options and a Recommended one; outputs; handoff creates
exactly one task; no approval step) · ask thread · automation (trigger, conditions, action, policy: run-as user,
concurrency, max runs per window, per-run budget; **versioned**) · skill (stack skill, or read-only index of
`.claude/skills/*/SKILL.md`; `design-md` = design system) · guardrail/connector · billing.

**API shape:** REST+JSON, Bearer, `limit/offset` ≤100, SSE only for the review overlay and ask messages. **No
outbound webhooks or subscribable task-event stream anywhere public.** The sync plugin is CC → LS only, last write
wins, no etags. IDs: 21-char nanoids, prefixed (`ws_`, `stk_`); tokens `lsat_`/`lsrt_`.

**What they don't model** (ours to add): idea, hypothesis, baseline, metric, experiment, flag, look-by, verdict,
post-merge check, evidence attached to an idea, fake-data labelling in a demo, per-PR rollback plan or guard
metric. Their unit of work ends at `done`. Automations have no telemetry trigger.

### Draft Postgres schema for the engine

Conventions: one engine process is the only writer; agents and hooks POST events; the engine updates the state row
and appends to `event` in one transaction. Tags: `[LS]` Lightsprint-derived, `[ID]` InDusk run-the-graph, `[IF]`
ours. Anything filtered, joined or shown on a card is a column; snapshots of external systems or shapes still
moving are JSONB. Skills stay in the repo, indexed, not stored. Automations and billing deferred.

```sql
create table app (                       -- [LS] "stack"
  id text primary key, name text not null, default_branch text not null default 'main',
  setup jsonb not null default '{}',     -- [LS] setup_cmd, test_cmd, services[], env_ref, sandbox_size
  created_at timestamptz not null default now());

create table repo (id text primary key, app_id text references app, full_name text not null,
  local_path text, writable bool not null default true, base_branch text);   -- [LS] member repos

create table provider_connection (       -- [IF] modules and providers
  id text primary key, app_id text references app,
  role text not null check (role in ('telemetry','code_host','design_system','model','sandbox','traces')),
  provider text not null, config jsonb not null default '{}', secret_ref text,
  status text, checked_at timestamptz, unique (app_id, role, provider));

create table "user" (id text primary key, name text, email text, github_login text,
  role text not null default 'owner' check (role in ('owner','member','member_no_merge')));  -- [LS]

create table idea (                      -- [IF] the unit of work that outlives the merge
  id text primary key, app_id text references app, number int not null,   -- [LS] display "HG-12"
  title text not null, body text,
  source text not null check (source in ('person','agent','telemetry')), source_ref jsonb,
  lane text not null default 'inbox'
    check (lane in ('inbox','measuring','build','testing','shipped','parked','killed')),
  hypothesis text, baseline jsonb,       -- {metric, value, window, captured_at, insight_id}
  measures jsonb not null default '[]',  -- [{kind: insight|flag|experiment, provider_ref, target}]
  testability jsonb, look_by date,       -- {verdict, reason, min_traffic}
  decision text check (decision in ('yes','no','not_yet')), decided_at timestamptz,
  created_by text references "user", created_at timestamptz not null default now(),
  updated_at timestamptz, unique (app_id, number));

create table evidence (                  -- [IF] append-only telemetry results
  id bigserial primary key, idea_id text references idea, pr_id text,
  kind text not null check (kind in ('baseline','finding','verdict','guard','post_ship')),
  metric text, value numeric, baseline_value numeric, window tstzrange, provider text,
  summary text, raw jsonb, captured_at timestamptz not null default now());

create table plan (id text primary key, idea_id text references idea,     -- [LS] plan under an idea
  status text not null default 'drafting' check (status in ('drafting','proposed','approved','superseded')),
  spec text, chunks jsonb, created_at timestamptz not null default now());

create table decision (                  -- [LS] decision card; [IF] provisional flag
  id text primary key, idea_id text references idea, plan_id text references plan,
  question text not null, options jsonb not null,   -- [{key:'A', text, tradeoff, recommended, story}]
  chosen text, provisional bool not null default false,
  decided_by text references "user", decided_at timestamptz, rationale text);

create table question (                  -- [ID] questions with a cost
  id text primary key, idea_id text, task_id text, run_id text, text text not null, options jsonb,
  cost text, status text not null default 'open' check (status in ('open','answered','skipped','expired')),
  answer text, answered_by text, answered_at timestamptz, asked_at timestamptz not null default now());

create table task (                      -- [LS] fields; [ID] graph semantics
  id text primary key, app_id text references app, idea_id text references idea, plan_id text references plan,
  number int not null, title text not null, brief text,
  status text not null default 'queued' check (status in
    ('queued','ready','running','awaiting_answer','merging','testing','done','failed','cancelled')), -- [ID]
  attempt int not null default 0, max_attempts int not null default 3,     -- [ID] three attempts
  branch text, worktree_path text, base_sha text,                          -- [ID] worktree; [LS] branch naming
  size text check (size in ('S','M','L','XL')), priority int,
  requires_schema_change bool default false, auto_merge bool, position int, -- [LS]
  assignee text references "user", created_by text, pr_id text,
  created_at timestamptz not null default now(), updated_at timestamptz, unique (app_id, number));
create table task_dependency (task_id text references task, depends_on_task_id text references task,
  primary key (task_id, depends_on_task_id));                              -- [ID]/[LS]
create table task_file_claim (task_id text references task, path_glob text,
  primary key (task_id, path_glob));                                       -- [ID] file claims

create table session (id text primary key, task_id text references task,  -- [LS] one shared conversation per task
  status text not null default 'open' check (status in ('open','ended')),
  created_by text, created_at timestamptz not null default now());
create table session_message (           -- [LS] shared queue; "send now" = interrupt
  id bigserial primary key, session_id text references session, author text not null, body text not null,
  attachments jsonb, status text not null default 'queued'
    check (status in ('queued','sent','interrupted','dropped')),
  queued_at timestamptz not null default now(), sent_at timestamptz);

create table run (                       -- [LS] agent run; [ID] attempt
  id text primary key, task_id text references task, session_id text references session,
  attempt int not null, kind text not null
    check (kind in ('build','follow_up','verify','merge','setup','measure')),
  agent text not null, model text, status text not null default 'starting'
    check (status in ('starting','working','ready','completed','failed','stopped','interrupted')),
  started_at timestamptz not null default now(), ended_at timestamptz,
  cost_usd numeric, budget_cap_usd numeric, tokens jsonb, summary text, error text);

create table event (                     -- [IF] append-only live stream; the graph view's feed
  seq bigserial primary key, ts timestamptz not null default now(),
  app_id text not null, idea_id text, task_id text, run_id text, session_id text,
  actor text not null,                   -- engine | agent:<run_id> | user:<id> | github | posthog
  type text not null,                    -- task.status, run.tool_call, run.message, pr.check, verification.captured, question.asked, evidence.captured
  payload jsonb not null default '{}');
create index on event (app_id, seq); create index on event (task_id, seq);

create table pr (                        -- [LS] githubPullRequests + review hub; [IF] pitch
  id text primary key, task_id text references task, repo_id text references repo,
  number int, url text, head_branch text, base_branch text, head_sha text, merge_sha text,
  status text not null check (status in ('draft','open','queued','merged','closed')),
  additions int, deletions int, changed_files int,
  readiness jsonb,  -- [LS] {light, score, label, section_summaries, callouts, actions, signals_hash, updated_at}
  signals jsonb,    -- [LS] snapshot [{category, status, title, url, actor, updated_at}]
  pitch jsonb,      -- [IF] {off_switch_flag, guard_metric, schema_impact, revertable_alone, fake_data}
  opened_at timestamptz, merged_at timestamptz, unique (repo_id, number));

create table verification (              -- [LS] Feature/Entry shots; [IF] demo kinds + fake-data notes
  id text primary key, task_id text references task, pr_id text references pr, run_id text references run,
  kind text not null check (kind in ('screenshot','video','flow_diff','expectation','story','numbers')),
  label text check (label in ('feature','entry_point','before','after','failing_now_passing','data_effect')),
  name text not null, route text, blob_url text, notes jsonb,   -- notes.fake_data: what and why
  captured_at timestamptz not null default now(), unique (task_id, name));  -- [LS] same name replaces
```

**What the VS Code graph view subscribes to** (`LISTEN/NOTIFY` per app): `task` + `task_dependency` +
`task_file_claim` (nodes, edges, colour by status), `run` (the live node), `pr` (readiness light), `question`
(open = the node needs you), `event` (ticker and tool rows), `idea` (lane). Everything else loads on click.

**Not shown by the sources:** their ORM or full table list; whether `plan-handoff.md` is ever committed (inferred
not); the server-side run status enum; the DB-branch provider; webhook payload handling.

## 6. Build order (the loop first, the middle in its simplest form)

1. **Schema and server skeleton:** Postgres, migrations, the event table, `LISTEN/NOTIFY` → SSE, a CLI that talks
   to it. No agents yet. A plan with tasks and dependencies as rows; the scheduler as a pure function with tests.
2. **One task end to end:** worktree from the integration branch, Agent SDK run, events in the table, the landing
   step, a PR via `gh`.
3. **Parallel:** the cap, file claims, dependents after landing, orphan reaping, resume. Run it on Homework Gate
   with a plan of three independent tasks and one dependent.
4. **The VS Code graph view** over the live stream.
5. **Then** telemetry in (PostHog → ideas with baselines), verification skills (screenshots on the PR), plans as
   decision cards, sandboxes and previews.

## Sources

InDusk: `.indusk/planning/run-the-graph/`, `apps/indusk-mcp/src/lib/{session,run-record,worktree}/`,
`apps/vscode-extension/`, `.claude/lessons/`. Claude Code docs: agent-sdk/overview, agent-sdk/typescript,
headless, worktrees, workflows, agent-teams, legal-and-compliance (code.claude.com/docs/en/…). Runners:
github.com/BloopAI/vibe-kanban, OpenHands/OpenHands, langchain-ai/open-swe, superplanehq/superplane,
ColeMurray/background-agents, openai/symphony, gastownhall/gastown, steveyegge/beads. Engines:
langchain-ai/langgraphjs, mastra-ai/mastra, microsoft/p-graph, sindresorhus/p-limit. Viz: reactflow.dev/learn/layouting,
dagster.io/blog/scaling-dag-visualization, github.com/nrwl/nx-console. Merge: github.blog/changelog/2026-10-06-stacked-pull-requests-generally-available,
arxiv.org/abs/2607.04697, arxiv.org/abs/2604.03551, factory.com/news/missions, cognition.com/blog/multi-agents-working,
mergiraf.org.
