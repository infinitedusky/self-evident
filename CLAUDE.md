# Self Evident — the thing proves itself

The product is **Self Evident** (repository `infinitedusky/self-evident`; it was `idea-factory`, then briefly `olimb`, on 2026-10-22). The loop it runs is observe → learn → ideate (with research) → plan (tasks: research, brief, mockup, prototype, in any order) → build, which is the nav.

Start here: read [LOG.md](LOG.md) (where things stand, decisions, next step)
and [SHAPE.md](SHAPE.md) (what we're building). Research is in `research/`.

This folder holds the design (LOG.md, SHAPE.md, `research/`), the ideas (`ideas/`, one file each) and, since
2026-10-20, the factory's code: `engine/` (Postgres schema, server, event stream, scheduler, planner; see
`engine/README.md`) and `app/` (the web UI). pnpm workspace at the root: `pnpm dev` brings up the database, the
engine and the UI. Work in a git worktree per branch, never in the main checkout. We are acting as the
factory by hand on Homework Gate first and logging each step; the tool gets
built from that log. Keep it light: no plan ceremony, no gates. When something
is decided, write it into LOG.md or SHAPE.md before moving on.

UI starts as a story: a new page, component or state is written as a Storybook story first (made-up sample data,
labelled; see `app/src/stories/`), then built to match. `pnpm --filter app test` fails on a screen without one.
