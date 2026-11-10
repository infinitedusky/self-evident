<!-- rogs-skills:begin config v1 -->
## Ticket lifecycle

Tickets move through these skills, which hand off through status lines. None of them calls another; a person starts each stage. Their configuration lives in `docs/agents/`: `issue-tracker.md` ({{FILL: tracker and project in a few words}}), `forge.md` ({{FILL: forge and repository in a few words}}), `workflow.md` (verification, worktrees, and the features that are on: {{FILL: the features that are on, or "none"}}) and `domain.md`.

```
create-ticket       audit the code, then draft and create tickets
suggest-tickets     pick ready tickets that can run side by side
     |   the user creates a worktree: branch = directory name = lead ticket id
start-ticket        move to in-progress, investigate, plan  Status: AWAITING_APPROVAL
     |   the user approves the plan
work-ticket         implement, verify, pull request, exact-head CI, handoff
                                                            Status: READY_FOR_REVIEW
     |   a fresh session, never the implementer
review-pr           findings pinned to the exact head
                                    Verdict: CHANGES_REQUESTED | READY_FOR_HUMAN
     |   when changes were requested or the base moved
address-pr-review   verify, fix or push back, reply; at most two rounds
                                                            Status: READY_FOR_REVIEW
     |   a fresh session, after a clean review, when agent verification is on
verify-pr           run the human verification steps, post the evidence
                                       Verification: PASSED | FAILED | INCOMPLETE
     |   the user confirms the steps, from the evidence or by running them
finish-ticket       merge, verify, complete the tickets     Status: DONE
```

- The implementer never reviews its own change, the fixer never resolves review threads, the reviewer never writes to the tracker, and only `finish-ticket` merges.
- Every claim (CI is green, reviewed, verified) names the exact head SHA, and that head contains the current base. Only two things carry over to a later head, across clean merges of the base: a human verification step, as `finish-ticket` defines them, and browser-pass captures, as `browser-pass.md` allows.
- After a plan is approved, "go" or "do it" means `work-ticket`, never a generic implementation flow.
- When plan presentation is on, `present-plan` shows the settled plan after optional adversarial review. The user approves it in this conversation or with the viewer's Approve button on the current revision, which also means "go"; comments and ending the review never approve it.
- Self Evident wrote this configuration from the app's settings and the repository: Set up what's missing under Integrations › tkt writes it again.
<!-- rogs-skills:end -->
