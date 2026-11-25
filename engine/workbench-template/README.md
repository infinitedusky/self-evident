# {{app}} workbench

What is ours about working on {{app}}, kept outside its repositories: its
docs, the scripts Evident runs for it, mockups. Nothing here goes into the
app's code. Evident made this folder; it is yours to change and to version.

## What is here

- `docs/`: the docs site (VitePress), shown under Docs in Evident. Two
  sections: `docs/system/`, **How the system works**, added to when the
  codebase is learned; and `docs/work/`, **Our work**, a page per closed task
  and per project. Evident's docs agent writes both; ask it from the Docs page.
- `.claude/skills/`: what the docs agent is told. `docs-pages` says how a page
  is written here, `docs-pages/task-page.md` sets out a task's page, and
  `vitepress` says what the site accepts. Change them, or add your own.
- `hooks/`: scripts Evident runs at set points (see `hooks/README.md`).
- `mockups/`: pictures and sketches of screens.
- `vendor/`: the diagram library the docs site draws with (see its README).

## Running the docs on their own

Evident starts the site for you. By hand:

```bash
pnpm install
pnpm dev      # http://localhost:4173 (or $PORT)
pnpm build    # static site in docs/.vitepress/dist
```

## Sharing it

This folder is a git repository of its own. To share it, make a private
repository for it and push. To publish the docs as they are written, put
`git push` in `hooks/docs-written.sh`.
