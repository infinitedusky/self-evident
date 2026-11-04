# Comparable: tkt and rogs-skills (Roger Gonzalez)

Read 2026-11-04 from the GitHub mirrors `rogsme/tkt` (221 commits since 2026-10-19) and `rogsme/skills` (146 commits
since 2026-10-12); the canonical home, git.rogs.me, sits behind a Cloudflare challenge. Both MIT. Read from the docs,
the contract and the code; not run. Sandy: "I love how simple it is and I would love to even think about taking it and
rebuilding Self Evident on top of it, with more of the approach it takes of tickets."

## What it is

Two repositories that split one job in two:

- **rogs-skills** does the thinking. Nine lifecycle skills in the Agent Skills format, each one stage of a ticket:
  `create-ticket`, `suggest-tickets`, `start-ticket` (plan), `work-ticket` (build, PR), `review-pr` (fresh session),
  `address-pr-review`, `verify-pr` (runs the human verification steps, posts evidence), `finish-ticket` (merges), and
  `setup-rogs`, which writes the per-repository configuration. Each skill ends with a status line
  (`Status: READY_FOR_REVIEW`, `Verdict: READY_FOR_HUMAN`) and never starts the next one. Plus ~20 engineering and
  writing skills (tdd, commit, create-pr, review-plan, present-plan, retro, grilling…), many adapted from Matt Pocock's.
- **tkt** does the mechanics between stages: a Go CLI (~24k lines, 177 black-box test scripts) that, per ticket, makes
  a worktree (worktrunk), opens a tab (herdr), starts Claude Code or OpenCode there, types the stage line, and reads the
  status lines, the PR, CI and the review bot to find each ticket's next step. `tkt auto` drives one ticket between
  the three human decisions (plan, verification, merge); `tkt watch` keeps every ticket moving (syncs a moved base,
  fixes failing checks once per head, carries out merge orders, runs scheduled chores). `tkt agent` is a chat in the
  terminal (pi, embedded) with a board pinned on top, mirrored to a web page; every button sends the slash command,
  which runs a tkt command with `--json`. The chat cannot read code or run a shell; the ticket's own agent does.

The surface is simple: a ticket id, a handful of commands, one board, three decisions. The machinery is not small.

## Where it is strong

1. **Thinking and mechanics are separate, with a written contract.** Prose skills (portable, user-installable,
   harness-agnostic) decide; Go moves. The seam is a list of lines tkt reads (status lines, `Verdict:`,
   `Reviewed head:`, the markers in `docs/agents/*.md`), pinned by verbatim fixtures in `internal/contract`. A change
   to the skills updates the fixture and the code in one commit that cites the skills commit. Nothing drifts quietly.
2. **No database.** State is derived every time: the tracker holds the ticket's state (skills write it; tkt never
   does), the forge holds PR, CI and review state (read through `gh`), the agent's transcript holds the status lines,
   herdr says whether the agent is working, blocked or idle, and a sorted `key=value` file in the worktree's git
   directory holds preset, session, tab and pane, so it disappears with the worktree. `NextStep(Facts)` is one pure
   rule list that `tkt ls`, `tkt auto` and `tkt watch` all read. One `history.jsonl` outlives worktrees, for
   `tkt stats` (cycle time, time waiting on you) and `tkt history`.
3. **Rigor is a short list of checkable rules.** The implementer never reviews its own change (every review is a
   fresh session). Every claim names the exact head SHA, and that head contains the current base; a new push needs a
   new review. Only `finish-ticket` merges, only on the person's word (or in a yolo run they started). Branches take
   the base by merging; nothing rebases or force-pushes. One merge at a time per repository. A verification
   confirmation carries over clean merges of the base only, proven by `git merge-tree` tree equality. Human
   verification is a numbered procedure with setup, exact actions, expected results, a negative check and cleanup;
   `verify-pr` runs it and posts evidence, and the person still confirms.
4. **Modes.** Per ticket: manual, auto (default: you approve the plan, confirm the steps, say merge), auto-plan
   (a runner approves the plan), yolo (nobody watches; another vendor reviews the plan; merges once verify-pr passed
   every step; refuses unless the repository turns on Plan review, Agent verification and Autonomous runs, and lists
   hard stops such as migrations and payments). Per repository: a feature table in `docs/agents/workflow.md`
   (Bundles, Browser pass, Model routing, Plan review, Plan presentation, Taste pass, Changelog, Agent verification,
   Autonomous runs, CI review). This is our open question "Modes: same feel, different gates", built.
