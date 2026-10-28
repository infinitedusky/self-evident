# Self Evident app

The minimal UI: the **ideas board** (building / testing / parked), an **idea page** (the bet, its telemetry, the loop
it ran, its evidence — from the database, once connected), **graph** (the top level: every step of every plan in an app on one canvas, dependencies as edges, dashed
links between open steps that share a file, live), **plans** (every plan the engine knows; a plan's live graph with the
selected task's detail, the event ticker and the plan's PR; a composer to make a new plan as rows of tasks), and **settings** (modules and their providers, telemetry first).

The Plans pages talk to the engine (`../engine`, `pnpm serve`) through Vite's proxy at `/api`, and follow its event
stream over SSE, so a running plan's graph updates as the engine logs events. The graph is `@xyflow/react` laid out
by `@dagrejs/dagre`; layout re-runs only when the topology changes.

Ideas are the files in `../ideas/` (one per idea, read at build time). Telemetry isn't connected yet; the idea page
says so. The look is **provisional** (InDusk's palette and fonts in `src/tokens.css`), not yet chosen through Sandy's
references.

```bash
pnpm install
pnpm dev          # http://localhost:5180
pnpm storybook    # http://localhost:6007 — components and page states
```

React 19 + TypeScript + Vite, React Router, Storybook (react-vite). Tokens by hand in one CSS file; no generator.

## Stories lead

Every page and component has stories beside it (`Now.tsx` → `Now.stories.tsx`), and a new screen or state starts there.
Pages render for real against a fake engine: MSW answers `/api` from `src/stories/sample.ts` (Sample Shop, made up and
labelled so: the repository is public). In a story:

```tsx
export const Quiet: Story = { beforeEach: withEngine({ now: quietNow }) }                 // the engine says something else
export const Loading: Story = { beforeEach: withEngine({}, { latency: 'infinite' }) }     // it never answers
export const EngineDown: Story = { beforeEach: withEngine(engineDown) }                   // it is down
export const OneIssue: Story = { parameters: { route: { path: '/issues/:id', url: '/issues/iss_sample5' } } } // a page that reads the URL
```

`pnpm test` checks that every page and component has a stories file and renders every story in a browser.
