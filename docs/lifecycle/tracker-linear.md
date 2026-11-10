# Tracker guide: Linear

## Setup notes

For setup-rogs only; this section is not copied into the project. Linear through its hosted MCP server, with one server per Linear workspace.

- Detect: ticket ids such as `ACM-123` in branch names, commit messages and pull request titles; `linear.app/<workspace>/issue/` links in docs, templates or commits; an MCP server entry for `https://mcp.linear.app/mcp` in a harness config; Linear tools such as `save_issue` and `list_issue_statuses` in the session.
- Connection check: ask which MCP server belongs to this project (for example `linear-acme`), then call that server's `get_team` with `query: "<team key>"` (`list_teams` shows the teams it can see when the key is not known yet). Success returns the team's name, key and id. Failure is one of: the server's tools are missing from the session (not connected, or not signed in), an authentication error, or no such team (the server belongs to another workspace). Several Linear servers can be connected at once, one per workspace; check the one the user named. To add it, the user puts a remote MCP server with the URL `https://mcp.linear.app/mcp` in their own harness config and signs in; the `https://mcp.linear.app/mcp/readonly` endpoint cannot write. Setup records only the server name.
- Discover: run the calls in `metadata`. `get_team` gives the team's name, key and id. The workspace URL slug is the path segment after `linear.app/` in the `url` of any issue (`list_issues` with `team` and `limit: 1`).
- States: every Linear state has a type. The usual map: new is the `backlog` state (`Backlog`), or `Triage` when the team triages; ready is the `unstarted` state (`Todo`); in-progress and in-review are `started` states (`In Progress`, `In Review`); done is the `completed` state (`Done`); canceled is the `canceled` state (`Canceled`); blocked is a custom state when the team has one, otherwise none. `Duplicate` is a canceled-type state: list it among the terminal states.
- Automation: Linear's Git integrations link a pull request that names an issue's identifier in its branch, title or description, and team settings can move the issue when that pull request opens, asks for review or merges. The lifecycle names every branch and pull request after its tickets, so these rules fire: ask the user which are on and record each under Automation, or "none" once the user confirms.
- Priority: `priority` is a number: 1 Urgent, 2 High, 3 Medium, 4 Low, and 0 for none. Map P0 to `1 (Urgent)`, P1 to `2 (High)`, P2 to `3 (Medium)` and P3 to `4 (Low)`.
- Bundles: `relatedTo`, unless the pair already has `blocks` or `blockedBy`.
- Gaps: none of the contract's gap rules apply. `attach` names the URL to link, because the one Linear returns expires.
- Verify on first use: the response field that carries the next-page cursor; whether `list_issue_labels` with `team` also returns workspace labels (list without `team` when a label the project uses is missing); whether `get_issue` relations carry each related issue's state; whether `save_issue` replaces or refuses a second relation on a pair that already has one.

## Tracker