5. **Tracker-agnostic by prose.** `setup-rogs` writes `docs/agents/issue-tracker.md`: the tracker's kind and
   connection, states mapped to roles (new, in-progress, in-review, done, blocked), and an H3 per operation
   (`resolve`, `load`, `search`, `list-ready`, `create`, `update`, `relate`, `comment`, `transition`, `attach`), each
   ending in `Capability: Supported | Fallback: … | Unsupported`, with gap rules for what the skills do without one.
   Built-in guides for Linear, Kaneo, GitHub Issues and local markdown files (`.scratch/tickets/ACM-12-slug.md` with
   `Status:`, `Priority:`, `Blocked by:` lines and `## Comments`). Same for the forge (GitHub, Gitea, GitLab) and CI.
6. **Multi-vendor by stage.** Presets name a harness and model; `[fixes] as` runs small fixes on a cheap model,
   `[verify] as` and plan review on another vendor, so the checker does not share the builder's blind spots.
7. **Programs are first-class callers.** `--json` on everything, `tkt schema`, stable error codes with exit statuses
   and a `hint`, `tkt wait ID` instead of polling, `tkt ls --json` rows carrying the next step as argv.
8. **Operational sense.** Status pages hold agent starts during a GitHub or provider incident; `tkt doctor`;
   `tkt drop` for a ticket started by mistake; chores (scheduled agent runs, e.g. a weekly dependency upgrade);
   fakes of every outside tool for the black-box tests; the same plain house style as ours (short sentences, present
   tense, no em dashes, Acme examples).

## Where it is thin, or absent

- **Everything before a ticket.** No ideas, no evidence, no telemetry, no observe or learn, no research, no mockups,
  no prototypes, no demo. A ticket arrives from a person or from `create-ticket`'s audit of the code; the work starts
  at a plan. Our thesis ("make an idea earn its build", prototype before plan) has no counterpart.
- **One noun.** Ticket, plus chore. No projects, initiatives, cycles, backlog or to-dos. Dependencies are
  `blocked-by` relations in the tracker and `suggest-tickets`' judgement about which in-flight branches touch the
  same files. No sub-task graph, no file claims, no scheduler: collisions are avoided by suggestion and repaired by
  sync and review afterwards. Parallelism is between tickets, capped by `[auto] max_parallel`.
- **One person, one machine.** It lives in a herdr pane, needs worktrunk, `gh`, a desktop display for browsers,
  and systemd or launchd to stay on. The web page is a LAN page with a token. Not a server, not multi-user, not
  multi-app in one place (each repository runs its own watch). tkt's own forge reads are GitHub-only.
- **A thin record.** `history.jsonl` holds events; the conversations live in the harness's session files; the chat
  "says what the history cannot show, such as the agents' conversations and CI logs". No observability beyond a log
  file.
- **No tracker of its own.** It depends on one existing (or on markdown files), and reads it only through the skills.
- **The UI is the board.** Good for what it is; there is no design system, no stories, no pages beyond the ticket's
  six tabs.

## Side by side

| | tkt + rogs-skills | Self Evident |
|---|---|---|
| Scope | ticket → merged PR | idea → evidence → brief → build → check |
| Unit of work | ticket (≈ our task), chore | initiative › project › task › sub-task › step; idea; to-do; cycle |
| State | derived from tracker, forge, transcript, herdr; a key=value file per worktree | Postgres, one engine as single writer, event stream |
| Thinking | prose skills, Agent Skills format, any harness | planner and tool prompts in the engine; Agent SDK, Claude only |
| Contract between prose and code | status lines, pinned by fixtures | tool calls and events (no status-line contract) |
| Parallelism | tickets at once; collisions by suggestion, sync, review | sub-tasks at once by a file-claim and dependency scheduler; tasks in order; projects at once |
| Review | fresh session, verdict at exact head, rounds capped, accept-review, another vendor possible | none of our own; GitHub's review decision is read |
| Verification | numbered human procedure; verify-pr runs it and posts evidence; person confirms | test command per app; brief audit and blast radius as steps; no procedure |
| Merge | only finish-ticket, on the person's word; gates at exact head; merge orders; one at a time | engine lands sub-tasks on the project branch; the person merges the PR |
| Modes | manual / auto / auto-plan / yolo per ticket; feature table per repository | workflows (steps on, required, ordered); auto-approve risk levels; not yet "stage decides rigor" |
| Tracker | any, through prose operations with capability lines; local markdown fallback | we are one (Linear-shaped); Linear connection planned |
| Prototype | none | first, in its own worktree, then analysed into the plan |
| Before the build | nothing | observe (PostHog), learn, ideas, research, mockups (Storybook), prototypes |
| Interface | terminal chat + mirrored web page; every button is a command | web workspace (tabs, agent column, following tab); CLI; MCP |
| Footprint | one binary + skills; needs herdr, worktrunk, gh, a desktop | Postgres, Docker, Node; a browser |
| Deployable as a service | no | yes by design |
| Tests | 177 black-box scripts against fakes; contract fixtures | 136 engine, 284 app; stories first |
| Size | ~24k Go, ~10k TS | ~7k engine, ~5k app |

