# Lightsprint, taken apart

Public sources only (mainly their docs at https://app.lightsprint.ai/docs/), 2026-10-20. Why: Sandy decided to
build a Lightsprint-like factory and feed it with telemetry (SHAPE.md). We borrow product thinking — patterns and
ideas, never pixels, brand or code.

## The short version

A product layer on rented parts: **E2B sandboxes** (inferred, high confidence: reserved ports 49983/49900/50005,
`/home/user/workspace`, a job ad naming E2B), **Claude Code or Codex** running inside them, **Composio** for
connectors, and the customer's own GitHub CI. What they own: the setup agent, screenshot verification, live shared
sessions, plan mode, the review screen. YC Spring 2026, $6.1M seed (645 Ventures, 2026-10-13), six people, SvelteKit.
Founded 2026, three at YC time (YC page; partner Garry Tan). Founders: Ben Ong (ex-VC, January Capital; venture
builder at Temasek's studio), Benedict Chan (CTO BitGo, head of eng Chainlink, ex-Microsoft), Heng Hong Lee
(Facebook Messenger 2013, Director of Eng at Fazz, YC S17). Launch post: "using Lightsprint to build Lightsprint".
Read: they got into YC on the team, not on a pre-built product — a few months old at most when the batch started.

## How each part works, and how hard it is to build

| Part | How it works | Build |
|---|---|---|
| Sandbox per task | VM + branch (`ls/*`) + agent per task, booted in seconds from a prebuilt snapshot (repos cloned, setup run); 8/16 GB; pause after ~20 min idle, retire at 7 days; one persistent "primary sandbox" per stack for read-only work and a preview of main | **High.** Snapshots, setup on every boot, long-running services, arbitrary repos. Rent E2B/Daytona |
| Previews | Each dev server gets an unguessable public URL (the Vercel model), optional password; servers bind 0.0.0.0 behind a proxy; some stacks get a database branch per task | Medium–high (proxy + lifecycle) |
| Onboarding agent | "Set up my preview" inspects the stack, fills in setup/test commands, services, agent instructions; **opens PRs when the repo needs changing; setup is done only when the preview loads**. Env vars in `/tmp/.env`, which the agent can read — docs say use staging credentials | **High** — their own main engineering problem |
| Live shared session | App on the left; plan, reasoning, tool calls on the right; one shared message queue ("Send now" interrupts); click an element to attach it; optional terminal | High (multiplayer queue). InDusk's session panel is a start |
| QA | Built-in agent skills: `qa` on every task chooses `visual-qa` (screenshots/video), `expect-qa` (checks the preview can't show, e.g. emails), `flow-diff` (Mermaid of changed flows); `interactive-qa` reports bugs, never fixes. Posted as a "Verification" comment on the PR (Feature / Entry Points shots); `@lightsprint capture …` in a PR comment asks for more; can QA PRs it didn't make | **Low–medium.** Prompts + a headless browser. InDusk's `browser.ts` |
| Merge readiness | Docs: red/yellow/green from CI checks, bot reviews, unaddressed comments, conflicts; auto-merge needs 100, ≥1 passing check, no warnings. The homepage's "design-token linting / component registry" look like marketing — in practice your linters plus a `design-md` skill | **Low.** Summarise GitHub's checks API |
| Plans | Read-only interview with the agent: decision cards with lettered options and a recommended one; ends in product spec + design preview + tech spec (variants: Prototype, Meeting Notes to Plan, "YC Office Hours"); hands off to a task as `plan-handoff.md`; **no approval step** | Medium — conversation design, not code. InDusk's DecisionCard |
| Skills | Per stack, or discovered from `.claude/skills/*/SKILL.md`, or imported from skills.sh; a skill named `design-md` is the design system | Low — copy the pattern |
| Automations | Run as a named user, with budget caps and run limits | Medium |
| Models | Lightsprint credits via an AI gateway token, or connect a personal ChatGPT/Claude/OpenRouter account, or (Enterprise) your gateway. Claude "where available" | — |

## What it does not do

No baseline, hypothesis or post-merge measurement — merging marks a task "Done". No experiments or feature flags. No
idea validation (plans are *what* to build, not *whether*). ~~No generated seed data in previews.~~ **Wrong — see
below.** Closest: a PostHog connector so an agent can "check whether the feature they just built is actually being
used".

**PostHog, as documented (2026-10-20, `docs/mcp/`, `integrations/`, `automations/`):** a Composio catalog app
(API-key form, like Sentry), connected workspace-wide by an owner/admin, switched on per stack in the MCP tab. Its
tools reach task agents, Chat and Plan Mode like any MCP tool ("agents can call every attached MCP tool, including
write actions"). The only stated use is a read: "What's the funnel conversion on the new signup flow?", and checking
whether a shipped feature is used. **Not a trigger:** automations fire on a schedule, a GitHub event, a Slack
mention, a Linear change or a manual run — no PostHog, no errors, no metrics. Nothing runs after merge. So PostHog
is a tool the agent consults when asked; data is neither the input nor the judge. **Threat:** the "Triage task"
action already names tasks from incoming events, so a PostHog trigger is a sprint away for them and would close the
signal → task half of our loop. The other half (baseline and hypothesis per idea, verdict after ship) needs a unit of
work that outlives the merge; theirs ends there. **Check in the app** (docs undersell it): the Automations trigger
list, and whether Triage can take a PostHog event.

## Sample data is the default (Sandy, 2026-10-20 — seen in the app, not in the docs)

Onboarding step 4 of 8, "What data should your preview use?": **Sample data (Recommended)** — "Realistic placeholder
users, accounts and records. Nothing touches your real data" — versus **My real data** — "Add your environment
variables so the preview connects to your own databases and services". Footer: "You can switch to real data any time
in Settings." Intro: "We'll build your preview with sample users and records by default, so it works without access
to your systems."

So the thing our comps called unoccupied — a running preview with realistic data filled in — Lightsprint ships, as
the default, and the docs (`preview-setup/`, `llms.txt`, the docs index) say nothing about it. Our research read
the docs and missed the product. **Lesson for research: open the app, not just the docs.**

Unknown (nothing public): how the sample data is made (most likely the setup agent writes a seed script per stack
and the setup command runs it on every boot — that matches the docs' "seed data" in the setup command); whether it
is deterministic across tasks; whether it is scoped to the change under review; and **whether the preview or the PR
says which data is fake** — the screenshot labels the choice at setup, not the data in the demo.

What this leaves us: the preview with sample data is table stakes. What is still not found anywhere: the demo
labelling its fake data in the review, the demo tied to a hypothesis and a baseline, and telemetry judging the
result after merge. The "data realism" gap is narrower than we wrote: it is realism *for this change's scenario*,
stated honestly, not realism in general.

## Lessons for us

- **Customers' Claude subscriptions: only through Claude Code itself.** Anthropic's Feb 2026 change cut off
  third-party harnesses using subscription OAuth as their own credential (secondary sources). But `claude setup-token`
  is documented for "CI pipelines, scripts, or other environments where interactive browser login isn't available"
  on Pro/Max, and the Claude Code GitHub Action runs on it — so the real `claude` binary running headless on rented
  infrastructure with a customer's token is sanctioned (corrected 2026-10-20; docs: code.claude.com/docs/en/authentication).
  For our product: if the factory runs the actual Claude Code binary, a customer's `setup-token` is a legitimate
  model-access provider; our own harness calling the API needs API keys. Which one Lightsprint does is unknown
  ("where available"); tell by whether its connect flow asks for a pasted setup-token or an OAuth sign-in.
- **Borrow:** the setup agent that works by opening PRs; "the preview loads" as the definition of set up;
  **sample data as the default, real data as an opt-in with env vars, switchable in Settings**;
  Feature / Entry Points screenshots on the PR; `@bot` commands in PR comments; automations with a run-as user,
  budget caps and run limits; honesty about what the agent can read.
- **Ours alone:** the loop from a telemetry signal → idea with baseline and hypothesis → build → the same telemetry
  measures it. Lightsprint offers no hook for a build to carry a hypothesis or report back.
- **Rent:** sandboxes (E2B/Daytona), the coding agent (Claude Code headless / Agent SDK with API keys, Codex),
  connectors (Composio or MCP), CI and merge (GitHub).

## Proposed build order (the edge first)

1. **Telemetry in, ideas out.** Connect PostHog (then Datadog); a signal becomes an idea card with its baseline,
   hypothesis and look-by date. The minimal UI: ideas board, idea page, settings (providers).
2. **Build, simplest form.** One known repo (Homework Gate): Claude Code headless on a branch/worktree (InDusk's
   session manager), PR with QA screenshots (InDusk's browser tooling), the readiness light from GitHub checks.
3. **Measure.** After merge, the same insight against the baseline → a verdict on the idea card. The loop closes.
4. **Thicken the middle.** Rented sandboxes and preview URLs, the onboarding agent, plans as decision cards, the live
   shared session, automations.

## Sources

Docs: preview-setup, agents, steering, terminal, agent-subscriptions, billing, skills, verify-from-github, review,
many-tasks-one-base, plans, mcp, guardrails, automations, workspace-settings — all under
https://app.lightsprint.ai/docs/. Site: https://lightsprint.ai/, /pricing, /llms.txt, /careers/senior-software-engineer,
/blog/lightsprint-raises-6-1m. Company: https://www.ycombinator.com/companies/lightsprint,
https://dealroom.co/news/161992-lightsprint-raises-6-1m-seed-to-help-pms-and-designers-ship-code-safely/,
https://dnyuz.com/2026/10/13/this-y-combinator-startup-raised-6-1-million-to-let-product-managers-and-designers-ship-code-see-its-pitch-deck/,
https://github.com/SprintsAI. Subscription terms: https://gigazine.net/gsc_news/en/20260220-anthropic-third-party-block,
https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/.
Not found: changelog, Hacker News launch, Product Hunt, talks; QA browser tool; named customers unconfirmed.
