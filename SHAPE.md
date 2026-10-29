# Idea factory — the shape

Working name. Brainstormed with Sandy, 2026-10-20, after deciding InDusk had
grown more process than product. Draft: research in `research/` fills in the
comps, the method and what to salvage.

## The dream: company as code (Sandy, 2026-10-21 — "this has been a dream forever")

A company whose logic lives in git (processes, standards, skills, integrations; changed by PR), whose state lives
in a database (orders, messages, decisions, evidence; never in the code), that is changed on evidence by the
factory (telemetry proposes, agents build, telemetry judges), and where people make the judgement calls and
those calls are recorded as part of the company's record. Infrastructure as code took a decade to become the
default; the tech-pack company (`LOG.md`) would be the first one written this way, from its first garment.

## What matters most (Sandy, 2026-10-20)

1. **Agents produce PRs and the support for them.**
2. **Telemetry drives the decisions and that support.**

When someone asks "how do I know this will work?", the answer is never "trust me". It is: "This ran. Here's
the loop it ran, and here are its telemetry results. It's all green, so you can launch production." After launch:
"Still all green." Metrics keep coming in, and **every idea, the moment it arrives, is analysed against them** —
the data that supports it, augments it, or argues against it is attached to the idea.

## Start with people who are starting (Sandy, 2026-10-21)

"It's hard to retrofit any company, easier if you start using this." The factory and everything built with it
are for greenfield: PostHog-native from the first line, Postgres from day one, a brand's first tech pack rather
than a migration of its hundredth. Converters run outward (our standard → the formats incumbents already use), so
nobody on the other side has to change. The standard spreads because newcomers keep arriving with it.

## The goal: free and open source (Sandy, 2026-10-20)

Not a pivot: this is still InDusk's successor. We learn as much as we can from Lightsprint (and InDusk), add our
own ideas on top, and speed-run it — **not racing for venture money, but putting it out free for people to use and
contribute to.** Success is people running it and contributing. Open-source neighbours turning tasks into agent PRs
already exist (OpenHands, Open SWE, superplane, background-agents); ours is different by the loop — telemetry
proposes, agents build with evidence, telemetry judges, PostHog-native. Open questions for Sandy: licence
(recommended MIT, like PostHog's core) and the public repo's name. The current idea-factory repo stays private
(the log and ideas describe a real family); the public project gets a fresh repo.

## The core engine: parallel execution as a graph (Sandy, 2026-10-20)

Name: **Idea Factory** (decided). Build the core engine first, as soon as possible: **plans are made of tasks;
tasks form a dependency graph** (node = task, edge = dependency); running a plan runs every task whose
dependencies are done, in parallel, each agent on its own branch/worktree, producing PRs. A **VS Code
visualization** of the graph running. If people already do this, borrow what we can (InDusk's unbuilt
`run-the-graph` plan, its session manager and worktrees; open-source parallel runners and graph engines —
`research/parallel-engine.md` when written).

## Founding rule of the engine: git holds code, the database holds state (Sandy, 2026-10-20)

Why InDusk's graph runner failed when built: task status lived in versioned files (plan docs, `impl.md`
sections and table rows), so every parallel agent that finished had to merge its status into the same document
as every other agent — "two phases appending to one shared doc conflicted every time." The fix, a move of state
to a database, stalled as a retrofit (`plan-state-is-a-database`). We get to do it from day one, with nothing to
fix.
- **Git holds code and authored inputs** (prose plans, skills, setup). **Postgres holds all state**: apps/stacks,
  ideas, plans, tasks, dependencies, file claims, status, runs, sessions, events, questions, verifications, PRs,
  evidence, verdicts. No status in a markdown file, a JSONL log in a repo, or a frontmatter field — including the
  `ideas/` files (authored input only; evidence and verdicts are rows).
- **One engine process is the single writer.** Agents, the CLI, the VS Code view and the UI talk to it. Agents
  never write status; they emit events (or call a tool) and the engine records them. (Kills InDusk's other bug:
  two processes each holding session state, launching a task twice.)