## Should Self Evident be rebuilt on tkt?

No. They cover different halves, and the half tkt covers is bolted to a stack we chose against: a single machine, a
terminal multiplexer, no database, no server, no tracker of its own. Rebuilding on it would mean adopting herdr,
worktrunk and the pane, and giving up Postgres, the event stream, multi-app, the workspace UI and the stories, to
gain a build pipeline that still starts at a ticket. Everything before the ticket, which is the product, would be
ours to write again on top.

What tkt proves is that the build half can be rigorous and still feel light, because the person decides three
things and reads one board. That is the "build: automated and rigorous" half of "Explore fast, build rigorous"
(SHAPE.md), done well, in the open, in the format our agents already load.

## What to take

In order of value for cost:

1. **The review half, as rules or as the skills themselves.** We have no independent review, no verification
   procedure and no merge gates. The cheapest route is to run the rogs lifecycle skills on our project PRs:
   `work-ticket`'s PR body with a human verification section, `review-pr` in a fresh session on another model,
   `address-pr-review` with its two-round cap, `verify-pr`'s evidence, `finish-ticket`'s gates at the exact head. Our
   approved brief is their approved plan; our project PR is their PR. Their `setup-rogs` writes a `docs/agents/`
   folder per repository; our engine could write it from the app's settings instead of asking. The rules are worth
   adopting even if the skills are not: exact-head claims, fresh-session review, merge-not-rebase, one merge at a
   time, confirmations carry over clean merges only.
2. **Modes.** manual / auto / auto-plan / yolo per thing, and a feature table per app with hard stops, is the answer
   to "Modes: same feel, different gates" and to "the stage decides rigor" in one stroke. Explore is auto-plan with
   nothing gated; build is auto or manual with the review half on; yolo is for a repository where a wrong merge
   costs little, which Homework Gate is today.
3. **Status lines as the contract, and one command behind every button.** Our CLI, UI and MCP can drift; tkt's
   cannot, because every button sends the slash command and the page shows what it sent. A short list of lines the
   engine reads from an agent's output, pinned by fixtures, would make our build stages portable to other harnesses.
4. **The tracker contract for our integrations.** Prose operations with `Capability:` lines and gap rules are a
   cheap way to be tracker- and forge-agnostic. Our "shape of an integration" could borrow the form. Conversely, Self
   Evident can satisfy that contract: our MCP tools already cover `resolve`, `load`, `list`, `create`, `update`,
   `transition`; we lack `search`, `comment`, `relate` and `attach`. Add those and the rogs skills can treat Self
   Evident as their tracker, which is the real integration: Self Evident upstream of the ticket, tkt and the skills
   downstream, both MIT.
5. **Small things:** `tkt drop`, `tkt doctor`, `tkt stats` (time waiting on you), the status-page hold during
   incidents (we have `outage.ts` for the model; not for GitHub), `tkt wait` for scripts, chores.

## What to keep that tkt lacks

The scheduler (file claims and dependencies over sub-tasks), the prototype before the plan, the backlog and to-dos,
multi-app in one engine, the event stream and the UI it feeds, the stories, and the whole observe-and-learn front:
all of it is absent from tkt, and the parallelism we have is more principled than "suggest tickets that look
disjoint". Sandy's worry about tasks at once (2026-11-01) also reads differently here: tkt's unit of parallelism is
the ticket, which is our task; we run tasks in order inside a project and projects at once, so a project per
independent task already gives tkt's model.

## Open

- Talk to Roger: Self Evident as a tracker for the rogs skills (the `issue-tracker.md` operations over our MCP), and
  tkt as a runner for our build half. Which side owns the worktree and the agent session is the real question; today
  both do.
- Whether to run the lifecycle skills from our executor (Agent SDK, our worktrees) or to call `tkt` as a program
  (`--json`, `wait`, `schema`), which would bring herdr and worktrunk with it.
- The ticket body (`## Problem`, `## Soft scope`, `## Acceptance criteria`, `## Dependencies`) against our brief:
  ours is Markdown for the builder; theirs is a soft plan the planner reads. Probably the same thing.

## Sources

- https://github.com/rogsme/tkt (mirror of https://git.rogs.me/rogs/tkt): README, AGENTS.md, docs/lifecycle.md,
  docs/day-in-the-life.md, internal/app/next.go, internal/state/state.go, at 99b3b3c (2026-11-04).
- https://github.com/rogsme/skills (mirror of https://git.rogs.me/rogs/skills): README, skills/lifecycle/README.md,
  setup-rogs/references/contract.md, setup-rogs/assets/workflow.md and tracker-local.md,
  create-ticket/references/ticket-body.md, at d3e73ca (2026-11-04).