- Kind: Linear
- Connection: the MCP server `{{FILL: MCP server name, for example linear-acme}}`. Harnesses prefix each tool with its server's name (`mcp__<server>__<tool>` in Claude Code, `<server>_<tool>` in OpenCode); the operations below give bare tool names. Call only this server's tools: another Linear server in the session belongs to another workspace.
- Workspace: {{FILL: workspace name}}, URL slug `{{FILL: workspace URL slug}}`
- Team: {{FILL: team name}}, key `{{FILL: team key}}`, id `{{FILL: team id}}`
- Projects: {{FILL: the Linear projects this repository's tickets use, each with its id, or "none"}}
- Ticket ids: `{{FILL: team key}}-<number>`, matched by `^{{FILL: team key}}-[1-9][0-9]*$`. Linear assigns the number when it creates the issue.
- Ticket URLs: `https://linear.app/{{FILL: workspace URL slug}}/issue/<ticket id>`. Linear also serves the URL with a title slug after the id.
- Markdown fields (`description`, `body`, `text`) take real line breaks, never the two characters `\n`.
- Linear turns ticket ids inside descriptions and comments into links to the issue. When reading a `Blocked by:` or `Delivers with:` line, take the id inside each link.

## Operations

Angle brackets mark values: identity values come from `## Tracker`, the rest from earlier calls.

### resolve

Take the id from a URL (the segment after `/issue/`), or put the team key in front of a bare number, and write it in upper case. Call `get_issue` with `id: "<ticket id>"`. Require the returned identifier to equal the id asked for and the team to be `<team name>`; otherwise stop and report what came back (an issue moved to another team gets a new identifier). Keep the returned `id`, a UUID, beside the identifier, and pass the UUID wherever a tool asks for `issueId` or `issue`.

Capability: Supported

### load

1. `get_issue` with `id: "<ticket id>"` and `includeRelations: true` returns the title, description, state, labels, priority, assignee, project, parent, attachments, and the `blocks`, `blockedBy` and `relatedTo` relations.
2. Call `get_issue` on each related issue for its state.
3. `list_comments` with `issueId: "<uuid>"` and `limit: 250`; pass the cursor each response returns as `cursor` until a response returns none. The list holds thread roots, their replies, and inline comments on the description (those with a non-null `quotedText`).

Capability: Supported

### search

`list_issues` with `team: "<team id>"`, `query: "<terms>"` (it matches titles and descriptions), `includeArchived: true` and `limit: 250`, following the cursor to the end. Leave out `state`, so open, completed, canceled and archived issues all come back. Make one call per set of terms.

Capability: Supported

### list-in-flight

`list_issues` with `team: "<team id>"`, `state: "<in-progress state name>"`, `includeArchived: false` and `limit: 250`, following the cursor to the end; then the same call with the in-review state name.

Capability: Supported

### list-ready

`list_issues` with `team: "<team id>"`, `state: "<new state name>"`, `includeArchived: false` and `limit: 250`, following the cursor to the end; then the same call with the ready state name, when `## States` maps one.

Capability: Supported

### metadata

- States: `list_issue_statuses` with `team: "<team id>"`.
- Labels: `list_issue_labels` with `team: "<team id>"`, every page.
- Members: `list_users` with `team: "<team id>"`, every page. A member's `id` is what `assignee` takes.
- Projects: `list_projects` with `team: "<team id>"` and `limit: 50` (the most this tool allows), every page.
- The connected user: `get_user` with `query: "me"`.

Capability: Supported

### create

`save_issue` without `id`, with `team: "<team id>"`, `title`, `description`, `state: "<new state name>"`, `priority` (a number) and `labels` (an array of label ids or exact names: the whole set), plus `assignee` (a user id) and `project` (a project id) when the conventions call for them, and `parentId` for a sub-issue. Relations that need another new ticket's id wait for `relate`. Read the new issue back with `get_issue` and record its identifier and URL.

Capability: Supported

### update

`save_issue` with `id: "<ticket id>"` and only the fields that change. Omitted fields keep their values; `null` clears `assignee`, `project`, `parentId` and `dueDate`.

- `labels` replaces the whole set: read the current labels, then send every label the ticket keeps plus the new ones.
- `description` replaces the whole text. For a targeted change, such as adding one line, send `patch` instead: an array of 1 to 50 edits applied together, where each anchor matches the current text exactly once and one failing edit cancels the save. Edits: `{op: "replace", old_string, new_string}` (an empty `new_string` deletes), `{op: "insert_after", anchor, text}`, `{op: "insert_before", anchor, text}`, `{op: "append", text}` and `{op: "prepend", text}`. Put the blank lines that separate new text from its neighbors inside `text`.
- Read the ticket back with `get_issue`.

Capability: Supported

### relate

`save_issue` with `id` set to one ticket of the pair:

- Blocked by: `blockedBy: ["<blocker id>"]` on the blocked ticket.
- Related: `relatedTo: ["<other id>"]`.
- Parent: `parentId: "<parent id>"` on the child; `null` removes it.

`blockedBy`, `blocks` and `relatedTo` add to the existing relations and never remove one; `removeBlockedBy`, `removeBlocks` and `removeRelatedTo` remove. Linear keeps one relation per pair of issues, so read the pair first (`get_issue` with `includeRelations: true`) and add a relation only to a pair that has none. Read both tickets back the same way.

Capability: Supported

### comment

1. List the comments as `load` does and find the thread root whose body's first line is the heading, for example `## Implementation handoff`; when several match, take the newest.
2. Found: `save_comment` with `id: "<comment id>"` and the complete new `body`; the edit replaces the whole body. When Linear refuses the edit, for example because another user wrote the comment, post a new comment under the same heading whose second line names the date of the comment it supersedes.
3. Not found: `save_comment` with `issueId: "<uuid>"` and `body`. A reply inside an existing thread takes `parentId: "<root comment id>"` in place of `issueId`.
4. Read the comment back with `list_comments`.

Capability: Supported

### transition

`save_issue` with `id: "<ticket id>"` and `state: "<state name mapped to the role>"`. Read back with `get_issue`: its state name must equal the name written.

Capability: Supported

### attach

Upload one file at a time, finishing each before preparing the next:

1. Reuse: when `get_issue` lists an attachment with this title and the current head's short SHA as its subtitle, use it.
2. `prepare_attachment_upload` with `issue: "<uuid>"`, `filename`, `contentType` (the MIME type), `size` (the exact byte count from `wc -c < <file>`, never an estimate), `title` (what the file proves, such as the acceptance criterion) and `subtitle` (the short head SHA).
3. Within 60 seconds, PUT the raw bytes to the URL in the returned `uploadRequest`, sending every header it lists verbatim: `curl --fail -X PUT -H '<name>: <value>' --data-binary @<file> '<upload URL>'`, with one `-H` per header. Send the file itself, never base64.
4. `create_attachment_from_upload` with `issue: "<uuid>"`, the `assetUrl` from step 2, `title` and `subtitle`.
5. Read back with `get_issue`: the attachment is listed with its title.

`create_attachment` is deprecated; use the steps above. The URL Linear gives for an attachment is signed and expires within minutes, so it never goes into a comment, description or pull request. Where a link is needed, use the forge's permanent URL for the same file; when the forge has none, name the attachment by its title and link the ticket.

Capability: Supported
