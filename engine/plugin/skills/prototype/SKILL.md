---
name: prototype
description: Use when building a prototype for a task, idea or project in Self Evident (the Prototype step), when writing a prototype agent's brief, or when deciding whether a prototype is ready for the person to approve. Defines what a prototype is for, its definition of done, where fakes are allowed, and how to report on it honestly.
---

# Prototype

## What we are trying to accomplish

A prototype answers one question with evidence: **will this work, built the way we would ship it?**

So the prototype's code is **essentially the code we would go live with**: the real integration point, the real
parsing, the real schema and migration, the real storage and queries, the real API, the real screens, written the way
the repository writes them. The only things that are not real are **outside the system's edges** (vendors, other
services, identity, real people's data), and those are swapped in through **seams the production code already has or
should have**: a configurable base URL pointed at a stub server, an injected HTTP transport, a dependency override, a
fixture file replayed by a stub. The code under test never knows it is talking to a stub.

That is what makes the prototype worth analysing. After the person approves it, a prototype analysis, a draft ADR and
a blast radius are read out of it, and they describe **what we intend to build**. A prototype full of shortcuts would
teach them the shortcuts.

**Speed is the point.** The prototype exists to show the shape of the thing fast: what the data really is, where it
lands, what the screens need, what is hard. Get every criterion working end to end first, then stop. Do not refactor,
abstract, de-duplicate or tidy as you go. How the code could be better (simpler, more maintainable, DRYer, a better
approach altogether) is the prototype analysis's job, and the build follows what the analysis finds.

## What it is not

- **Not a UI guide.** Screens on sample data in the browser answer *what it should look like*. That is the job of
  sketches and mockups. A branch someone called a "prototype" that only renders screens is a starting point to build
  on, not a prototype.
- **Not a mock-up of the backend.** A fake server that returns finished API responses skips the very code we need to
  know works. Stubs replace what is *outside* the system, never a layer of it.
- **Not a partial with gaps for later.** "The analysis will cover it" and "the real build will add it" are not
  allowed. A gap the prototype could have closed is a prototype not finished.

## Definition of done

1. **Every requirement of the task's brief (or description) is met, end to end.** Turn them into a checklist before
   writing code and work through it. On a task, the checklist is its **acceptance criteria** (`set_acceptance`; the
   `task` tool shows them): the person approves them with the brief, so build them as you build. Add what the brief
   implies and what building turns up, sharpen any that cannot be checked, and record for each whether the prototype
   shows it and where. A criterion marked **final build only** is not the prototype's: skip it. Only the task's agent
   or the person marks one that way. For each one, the running prototype shows it working through the whole path:
   in through the real integration point, into storage, out through the API, onto the screen the task names.
2. **Real data shapes.** Stub responses are recorded from the real service whenever possible (a real run, captured
   once, kept out of git if it holds real people's data, with a committed copy whose people are invented but whose
   shape is identical). When nothing real can be had, write the stand-in from the best reference and say plainly that
   the shape is assumed.
3. **It runs as the app runs.** Started by the app's prototype command, on the app's real database engine, with the
   app's own services; rebuilt from a labelled scenario (`.prototype/scenarios/<name>/`). Save scenarios that show
   each requirement, including empty and edge cases (nothing found, many found, re-run).
4. **It answers the hard questions by trying them.** Where the brief leaves a design choice open (one record per scan
   or per finding, where a field is stored, how duplicates are avoided), pick one, build it properly, and note what it
   showed.
5. **It proves the claims that matter.** Where a requirement is a guarantee (no duplicates on re-run, a company sees
   only its own data), show it: a scenario, a script or a test that runs it twice or as two companies.
6. **It finds the telemetry hook points.** With the real path built, mark where production would tell us the feature
   works and is used, using the app's own telemetry channels (find them first: structured logs, metrics, monitors,
   product analytics). For each hook point: where in the code, what it records (counts and states, never personal
   data), what question it answers ("did the vendor change its format?", "is anyone using it?"), and what would alert.
   Cover at least: data coming in (found, skipped, absent), writes (inserted, updated, pruned), failures, latency of
   the new reads, and the user actions that show the feature is used. Emit them in the prototype where it is cheap, so
   the analysis can see them work; the full list goes in the report either way.

## Where fakes go, and where they don't

Allowed, at the edges only and through a seam: outside vendors and services (stub server or injected transport fed
by recorded fixtures), identity and login (a dependency override or a dev-only session), sample companies and people,
config values. Name each seam you used in your report, and say whether it already existed or you added it; a seam you
added is something the real build will need too.

Not allowed: skipping a layer, hard-coding what a query should return, parsing that only handles the sample, a
schema you would not ship, logic in the browser that belongs on the server.

Optional, and better left out: polish (final copy, every error state, exhaustive tests beyond what proves a
criterion), refactoring, shared abstractions and tidying. Required: every layer present and correct on the path.
Duplicated or clumsy code is fine; a skipped or faked layer is not.

## Rules

- Never commit real personal data. Recorded real runs stay local and gitignored.
- Never push to, rebase or change a branch you were given as a starting point; copy it into your own and build there.
- Follow the repository's own conventions (AGENTS.md / CLAUDE.md): structure, naming, migrations, privacy rules.
- Restart the server yourself (`run_prototype`) after a change that needs it.

## Reporting

When you say you are done, report against the checklist, one line per requirement, gaps first:

- **Not met**: why, and what it would take. Plainly, before anything else.
- **Met**: how to see it in the running prototype (page, record, scenario, script).

Then: each seam and stub used (existing or added), what is assumed rather than recorded from the real service, and
what was hard or surprising; the analysis reads it.

Then the **telemetry hook points**, as a table (where, what it records, the question it answers, the alert), saying
which ones the prototype already emits. The brief and the plan take them from here.

Where you knowingly took the quick way (copied code, an awkward structure, a choice you would revisit), say so in a
line each, so the analysis starts there.

Never call it ready, or suggest the person approve it, while any requirement is not met, unless the person has
explicitly accepted that gap. The conductor holds the report against the same checklist before telling the person.
