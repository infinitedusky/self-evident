# Reviewable pull requests: where it stands and what is left

Written 2026-11-22, to start a fresh session. The detail behind every line is in [LOG.md](../LOG.md) (newest
entries last) and [SHAPE.md](../SHAPE.md), "A mock is a server plus data".

## The goal

A reviewer, or Sandy trying a prototype or smoke test, can run a task's change on made-up data with nothing real
exposed. The app's code is exactly what goes live; only environment variables point it at mocks. We are proving it
on one task, CEB-90, and its one outside service, SixtyFour.

## What exists

- **Services** (Settings › Mocks): name, real address, the environment variable to override, endpoints.
- **Endpoints** carry their own data. A real response stays on this computer; a faked version is made from it.
  An endpoint can be sensitive (the real response is never kept) and can be a next step of another (a download
  link).
- **A general mock server** serves any service straight from its endpoints. No server is written per service.
- **Source**, per place (prototype, smoke test, reviewer): the real service or the mock. A reviewer always gets
  the mock with faked data.
- **Fixtures**: the app's shared scenarios, listed on the Data step. An endpoint's faked data can be filled out
  for a fixture's people, and a task's smoke test is built from that fixture.
- **A `service` tool** lets any agent do what the Settings page does.

- **Files** (the second part of Fixtures, after Database): what a tester brings to a task. Each has a fake
  version and may have a real one; a prototype and a smoke test say which they use and are given them in a folder
  (`$TEST_FILES`) when they start; a reviewer gets the fake.

## How to work

- Look at the real page before and after changing it. Story tests only prove text exists.
- Design a page's hierarchy as a whole and get it approved as one story before building.
- Ask when an instruction has two readings. Do not build a guess.
- Confirm before building anything not asked for.

## What is left, in order

1. ~~Lay out the Data step properly.~~ Done 2026-11-22 (LOG.md).
   Was: It has grown by patches and has no consistent hierarchy. Decide the levels
   (page, section, service, part, row) with one text style each, show it as one story, then apply it. Outline
   agreed: Fixtures; Services (what the task needs; then each service with Info, Source, Endpoints).
2. ~~Fix two refusals that block CEB-90's fake~~ Done 2026-11-22, not yet proved on the real file. Was: (found by the task's agent):
   - A column named as text does not replace a cell holding a JSON object, so the results file cannot be faked.
   - Invented data is refused for fixed words the app needs (statuses, platform names), because it is checked
     without the words a fake was allowed to keep.
3. ~~Decide what a fixture is for the person.~~ Done 2026-11-22: a fixture is a set of tables, made from the
   app's seed command in a press on the Data step, opened to its rows, renamed and deleted; a prototype follows
   its task's fixture on its first start. CEB-90's app has one, "seed" (Meridian, 250 employees).
   Also now on the Data step: **Test files** (2026-11-23), what a person needs in their hands to try the change.
4. ~~Prove it on CEB-90.~~ Done 2026-11-23, on Sandy's word: a one-person file imported and scanned in the smoke
   test against the mock, findings stored and shown. That run answered the results call with the real response;
   the faked version has not been through a scan yet, so the review branch's first run is also its first proof.
   Was: as a reviewer would do it (LOG.md, "What the results file is, and what it is not"): a test file with one
   made-up person to import, and the mock's results file for that same person, tied by email.
5. ~~The review branch.~~ Done 2026-11-23 (LOG.md, "The review branch is made by the tool"): made and made again
   from the task's PR step, as `REVIEW-<branch>-<task id>`, with the pull request's Review section written from it.
   Was: the mock server, endpoints, faked data, fixture and the fake versions of the files on
   a `<branch>-review` branch with one start command.
6. ~~The data agent.~~ Built 2026-11-23 (LOG.md, "The data agent"), not yet run on a real task: one per task,
   asked by the task's agent, in three steps (list the calls, say where data comes from, build what was approved),
   each approved by the person on the Data step.
7. **The gate**: a task cannot go to Ready for review until its review copy can be made.
8. **Clean up when a task closes**: discard its prototypes and their databases, drop its smoke test database,
   delete its real responses and the real versions of its files from this computer.
9. **Close the data holes**: sharing a prototype that ever ran on real data needs a reset first; check a smoke
   test's evidence cannot reach a pull request after a run on real data; refuse to share a prototype on a
   database that is not its own; make the faker vary small numbers.

## Set aside, to build in its own right

- **A fixture grown from one or two examples** (Sandy, 2026-11-23): a new feature needs seeded data the app does
  not have, so the fixture's rows are filled in from an example or two before any prototype. A Fixtures feature,
  not a Services one. "Fill out for fixture people" on an endpoint was reaching for it in the wrong place.

- **Data scripts** (Sandy, 2026-11-23): custom logic for a test where mapping fields is not enough. A script is
  mapped onto one function of the app and stands in for it: a function override. The case that raised it: the app
  matches a results row to a person by an id; the override would match by email, for an app that had no such
  fallback of its own. The Data step holds a "Data scripts" section marked Coming soon.

- **The fixture's files in place of the browser's file dialog** (Sandy, 2026-11-23: "there's no way to run this
  as if it's being run from a mock file system?"). The app's Browse button opens the browser's own dialog, which a
  page cannot point anywhere. The engine's frame proxy already puts a script in every page of a prototype or smoke
  test; it can catch a file field being opened and show a chooser of the run's fixture files (File Context, Real
  badge), handing the one picked to the app as the dialog would, with "something else on this computer" falling
  through. Misses apps that use a newer file API. Only where the proxy is in front; whether a reviewer's set-up
  runs it is the review branch's question. Until then: "Show the folder" on the smoke test's page.

## Known test noise

`github.test.ts` (stacked PRs) fails on main. Some runner tests fail only in full runs. The stories "Compared With
What" and "All Apps Skills From A Repo" time out in full runs.
