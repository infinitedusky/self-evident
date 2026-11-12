# Running Self Evident on a computer

How Self Evident is set up on a computer, how to move between computers, and what to do when it doesn't start. For
the person who runs it and for an agent asked to help with it. The decisions behind each part are in
[LOG.md](../LOG.md) under the headings named here; this page is how things are now.

## What runs

| Part | Where | Started by |
| --- | --- | --- |
| The engine | `http://localhost:4000` (API under `/api`) | `pnpm dev` |
| The page | `http://localhost:5180` (sends `/api` on to the engine) | `pnpm dev` |
| The database | Postgres: a container on this computer, or one shared database elsewhere | see below |

`pnpm dev` at the repository root starts the engine and the page with live reload. The engine applies database
migrations when it starts. `GET /api/health` answers `{"ok":true}` when the engine can reach its database.

A computer runs Self Evident in one of two ways. They differ only in where the database is.

## Way 1: its own database (the default)

```bash
pnpm install
pnpm dev
```

With no `DATABASE_URL` set, `pnpm dev` starts a Postgres container that belongs to this checkout
(`docker compose`, `localhost:5433`) and uses it. This needs Docker or OrbStack running. Everything (apps, tasks,
conversations) stays on this computer, and no other computer sees it. Nothing else on this page is needed:
no Doppler, no proxy, no `leave` or `arrive`.

Use this for work that must stay on one computer, such as an employer's or a client's code.

## Way 2: a shared database

One database on a server, reached from each computer, so the same apps and tasks are there wherever you sit
(LOG.md, "The database moves to Fly"). Settings come from Doppler, project `self-evident`, config `dev`:

| Setting | What it is |
| --- | --- |
| `DATABASE_URL` | The shared database, through a local proxy: `postgres://…@localhost:15432/selfevident`. Secret. |
| `FLY_DB_APP` | The Fly Postgres app the proxy connects to. |
| `STATE_REPO` | A private git repository the conversations' histories travel through. |
| `UI_URL` | The page's address as people open it. |
| `STORYBOOK_FRAME` | The address pattern an app's Storybook is framed at. |
| `LINEAR_API_KEY` | For the Linear integration: a personal API key (Linear › Settings › Account › Security & access). Read access is enough to bring tickets in as tasks. An app can name another variable (Integrations › Linear › Key variable), for a second Linear workspace. Secret. |

Two launchd agents keep it running, both written by `pnpm arrive` and holding no secrets:

- `com.thedusky.self-evident-dbproxy` runs `fly proxy` to the database. Log: `~/Library/Logs/self-evident-dbproxy.log`.
- `com.thedusky.self-evident` runs `doppler run -- pnpm dev` in the main checkout. Log: `~/Library/Logs/self-evident.log`.

Restart the engine: `launchctl kickstart -k gui/$(id -u)/com.thedusky.self-evident`. Never start `pnpm dev` by hand
while that agent runs: the ports are taken.

**One engine at a time.** Two engines on one database would both schedule and build. The state repository records
which computer holds the engine, and `pnpm arrive` refuses while another one does.

## Which way is this computer using?

- `launchctl print gui/$(id -u)/com.thedusky.self-evident` succeeds: way 2, kept running by launchd.
- `pnpm dev` was started in a terminal with no `DATABASE_URL`: way 1. Its first lines start the Postgres container.
- The engine's log says, at start, `this computer: <name>, user <user>, root <folder>`.
- `pnpm handoff check` (way 2 only) lists the registered computers, which one holds the engine, and each open
  conversation's branch.

## Moving between computers (way 2)

```bash
pnpm leave          # on the computer you are leaving
pnpm arrive         # on the one you sit down at
pnpm handoff check  # what leaving would send; changes nothing
```

(LOG.md, "Moving between Macs is two commands".) What travels, and how:

| What | Through |
| --- | --- |
| Tasks, briefs, conversations' messages, events | The shared database; nothing to move |
| Settings and secrets | Doppler |
| Work in each open conversation's worktree | The app's own GitHub repository |
| Each conversation's history (what the agent resumes from) and each checkout's Claude Code memory | The state repository, cloned at `~/.self-evident/state` |

`pnpm leave` refuses while an agent is working (`--force` to leave anyway). It stops the engine, commits anything
uncommitted in each open conversation's worktree as "Handoff: work in progress, from <computer>", pushes each
branch, sends the histories, and lets go of the engine. `--except <branch…>` leaves branches on this computer.

`pnpm arrive` pulls and installs Self Evident, clones each app's checkout if it is missing or fetches it, makes
each conversation's worktree again from its branch, brings the histories in, writes the two launchd agents and
starts the engine. `--force` takes the engine from a computer that is gone.

Never moved: an app with no GitHub repository given (nothing is pushed or fetched for it), and a main checkout's
own uncommitted or unpushed work (reported, never committed for you).

## Computers and paths

(LOG.md, "A computer registers its root".) Each computer registers its name, user and root folder in the
`machine` table when its engine starts. The root is the home folder, or `MACHINE_ROOT`.

The database stores a path under the root as `~/…` (`~/code/sandbox/ragdoll-golf`), and each computer puts its own
root back when it reads. So two computers need **the same folder layout under the root, not the same user name**.
The engine's code and its API show full paths; a raw SQL query shows `~/…`.

Not rewritten: paths a person typed into a setting (a test command that names a folder), and paths inside old
messages and events.

## A new computer

1. Install: mise, pnpm, `gh`, Claude Code, and Docker or OrbStack. For way 2 also `fly` and `doppler`.
2. Sign in: `gh auth login` then `gh auth setup-git`, and `claude`. For way 2 also `fly auth login` and `doppler login`.
3. Clone to the same place under the home folder as on the other computers:
   `git clone https://github.com/infinitedusky/self-evident.git ~/code/sandbox/idea-factory`
