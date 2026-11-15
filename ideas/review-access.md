---
title: A reviewer can run the pull request
app: Self Evident
lane: shaping
hypothesis: If a pull request comes with the way in (who may run it, the secrets, the commands for a fresh machine), a reviewer on another machine actually tries the change instead of reading the diff and approving.
measure: review_shared (a way in was made), review_opened (the one-time link was used), pr_merged with at least one check marked by someone other than the author.
baseline: None. Today "how to check" is a line of commands that assumes the author's machine (Sandy, 2026-11-15, on BON-50: "this isn't really clear to a reviewer. We have to assume they are on a different machine").
look_by:
prs: []
---
The rule under it: a reviewer comes in through the same door as the user. A site is opened, a library is
installed, an app is run. Secrets first (Sandy: "maybe we could just deal with the secrets first").

**Who reviews decides everything**, so it is a setting per app:

- **People I invite** (my repo). They start with nothing; the author owes them access, secrets and commands.
- **The repo's own team** (I contribute to someone else's repo). The maintainer already has the set-up. Nothing is
  shared, no key is made. The pull request says what to try in the commands their own contributing guide uses.

**People I invite, app with Doppler**

- Settings, once: the Doppler project, a review config (review-only keys, test data, nothing that hurts if it
  leaks), and the reviewers (name, email).
- On a task with a pull request: Share for review. Each reviewer picked gets their own read-only key for the review
  config, expiring in a week, behind a one-time link (Doppler Share), and the commands for a fresh machine: clone,
  check out the pull request, install, `doppler run`.
- Afterwards: who holds access and until when; End access revokes one person's key.
- One key per person, so one can be ended without cutting off the rest. A key shows that someone holds it, not who
  they are. Access tied to a person means a Doppler member: invited from Doppler's Team page (no endpoint found for
  inviting), a paid seat, and the Team plan to limit them to one environment.

**People I invite, app without Doppler**

- Settings, once: the names of the variables the app needs and what each is for. Never the values.
- Share for review gives a "How to run this" page: clone, install, an env file template with those names, the start
  command. The values reach the reviewer some other way.

**Either way, in the pull request**

- "How to try it", written for a machine that has nothing.
- Checks split in two when the plan is written: proven by the build (a command the agent ran, with its output), and
  for your eyes (a judgement, with an address to open). A reviewer is only handed the second kind.

**Checked, 2026-11-15**: Doppler's API makes and revokes read-only keys for one config with an expiry, and makes
one-time links. It limits by config, not by secret, hence a review config. A private repo also needs the reviewer
to be a collaborator on GitHub, which is its own registration.

**Later, not this**: hosting the pull request's version ourselves for things reached by a URL (previews), an
installable pre-release for libraries, test builds for phones. Open: how the message is sent (start with text to
paste), and whether an agent may propose an app requirement for the person to approve.