- **Postgres from day one, so the engine is server-friendly** (Sandy): the engine is one server process owning
  the database — local in development (Docker Postgres or PGlite), hosted for real, same code. The CLI, the VS Code
  view and the UI are clients over HTTP plus a live stream; none touch the database directly. The live feed is
  `LISTEN/NOTIFY` on the append-only event table, fanned out over WebSocket/SSE, so several machines can watch one
  run. Workspace, membership and stacks are rows from the start, not a retrofit. Migrations from the first commit. The application is database-driven, working on repos — like Lightsprint, whose data
  model we're reconstructing from its public docs and open-source plugins to design ours properly before
  writing engine code (`research/parallel-engine.md`).

## Positioning (Sandy, 2026-10-20)

Lightsprint reads as **an extension of Linear** (tickets in, code out), and Linear is its natural competitor.
The idea factory should read as **an extension of PostHog** (data in, code out, data checks it), and **PostHog is
ours** — its self-driving loop (June 2026: signals → agent → draft PR → metric back to baseline) is the closest
thing to us. The customer is a PostHog user with data nobody acts on fast enough. The factory uses PostHog's own
building blocks (insights, flags, experiments) and feels like part of it.
Platform risk, and the defences: **telemetry-neutral** (PostHog *and* Datadog — PostHog will never be the layer
that reads your Datadog); **deep where PostHog won't go** (PRs on any stack with their evidence, demos with
labelled fake data, an agent that pushes back on whether an idea is worth building — their loop is a feature
inside analytics, ours is the product); and the best extension of PostHog is also what PostHog would buy.

## What it is

An entrepreneur machine. A person has many ideas; the machine tests them all
at once, kills most of them on evidence, builds the ones that survive in
parallel, and shows each result working before anyone says yes. Ideas are
cheap and execution is expensive, so the machine makes an idea earn its build.

It takes over where Claude Code stops being enough: the app is good, the list
of improvements grows faster than a person can judge it, and nobody knows what
is working.

## The loop

1. **An idea arrives** — from the person, talking it through with the agent
   (which pushes back: good, bad, here are the problems), or from telemetry
   ("checkout errors tripled after Tuesday").
2. **Baseline first.** The first answer to any idea or complaint is "let's
   measure": put telemetry on it, state a hypothesis, set up a few cheap tests
   (fake doors, A/B, watching the people who'd use it), and give the idea its
   own small dashboard with a look-by date. The agent says plainly when an
   idea can't be tested well ("you have 40 users; here's the best we can do").
3. **Decide on evidence.** On the look-by date the findings say yes, no or
   not yet. Most ideas die quietly here.
4. **Ideas, tasks, projects** (2026-10-29). An idea is exploration, even a
   single sentence. Research, mockups, a prototype and a rough draft of a
   brief can all be done on it without committing. Converting it, the agent
   uses whatever exists to decide whether it becomes a task or a project. A
   task can also be made directly. A task means "we're going to build this":
   it has a brief, and it can't be completed until the brief is approved. A
   project holds tasks; it has no brief of its own. Research, mockups and
   prototypes can be done on any of the three, at any time; workflows can
   require steps or an order, the way Jira's do. The prototype is the agent's
   quick, working attempt and a key artifact for the build.
5. **Factory.** Every chunk that isn't waiting on another is built at once,
   each as a PR. Only a blocked chunk costs anything.
6. **Demonstrate.** Each PR comes with a demonstration: the real app running
   the change, with fake data filled in where needed — and the agent knows and
   says which data is fake and why. Kinds: before and after, a walkthrough,
   numbers before and after, the failing case now passing, the effect on data.
   The pitch is an employee to a boss: what it does, why we need it, the data
   behind it, what could go wrong and how we'd know, one button to say yes or
   "talk to me".
7. **Ship and check.** Telemetry checks the claim against the baseline. What it
   sees feeds the next ideas.

The person can follow every step as it happens, interrupt at any point, or ask
"what are you doing".

## Principles

- **The person is in control.** Guidance, never gates. The evidence-first way
  is the easy, enjoyable one; skipping it is allowed, and then the telemetry
  goes in anyway so the decision is measured after the fact.
- **Review what it does, not the code.**
- **Evidence the agent can't dress up.** Real telemetry, and every pitch says
  what it is unsure of.
- **Web apps first.**
- **No plan ceremony.** No document chains that gate each other, no reviews of
  reviews. The checks are the evidence, the demonstration and the telemetry.

## The hard, mechanical parts

- The demonstration environment: a preview of the app per PR, a database copy
  per PR with generated data, stand-ins for outside services, and a record of
  what was faked.
- The factory: many agents building in parallel without stepping on each
  other.
- Telemetry that installs itself into an app and explains itself.
- The per-idea dashboard: baseline, hypothesis, tests, findings, look-by date.

## What the research says (2026-10-20)

Details and sources in `research/`.

- **Rent, don't build** (superseded 2026-10-20 — see Decided: build the factory, fed by telemetry): parallel agents each opening a PR (Cursor, Devin,
  Codex, Jules, Copilot, Claude Code cloud, Factory); PRs with videos and
  screenshots (mainstream since Feb 2026); error-to-PR autofix (Sentry Seer,
  Datadog, PostHog); preview deployments and database branches (Vercel, Neon,
  Supabase); service mocks (MSW); experiments (GrowthBook, open source).
