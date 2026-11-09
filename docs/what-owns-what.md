# What owns what: Self Evident, tkt, and the two together

Three ways to run the same loop, drawn so the ownership is visible (Sandy, 2026-11-08: "what owns what and how the
two are being used together … Self Evident on its own without tkt, tkt on its own including tkt web without Self
Evident, and then Self Evident with tkt as an integration"). The fixed point in every picture: **tickets live in
the tracker, never in tkt.** tkt keeps only what it knows about a running ticket (preset, session, tab, stage) in
the repo's `.git/tkt/state`; its board reads tickets through the agent, from wherever `docs/agents/issue-tracker.md`
says they live. tkt's own fit diagram is in its `docs/lifecycle.md`; these agree with it.

## 1. Self Evident on its own

```mermaid
flowchart LR
  you([You])
  subgraph se[Self Evident, on this machine]
    ui[Self Evident UI<br/>observe · learn · ideate · plan · build]
    engine[Engine]
    db[(Postgres<br/>ideas, projects, tickets, briefs,<br/>approvals, comments, events)]
    agents[[Its own agents: talk, planner, builder<br/>Claude Code with MCP tools into the engine]]
    wts[One worktree per sub-task]
  end
  subgraph out[Outside]
    gh[(GitHub<br/>branches, PRs, checks)]
    tel[(PostHog, Datadog<br/>what the apps report)]
    lin[(Linear<br/>the client's issues, if it has them)]
    conf[(Confluence<br/>declared; publishing a page is not built)]
  end
  you -->|writes tickets, approves briefs, watches| ui
  ui --> engine --> db
  engine -->|plans, builds, lands| agents --> wts
  agents -->|push, PR| gh
  engine -.->|sync: reviews, checks, merges| gh
  engine -->|Linear integration, built: the connection check<br/>signs in with the key, finds the team| lin
  engine -.->|Linear integration, not built: create an issue,<br/>comment, move, as a mirror of a ticket| lin
  engine -.->|Confluence integration: check built, publish not| conf

  classDef you fill:#fde68a,stroke:#b45309,color:#1f2937
  classDef se fill:#fbeee0,stroke:#c2620b,color:#1f2937
  classDef skill fill:#bbf7d0,stroke:#15803d,color:#1f2937
  classDef ext fill:#e5e7eb,stroke:#4b5563,color:#1f2937
  class you you
  class ui,engine,db,wts se
  class agents skill
  class gh,tel,lin,conf ext
```

Everything is Self Evident's: the tickets, the approval, the planner and builder, the worktrees, the build rows
and steps, the window. GitHub holds the code. The Linear integration is half there: its connection check is built (the solid
arrow), the mirror actions, create an issue, comment, move, are not (dotted). Confluence is the same.

## 2. tkt on its own, tkt web included (Roger's setup)

```mermaid
flowchart LR
  you([You])
  subgraph local[Your machine]
    chat[tkt agent, a pi chat, and tkt web<br/>board, needs-you cards, buttons]
    tkt[tkt]
    state[(.git/tkt/state<br/>per ticket: preset, session, tab, stage)]
    herdr[herdr<br/>one tab per ticket]
    wt[worktrunk<br/>one worktree per ticket]
    agent[[Claude Code or OpenCode<br/>running a lifecycle skill]]
    cfg[docs/agents/*.md<br/>tracker, forge, workflow, domain]
  end
  subgraph remote[Remote]
    mcp[Linear's hosted MCP server<br/>mcp.linear.app, signed in from the harness]
    lin[(Linear<br/>the tracker, in Roger's setup)]
    other[(Other trackers the skills know<br/>GitHub Issues, Kaneo, markdown files)]
    forge[(Forge<br/>GitHub, GitLab or Gitea: branches, PRs)]
  end
  you -->|tkt start, approve, run review, merge| tkt
  you -->|or buttons and slash commands| chat -->|the same commands| tkt
  tkt --> state
  tkt -->|tab, agent, prompt| herdr --> agent
  tkt -->|worktree| wt
  tkt -->|ticket id pattern only| cfg
  agent -->|reads| cfg
  agent -->|Linear tools: create, load, comment, move| mcp --> lin
  agent -.->|or, when the tracker file names one instead| other
  agent -->|push, PR, review, merge| forge
  tkt -.->|gh: PR, checks| forge
  chat -.->|reads tickets through the agent's tracker tools| mcp
  forge -.->|Linear's own GitHub integration:<br/>a PR attaches to the issue named in its branch| lin

  classDef you fill:#fde68a,stroke:#b45309,color:#1f2937
  classDef tkt fill:#bfdbfe,stroke:#1d4ed8,color:#1f2937
  classDef skill fill:#bbf7d0,stroke:#15803d,color:#1f2937
  classDef ext fill:#e5e7eb,stroke:#4b5563,color:#1f2937
  class you you
  class chat,tkt,state,herdr,wt,cfg tkt
  class agent skill
  class mcp,lin,other,forge ext
```

tkt owns the run: the worktree, the tab, the session, the stage, and the board that shows them. It never writes
the tracker. The skills do, following `docs/agents/issue-tracker.md`, and the tracker is wherever that file points:
for Roger, Linear through Linear's hosted MCP server. tkt web is a window onto tkt's state plus the tracker, driven
by the same slash commands you could type. Linear is reached two ways, neither through tkt: the skills call Linear's
hosted MCP server from the harness, and Linear's own GitHub integration attaches a pull request to the issue whose
id is in the branch name.

## 3. Self Evident with tkt switched on (ours)

```mermaid
flowchart LR
  you([You])
  subgraph se[Self Evident]
    ui[Self Evident UI<br/>the ticket page is the window]
    engine[Engine<br/>the tracker API]
    db[(Postgres<br/>tickets, briefs, approvals, the comments<br/>the skills write, events)]
    own[[Its own planner and builder<br/>stand down for this app]]
  end
  subgraph local[tkt, on the same machine]
    tkt[tkt]
    state[(.git/tkt/state)]
    herdr[herdr]
    wt[worktrunk]
    agent[[Claude Code or OpenCode<br/>running a lifecycle skill]]
    cfg[docs/agents/issue-tracker.md<br/>the tracker guide Self Evident fills]
  end
  gh[(GitHub<br/>branches, PRs)]
  lin[(Linear<br/>the client's issues, if it has them)]
  you -->|writes tickets, approves briefs, watches| ui --> engine --> db
  you -->|tkt start, approve, run review, merge| tkt
  tkt --> state
  tkt --> herdr --> agent
  tkt --> wt
  agent -->|reads| cfg
  agent -->|HTTP: load, search, comment, move| engine
  agent -->|push, PR, review, merge| gh
  engine -->|Linear integration, built: the connection check| lin
  engine -.->|Linear integration, not built: a mirror of each ticket,<br/>create, comment, move as the skills comment and move ours| lin
  engine -.->|tkt integration, built: the check<br/>PATH, checkout, guide, doctor| tkt

  classDef you fill:#fde68a,stroke:#b45309,color:#1f2937
  classDef se fill:#fbeee0,stroke:#c2620b,color:#1f2937
  classDef tkt fill:#bfdbfe,stroke:#1d4ed8,color:#1f2937
  classDef skill fill:#bbf7d0,stroke:#15803d,color:#1f2937
  classDef ext fill:#e5e7eb,stroke:#4b5563,color:#1f2937
  class you you
  class ui,engine,db,own se
  class tkt,state,herdr,wt,cfg tkt
  class agent skill
  class gh,lin ext
```

Self Evident is the tracker: tickets, briefs, approvals and the skills' comments live in its database, and the
skills reach them over plain HTTP through the guide Self Evident fills. tkt still owns the run, as in picture 2,
and nothing of it is copied into Self Evident. The two touch at exactly two points: the guide in the repo, and the
check on the app's tkt page. The only path to Linear is Self Evident's Linear integration: the connection check
today, the mirror of each ticket (create, comment, move) once built. No arrow runs from tkt or the skills to Linear:
the tracker file names Self Evident, and the skills use only the connection it names. tkt web would
still work here, reading our tickets the way the skills do; we are not using it.

## What owns what

| | Self Evident alone | tkt alone | Self Evident + tkt |
|---|---|---|---|
| Tickets live in | Self Evident's Postgres | the tracker named in `docs/agents/issue-tracker.md`: Linear, GitHub Issues, Kaneo, markdown files | Self Evident's Postgres, as the tracker |
| Who writes tickets | you, ideas becoming tasks, the talk agent | you in the tracker's own UI, or create-ticket from the chat | the same as alone, plus the skills' comments |
| Who moves a ticket's state | the planner and builder runs, the GitHub sync | the skills, never tkt | the skills, through our API |
| The run: worktree, tab, session, stage | the engine's build rows, runs and steps | tkt, in `.git/tkt/state` | tkt, in `.git/tkt/state` |
| Code and PRs | GitHub | the forge: GitHub, GitLab or Gitea | GitHub |
| The window | Self Evident's UI | tkt web, the terminal, the plan viewer | Self Evident's ticket page; tkt web optional |
| Linear, and what talks to it | Self Evident's Linear integration: the check is built, the mirror (create, comment, move) is not | Linear is the tracker: the skills reach it through its hosted MCP server, and Linear's GitHub integration attaches PRs by branch name; tkt never talks to it | only Self Evident's Linear integration, as a mirror of our tickets; the skills and tkt have no path to it |
