# Storybook, as an integration

Role: Mockups. This app's mockups, as stories: the real ones, after the sketches. Mockups shows them inside Self
Evident, the agent opens one to show what it means, and the screen map draws the app as the user walks it. Switched
on under an app's Integrations; the command and URL default from the repo (the `storybook` script, run with the
repo's package manager and `--no-open`; the port the script names, else 6006), and are set only when the defaults are
wrong. (Sandy, 2026-11-09: "for all the integrations there has to be a default where I can just put the integration
and say set up"; "Storybook is simple, every project uses it, it should not be hard to add to a repo".)

## The standard

Every project's Storybook, checked by Self Evident (`engine/src/storybook.ts`, `checkStorybook`):

1. Storybook 10 with a Vite or webpack5 framework (the add-on's peer range is `storybook ^10`).
2. The screen map add-on, `@zigbang/storybook-addon-story-flow`, as a dev dependency.
3. In `.storybook/main.*`, in `addons`: `{ name: "@zigbang/storybook-addon-story-flow", options: { flowGlob: "<stories folder>/**/*.flow.json" } }`,
   the glob relative to `.storybook/` and pointing at the stories folder, never the default (it scans the parent tree).
4. `.storybook/story-flow.css` (served at `GET /api/storybook/story-flow.css`), imported in `.storybook/preview.*`
   after the app's global CSS: it keeps each title in its own strip when zoomed out and draws the line under it.
5. When stories run with `@storybook/addon-vitest`, `'**/*.flow.json'` excluded from that vitest project, or the run
   imports each JSON as a test.
6. A map: `<stories>/flows/<area>.flow.json` with `"title": "<Area>/Map"`. Whole screens only: each node's stories
   draw a page as the user sees it, frame and all, never a card or a form on its own. A screen that isn't ours is a
   node with no story, `coverage: "external"` and a `noStoryReason`. Edge labels say what you tap; each node is tagged
   with its address; what is already built is `existing`. The contract is in
   `node_modules/@zigbang/storybook-addon-story-flow/skills/story-flow-author/SKILL.md`.

## Installation

What Set up does, in this order, in the app's checkout; a step already done is skipped, so pressing again is safe
(`engine/src/storybook.ts`, `installStorybook`):

1. **Where.** The package the UI lives in: an existing `.storybook/` decides; else the root `package.json` when it has
   a framework or builder dependency (vite, react, vue, svelte, next, lit, preact, solid, angular); else the first
   workspace package that has one; else the root.
2. **Storybook itself**, with Storybook's own installer, non-interactive, docs only (the vitest add-on and its browser
   are not part of the default; switch them on in the repo when wanted):
   `<pnpm dlx | npx -y | yarn dlx | bunx> storybook@latest init --yes --no-dev --features docs --package-manager <pnpm|npm|yarn1|yarn2|bun> --no-agent --disable-telemetry`
3. **The add-on:** `<pnpm add -D | npm install -D | yarn add -D | bun add -d> @zigbang/storybook-addon-story-flow`.
4. **The stylesheet:** `.storybook/story-flow.css`, the engine's copy.
5. **main:** the add-on entry first in `addons`, with `flowGlob` derived from the first `stories` glob (`../src/**/*.stories.*`
   gives `../src/**/*.flow.json`). A main without an `addons` list is the agent's.
6. **preview:** `import './story-flow.css'` after the last import; a missing preview file is created with it.
7. **The vitest exclude**, only when `@storybook/addon-vitest` is a dependency: the agent's, since vitest configs vary.
8. **A first map:** `<stories>/flows/<app slug>.flow.json`, title `<App>/Map`, with the example `Page` story the
   installer made as its first screen (`example-page--logged-out`) when there is one, else no nodes yet. Real screens
   replace it as they are built.
9. **The dev docs:** one paragraph, "The screen map", appended to the README when it has none.
10. **Committed on the base branch and pushed** when the checkout was clean before the install (everything the
    install touched, in one commit); otherwise left in the working tree and said so.

Then the check runs again; the Start button starts it with the default command; Open the map opens
`?path=/docs/<app slug>-map--docs`.

## What the agent gets

When a step cannot be done from here (a main without an addons list, the vitest exclude, a Storybook older than 10,
an installer that failed), the agent gets this document and the check's line, in a conversation in the repo, and
finishes the install without asking: these are the house standard, not choices.