- **Nobody does:** the idea as the unit of work — baseline, hypothesis,
  testability verdict, look-by date, verdict, re-check after shipping; an agent
  that pushes back on whether an idea is worth building; ideas proposed from
  telemetry (not just bug fixes); demos on a seeded preview that label the fake
  data and tie to the hypothesis. Seed data is the weak spot — the open tools
  are stalled or gone, so we may own that layer.
- **Closest threats:** PostHog (self-driving loop, June 2026: signals → agent
  → draft PR → checks the metric returned to baseline; MIT core) and Cursor
  (agents with demos). Building on PostHog may beat competing with it.
- **Caution on parallelism:** Factory found mostly-serial work beat broad
  parallelism; ideas in parallel is safer than chunks in parallel.
- **Method:** validate on behaviour that costs the user something (click <
  email < details < money), never compliments. Stages with time boxes and
  kill lines set before data: frame → problem evidence (interviews) → demand
  (1–3 weeks) → value (a real first version) → traction. The tool says when a
  test can't detect a realistic effect with the traffic available. Solo: one
  idea in the real-product stage, two or three in demand testing. Fundable
  evidence is the retention cohort, weekly growth and revenue quality, not a
  landing-page conversion rate. People run interviews and make the kill call.
- **Salvage from InDusk:** the telemetry layer (app scaffold, local daemon,
  own server, signal reading) ~9–10k LOC nearly as is; sessions, questions
  with a cost, run records, the looks/browser slice and UI primitives adapted;
  ~60k LOC of plan ceremony dropped.

## Decided

- **The loop's stages** (Sandy, 2026-10-29): Observe · Learn · Ideate (ideas and their research) · Plan
  (tasks: research, brief, mockup, prototype, in any order unless a workflow sets one) · Build (including the
  checks a build is held to). The rail lists only these stages; projects, tasks and the steps are inside them.
- **A prototype before the plan, then a build from scratch** (Sandy, 2026-10-29). Planning starts by building the
  actual thing quickly in its own worktree: shortcuts by default, made to demo and to change in moments, and able to
  do any kind of work, schema included. It runs on the app's real database engine, rebuilt from labelled JSON
  scenarios, with off-the-shelf stand-ins for outside services. When it's ready, everything about it is analysed
  into the plan, the migrations and the checks. Then the real build starts from main and is written properly; none
  of the prototype's code is kept. Details: LOG.md, "The prototype".