4. In that folder: `mise trust && mise install`.
5. Way 1: `pnpm install && pnpm dev`, then open `http://localhost:5180`. Way 2: `pnpm arrive`.

The name `https://idea.dawn` and an app's Storybook shown inside the page need Caddy and dnsmasq, which none of
this sets up. Without them, use `http://localhost:5180`.

## Adding an app

Settings › + App. An app is one repository, or several that are worked on together ("A product in two
repositories", below).

| Field | What to put |
| --- | --- |
| Name | Anything; it is the label in the tabs. It need not match the repository's name. |
| Default branch | The branch work is cut from, usually `main`. |
| Local checkout | The folder the repository is cloned in on this computer. A folder that isn't a repository yet becomes one. |
| GitHub repo | `owner/name`, never a clone address. Optional. |

Self Evident's git commands (fetch, worktrees, commits, pushes) run in the checkout and use the remote it was
cloned with, whatever account that is. The GitHub repo field adds what goes through the `gh` tool: opening pull
requests, reading reviews and checks, and the sync every two minutes. Those use the account `gh` is signed in as.
Leave the field empty and everything stays local; you push by hand.

## Two GitHub accounts on one computer

`gh` has one active account at a time, so the second account's repositories are cloned over SSH with their own
key and a host alias:

```
# ~/.ssh/config
Host github-second
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519_second
  IdentitiesOnly yes
```

```bash
git clone git@github-second:OWNER/REPO.git
git -C REPO config user.email "the address that account's commits carry"
ssh-add --apple-use-keychain ~/.ssh/id_ed25519_second   # a key with a passphrase: the engine cannot type it
```

Git in that checkout then uses the second account without any switching. For Self Evident to open pull requests
there too, `gh` must be signed in as that account and active (`gh auth login`, `gh auth switch -u <account>`);
with the GitHub repo field filled and `gh` on the other account, the sync and pull requests for that app fail.

## A product in two repositories

(LOG.md, "The workbench".) Two ways, by whether the work crosses them:

**One app with both repositories**, when a ticket can touch either or both. A conversation gets a worktree in
each, on the same branch, and opens a pull request in each one it changed. One is home: the folder the agent
starts in, and where the app's Storybook, test command and prototypes run.

Settings › the app › Repo › Repositories: Choose folder… opens the folder dialog on this computer. Pick the folder
the checkouts are in (or one checkout); the repositories found there are listed, each with the GitHub name its
origin remote gives, and ticking one adds it. With more than one, pick which is home; Remove takes one out of the
app and leaves its folder alone. Save applies it. The dialog is the Mac's; elsewhere, "Add one by hand".

So far only
conversations work across the repositories; the planner, the builder, a task's own agent, checks, prototypes,
Storybook and catching up from main work in home only.

**Two apps, each a reference of the other**, when one is only read while building in the other: Settings › the
app › Repo › Reference apps, tick the other app and say what it is ("the backend this app calls"). Each app keeps
its own tasks, worktrees and pull requests. Every agent of an app can read its references' checkouts and is told
what they are; an edit to a file there is refused. It reads whatever is checked out in the other app's main
checkout, normally the default branch.

## When something goes wrong

| What you see | Why | What to do |
| --- | --- | --- |
| `pnpm arrive`: `Repository not found` cloning the state repository | git isn't signed in as the account that owns it; GitHub answers "not found" for a private repository it won't show you | `gh auth status`; `gh auth switch -u <account>` or `gh auth login`; then `gh auth setup-git` |
| `pnpm arrive`: `<computer> still holds the engine` | The other computer never left | `pnpm leave` there. If it is gone: `pnpm arrive --force` |
| `pnpm leave`: `An agent is working` | Leaving stops the engine and cuts the agent off | Wait for it, or `pnpm leave --force` |
| `the database's proxy isn't answering` | `fly proxy` isn't up | `fly auth whoami`; read `~/Library/Logs/self-evident-dbproxy.log` |
| Log repeats `waiting for the database` | Way 1: Docker or OrbStack isn't running. Way 2: the proxy is down | Start Docker, or see the row above |
| Log: `EADDRINUSE :::4000` | Another engine already has the port, often a `pnpm dev` left in a terminal | `lsof -nP -iTCP:4000 -sTCP:LISTEN`, stop that one |
| Log: `lost the database's event connection … connecting again` | The connection dropped; the engine reconnects by itself | Nothing, unless it never says it is back |
| The page loads but lists no apps right after a restart | It asked before the engine was up | Reload the page |
| Pull requests or the GitHub sync fail for one app | `gh` is signed in as an account that can't see that repository | See "Two GitHub accounts", or empty the app's GitHub repo field |
| A reference app shows "no checkout set" | That app has no local checkout on this computer | Clone it and set its Local checkout |
| Background fetches hang for a repository cloned over SSH | Its key has a passphrase the engine can't type | `ssh-add --apple-use-keychain <key>` |
| The engine's tests fail to connect | They use their own database on the local container, whichever way the engine runs | Start Docker or OrbStack; `pnpm --filter @self-evident/engine db:up` |

## Known limits

- Way 2 runs one engine at a time. Assigning each app to a computer, so several can run at once, is not built.
- One page shows one database. Seeing a local and a shared one side by side is not built.
- Resuming a conversation on a computer with a different user is untried: its history arrives in the right
  place, but its earlier turns mention the first computer's paths.
- `pnpm arrive` does not install an app's own dependencies, and does not carry the global Claude Code set-up in
  `~/.claude` (instructions, skills, settings).
- A shell command that writes into a reference app's folder is not refused by path; file edits are.
