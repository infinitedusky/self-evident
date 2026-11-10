<!-- rogs-skills config v1: workflow -->
# Workflow

How this project runs the ticket lifecycle. Self Evident wrote it for the app {{FILL: the app's name}}: Set up what's missing under Integrations › tkt writes it again from the app and the repository, and leaves it alone once this line is gone.

## Features

| Feature | State |
|---|---|
| Bundles | {{FILL: on or off}} |
| Browser pass | {{FILL: on or off}} |
| Model routing | {{FILL: on or off}} |
| Client notes | {{FILL: on or off}} |
| Plan review | {{FILL: on or off}} |
| Plan presentation | {{FILL: on or off; missing in older configurations means off}} |
| Taste pass | {{FILL: on or off; missing in older configurations means off}} |
| Changelog | {{FILL: on or off; missing in older configurations means off}} |
| Agent verification | {{FILL: on or off; missing in older configurations means off}} |
| Autonomous runs | {{FILL: on or off; missing in older configurations means off}} |
| CI review | {{FILL: on or off; missing in older configurations means off}} |

## Worktrees

Every ticket or bundle is worked in its own git worktree whose branch name and directory name both equal the lead ticket id exactly: branch `ACM-42` checked out in a directory named `ACM-42`. The lifecycle skills check this before anything else and stop when it fails. They never create, switch or repair a worktree. The user creates worktrees, from a base branch that already contains `docs/agents/`.

Usual location: {{FILL: for example "~/code/worktrees/<repository>/<ticket id>", or "anywhere"}}.

## Verification

| What | Command |
|---|---|
| Format | {{FILL: the command, or "not configured"}} |
| Full check | {{FILL: the command, or "not configured"}} |

Focused checks:

| Paths | Command |
|---|---|
| {{FILL: a glob}} | {{FILL: the command that checks that area}} |

Test-first areas: {{FILL: the paths where behavior changes start with a failing test, or "everywhere", or "none"}}.

Hooks: {{FILL: for example "a pre-commit hook runs the focused checks of every touched area; a failing hook aborts the commit", or "none"}}. Never bypass a hook, and never pipe `git commit` through another command: the pipe hides the hook's exit status. Confirm every commit with `git log`.

Notes: {{FILL: environment notes, such as services a check needs, or "none"}}.

## Commits

- Each commit is one coherent change with its tests, staged by explicit path.
- No amending, no AI attribution, and no co-author trailers, unless this section says otherwise.
- Documentation that belongs to a change, such as an ADR for a new decision, goes in the same commit.
- Never committed: {{FILL: paths that stay out of git beyond .gitignore, or "nothing beyond .gitignore"}}.
- Message style: {{FILL: "follow recent history", or the project's documented convention}}.

## Sync

A branch takes the base by merging it: `git pull --no-edit <remote> <base>`, with the remote and base from `forge.md`. Never rebase a published branch and never force-push. Immediately before every push, fetch and require `<remote>/<base>` to be an ancestor of `HEAD`; when it is not, merge again first.

Notes: {{FILL: project-specific sync notes, such as a step to rerun after dependencies change, or "none"}}.

## Project rules

- Rule files: {{FILL: each area or glob with the rule file to read before planning, implementing or reviewing work there, or "none"}}.
- Reference implementations: {{FILL: path, pinned version and terms of use (for example "borrow mechanisms, never code; never pull or reset the clone"), or "none"}}.
- Data boundaries: {{FILL: data that must never enter prompts, logs, captures, fixtures or commits, or "none"}}.

## Review

- Invariants: {{FILL: the project's hard rules a review checks first, such as tenant isolation, personal data, read-only queries or provenance, or "none beyond the defaults"}}.
- House standards: {{FILL: review opinions specific to this project, or "none"}}.
- Focused reproduction: {{FILL: how to run one test, check an installed dependency's version, and find a dependency's source}}.

## Human verification

Every pull request and handoff carries one concrete human verification procedure. It contains:

- The environment and exact setup commands: for a user interface, the browser, dev server, account and test data; otherwise the exact API calls, commands, database queries or log inspections.
- Numbered actions that name the exact URL or page, navigation, control, input or command, and any wait condition.
- The observable expected result of every action, including at least one negative or regression check when the change can affect existing behavior.
- Cleanup that restores settings or removes test data.
- The environments or surfaces the procedure cannot verify.

Generic steps ("open the app and verify it works") fail this standard, and so do manual repeats of assertions that automation already proves. A change with no user-visible surface keeps the section, says why, and gives the closest exact check through an API, logs, a database or a CLI. The agent that writes the procedure never claims to have run it. When agent verification is on, `verify-pr` runs the steps in a fresh session after a clean review and posts what it saw as agent evidence; the user still confirms each step, from that evidence or by running it. When CI review is on, the procedure that counts after the CI reviewer's CLEAR is the one in the pull request body.
