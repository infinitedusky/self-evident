# Skills: categories, what we have, and how to judge a new one

As of 2026-10-27. Started after Sandy saw the gap: we build every agent workflow ourselves while the people
around us trade skills by author (Ayal names Pocock's grill-me and wayfinder; Thomas commits a perf A/B
evidence skill to Cloaked's repo). Sources: the Lazer "current process" Slack thread
(`career-workbench/career/people/_inbox/processed/ai-process-thread-slack-2026.md`), the Cloaked channel, and
primary reads of each repo's SKILL.md files. **[private]** means it lives in someone's Slack or repo and has
to be asked for; **[unverified]** means the name could not be confirmed publicly.

## Judging a new skill

Answer these for every skill we look at, then add a row to the log at the bottom.

1. **What it does**, in one line, from its SKILL.md (not from a roundup).
2. **Category**: which one below. If none fits, it is a new category; add it.
3. **Where it keeps state**: none, the code itself, its own repo files (`.omc/`, `docs/superpowers/`…), a
   tracker, or its own runtime. Our founding rule is git holds code and authored inputs, Postgres holds state
   (SHAPE.md), so a skill that keeps its own plan or progress files can't be installed into the engine's loop.
4. **How it starts**: the model can load it, only a human typing `/name` can (`disable-model-invocation`), or a
   plugin hook. The engine's Agent SDK sessions load a repo's `.claude/skills` (`settingSources: ['project']`)
   but can't type `/name` on a person's behalf.
5. **Interactive or unattended**.
6. **Against what we have in that category**: better, worse, or better at one thing we can borrow.

The verdict is one of:

- **Adopt**, into one of two layers (LOG, "Skills in two layers"). No state of its own, model-invocable:
  - **per app**: the app repo's `.claude/skills/`, about working on that app. Every engine session loads it,
    the builder included (`settingSources: ['project']`). OpenCode reads `.claude/skills/` too.
  - **factory-wide**: `engine/plugin/skills/` (ours) or a third-party plugin wired in `engine/src/skills.ts`, like
    REA. Only the talk agent and the planner get this layer (`ROLE_PLUGINS`); the builder builds what the plan
    says. Settings shows both layers live: All apps for the plugins and who gets them, each app for its own skills.
- **Borrow**: port the idea into the engine (a planner prompt, a schema field, an event) and say so in LOG.md.
- **Comparable**: it does the engine's job; it belongs in `comps-agent-factories.md`, not here.
- **Skip**, with the reason.

## Categories

Grouped by where they sit in the loop. "What we have" is the current holder: the engine, a Claude Code
built-in, or a career-workbench InDusk skill (those run in that repo, not here).

### Observe and learn

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Study a shipped product** | Learn how someone else built a feature, to move fast on our own | REA (`rea-agents`), factory-wide for the talk agent and planner (#55) | none yet |

### Plan

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Interview** | Draw out the decisions before anything is built | Engine planner's open questions with a cost on each (one non-interactive run) | Pocock `grilling` / `grill-me`; OMC `deep-interview`; Superpowers `brainstorming`; gstack `/office-hours` |
| **Spec and slice** | Turn decisions into issues | Engine planner: a code issue's sub-issues (brief, files, done-when), dependencies as `blocks` relations | Pocock `to-spec`, `to-tickets`; Superpowers `writing-plans`; HumanLayer `create-structure-outline`; GSD `/gsd-plan-phase`; Roger `start-ticket` [private] |
| **Multi-session planning** | Plans too big for one session | Engine initiatives → projects → issues → sub-issues, in Linear's shape; reachable from any Claude Code session through the engine's MCP tools | Pocock `wayfinder` |
| **Plan review** | Challenge a plan before building | none | OMC `plan --consensus` (planner, architect, critic); gstack `/plan-*-review`, `/autoplan`; Kyle's multi-model reviewer and adjudicator [private] |
| **Domain language** | Keep names and hard decisions consistent | LOG.md / SHAPE.md decisions | Pocock `domain-modeling` (GLOSSARY.md, ADRs) |

### Build

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Build discipline** | How a session writes code: test first, small slices | Engine executor, one build per code sub-issue (no method of its own) | Pocock `tdd`; Superpowers `test-driven-development`; Roger `work-ticket` [private] |
| **Deciding mid-build** | Keep going on small calls, record them | Engine provisional decisions | Superpowers `subagent-driven-development` "rulings, not stalls" ledger |
| **Debugging** | Find a root cause | none | Pocock `diagnosing-bugs`; Superpowers `systematic-debugging`; OMC `debug`, `trace` |

### Prove

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Demonstration and evidence** | Show the change working on the real app | SHAPE: seeded preview per PR (not built yet) | Thomas Mboto's perf A/B evidence skill [private]; Roger's screenshot per acceptance criterion [private]; Anthropic `webapp-testing`; Nate's before/after report [private] |
| **Verify before done** | Checks pass before claiming done | Claude Code `verify`; workbench `verify` | Superpowers `verification-before-completion`; OMC `verify` |
| **Falsify** | Try to break it | workbench `falsify` | Kyle's adversarial reviewers [private] |

### Review

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Review a diff** | Find bugs before merge | Claude Code `/code-review` | Pocock `code-review`; Superpowers `requesting-code-review`; Roger's GitHub Action reviewer [private]; Jay's peer-review skill [private]; CodeRabbit |
| **Answer a review** | Act on comments without obeying wrong ones | Engine GitHub sync reads reviews and checks (#49) | Roger `address-pr-review` [private]; Superpowers `receiving-code-review` |
| **Simplify** | Remove what isn't needed | Claude Code `/simplify`; workbench `cleanup` | OMC `ai-slop-cleaner` |

### Ship

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **PRs and commits** | Branch, commit, PR description | Engine stacked PRs (#50); workbench `git` | Pocock `pr`; gh-stack skill; Graeme's PR skill [private] |
| **Release safety** | Don't break production | none | Tallis `safe-apply` [private]; Jackson `/verify-release` [private] |

### Context

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Session handoff** | Pick up where the last session stopped | Engine runs resume the agent's session; workbench `catchup`, `handoff` | Pocock `handoff`; gstack `/context-save` |
| **Project memory** | Keep CLAUDE.md / AGENTS.md true | workbench `claude-md`, `compact-context` | Graeme's AGENTS.md gotchas rule; Pocock `retro` |
| **Learning from sessions** | Turn what happened into lessons | workbench `highlight`, `retrospective`, `eval-review` | Pocock `retro`; OMC `self-improve` |

### Environment

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Dev setup** | Get the app running for an agent | Engine modules, each with a manifest (SHAPE) | Cloaked Desktop dev-setup skill (INT-140) [private]; Nate's Shopify setup [private]; Pocock `setup-pre-commit` |
| **Observability** | See what the app and agents did | PostHog (always observed); workbench `local-telemetry` | PostHog [`signals`](https://github.com/PostHog/skills/tree/main/skills/omnibus/signals) and the rest of [PostHog/skills](https://github.com/PostHog/skills) (official, MIT) |

### Communicate

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Readable writing** | Writing people can read quickly | workbench `write` | tropes.fyi "The Whip"; Janac's de-ai [unverified]; Pocock `wait-what` |
| **Teaching** | Explain in pieces and check understanding | workbench `guided-build` | Pocock `teach`; Janac's piecemeal explainer [private] |
| **Diagrams and visuals** | Show the plan or system | none | Tallis `/excalli-diagram` [private]; Daniel's Hub artifact |
| **UI design** | Taste for interfaces | none | Anthropic `frontend-design` |
| **Documentation** (new, 2026-10-31) | Documents a reader can act on: briefs, ADRs, specs, READMEs, kept true | none (SE-1 builds a reader test) | Anthropic [`doc-coauthoring`](https://github.com/anthropics/skills/blob/main/skills/doc-coauthoring/SKILL.md); Diátaxis skills on [mcpmarket](https://mcpmarket.com/tools/skills/di-taxis-documentation-framework-1) (unvetted, many copies) |

### Meta

| Category | What it's for | What we have | Candidates seen |
|---|---|---|---|
| **Writing skills** | Make and test our own skills | none | Anthropic `skill-creator` (with evals); Pocock `writing-for-agents`; Superpowers `writing-skills`; OMC `skillify` |

Orchestrators (Conductor, T3 Code, herdr, Paseo, Orca, firstmate, smithers, Warp Factories, OMC `team` /
`autopilot`, GSD) do the engine's job; they are comparables, not skills.

## Evaluated

| Date | Skill (author) | Category | State | Starts | Verdict |
|---|---|---|---|---|---|
| 2026-10-27 | [REA](https://github.com/morluto/rea) `reverse-engineer-anything` (morluto) | Study a shipped product (new) | its own MCP session | model | **Adopted, factory-wide** (#55). 229 tools, gated from REA's own MCP hints; the planner gets only the free ones. |
| 2026-10-27 | [`grilling`](https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md) (Pocock) | Interview | conversation | model | **Borrow**: rounds of the whole open frontier, each with a recommended answer; facts from a subagent, decisions from the person. Matches the planner's open questions; a planner that runs in rounds would be this with state in Postgres. |
| 2026-10-27 | [`wayfinder`](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md) (Pocock) | Multi-session planning | the configured tracker, else `.scratch/` | human only | **Adopt candidate, through a tracker adapter** (below). Since the rebuild in Linear's shape our store is a tracker, so its map and tickets can be our issues, written by the engine. Borrow regardless: ticket types (grilling, prototype, research, task) marked AFK or HITL. |
| 2026-10-27 | [`to-spec`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md), [`to-tickets`](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md) (Pocock) | Spec and slice | the configured tracker | human only | **Adopt candidate, through the same adapter.** They overlap the planner, so try both on the same brief before choosing. |
| 2026-10-27 | [`deep-interview`](https://github.com/Yeachan-Heo/oh-my-claudecode/blob/main/skills/deep-interview/SKILL.md) (OMC, Yeachan Heo) | Interview | `.omc/state/`, `.omc/specs/` | model; needs OMC's `state_write` | **Borrow**: readiness as a score (goal, constraints, success criteria, context) with the gap named; scope check before questions; entity tracking across rounds. Shown as guidance, not a gate. Skip the made-up weights and the three-stage approval pipeline. |
| 2026-10-27 | [Superpowers](https://github.com/obra/superpowers) `subagent-driven-development` (Jesse Vincent) | Deciding mid-build | `.superpowers/sdd/progress.md` | plugin hook | **Borrow**: `Ruling: what — why — cost if wrong` as the shape of a provisional decision event. |
| 2026-10-27 | [`create-structure-outline`](https://github.com/humanlayer/humanlayer/tree/main/apps/riptide-rpi-claude-plugin) (HumanLayer, Dex Horthy) | Spec and slice | `.humanlayer/tasks/` | model | **Borrow**: "Do not structure a phase N such that Phase N+1 must be completed before Phase N can be verified" as a planner check. |
| 2026-10-27 | Pocock `tdd`, Superpowers `test-driven-development` | Build discipline | none | model | **Adopt** one into Homework Gate's `.claude/skills/`; try both by hand first. |
| 2026-10-27 | Anthropic [`webapp-testing`](https://github.com/anthropics/skills) | Demonstration and evidence | none | model | **Adopt** candidate for driving the app; it isn't the demonstration itself. |
| 2026-10-31 | Anthropic [`doc-coauthoring`](https://github.com/anthropics/skills/blob/main/skills/doc-coauthoring/SKILL.md) | Documentation (new) | an artifact or a markdown file in the working directory | model | **Borrow** the reader test: predict the reader's questions, have a fresh subagent that sees only the document answer them, and fix what it gets wrong. The rest (context gathering, 5–20 options per section) is interactive and keeps its own file, so not installable into the engine's loop. Built as SE-1. |
| 2026-10-31 | PostHog [`signals`](https://github.com/PostHog/skills/tree/main/skills/omnibus/signals) (PostHog, official) | Observability | none | model | **Adopt, factory-wide**, with PostHog's MCP server, for the talk agent and the planner (SE-4): HogQL over raw signal data, semantic search, dedup. Read its SKILL.md before installing; one listing's install path disagrees with the repo path. |
| 2026-10-31 | Diátaxis documentation skills (various, mcpmarket) | Documentation | varies | model | **Skip for now**: many near-identical copies, no maintainer or activity we could check. Diátaxis itself (tutorial, how-to, reference, explanation) is worth borrowing as a check on user docs once there are any. |

## Tracker skills on our store (since the rebuild in Linear's shape, 2026-10-27)

Pocock's planning skills don't keep state themselves; they write to whatever tracker
`setup-matt-pocock-skills` configured, described in prose in `docs/agents/issue-tracker.md` ("Other" is allowed).
Our store is now a tracker, and its tools are open to any Claude Code session over MCP. So one file in an app repo,
mapping each tracker operation to an engine tool, would let wayfinder, to-spec and to-tickets write into Postgres
through the engine. The founding rule holds: the engine stays the single writer. And once Linear is connected
(step 3), the same skills could write to Linear directly.

| Tracker operation the skills use | Engine today |
|---|---|
| Create an issue; a child under a parent | `create_issue` (with `parentId`) |
| Change state, close | `set_issue_state` |
| Order | `reorder_issues` |
| Read the map and its tickets | `issue`, `issues`, `project_graph` |
| Blocking edges ("blocked by") | `blocks` relations exist in the schema; **no tool sets one** |
| Labels (`wayfinder:map`, `ready-for-agent`, AFK/HITL) | **none** |
| Claim by assignment | **none** for planning issues (builds claim code sub-issues) |
| Resolution comment on a ticket | **none** (decisions and questions are rows; no comments) |

Four gaps, all ones Linear also has (relations, labels, assignee, comments), so closing them is step 3's shape
anyway. Not decided: whether to close them for this, or keep the planner as the only way plans get written.

Still to get: Ayal's planning skill (Cloaked), Thomas's A/B evidence skill and his PR-writing agent on Temporal,
the Cloaked Desktop dev-setup skill, Roger's skill files (he says a cleaned-up post is coming), Jay's
peer-review skill, Tallis's `wwa` / `lavish` / `safe-apply`.
