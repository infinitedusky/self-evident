# The lifecycle seeds

The files `tkt` and the rogs lifecycle skills read from a repository's `docs/agents/`, as seeds with `{{FILL: …}}`
blanks: `forge.md` (with `forge-github.md`, the GitHub guide whose Forge and Operations sections go into it),
`workflow.md`, `domain.md`, `pull-request.md` and `agents-block.md` (the `## Ticket lifecycle` block for CLAUDE.md).
They are the `setup-rogs` assets of gitlab.com/rogs/skills (MIT, Roger Gonzalez), copied 2026-11-09, with one change:
the "written by /setup-rogs" line is Self Evident's ownership line, so a file keeps being rewritten only while it
carries it.

`/setup-rogs` fills these by asking. Self Evident fills them itself, for an app, in one press (Set up what's missing
under Integrations › tkt): every blank is a fact about the app or its repository, or the house default written in
SHAPE.md ("The house profile"). The code is `engine/src/lifecycle.ts`; the tracker guide (`issue-tracker.md`) has
its own seed, `docs/tracker-self-evident.md`, filled by `engine/src/tkt.ts`.

When the skills' contract moves to a new version, copy the new assets here, keep the ownership line, and update the
fills in `lifecycle.ts`; its test fails on any blank left unfilled.
