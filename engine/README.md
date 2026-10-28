# Self Evident engine

The core is shaped like Linear (since 2026-10-27), so a connected Linear workspace can hold the plan later:
**initiative → project → issue → sub-issue → step.** An initiative is a goal, served by projects. A project is issues
in order, one branch and one PR (or one PR per issue, stacked). An issue is the one unit of work, named by the app's
key and a number (HG-12): **code**, planned into sub-issues and built, or a **to-do**, work outside the code with its
checklist as sub-issues. A code sub-issue is the atomic unit the engine builds: one agent, one worktree, one commit,
declaring its files and what it depends on (blocks relations); its **build** holds the engine's status, attempts and
worktree. The planner writes sub-issues from an issue's brief (a person may write them too). Steps are the builder's
own todo list while it builds, captured live. A **cycle** is a stretch of time with the issues meant for it.

The engine builds every sub-issue whose dependencies are done, in parallel across all running projects; issue order
is an implicit dependency; sub-issues that share a file take turns. Issue states are Linear's (Backlog, Todo, In
progress, In review, Done, Canceled, Duplicate); a code issue's state follows its sub-issues, and its PR merging makes
it Done. An issue in a project's Backlog is something the project must cover before it lands.

Founding rule (SHAPE.md): **git holds code, Postgres holds state, this server is the single writer.** The CLI, the
UI and Claude Code over MCP are clients; agents report events, they never write status.

## Run it

From the repo root, one command:

```bash
pnpm install
pnpm dev        # Postgres 17 (docker compose, localhost:5433) + the engine on :4000 + the UI with live reload on http://localhost:5180
pnpm start      # or: the engine alone on http://localhost:4000, serving the built UI (`pnpm build` first)
```

The database is `selfevident`; the engine creates it if missing and runs migrations when it boots. The API is under
`/api` (`GET /api` lists the routes); the UI is served at `/`. The database from before the Linear shape,
`ideafactory`, is kept as it was; `pnpm --dir engine exec tsx src/db/copy-legacy.ts` copied it over (ids kept, issues
numbered per app in the order they were made; `--replace` to copy again into an emptied target).

## From Claude Code (VS Code or the terminal)

The engine is also an MCP server, one per app, with the same tools as the agent in the web UI: what needs you
(`now`), projects and issues, plan an issue, start, pause, retry, to-dos and their checklists, the backlog,
initiatives and cycles. In a checkout of the app's repo:

```bash
pnpm --dir <self-evident>/engine se connect .      # prints the one command to run, e.g.
claude mcp add --scope local --transport http self-evident http://localhost:4000/api/mcp/app_…
```

Local scope keeps it to you and that repo; nothing is written into the repo. Then ask Claude Code "what needs me?".

In here, `pnpm serve` runs just the engine and `pnpm se …` is the CLI (against `ENGINE_URL`, default `http://localhost:4000/api`):

```bash
pnpm se workspace "My workspace"                 # → {"id":"ws_…"}
pnpm se app "Homework Gate" -w ws_…               # → {"id":"app_…", "key":"HG"}
pnpm se project create -a app_… -n "The gate" -f examples/demo-plan.json   # issues in order, each with sub-issues
pnpm se project tick proj_… -r 2                  # one dispatch pass with 2 free slots (drafts)
pnpm se project graph proj_…                      # issues, sub-issues, edges, why each held one waits, steps
pnpm se issue build iss_… done                    # drive a draft by hand, or:
pnpm se watch -p proj_…                           # replay the project's events, then follow live
pnpm se issue plan iss_…                          # the planner: brief → sub-issues, decisions, questions (minutes; read-only on the repo)
pnpm se issue sub-issues iss_… -f subs.json       # or write an issue's sub-issues by hand
pnpm se question answer q_… "Yes"                 # answer one of the planner's questions
```

A project file is `[{title, brief?, subIssues?: [{key, title, brief?, dependsOn?, files?}]}]`: issues in order.

To run a project for real, the app needs a repo with a local main checkout and a test command:

```bash
pnpm se app "Homework Gate" -w ws_… --test-cmd "/abs/path/to/.venv/bin/python -m pytest -q poc" --max-budget-usd 10
pnpm se repo infinitedusky/homework-gate -a app_… -p /abs/path/to/homework-gate
pnpm se project create -a app_… -n "Health endpoint" -f examples/homework-gate-health.json
pnpm se project start proj_…                      # integration branch, worktree per sub-issue, agent run, landing, PR
```

Each sub-issue gets `<repo>-worktrees/<project>--<identifier>` on branch `sub/<project>/<identifier>`, cut from
`project/<id>` (itself cut from the default branch), or from the issue's own branch `project/<id>--hg-12` when PRs are
per issue. A sub-issue of a later issue starts only after every sub-issue of the earlier issues has landed. The agent
works there with tools confined to the worktree (no branch changes, pushes or PRs), commits, and summarises. Landing
is serialized per project: merge the integration branch in → run the test command on the merged commit →
fast-forward the branch by compare-and-swap. A failed run or landing re-queues the build with the reason, up to three
attempts. The first landing pushes the branch and opens the PR via `gh`; later landings update it. When everything
has landed, the worktrees and local build branches are removed; the integration branch stays, it is the PR.
Development runs on the operator's Claude Code login; a product deployment sets `ANTHROPIC_API_KEY`.

Up to `SESSIONS_MAX` (default 4) builds run at once **across all running projects**: one dispatch pass covers every
running project, file claims are checked across projects within an app (a sub-issue with no claims claims the whole
app, never another app), and `GET /apps/:id/graph` is the top-level graph. On startup the server recovers: runs left
`working` are marked `interrupted`, their builds re-queued (the next run resumes the agent's session in the same
worktree), stray `claude` processes inside our worktree roots are stopped, and running projects are dispatched again.
On SIGTERM, live runs are aborted so the agents stop.

