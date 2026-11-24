# Context: a section above the brief

Written 2026-11-24, to hand to a fresh session. Agreed with Sandy in conversation; nothing is built yet.

## What it is for

A place to put things ahead of research, and to record structured thoughts that guide every agent working on a
piece of work: reference documents, notes and decisions.

## Where it sits

- A **Context** section on an idea, a project and a task, above the brief and ahead of Research.
- It is always there. It is not a step that is started or skipped.
- **It moves with the work.** When an idea becomes a task or a project, everything in its context goes along, as
  its steps and its ticket already do.
- **A task inside a project also sees the project's context**, shown as "from the project" and read-only there.
- No app-level context yet. Sandy expects one later.

## What it holds

Three kinds of item. Each can be edited and deleted, and shows who added it and when.

- **Reference docs:** pasted text, an imported file (text, Markdown, PDF), or a ticket from a tracker. Each has a
  title and says where it came from.
- **Notes:** short free text.
- **Decisions:** one statement each, with an optional reason.

## The Linear ticket is the first reference doc

An imported ticket is already kept word for word as an **origin** (`engine/src/origins.ts`, table `origin`): title,
text, comments, links, images. It is never edited here, only refreshed from its source. An idea, project or task
points at one (`origin_id`), a task with none inherits its parent's, project's or idea's, and every agent is given
it whole (`originPrompt`).

So: show the origin in Context as the first reference doc ("From Linear, SHOP-12"), read-only, with a refresh. More
docs can be added beside it, including another ticket by its id. A doc that comes from a source stays as the
source has it; one that was pasted or imported can be edited.

## How agents get it

- **Decisions and notes:** in every agent's instructions for that work, in full. Decisions are stated as settled,
  so an agent does not reopen them.
- **The originating ticket:** in full, as today.
- **Other reference docs:** listed by title with a line of description, opened by an agent when it needs one,
  unless the person marks a doc "give to every agent in full".
- **Agents can add to it** through a tool. A note or a doc, freely; what an agent adds is marked as the agent's.
- **A decision:** an agent may record one once the person has agreed to it in conversation. Otherwise it proposes
  one, and the person accepts or rejects it.

## How to build it

- Story first (`app/src/stories/`, made-up sample data), with the section's hierarchy designed as a whole and
  approved before it is built.
- Look at the real page before and after. Story tests only prove text exists.
- Work in a git worktree. Write what is decided into LOG.md and SHAPE.md.
- Ask when an instruction has two readings.

## Settled since (2026-11-24)

Built the same day; LOG.md, "Context: a section above the brief", has how it works and what is not done.

- Order of work: before the gate in [reviewable-prs-brief.md](reviewable-prs-brief.md).
- A rejected proposed decision is kept, marked rejected and folded away; agents are told not to propose it again.
- Size: a doc up to 200,000 characters; one given to every agent in full, up to 20,000.
- Notes and decisions here are the app's existing notes: one set, still in the reports.
