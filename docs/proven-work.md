# Proven work: from test plan to production, with the evidence a reviewer can trust

From the Cloaked app, worked through on CEB-90 / ENT-322 (PR #488). Sandy, 2026-11-23. This replaces the separate requests about the gate, smoke tests, mutation testing and evidence written the same day: where they differ, this one holds.

## Why

In an age of AI, the signals reviewers used to trust mean nothing: every PR arrives with hundreds of tests and a green CI, and many of those tests check nothing. Worse than useless, they give false assurance. Evident's claim is that its work is *evident*: a reviewer can see that the change was tested well, try it themselves, know what to do at deploy, and later see that it works in production.

CEB-90 showed every gap:
- 186 new tests, and nothing proved any of them had ever been red. Mutation testing after the fact caught 82% of meaningful breaks and missed 39 (sort order, edge inputs, log counts).
- A criterion added after the build's check sat unmarked and looked like a failure; the Check step stayed done.
- An after-merge configuration item sat on the Smoke page beside the person's acceptance checks.
- The PR went out with a description written by hand three times, the review instructions lost once, and no way to see the evidence before it was public.
- The worst failure ENT-322 can have (production left on the old SixtyFour workflow: scans finish, nothing errors, findings silently never appear) is visible only in telemetry, and nothing in Evident looks after merge.

## The whole flow, in order

1. Prototype, approved.
2. **Test plan**, approved by the person.
3. **Test phase**: every test that can be written now, run red.
4. **Build sub-tasks**: each writes its deferred tests (red), then its code (green).
5. **Check step**: every criterion marked, or handed to the person.
6. **Smoke test**: the person tries the built code and accepts it. Before merge only.
7. **Pull request finalizing**: mutation testing, the trajectory, the review environment, the gate checks, the evidence drafted. Results wait for the person.
8. The person reviews the results: fixes and reruns, or **pushes and marks ready for review**.
9. Review, merge.
10. **Release checks** at deploy, by whoever deploys.
11. **Watch**: Evident reads production telemetry against the task's promises; the task is Done after a quiet window.

Build in the order of the sections below; each says what it needs first.

---

## 1. The Check step tells the truth (needs nothing; build first)

- **Three states, shown as three everywhere** (task pages, counts like "42 of 47", the merge guide): **met**, **failed**, **not checked yet**. "Not checked yet" is never shown as a failure.
- **The Check step is done only when** every acceptance criterion and every required-of-every-change item is marked (met or failed, with evidence) or handed to the person on the Smoke page. Anything else keeps it open.
- **Adding a criterion after the check** (by an agent or the person) reopens the Check step and marks it not checked yet. Changing a criterion's statement or check does the same for that criterion. Changing the PR description does it for the required items judged from it (Test plan, Risks).
- **Run the check again**: a button on the Check step and a tool for the task's agent. It checks only what isn't checked yet, on the current head, with the same rules and evidence as the build's check, and either marks each item or hands it to the Smoke page when only a person can show it.

Done when: adding a criterion to a built task reopens its Check step with that criterion "not checked yet"; "Run the check" marks it from the tests on the head; the step closes again; the counts never show it as a failure meanwhile.

## 2. Three kinds of check: smoke, release, watch (needs 1)

- **Smoke (before merge):** what the person checks on the built code to accept it (a live run, how a screen looks, the PR's text). Only these are on the Smoke page. **Accepting the smoke test starts the Pull request finalizing (section 4).**
- **Release (at deploy):** what must be true for it to go live and can only be done there: configuration in each environment, monitors applied, a migration run. Never on the Smoke page, never holding the smoke test. Written into the PR's Merge Danger as deploy steps, in order, and listed on the task as owed by whoever deploys.
- **Watch (after deploy):** production health. Built and tested like any code; the release checks say to apply it; section 5 reads it.
- The planner tags each criterion smoke, release or watch when it writes it; the person can change it.

Done when: CEB-90's "SIXTYFOUR_WORKFLOW_ID is set in each environment" is a release check (in Merge Danger, not on the Smoke page), and accepting CEB-90's smoke test starts its finalizing.

## 3. Test-first builds: plan, red, green (needs 1)

The model is InDusk's Test Trajectory. Read `~/code/indusk/apps/docs/src/guide/test-trajectory.md` and `test-levels.md` first: it has the trajectory table, a test phase first, the deferral register, regression guards, real red versus fake red, and gates. The build stops being one run and becomes sub-tasks.

**The test plan (a step the person approves, after the prototype):** a **Test Trajectory**, one table of every test the build commits to:
- **ID**; **Asserts** (what it proves, in words a reviewer reads); **Level** (unit, integration against the real database, component, browser, contract, live check); **Criterion** (which acceptance criterion it proves); **Writable at** (the sub-task it can be written in); **Passes at** (the sub-task it turns green); **State**.
- **Every acceptance criterion** names its tests, or says how else it's proven (smoke, release, watch).
- **The deferral register:** each test that can't be red in the test phase, with why and the sub-task it becomes writable in. It should carry the test's code, commented, so a reader can check the promise.
- **Regression guards:** tests green the moment they're written (they pin existing behaviour), each declared with why: a guard and a rubber stamp look identical.
- **Write as many tests up front as possible**; a test that isn't written up front must give a reason.
- Prefer the smallest level that proves it, and write early tests against boundaries (an HTTP call, a query, a CLI) so they can fail on a real assertion.

**The test phase (the first sub-task):** writes every test that's writable now and runs them. The engine records each run:
- **Real red** (it ran, an assertion failed): required.
- **Fake red** (it failed to load, e.g. importing something not built yet): refused; the test goes to the register.
- **Green on first run:** refused unless the plan declares it a regression guard.

**Build sub-tasks, one slice each, in Writable-at order:** each writes the tests that become writable at it and records their real red, writes the code, and records green for every row due to pass there. The next sub-task waits until this one's rows are green.

**The engine enforces it from its own runs, not the builder's word:** a row never seen red, never written, or due green and not, blocks the Check step; a test in the diff that isn't in the trajectory is flagged (added with its row, or explained). Changing the trajectory after approval asks the person again.

Done when: a new task, after its prototype, opens a Test plan step; the build runs as a test phase then slices; each row shows its red and green runs; an import-only failure is refused as fake red; a first-run green is refused unless declared a guard.

## 4. The Pull request step finalizes; the person decides (needs 2 and 3)

**Accepting the smoke test starts the finalizing.** Nothing is pushed or marked ready by it. Each step shows live on the task's Pull request page:
1. **The trajectory holds:** every row seen really red then green; nothing unwritten; nothing due green that isn't.
2. **Mutation testing** on only the lines the PR changed, against the tests that cover them (Python: mutmut or a small AST mutator; TypeScript: Stryker). Equivalent mutants (a frozen-dataclass flag, a value already returned, a limit nudged off its boundary) are left out of the score and listed apart. Every surviving mutant is named: file, line, what changed, what it means in words.
3. **The review environment** (the review branch, built already) rebuilt on the head and its checks run.
4. **The gate checks:** GitHub's checks green; the app's held commands pass on the head; the title fits the app's rule and carries the team ticket; the description follows the app's form with every section filled and nothing of ours above the fold; the rollback agrees with the blast radius (a one-way door is never called revertable); the person's smoke checks done.
5. **The Evidence section drafted** from what was measured:
   - **Tests by level** written by this PR, all passing (e.g. 41 unit, 33 integration, 99 component, 13 browser).
   - **Red before green:** N of N rows seen red then green, with the sub-task for each; exceptions named.
   - **Criteria to tests:** each criterion with its tests, or how else it's proven.
   - **Deferrals and regression guards**, with reasons.
   - **Mutation:** "of 220 meaningful breaks to the changed code, the tests catch 205 (93%)", then each survivor and its fix or explanation.
   - **The whole suite** (e.g. 5,910 backend, 6,791 frontend) only as "nothing else broke", never the headline.
   The rest of the description is left as the person or agent wrote it.

**Then the results wait for the person:**
- **Go back and change things:** each survivor, failing check or gap has "Fix this", which adds a sub-task (a test to write, code to change). When it lands, the finalizing runs again and the results update.
- **Accept a survivor** with a reason, which goes into the evidence.
- **Push and mark ready for review:** a separate button, enabled only when the gate checks pass. It sends the title, the description with the evidence, and the review branch, then marks the PR ready.

**After it's ready:** a push runs the finalizing again; its results wait on the page; **Update pull request** (a button on an open PR) sends them through the same gate. Edits made on GitHub directly are read back before an update, never overwritten silently.

**Where it runs:** in Evident on this computer, never in the team's CI. A team that wants it in their CI adopts an exported workflow deliberately.

Done when: accepting CEB-90's smoke test runs the finalizing; the page shows mutation survivors with their meaning and the drafted evidence; "Fix this" adds a sub-task and the results update after it lands; nothing reaches GitHub until "Push and mark ready".

## 5. Watch: telemetry testing after a task ships, in Observe (needs 2; build last)

**Watch promises, written with the task** (the planner drafts them from the telemetry criteria and the blast radius; the person approves them with the test plan). Each is a query the engine runs against the app's telemetry, with what passes:
- **It happens:** an event the change emits appears (ENT-322: `sixtyfour.person_findings.decoded` in production within a day of a scan).
- **It's right:** a measure holds (ENT-322: the findings columns present on 100% of decoded rows; skipped items under 10% of found).
- **Nothing got worse:** a measure stays within its pre-deploy baseline (ENT-322: `GET /employees` p95; the `process_workflow_results.row_failed` rate).
- **No monitor this task added is alerting.**
- **"No data" is a failure, never a pass:** a promised event that never appears is exactly the silent case.

**After deploy:** Evident learns the merge commit is live in an environment (a deploy event from the integration, or the person saying so) and starts a watch window (default 7 days in production, per task). It runs each promise on a schedule through the telemetry integrations (Datadog read-only; PostHog for product events) and keeps the results. The task shows **Watching** on its page and on Observe: each promise green, red or no data, with its query, latest value, baseline and a link. **When every promise holds for the window, the task is Done**, not before.

**When a promise fails:** Observe shows it as a report on that task: which promise, since when, the evidence (values and sample log lines, counts only, never personal data), and the likely cause from the task's blast radius and Merge Danger (ENT-322: "check SIXTYFOUR_WORKFLOW_ID against 3d50b61e"). A release check owed and not done shows the same way, since it's usually the cause. The person, or the task's agent asked, turns it into a fix-forward task linked to the original, or changes the promise with a reason.

**Rules:** read-only keys; Evident never changes monitors or dashboards; promises and results carry counts and states only; a task that can't be watched says so in its test plan, with why.

Done when: CEB-90 carries its watch promises; once #488 is live it shows Watching with each promise's state from Datadog; leaving production on the old workflow turns "findings columns present" red within the day, names the cause and offers a fix-forward task; seven quiet days later CEB-90 is Done.

---

## Not in this

- Small flagged PRs, `deployment:block` / `deployment:safe` markers and merge queues (waiting on the team's answer about which flags the dashboard uses).
- Rewriting the tests of already merged work; mutation testing of code a build didn't change.
- Changing monitors, dashboards or alert routing in the team's telemetry.
- Test plans for to-dos (no code).