- **Built on PostHog** (Sandy, 2026-10-20). An app made with the idea factory
  is PostHog-native from its first line: every feature ships with its events,
  its feature flag, its experiment where one fits, session replay and error
  tracking, named and wired the way the idea's hypothesis needs. So when an app
  starts getting traction, it already has the best PostHog integration it
  could have, as a result of how it was built. The salvaged InDusk telemetry
  covers only what PostHog doesn't (server-side traces and signals).

- **First app: Homework Gate** (Sandy, 2026-10-20) — its web side: the parent
  dashboard (locks and rewards) and the student tutor (reads homework, teaches
  rather than answers, grades, tracks progress over time). The iOS and native
  locking pieces stay outside the loop at first.

- **It builds the supporting work as it goes** (Sandy, 2026-10-20) — kept from
  InDusk, which did this well: mockup first, then build, then stories, plus a
  design system, changelog and docs, each encouraged at the right moment.
  Here they are by-products, never gates: nothing waits on a document, a
  missing one is flagged, not blocking (InDusk's gates and reviews are what
  made it cumbersome). Every artifact needs a reader or it isn't made: mockup
  → Sandy before code; design system → the next mockup and the app; stories
  (Storybook) → the demonstration, every state including faked ones;
  changelog → Sandy and the pitch; docs → the next session.

- **Storybook is the home of the design system, stories and mockups**
  (Sandy, 2026-10-20), as its own server — not built into our UI (InDusk
  built its looks/approval flow into the admin and fought it). Tokens and
  components documented there; mockups are page stories built only from
  design-system components (so an approved mockup is most of the real
  screen); every state is a story, with fake data via MSW, labelled; the
  same stories serve as PR demonstrations.

- **PRs are a source of production failures, so each carries telemetry and a
  rollback plan** (Sandy, 2026-10-20). At volume (hundreds of PRs a day) a
  problem can surface after many later merges: redeploying the old version
  undoes all of them, and reverting one PR can conflict with work built on
  it. The practice: separate deploy from release with feature flags (PostHog)
  so rollback means turning off one flag; release gradually with a guard
  metric; tag events with the release and the flags on, so a late problem
  traces to one PR; schema changes go expand-then-contract so they stay
  reversible. Every PR's pitch states: the off switch (which flag; "none"
  must be justified), how we'd know (guard metric), schema impact, and
  whether it can be reverted alone. Work is PRs only; `main` is production.
  Schema changes: additive (new table, nullable/defaulted column, index built
  concurrently) is flag-safe; breaking (NOT NULL without default, drop/rename,
  type change, tighter constraint) needs expand-then-contract across PRs.
  Trap: additive schema can still break rollback through data (e.g. a new
  enum value written while the flag was on, which flag-off code can't read).
  So "does the flag work?" is two checks — flag-off code against the new
  schema, and against data written with the flag on — and the PR
  demonstration runs both: flag on, write data, flag off, old path still
  works.
  No gating migrations by person (Sandy: slow, and no safer). Classify each
  change by schema *and data* — the same NOT NULL / unique / backfill is
  trivial or dangerous depending on row counts, nulls, duplicates. Use
  existing tools for the schema side (Squawk, Atlas migrate lint,
  strong_migrations; pgroll/Reshape for expand-contract), add the data side
  by querying the real database. Simple → goes; needs care → agent splits it
  into expand-contract PRs; hard/irreversible → more evidence (dry run on a
  DB copy, snapshot first, "irreversible" stated in the pitch), Sandy still
  decides. Database is a module with a provider (most tools are
  Postgres-first; Homework Gate is SQLite).

- **Modules and providers** (Sandy, 2026-10-20). Modules are what the factory
  can do; each needs a role filled; extensions are providers for a role, and
  a module unlocks when its role has a provider. Telemetry → PostHog; design
  system / stories / mockups → Storybook; server traces → salvaged local
  OTel/Jaeger; model access for the app → Claude Code subscription (dev) or
  Claude API (prod) — `HG_CLAUDE_CODE` is already this; code host → GitHub.
  Builds on InDusk's extensions (`apps/indusk-mcp/extensions/`, ~20, each a
  `manifest.json`: skill, MCP server, health checks, env template, detect),
  which were a flat list with overlaps settled by hand in a README "decision
  matrix". Keep it light: a module is a named role + manifest; no generic
  adapter code until a second provider for a role is real. Settings shows each
  role with its provider(s) — PostHog the only telemetry option for now. An
  integration's values are set once under All apps and overridden per app, field
  by field (LOG, "Settings: All apps, then each app").

