# Tracker guide: Self Evident

A tracker guide in the format of the rogs-skills `setup-rogs` guides (`tracker-linear.md`, `tracker-local.md`, …), so
`/setup-rogs` can write a repository's `docs/agents/issue-tracker.md` from it, or a person can, by filling the
`{{FILL: …}}` values. Self Evident is where tickets are born, reviewed and watched; tkt and the lifecycle skills
build them and write back here (SHAPE.md, "tkt is the runner; Self Evident is the tracker and the window"). The
engine fills it for an app itself (`engine/src/tkt.ts`, `trackerGuide`): an app's page under Integrations › tkt
shows the finished `docs/agents/issue-tracker.md` to copy, and `GET /api/apps/:id/tracker-guide` serves it.

## Setup notes

For setup only; this section is not copied into the project.

- Detect: the repository is an app in a running Self Evident (`GET <engine>/api/apps` lists it with this
  repository's path under `repos[].localPath`), or the user names Self Evident.
- Connection: the engine's HTTP API, by default `http://localhost:4000/api`. Plain `curl`; no token on a local
  engine, so nothing secret goes in the file. Every call works from any harness and any worktree.
- Connection check: `curl -sf <engine>/api/health` prints `{"ok":true}`, and `curl -sf '<engine>/api/apps'` lists the
  app; record its `id` and `key`.
- Discover: states are fixed words (below); there are no labels; members are free text; projects come from
  `GET <engine>/api/projects?app=<app id>`.
- The hinge: a ticket is built from an approved brief. `briefApprovedBy` is set on a ticket whose brief a person
  approved in Self Evident; a ticket whose brief is not approved is not ready, whatever its state, and the engine
  refuses to mark it done.
- Gaps: `relate` is a fallback (description lines; the API reads relations but does not write them yet); `attach`
  is unsupported (the forge holds captures).

## Tracker

- Kind: Self Evident
- Connection: the engine's HTTP API at `{{FILL: the engine URL, by default http://localhost:4000/api}}`, with `curl`.
  The UI is at `{{FILL: the UI URL, by default http://localhost:5180}}`. No token.
- Scope: the app `{{FILL: the app's name}}`, id `{{FILL: app_…}}`, key `{{FILL: the key}}`. Every list call passes
  `app=<app id>`; every ticket read back must have `appId` equal to it.
- Ticket ids: `{{FILL: the key}}-<number>`, matched by `^{{FILL: the key}}-[1-9][0-9]*$`. The API also knows each
  ticket by an internal id (`iss_…`); use the identifier in branches and in writing, either in calls.
- Ticket URLs: `<UI>/tasks/<identifier>`.
- Rules for every call: pass bodies as JSON with `-H 'content-type: application/json'`; read the JSON back and
  check `identifier` and `appId`; an error is `{"error": "…"}` with a 4xx status, and its text says what to do.

## Operations

Angle brackets mark values: `<engine>`, `<UI>`, `<app id>` and `<key>` come from `## Tracker`; the rest from earlier
calls.

### resolve

`curl -sf <engine>/issues/<ticket id>` with the identifier (`<key>-12`) or the internal id. A bare number gets the
key in front. 404 means no such ticket. Check that `appId` is `<app id>`; a ticket of another app is not a ticket of
this project.

Capability: Supported

### load

The same call returns the whole ticket: `title`, `description` (for a person: what will be different), `brief`
(for the builder: Problem, Soft scope, Acceptance criteria, Dependencies), `state`, `priority` (0 none, 1 urgent,
2 high, 3 medium, 4 low), `assignee`, `briefApprovedBy` and `briefApprovedAt` (the hinge), `relations`
(`issueId`, `relatedIssueId`, `type` blocks | related | duplicate), `comments` (`heading`, `body`, `author`,
`updatedAt`, oldest first) and `subIssues`. For each related ticket, resolve it and read its `state`. Attachments:
none.

Capability: Supported

### search

`curl -sf '<engine>/issues?app=<app id>&q=<term>'` searches title, description and brief, open and closed tickets
alike (Self Evident keeps no archive), one page, in the app's order. One call per term or synonym; match the terms
against titles yourself as well.

Capability: Supported

### list-in-flight

`curl -sf '<engine>/issues?app=<app id>&state=in_progress,in_review&top=1'`

Capability: Supported

### list-ready

`curl -sf '<engine>/issues?app=<app id>&state=todo,backlog,triage&top=1'`, then keep the tickets whose
`briefApprovedBy` is set: those are ready. The rest are being reviewed in Self Evident; say so, never start one.

Capability: Supported

### metadata

- States: the words in `## States`; `curl -sf '<engine>/issues?app=<app id>' | jq -r '.[].state' | sort | uniq -c`
  shows the ones in use.
- Labels: none.
- Members: none; `assignee` holds a name, or null.
- Projects: `curl -sf '<engine>/projects?app=<app id>'` (`id`, `name`, `status`).

Capability: Supported

### create

```bash
curl -sf -X POST <engine>/issues -H 'content-type: application/json' \
  -d '{"appId":"<app id>","title":"<title>","description":"<one paragraph for a person>","brief":"<the body>","state":"triage","priority":<1-4>}'
```

Returns the ticket with `id` and `number`; the identifier is `<key>-<number>`. Its URL is `<UI>/tasks/<key>-<number>`.
The brief is the ticket body in the usual shape (Problem, Soft scope, Acceptance criteria, Dependencies); a person
approves it in Self Evident before anyone starts the ticket. When the app's rules start everything as an idea, the
call fails and its message says so: ask the user to capture the idea in Self Evident instead.

Capability: Supported

### update

`curl -sf -X PATCH <engine>/issues/<ticket id> -H 'content-type: application/json' -d '{"description":"…","brief":"…","priority":3}'`
changes the fields given (`title`, `description`, `brief`, `priority`, `assignee`). A changed brief loses its
approval, by design: a person approves it again. Read the ticket back.

Capability: Supported

### relate

Write a `Blocked by: <ids>` line, and a `Delivers with: <ids>` line for a bundle, into the ticket's description with
`update`. The API reads relations (`relations` in `load`) but does not write them yet.

Capability: Fallback: the `Blocked by:` and `Delivers with:` lines in ticket descriptions alone.

### comment

```bash
curl -sf -X POST <engine>/issues/<ticket id>/comments -H 'content-type: application/json' \
  -d '{"body":"## <heading>\n\n<the comment, Markdown>","author":"<the skill, e.g. start-ticket>"}'
```

The heading is the body's first line without its `#` marks (or pass `heading`). A comment with the same heading
already on the ticket is replaced, body and author, so a ticket carries one current plan, one handoff, one review;
the event log keeps the history. `curl -sf <engine>/issues/<ticket id>/comments` reads them back, oldest first.

Capability: Supported

### transition

`curl -sf -X POST <engine>/issues/<ticket id>/state -H 'content-type: application/json' -d '{"state":"<state>"}'`
with the state mapped to the role in `## States`; canceling takes `"reason":"<why>"` too. Read `state` back. Moving
to `done` is refused while the brief is not approved or a required step is unfinished; the error says which.

Capability: Supported

### attach

Capability: Unsupported

## States

| Role | Tracker state |
|---|---|
| new | `triage` |
| ready | `todo` (and `backlog`), with `briefApprovedBy` set |
| in-progress | `in_progress` |
| in-review | `in_review` |
| done | `done` |
| canceled | `canceled` |
| blocked | none |

Terminal states: `done`, `canceled` and `duplicate`. A state missing from this table is unexpected: ask before
working on a ticket in it.

Automation: none moves a ticket on its own; a person or a skill does, through `transition`.

## Labels and priority

| Planning | Tracker priority |
|---|---|
| P0 | 1 (urgent) |
| P1 | 2 (high) |
| P2 | 3 (medium) |
| P3 | 4 (low) |

0 means none. There are no labels.