`GET /events?since=<seq>&project=…&issue=…` is the live feed (SSE): replay from a sequence number, then every
committed event as it happens, via Postgres `LISTEN/NOTIFY`. Several clients can watch one run.

## What's here

| File | Role |
| --- | --- |
| `src/db/schema.ts` | The tables, tagged `[LS]` Lightsprint-derived, `[ID]` InDusk, `[IF]` ours; Linear's states and their types. Prefixed IDs (`iss_…`; rows copied from before keep `task_…`, `ph_…`, `todo_…`, `bl_…`). |
| `drizzle/` | Migrations, generated with `pnpm db:generate` after a schema change (history starts again at the Linear shape). |
| `src/issues.ts` | Issues: numbering per app, create, update, move into a project, order among siblings, states (`setState`, canceling cascades to unbuilt sub-issues), a code issue's state rolling up from its sub-issues. |
| `src/projects.ts` | Projects: create with issues, sub-issues and builds in one transaction, add sub-issues to an issue, graphs (project and app), `tickAll` (one dispatch pass across running projects, issue order as implied edges), `setBuild`, the Issues list, one issue in full. |
| `src/backlog.ts` | A project's backlog: issues in Backlog; take on, mark a duplicate, drop with a reason, reopen; a builder's `Later:` lines. |
| `src/todos.ts` | To-dos: issues of kind `todo`, their checklist as sub-issues; done when every line is; the agent drafts a checklist. |
| `src/goals.ts` | Initiatives (goals, with their projects) and cycles (a stretch of time, with its issues). |
| `src/scheduler.ts` | Pure: given the builds and free slots, what to start and why everything else is held. One pick at a time, so two freed together never claim the same file. |
| `src/planner.ts` | The planner: one read-only Agent SDK run on the repo with the issue's brief, ending in one structured proposal (`outputFormat: json_schema`) → sub-issues (brief composed from summary, steps, checks, done-when; files; depends-on), provisional decisions with rejected alternatives, open questions. The server sets each question's cost. |
| `src/events.ts` | Append an event in the same transaction as the state change; `NOTIFY` carries only the seq; readers fetch rows by seq. |
| `src/server.ts` | Hono; `GET /api` lists the routes. |
| `src/tools.ts`, `src/mcp.ts`, `src/talk.ts` | The engine as tools: for the agent in the web UI, and for Claude Code over MCP. |
| `src/git.ts` | Worktrees, branches, merge, fast-forward by `update-ref` compare-and-swap, push. |
| `src/executor.ts` | One Agent SDK run on one sub-issue; messages → events (trimmed); the builder's todo list → steps; tools confined to the worktree. |
| `src/landing.ts` | Merge → test → fast-forward, serialized per project; refuses conflicts and failing tests. |
| `src/pr.ts`, `src/branches.ts` | The project's PR (or one per issue, stacked) via `gh`; where an issue's work lands. |
| `src/github.ts` | The sync: our PRs (merged issues become Done), teammates' PRs, main into open project branches. |
| `src/runner.ts` | Start a project, dispatch ready builds under the cap across projects, launch, land, retry, keep the PR current, clean up, recover. |
| `src/skills.ts` | Plugins and skills: Claude Code plugins installed by the SDK's own `claude plugin install` into `PLUGINS_HOME` (default `~/.self-evident/claude`, never `~/.claude`), plus `engine/plugin/` built in; each switched under All apps and per app, given to the talk agent and the planner as set, its skills filed by job; REA's MCP server supplied while its package leaves it out; REA's tools rated from its own catalogue. The app repo's `.claude/skills/` is the other layer. |
| `src/catalogue.ts` | The jobs a skill can cover (`research/skills.md`'s categories), grouped by where they sit in the loop, with what the engine itself does there. |
| `src/integrations.ts` | The integrations (PostHog, Datadog): their fields, set under All apps (`workspace.settings`) and overridden per app field by field (`app.setup.integrations`). Never keys: a field names the `.env` variable. |
| `src/summary.ts` | The Summary page's focus section, written by a model from the facts, stated goals first. |
| `src/db/copy-legacy.ts` | One-off: the database from before the Linear shape into this one. |
| `src/cli/if.ts` | The `se` CLI. A client; only `migrate` touches the database. |

`pnpm test` runs the scheduler and landing tests anywhere (landing uses a throwaway git repo) and, when Postgres
is up, the project, issue, planner and runner tests (a fake proposer; a fake executor on a throwaway repo: the cap,
dependents after parents, two projects at once, retries with the reason, recovery, cleanup) against **their own
database**, `selfevident_test`, which the global setup creates and migrates (`DATABASE_URL_TEST` to override). The
server's database is never touched.

## Planning

`POST /issues/:id/plan` (or `pnpm se issue plan`) runs the planner on a code issue in a project that has nothing
planned yet. It reads the repo at the app's local checkout (nothing is written), gets the issue's brief, the
project's name and why, the earlier issues (already implied dependencies), and the test command; it returns one
object the SDK validates against `PROPOSAL_SCHEMA`, after one self-review pass in the same run. What it settled is a
`decision` (provisional until a person approves) with the rejected alternatives; what it could not settle is a
`question` with options, a recommendation and what each option changes; the sub-issues go in through `addSubIssues`
like hand-written ones. Progress is on the event stream (`issue.planning`, the run's messages, `question.asked`,
`issue.planned` or `issue.plan_failed`); the run row of kind `plan` carries cost and the session id.

## Next

A plan-store boundary (the planner, runner, Summary and tools read and write the plan through it), then Linear as a
second store per app: `@linear/sdk`, its webhooks, and its agent sessions for builds.
