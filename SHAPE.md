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
4. **The ticket** (2026-11-04; replaces "Ideas, tasks, projects" of
   2026-10-29). One noun from the first sentence to the merge: a ticket, which
   we call a task. It is born fuzzy, in Triage, with a title and whatever is
   known: why, a soft scope, acceptance criteria, what it waits on. Then it is
   reviewed and edited on itself for as long as that takes: research, mockups,
   a prototype, and the agent's proposals to sharpen its criteria, split it
   into thinner tickets or relate it to others, each accepted or not. Approving
   its brief is the hinge: from there it is work, planned and built. A project
   holds tickets in order and has no brief of its own. Nothing is converted;
   the record you started with is the record that ships. Workflows can still
   require steps or an order, the way Jira's do. (Roger Gonzalez's tkt and
   rogs-skills showed this shape; `research/comps-tkt.md`.)
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

- **Task, not issue** (Sandy, 2026-10-29): we say task and sub-task; connecting Linear maps them to its issues and
  sub-issues. Code and the database keep "issue".
- **One noun: the ticket, from fuzzy to merged** (Sandy, 2026-11-04, after watching Roger Gonzalez use tkt: "a
  ticket is the unit of work that everything starts with … it gets reviewed and approved, and then eventually it
  gets worked on. Whereas for us … by the time we get a ticket, it's complete."). Ideas fold into tasks: a task
  starts in Triage with a title, is reviewed and refined on itself, and approving its brief is the hinge. The idea
  table's hypothesis, baseline, measures and evidence stay as the ticket's own sections. Replaces "an idea is
  exploration; a task means we're going to build this" (2026-10-29). Also decided then: the rigorous build half
  (independent review, verification with evidence, merge gates at the exact head) runs Roger's MIT lifecycle
  skills from our executor rather than stages of our own; and the plan for all of it is tickets in Self Evident,
  project "Tickets first" (LOG.md, "Tickets first").
- **tkt is the runner; Self Evident is the tracker and the window** (Sandy, 2026-11-07, after the spike: one
  ticket from `new` to merged in 19 minutes on this Mac, every stage a rogs skill; LOG.md, "tkt is the runner").
  Self Evident is where a ticket is born, reviewed and watched; once its brief is approved, tkt builds it: a
  worktree, a herdr tab, start-ticket → work-ticket → review-pr in a fresh session → the person's verification →
  finish-ticket, on whichever harness and model the preset says (Claude Code, or OpenCode for DeepSeek, GPT and the
  rest). The skills read and write the ticket through our API: comments one per heading (the plan, the handoff,
  the review, the completion), search, lookup by identifier, state. tkt is a hard dependency we do not babysit:
  when it fails, we show its own error and say run `tkt doctor`. The graph (scheduler, sub-tasks, file claims)
  stays in the code, parked: it is for an unattended loop we are not running. Replaces "runs Roger's MIT lifecycle
  skills from our executor" above.
- **tkt is switched on per app, as an integration** (Sandy, 2026-11-08: "there are two things that we're talking
  about at the same time … we don't need to configure tkt to make sure it works if we use it … that is very
  different than saying for any specific project we can choose to use tkt or not, and for that we do need an
  integration"). Two decisions, kept apart. Not babysitting: Self Evident never installs, configures or repairs
  tkt; its check repeats tkt's own words and says get tkt working, and the fixing happens in the terminal.
  Choosing: under an app's Integrations, tkt is a runner switched on or off (an integration, not a plugin: plugins
  here are Claude Code plugins for the factory's own agents). On, tkt builds the app's tickets and Self Evident
  hands none to its own planner; the ticket page says "run by tkt"; tkt's lifecycle (start, approve, review,
  merge) is listed where Linear's actions are, to become buttons on the ticket page. Self Evident's one piece of
  the handshake is the tracker guide, the repo's `docs/agents/issue-tracker.md` filled with the app's id, key and
  URLs, on the app's tkt page and at `GET /api/apps/:id/tracker-guide`.
- **The loop's stages** (Sandy, 2026-10-29): Observe · Learn · Ideate (ideas and their research) · Plan
  (tasks: research, brief, mockup, prototype, in any order unless a workflow sets one) · Build (including the
  checks a build is held to). The rail lists only these stages; projects, tasks and the steps are inside them.
- **A prototype before the plan, then a build from scratch** (Sandy, 2026-10-29). Planning starts by building the
  actual thing quickly in its own worktree: shortcuts by default, made to demo and to change in moments, and able to
  do any kind of work, schema included. It runs on the app's real database engine, rebuilt from labelled JSON
  scenarios, with off-the-shelf stand-ins for outside services. When it's ready, everything about it is analysed
  into the plan, the migrations and the checks. Then the real build starts from main and is written properly; none
  of the prototype's code is kept. Details: LOG.md, "The prototype".
  The prototype's agent runs on Sonnet, for speed (Sandy, 2026-11-10: "the prototype agent should be sonnet and it
  should build fast"); an app can name another model with `prototype_model` in its set-up.
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
  | Ticket in Triage (until 2026-11-04: an idea in the inbox) | Triage issue; its hypothesis and evidence stay ours |
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

- **Integrations: free, official, ours** (Sandy, 2026-10-29: "I want to give this away. I don't want to be
  incurring a bunch of fees for it"). No paid middleman like Composio (Lightsprint's connector catalog), and no
  workflow engine like n8n underneath: each integration talks to the service's official API or SDK
  (`@linear/sdk`, Confluence's REST API), and keys stay in the engine's environment, named but never stored. We
  revisit a hosted connector service only if the list of integrations grows past what we can keep up.
- **The shape of an integration** (Sandy, 2026-10-29):
  - **Integration:** what it is and does, its fields (site, team, space; set for all apps and overridden per app),
    the variable holding its key, and a check that says whether it's connected.
  - **Actions:** what it can do for a workflow, e.g. Confluence "publish a page", Linear "create an issue",
    "comment", "move the issue". Each takes content from an earlier step and gives back a link and an id, and
    running it again updates the same record rather than making a second.
  - **Integration steps:** a workflow can put an action between its steps ("after the ADR, publish it to
    Confluence"). It shows in the task's nav like any step, unlocks when the steps before it are done, asks before
    it sends anything out, and keeps the link it made. This is also the first way into Linear: the full connection
    (Linear as the plan store, above) comes later and builds on the same connection.

- **PostHog finds, Self Evident builds** (Sandy, 2026-10-31: "Can we more tightly integrate what PostHog is doing
  into Self Evident?"). PostHog's self-driving loop (scouts → reports → PRs → a check after ship) is the closest
  mature version of our Observe, Learn and Check. Its inbox can be read and changed from outside its app (MCP tools
  and the API behind them), so we use it instead of rebuilding it: its reports arrive in Observe; one becomes an
  idea, a task, or is left to PostHog; taking it claims it there; a PR PostHog already opened can be the task's
  build; when our work lands the report is resolved; the task shows what PostHog measured after. What we add is
  the middle: research, briefs, mockups, prototypes, approval and the parallel build, on our own Claude Code.
  The project and its tasks, in order, are in Self Evident (SE-1 to SE-10).

- **The code comes with the app** (Sandy, 2026-11-09: "it should have you select the repo or point to the local
  location when you create a new project. If the location is not a repo, create one"). A new app asks where its
  code is: a GitHub repo of yours (picked from gh's list, or typed), the folder on this machine, or both. A folder
  that isn't a git repository becomes one on the app's default branch, with the files as found committed; a
  repository already on another branch gives the app that branch. The engine says what it did in a sentence, and
  what it can't fix (no such folder, a detached HEAD, git refusing) is a sentence on the page, never a 500. The
  same when the checkout is set later on the Repo page, and a conversation checks the checkout before it starts.

- **Storybook is an integration, per app** (Sandy, 2026-11-09: "it should be a storybook integration and we should
  ensure that we have story flow add on"). Its command and URL moved from the app's Settings to Integrations ›
  Storybook (role Mockups); since the same day it is a switch there, the command and URL overriding the repo's
  defaults. Its check reads the repo for the standard: Storybook 10, the screen map add-on
  (@zigbang/storybook-addon-story-flow) wired with a flow glob, its stylesheet imported, the flow files kept out of
  the story tests, a map; then whether it answers. First thing wrong is the answer. Its actions are buttons: Start,
  Open the map, Set up the screen map (the agent, in a conversation in the repo, asks before each file). The
  Prototype settings (the command and throwaway database for running the app itself) stay the app's own.

- **Set up what's missing, in one press** (Sandy, 2026-11-09: "can we add a step with tkt where it auto configures
  anything missing?"; then, when the first version handed a five-item yes/no list back: "this is still a really
  annoying process … we need a way to do it fast and consistent"). A per-app integration whose check fails gets one
  button under the check. For tkt the engine writes everything tkt and its skills read from the repo, itself: the
  tracker guide, `docs/agents/forge.md`, `workflow.md`, `domain.md`, `pull-request.md` and the Ticket lifecycle
  block in CLAUDE.md, filled from the app, the repo (remote, base branch, merge style through gh, CI workflows,
  package scripts) and the house profile below; installs tkt's hooks with tkt's own installer (the shared settings
  file, so Self Evident's agents get them too); commits on the base branch and pushes, since tkt reads the
  configuration from there; checks again. Only what cannot be computed goes to the agent, in tkt's words (tkt itself
  missing, whatever `tkt doctor` still flags). The pi warning is not one of them: pi runs tkt's own chat, which
  Self Evident stands in for. A file is rewritten only while it carries the line "Self Evident wrote it"; take the
  line out and it is the person's. This amends "tkt is the runner": Self Evident still installs nothing of tkt's by
  hand, but it writes what tkt reads, and says what it did.

- **Every integration has a default set-up** (Sandy, 2026-11-09: "for all the integrations there has to be a default
  where I can just put the integration and say set up and it'll just set it up in a default configuration. So for
  Storybook for instance, like it's asking me to choose a bunch of stuff that is part of setting up the project").
  Adding an integration to an app is a switch; its values have defaults read from the repo, and the person sets one
  only when the default is wrong. Storybook's command and URL default to the repo's `storybook` script run with the
  repo's package manager and `--no-open`, and the port the script names (else 6006). Set up what's missing then does
  the rest without a question; in a repo without Storybook it installs it to the standard (Sandy, 2026-11-09:
  "Storybook is simple, every project uses it, it should not be hard to add to a repo"): Storybook's own installer,
  docs only, in the package the UI lives in; the add-on, the stylesheet, the main and preview entries, a first map
  with the installer's example page, a README paragraph; one commit on the base branch, pushed. Switching it on is
  the set-up; the button stays as repair. The agent gets only what the installer could not do (a vitest exclude, a
  main without an addons list), with the integration's document, and finishes without asking.

- **The house profile** (2026-11-09). The one default every app's lifecycle configuration gets, apart from its own
  facts: worktrees at `../<repo>-wt/<ticket id>` beside the checkout; the glossary in `GLOSSARY.md` (or the
  `CONTEXT.md` the repo already keeps) and ADRs in `docs/adr/`; the block in CLAUDE.md (AGENTS.md when CLAUDE.md
  only points at it; CLAUDE.md created when neither exists); the verification commands from the package scripts
  (`lint && typecheck && test`), one focused check per pnpm workspace package with tests; commits that follow recent
  history; every workflow feature off to begin with (bundles, browser pass, model routing, client notes, plan review,
  plan presentation, taste pass, changelog, agent verification, autonomous runs, CI review), since Self Evident runs
  those stages itself; pull requests from `docs/agents/pull-request.md` unless the repo has its own template; the
  forge GitHub only, for now. Decided by Sandy's "set it up" to the proposal of 2026-11-09; the toggles come to the
  app's Settings when wanted.

- **An integration is a document** (Sandy, 2026-11-09: "integrations have configuration documents that just have all
  the stuff we need. And if someone needed to make a special change to it, they would do that. But that configuration
  file would then just tell the system what to do, how to incorporate it"; "it can have installation instructions").
  One document per integration says what it is, how it joins an app (a switch, or values with their defaults), what
  it needs on the machine, what it writes into the repo, how it installs, how to check, what changes in Self Evident
  when it is on, and what goes to the agent when the document cannot do a thing itself. A special change is an edit
  of the document (every app) or of the written file in one repo (that app). Storybook's is the first,
  `docs/integrations/storybook.md`, read by the engine for the agent's job and followed by its installer; the tkt
  seeds in `docs/lifecycle/` are its documents' templates. The rest of the integrations move from the code into
  documents next, and the engine becomes their reader; a check the common forms cannot express (a command's exit
  code, a file containing a line, a URL answering) stays a named check the document points at.
- **tkt reads from Self Evident; a switch lets it run on its own against Linear** (Sandy, 2026-11-10: "we want Self
  Evident to be pulling from Linear and we want TKT to be pulling from Self Evident. But I want to test TKT on its
  own"). The arrangement stays as in "tkt is the runner; Self Evident is the tracker and the window": tkt's skills read
  and write the ticket through our API. Linear, where an app uses it, is Self Evident's to talk to, not tkt's. The one
  exception is for seeing tkt by itself: tkt has a second switch per app, "Tickets live in Linear". On, Set up what's
  missing writes the tracker guide for the team Integrations › Linear names (the skills' own Linear guide, its blanks
  and States table filled from Linear), tkt's agents reach Linear through its hosted MCP server (`linear` in the
  harness, signed in by the person once), and that app's tkt has nothing to do with Self Evident after the file is
  written. It is a way to test, not the product's shape. Not built: Self Evident pulling from Linear; today it only
  pushes (an issue from an approved brief, comments, state moves).
- **One conductor per worktree; it deploys agents where needed** (Sandy, 2026-11-10: "I want there to be an agent
  per worktree as the conductor and then it will deploy agents where needed … like a fresh agent for blast radius").
  The conversation's agent is the conductor of its worktree, from the first message to the merge. It keeps whatever
  the person is part of turn by turn: the conversation, the brief, the sketches, the decisions. Sketching is the
  conductor's, with a sketch skill, not a special agent: a sketch is only as good as its grasp of what was said, and
  a handoff loses that. It deploys a fresh agent when the work can be written down and come back as a result:
  research, the blast radius, turning an agreed sketch into stories, the build, verification. Review is always a
  fresh agent, because the point is eyes that have not seen the build. What a deployed agent returns shows beside
  the conversation, and the conductor stays free to talk. This replaces tkt as the driver (LOG.md, "tkt on its own,
  tried and put down"): the lifecycle skills stay, the conductor runs them. Not built.
- **A task's agent lives on the task's page; the left agent is for what is new** (Sandy, 2026-11-10: "an agent chat
  thing within the task itself, so we know that it's its own thing and that we're not sharing across different tasks
  … static across the different steps of the brief and the build"; and of the left column: "for creating new, for
  ideas and new tasks, and looking and discussing findings"). The conductor of a task is one conversation for the
  life of the task, shown in a column of the task's page that stays put while the steps of the brief and the build
  change beside it, and folds to a strip. Under its name it lists the fresh agents it has out. The app's agent, the
  full-height column on the left, stays for starting things (an idea, a new task) and for looking at and talking
  about findings; it folds too (a button on it, the rail's S, or ⌘J). Today each step started on a task opens a new
  conversation in the left column, in a worktree of its own; that goes when this is wired. Built (2026-11-10): a
  task has one conversation, pinned to it (`subjectRef.issueId`), started once and found again (`ensureTaskTalk`); a
  step started on the task is said to that conversation; the task's page shows it in the column; the left column no
  longer lists it; the agent is told it is this task's conductor. Not built: the list of agents it has out (the
  column takes one, nothing fills it), an end to the conversation when the task is done, and the same for projects
  and ideas, whose steps still open a conversation each in the left column.
- **The check mark is the person's** (Sandy, 2026-11-10: "there should be an approve button for each step … I see
  the check mark but not sure how that is decided"). On a task, research, sketches, mockups and the prototype are
  finished only when a person approves them, with a button on the step's page; the agent marking one done makes it
  "ready for you", shown in the nav and on the page, and nothing more. Approval can be withdrawn, and a change to an
  approved step asks for it again, as with the brief. The ADR, the blast radius and the brief audit are reports: they
  are finished when they are back, and stand approved with the brief that contains them. The brief still waits on
  every required step. An idea's and a project's steps keep "done" as finished. Not built: approving the prototype
  setting off the three checks.
- **Sketches, mockups and prototypes are viewed where the work is, and detach** (Sandy, 2026-11-10: "we need a way
  to view sketches, mockups and prototypes. Each should have a way to detach the viewer, which makes it a tab in
  Chrome; it can be reattached"). One viewer for the three. On a task, the step's page shows it: the task's sketches,
  its Storybook, its prototype, from the task's own worktree. In the workspace, a Sketches, Storybook or prototype
  tab is the same viewer. Detach opens it in a browser tab of its own (`/view`), and the place it left says so and
  brings it back; Put it back in the detached tab does the same. One place at a time.

## Explore fast, build rigorous (Sandy, 2026-11-01)

> "When I use VS Code, I can just move really quickly … I just set things to dangerously skip permissions and just
> build. … Then I try and use our process and it feels super clunky. And it also feels way too information dense."
> "I should be able to move just as fast but with more information and more feedback, faster feedback within Self
> Evident than I should be able to in VS Code. But I should also be able to pass it through a super rigorous
> workflow depending on what I'm doing, who I'm doing it for."

Direction, not yet built. The work has two halves with a hinge between them.

- **Explore: fast and fun.** Ideas, mockups and prototypes. A conversation and the running thing beside it: no
  approvals, no planner, no projects. The agent works in a throwaway worktree, so it can be trusted widely (asks
  only before losing work). Self Evident beats VS Code here on feedback, not process: the prototype is live
  beside the conversation, you change it by talking, and you compare versions side by side.
- **The hinge: "this one."** You look at the prototype and pick it. The agent writes the brief from everything
  gathered: the conversation, the mockups, the prototype. In some workflows **accepting the prototype approves
  the brief**, so the hinge is one click.
- **Build: automated and rigorous.** Brief → planner → phases → PR, with little of the person in the loop. How
  rigorous depends on the workflow (who it's for, what stage the app is at; see "Modes" in the open questions).
- **Calm screens.** Each screen answers one question. In explore, the default screen is the conversation and the
  thing being made; the rest waits until asked for.

**Three steps, each with its tool as an integration** (Sandy, 2026-11-09): **sketches**, the first mockups, written
rapidly in HTML or whatever; **mockups**, the real ones, which are Storybook; **prototypes**, an actual working
branch built at hyperspeed with no concern for safety, something you could merge in form but never would. The tool
for each step is an integration whose role is the step (Storybook: Mockups; the prototype environment: Prototypes;
the sketch tool: open). After the prototype: the plan, an audit of the prototype for issues, a blast-radius risk
assessment, then the build.

**Where the brief sits, and what each step is for** (Sandy, 2026-11-09: "the simple mockup is about speed, we get
how we like it, then we do a story properly, we make sure we like it. Then that mockup is added to the brief";
"Proto comes after brief and is used to figure out the best way to build it"; "we need to add a workflow step
then"). The order is sketch, mockup, brief, prototype, plan, build. Sketches and mockups answer what it should be;
the brief carries the agreed mockup; the prototype answers how it should be built; the plan and the build do it
right. Sketches are a workflow step of their own (`sketch`, beside `mockup`): plain HTML files under `sketches/` on
the conversation's branch, one screen each. The default workflow is idea, research, sketches, mockups, the brief,
the prototype; a workflow saved before the step gets it on, right before its mockups, and its own order is left as
the person set it.

**The brief is the parent, not a step in the line** (Sandy, 2026-11-10: "the brief sits as a kind of parent document
to all the stuff we do up through blast radius. So it's not like step five … that workflow is all about getting us
to a really solid brief. Including the prototype. The brief would include references to assets that we produce
during that"). This changes the paragraph above: the brief is no longer one stop between mockups and the prototype.
It opens when the work starts and every step up to the plan feeds it: research, sketches, mockups, the prototype,
the ADR, the blast radius, the brief audit. Each step leaves its asset (a sketch file, a story, the prototype's
branch, a report) and the brief points at it. The prototype now comes before the brief is final. Once the person
approves the prototype, the ADR, the blast radius and the brief audit run by themselves, each a fresh agent the
conductor deploys (Decided, "One conductor per worktree"), and their results finalize the brief, which the person
then approves. An approved brief is what the plan and the build start from. A task so has two stages, the brief
and the build; a project is several tasks; the build is phases, decided through the briefing (Sandy, 2026-11-10:
"a task really has the brief stage and then the build stage … the build is made up of phases that are decided
through the briefing process"). Built (2026-11-10): the rule and the page. In `steps.ts` the brief is outside the
order: no step waits on it, the checks come after the other steps instead of after the brief, and the brief can be
approved only once the workflow's required steps are done. A task's nav is Brief and Build, the steps under the
brief, and the brief's page lists what it stands on. Not built: the three checks running by themselves once the
prototype is approved, the brief naming each step's assets by itself, and the phases coming out of the briefing
(today the planner cuts them after approval, as sub-tasks).

**It shows beside the conversation, from the conversation's worktree** (Sandy, 2026-11-09: the sketch "can't be
jumping back and forth to some random screen or having to give us a link somewhere. It has to be right there when
we're prompting"; and of Storybook: "we need the screens to match the worktree of the plan of the task"). Sketches
and Mockups are tabs in the workspace that show the worktree of the conversation in front. A sketch is served by
the engine from `sketches/` in that worktree, framed at phone, tablet or full width, sandboxed, and reloaded when
its file changes; the agent opens it with `open_tab`, never a link. Storybook is started in that worktree on a port
of the worktree's own (its dependencies installed first when it has none), so a story written a minute ago is
there; a branch without a Storybook, or no conversation, gets the app's from the main checkout. A Storybook runs on
its own, not as the engine's child, so a deploy no longer takes it down; a conversation ending stops its own. Still
to build: the Mockup section of the brief with a screenshot, and Sketches as an integration document.

### The agent shows where it is

At the top of each conversation, its **name and the stage it's at now** (one pill: Mockups, Prototype 2, Brief,
Build), after a dot in its colour (pulsing while it works, amber while it waits on you). Nothing else. A fork adds a fork icon whose popup says where it came from and what it's focusing on. Story
first: `Components/AgentStrip`. (Sandy, 2026-11-01, on a first version with a path, a row of steps and a live line:
"still too info dense. It should have a name and that is it"; then: "it is missing the stage or focus of the
conversation at this moment, that is the key info.")

### Asking while it works forks

> "If you ask it something when it's not done with what it's doing, it should fork … immediately fork and open up
> a new chat right next to it and say where that's going to focus on, and then start working there."

- A message sent to a busy conversation doesn't queue or interrupt: a **new conversation opens beside it**,
  carrying the history so far (the Agent SDK forks a session: resume with `forkSession`), says in one line what it
  will focus on, and starts. The first keeps going.
- The fork has its own colour, and a fork icon by its name whose popup says where it came from.
- Proposed: an answer to the busy agent's own ask (a permission, a question it put) still goes to it, not a fork;
  so does **Stop**.
- Open: where the fork works. Proposed: its own worktree, branched from the first conversation's branch as it is
  now, so the two never edit the same files under each other.

### Open

- **What happens to the prototype's code.** Today a prototype is thrown away and built again from scratch from
  what it taught. Right for a team and production; clunky alone and early, when you'd throw away code you just
  liked. Proposed: the stage decides. Early, the accepted prototype is the starting point and the build tidies it
  and adds tests; later, it's a reference and the build starts clean.

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
  Sharpened 2026-11-01 into explore vs. build ("Explore fast, build
  rigorous" above): the modes differ mostly in how rigorous the build is.

- Comps: who already does each part (`research/comps-*.md`).
- The best route from idea to funding, and what evidence each idea should
  produce to be fundable (`research/idea-to-funding-method.md`).
- What to salvage from InDusk (`research/salvage-from-indusk.md`).
- The first real web app to build it against.