- **Foundational decisions are drawn out, not automated** (Sandy,
  2026-10-20). Automating setup early takes decisions out of the person's
  hands — easy, and useless. Setup decisions are mechanical (framework,
  file layout, routes: automate) or foundational (look and feel, palette,
  type, voice, density, audience: the person's). Foundational ones get an
  elicitation process, not a question: references (sites/apps liked and
  disliked, and why; who it's for) → the agent proposes 2–3 directions as
  real stories of the app's own screens → the person reacts (pick, mix,
  reject) → the choice is recorded with its why. Not a gate: the agent may
  proceed on a default, but it is labelled provisional (agent-chosen) and
  stays on the person's open list until decided.

- **Tiny visual start, as mockups** (Sandy, 2026-10-20): the idea board
  (inbox, three lanes — build / testing / parked — and a card per idea) and
  a settings page, "Telemetry: PostHog" as the only option.

- **Build the factory, fed by telemetry** (Sandy, 2026-10-20; **replaces "rent
  the factory"** below and in LOG decision 3). Lightsprint
  (`research/comps-agent-factories.md`) "is exactly what we want to build" —
  describe a change, an agent builds it in a sandbox, live preview, QA
  recordings, merge checks, PR. We borrow its product thinking (UI patterns,
  plans, automations, the idea-to-PR flow) to look good fast — patterns and
  ideas, never its pixels, brand or code. The difference: **integrations
  from day one are telemetry, not task trackers** — PostHog (what users do)
  and Datadog (what services do), not Linear or Jira. The factory's input is
  "the data says something changed", and the same data judges the result:
  the telemetry-driven self-building loop. InDusk's session manager,
  worktrees and screenshot tooling are the starting point for the middle.
  Build order protects the edge: the telemetry loop first, the middle in
  its simplest form, then thicken it.

- **A project has a backlog: nothing to remember** (Sandy, 2026-10-23: "some
  way for you to say, okay, this is what I need to accomplish, and I know
  it's all here and I don't feel like I have to worry about forgetting
  anything"). Beside its tasks, a project keeps a backlog: one line per thing
  it has to cover. Items come from the person, the agent (from a
  conversation), an idea (adding an idea to a project takes it out of the
  inbox), the planner (what it noticed but left out of a task) and the
  builders (a `Later:` list at the end of a phase's summary, kept once the
  phase lands). Every item ends one of two ways: **covered** by a task (a new
  one made from it, or one the project already has) or **dropped with a
  reason**. Nothing disappears silently, and **a project lands only when
  nothing in its backlog is open**: the engine holds the landing and the
  front door says what is left. The pull request lists what was left out on
  purpose, with why.

- **To-dos: the work around the code** (Sandy, 2026-10-26). Getting approved
  by Apple, calling Naya and getting her set up, confirming PostHog matches
  her anonymously: not strategy, not dev tasks, but what decides whether the
  work counts. A to-do belongs to the **app**, beside its projects, never
  inside one (a project exists to produce code: a branch, a PR, phases; a
  to-do has none of that). It is owned by the person or the agent, can point
  at what it unblocks (a project, a strategy's evidence), and has a
  **checklist** (one level; Sandy: "we could just call it a checklist"),
  which the agent drafts and the person edits. A checklist item can be marked
  as waiting on someone else (Apple's review). Done when the checklist is,
  or ticked by hand. Open to-dos show on Now under "needs you"; their page
  sits under Plan beside Projects and Tasks. A backlog item can also end as a
  to-do. "Task" stays the dev unit. Grouping to-dos into goals waits until
  there is a real need. Built 2026-10-26 (PR #45); the agent drafts a
  checklist on request, looking up how the thing is done today.

- **Summary: a page the agent writes** (Sandy, 2026-10-27: "like a dashboard
  but one that is regularly built by AI"). Sections: what we are focused on,
  state of the app, observability highlights, learnings, open questions (each
  with where, when and why it was asked). First built: **focus**, "if I walked
  in on Monday morning and asked everyone what they are working on, and to
  remind me of near, mid and long term goals". Who is on what (you, the
  builders, the planner, the agent's to-dos, each teammate), then goals this
  week, next few weeks, long term. Goals are inferred from the work for now;
  nobody states them yet. Every line cites the rows it came from and links
  them. Rewritten daily when something has moved, or on asking. Sits above My
  Stuff.

- **Shaped like Linear: connect it or run it ourselves** (Sandy, 2026-10-27:
  "we build ours to match Linear and then we can slip it in. We can connect
  it or we can manage it ourselves"). On a team the plan lives in the
  tracker everyone already uses; solo, Self Evident keeps it. So our plan
  takes Linear's names and shapes, and the store behind it is either our
  database or a connected Linear workspace (its official SDK and MCP
  server), per app. What Linear has no place for stays ours either way and
  links to its records: the engine's execution (worktrees, file claims,
  landing, cost), Observe and Learn (metrics, promises, hypotheses,
  evidence), Validate (mockups), and decision records.

  | Ours today | Linear |
  |---|---|
  | App | Team (its own statuses, cycles, triage) |
  | Goals (inferred on the Summary) | Initiative |
  | Near-term goals | Cycle |
  | Idea in the inbox | Triage issue; its hypothesis and evidence stay ours |
  | Project | Project (milestones, documents, updates) |
  | Task | Issue: one branch, one PR, linked by Linear's GitHub integration |
  | Phase | Sub-issue, delegated to the builder agent |
  | Run | Agent session; its messages and tool calls are activities |
  | Step | The agent session's plan (a checklist) |
  | Planner or builder question | An elicitation on the agent session |
  | Phase dependency | Blocked-by relation |
  | Backlog item | Issue in Backlog; dropped is Canceled with a comment |
  | To-do and checklist | Issue (no branch) with sub-issues; the agent's are delegated to it |
  | Summary, what we're focused on | Project and initiative updates, with health |
  | My Stuff | My Issues and Inbox |

  Statuses keep our meanings under Linear's categories (triage, backlog,
  unstarted, started, completed, canceled). Open: whether phases are worth
  showing as sub-issues on a busy team, or stay inside the engine there.
  Step 1 built 2026-10-27: our own store has this shape (a fresh database,
  the old one copied over); the engine's execution of a sub-issue is its
  `build`, kept beside the issue.

## Open questions

- **A strategy section in Ideate** (Sandy, 2026-10-26): a longer-term bet,
  the assumptions it rests on, and how to get the evidence for each (talk to
  25 customers, with scripts the agent writes; experiments; baselines).
  Proposed: a strategy's evidence work is to-dos and projects linked to its
  assumptions; results flow into Learn. Not yet decided.
- **Modes: same feel, different gates** (Sandy, 2026-10-26): Homework Gate
  shows the full loop is too much before there is a wedge. A "wedge hunter"
  mode skips Observe and Learn and builds in any order, while laying the
  groundwork from day one (OpenTelemetry and PostHog everywhere, flags on
  features); skipped rigor is flagged, not enforced. A stricter mode makes
  hypotheses and baselines required. Proposed: the mode is per app, wedge by
  default. Open: whether one project can opt into the strict mode inside a
  wedge app.

- Comps: who already does each part (`research/comps-*.md`).
- The best route from idea to funding, and what evidence each idea should
  produce to be fundable (`research/idea-to-funding-method.md`).
- What to salvage from InDusk (`research/salvage-from-indusk.md`).
- The first real web app to build it against.
