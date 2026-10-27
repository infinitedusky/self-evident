# Self Evident — the thing proves itself

The product is **Self Evident** (repository `infinitedusky/self-evident`; it was `idea-factory`, then briefly `olimb`, on 2026-10-22). The loop it runs is observe → learn → ideate → mockup → build, which is the nav.

Start here: read [LOG.md](LOG.md) (where things stand, decisions, next step)
and [SHAPE.md](SHAPE.md) (what we're building). Research is in `research/`.

This folder holds the design (LOG.md, SHAPE.md, `research/`), the ideas (`ideas/`, one file each) and, since
2026-10-20, the factory's code: `engine/` (Postgres schema, server, event stream, scheduler, planner; see
`engine/README.md`) and `app/` (the web UI). pnpm workspace at the root: `pnpm dev` brings up the database, the
engine and the UI. Work in a git worktree per branch, never in the main checkout. We are acting as the
factory by hand on Homework Gate first and logging each step; the tool gets
built from that log. Keep it light: no plan ceremony, no gates. When something
is decided, write it into LOG.md or SHAPE.md before moving on.

**Everything is observed** (Sandy, 2026-10-27). Whatever we build that runs, here or in an app we make, sends its
logs to a central place (PostHog Logs, over OpenTelemetry) with a level on every line, and errors alert. Wire it in
the same PR as the thing itself. Never ask Sandy to send a log file.
