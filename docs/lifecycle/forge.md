<!-- rogs-skills config v1: forge -->
# Forge

Where this project's code is hosted and how the lifecycle skills push branches, open and review pull requests, wait for CI, and merge. Self Evident wrote it for the app {{FILL: the app's name}}: Set up what's missing under Integrations › tkt writes it again from the app and the repository, and leaves it alone once this line is gone.

## Forge

{{FILL: the "## Forge" section of the forge guide, with this project's values}}

Rules for every forge call:

- Name the host, repository and remote from this section explicitly; never rely on ambient CLI defaults or environment variables.
- Never open an editor, form, browser, pager or interactive prompt. Write long bodies to a temporary file outside the repository and pass the file.
- A failed query is not an empty result. Follow pagination until it ends.
- Read every write back.
- Never force-push, bypass branch protection, enable auto-merge, merge with administrator rights, or delete branches.
- Keep tokens out of commands, logs and replies.

## Operations

{{FILL: the "## Operations" section of the forge guide, adjusted to this project}}

## CI gate

- Gate checks: {{FILL: "every check reported for the head", or the named checks that must pass}}.
- Advisory checks: {{FILL: automated reviewers, documentation jobs and other checks that never count as the gate, or "none"}}. Their comments are review feedback; their status is not the gate.
- Path filters: {{FILL: the paths that make the gate checks run, or "none: every change runs them"}}. A head whose diff touches none of these paths legitimately reports no gate checks; treat that as a pass only after confirming it from the changed files, and say so wherever CI evidence would go.
- No CI: {{FILL: "not applicable", or "this repository has no CI; write 'no CI configured' wherever CI evidence would go"}}.
- Automation that moves the base branch: {{FILL: for example "a bot commits generated docs to the base after every merge", or "none"}}. Re-check that the base is an ancestor of the head immediately before every push.

## Pull requests

- Body format: {{FILL: "the template at <path> on the base branch" or "docs/agents/pull-request.md"}}.
- Every body contains `## Review brief`, `## Related work`, `## Attribution`, `## Validation` and `## Human verification`, plus `## Screenshots` when the browser pass is on and `## Changelog` when the changelog is on. When the template lacks one of these, add it to the body you write; never edit the template file.
- Title: `<lead id>[, <rider ids>]: <title>`, with every ticket id first so the tracker can link the pull request.
- Related work: one line per ticket, lead first, in this format: {{FILL: for example "`Ticket: [ACM-123](<ticket url>)`"}}.
- Closing keywords: never. Reference tickets plainly (`Refs ACM-123`); only `finish-ticket` completes tickets.
- Drafts: never, unless the user asks for one.
- Assignee: {{FILL: a login to assign every new pull request to, or "none"}}.

## Identity limits

{{FILL: what the account the skills run as cannot do, for example "it cannot approve or request changes on its own pull requests, so the verdicts the skills post are workflow evidence, not branch-protection approvals"}}
