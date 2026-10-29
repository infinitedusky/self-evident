# Idea factory — log

Where things stand, newest first. Read with [SHAPE.md](SHAPE.md) (what we are
building) and `research/` (comps, method, salvage).

## 2026-10-20 — started

### How we got here

Sandy had spent weeks building InDusk (`~/code/sandbox/dusk`), a development
system with plans, briefs, phases, gates, plan reviews and rituals around
Claude Code. On 2026-10-20 it became clear the process had grown faster than
its reliability: plan reviews re-reading their own fixes, a one-line promise
change dragging a finished plan back to the brief stage, UI buttons the server
then refused, sessions deciding from documents that missed what was agreed in
chat. Sandy questioned the whole thing and decided to start from scratch on
the design, salvaging code only where it earns its place.

### Decisions

1. **What we're building** is in SHAPE.md: an idea factory / entrepreneur
   machine. Ideas start with a baseline and a hypothesis; most die on
   evidence; survivors are built in parallel as PRs; each PR comes with a
   demonstration on the real app (fake data labelled); telemetry checks the
   result after shipping. The person is in control: guidance, never gates.
2. **Built on PostHog.** Apps made this way are PostHog-native from their first
   line. Salvaged InDusk telemetry only for what PostHog doesn't cover.
3. **Rent the factory.** *(Superseded 2026-10-20: build it, fed by telemetry — SHAPE.md.)* Parallel agents opening PRs is commodity (Cursor,
   Devin, Codex, Claude Code cloud). Our part is both ends: the idea and its
   evidence before, the demonstration and the measured outcome after.
4. **First app: Homework Gate**, tutor side first. No users yet.
5. **Act as the factory by hand first.** Do on Homework Gate what the factory
   would do, write down every step, mark which were tedious (→ automate) and
   which needed judgement (→ stay with the person). That log is the spec. Do
   not build the tool before the log shows what it is.

### Homework Gate

- Repo: https://github.com/infinitedusky/homework-gate — `main` has only a
  README; the proof of concept is **PR #1, branch `poc-learning-loop`**
  (commit `860eeef`), being built by Sandy in a separate Claude Code session.
  **Merged to `main` 2026-10-20** (`4d3f418`), with a repo `CLAUDE.md` that
  hands off context (invariants, API notes, next steps). Work on branches off
  `main`.
- `~/code/sandbox/homework-gate-workbench` is something else, unrelated to
  this work; don't use it.
- Local clone: `idea-factory/homework-gate/` (gitignored; its own repo and
  commits), so sessions here have the app's full context.
- `brief.md` at the repo root: the whole product (laptop + iPhone gating, the
  evening flow, architecture). v1 = the learning system; gating is a manual
  switch the parent flips.
- `poc/`: FastAPI + SQLite + Jinja, ~1,100 lines of Python. The assistant
  (`hg/assistant.py`) reads an assignment (photo, PDF, text) and builds a
  private answer key; the tutor (`hg/tutor.py`) climbs a hint ladder; the
  answer-leak guard (`hg/guard.py`) checks every reply by number match against
  the key plus a second model call that rewrites leaks into hints; the quiz
  (`hg/quiz.py`, `hg/grading.py`) makes five fresh questions, graded by SymPy
  and the model; a parent page. `HG_FAKE_LLM=1` runs canned responses; tests
  with `pytest`. Every call uses `claude-opus-5-5` (`HG_MODEL`).
- No telemetry yet: no PostHog, no timing, no logging.
- **Model access in development: Sandy's Claude Code subscription** (decided
  2026-10-20). The API costs money and the subscription is already paid, so
  while developing, `llm.py` gets a backend that calls headless Claude Code
  (`claude -p`), kept as close to the API calls as possible. Not the Agent
  SDK: Anthropic's terms have said subscription logins are not for the SDK.
  Production uses the API with a key; the API path stays the default.
  Differences to remember when reading dev numbers: Claude Code's own system
  prompt, process start-up time, no refusal fallback, token counts instead of
  billed dollars.

### Hypotheses to baseline (no users needed)

Run on a fixed set of real homework pages:

1. **The answer key is right** — riskiest; the guard, grading and quiz all
   trust it. Measure: problems extracted and solved correctly, missed, wrong.
2. **The guard catches leaks and doesn't over-fire** — leaks caught, missed,
   harmless hints wrongly rewritten.
3. **Grading is fair** — model-graded short answers agree with Sandy's grading.
4. **Speed and cost** — seconds and dollars per evening; hypothesis: a smaller
   model is good enough for the guard and grading.

Plus: PostHog (Python SDK) in the app for errors, time per step, guard
rewrites, hint level reached, quiz pass rate. No homework text in events.

### Next

1. **Sandy:** photograph 20–30 real homework pages from recent weeks, as varied
   as possible (worksheets, handwriting, a PDF, a reading question), with the
   correct answers — old graded homework is ideal.
2. **Agent:** on a new branch of homework-gate, an evaluation script that runs
   the assistant on each page and compares against the answers: problems
   found/missed, answers right/wrong, time and cost per page; a simple report
   page — the first idea dashboard.
3. Record the baseline here, and log each step taken by hand (tedious or
   judgement).

### Steps taken by hand (2026-10-20)

- **First live run, done.** Branch `live-run` in homework-gate: `HG_CLAUDE_CODE=1`
  backend in `poc/hg/llm.py` (`claude -p`, stream-json content blocks in,
  `--json-schema`, `--effort`, own `--system-prompt`, no tools/settings/MCP).
  Not committed yet. A whole evening ran live on a made-up four-problem
  worksheet (labelled fake): answer key all correct, tutor didn't give
  answers when pushed, private check caught the wrong answer to #3, quiz
  generated and graded (4/5, one wrong on purpose). Nothing broke.
  Speed: analyze 13–15s, tutor ~10s per reply, check 5–7s, quiz 24s,
  grading 4.5s. Tutor latency is the one a student would feel.
  - Tedious (→ automate): probing CLI flags, writing the live-evening script
    (scratchpad, not in repo), reading results out of SQLite.
  - Judgement: subscription vs API for development; reading tutor replies
    for leaks ("plug 9 in and see if you get 10" — self-check, judged OK).

### Storybook: do it on Homework Gate, record it for the factory (2026-10-20)

Sandy: two separate things. (1) The idea factory should *know* to set up
Storybook, a design system and stories for an app. (2) We do it by hand on
Homework Gate now and record each step; the factory's own UI (idea board,
settings) waits until the log shows what the tool is. Lessons from InDusk:
`research/indusk-v2-lessons.md`.

- Homework Gate is server-rendered Jinja, no JS build. Proposed: Storybook's
  server mode (`@storybook/server-webpack5`, 10.6.3, current) fetching real
  templates rendered with labelled fake data from a dev-only FastAPI route;
  tokens pulled from `base.html`'s existing `:root` variables. Not React.
- Factory lesson already: it must fit Storybook to the app's stack, not
  assume React.
- **Done by hand: homework-gate PR #3** (open). Storybook server framework,
  tokens moved to `tokens.css` (+ `data-theme` override for a theme
  toolbar), dev-only `/_stories/<id>` route (`HG_STORIES=1`), 19 page-state
  stories with labelled sample data, a design-system MDX page, and a test
  that renders every story and checks Storybook lists the same set.
  - Tedious (→ automate): installing and configuring Storybook; moving inline
    CSS into token and style files; writing the stories route and CORS;
    generating the `*.stories.json` from the Python list (I scripted it);
    browser screenshots to check it rendered; README/CLAUDE.md updates.
  - Judgement: which states are worth a story (the night's status banner
    drives most of them); writing believable sample data (reused the science
    worksheet and the squirrel exchange); fixtures as hand-written contexts
    vs seeding a fake database and rendering real routes — chose contexts,
    with a test guarding drift.
  - **Correction (Sandy):** the look itself is *provisional, agent-chosen* —
    the colours came from the POC session; nobody picked them. The
    design-system decision is open, via the elicitation process in SHAPE.md
    (references → 2–3 directions as stories → Sandy reacts → recorded).
  - **Design brief, elicitation step 1 (Sandy, 2026-10-20).** Reference:
    https://tincan.kids/ (warm flat saturated blocks — yellow, green, cobalt,
    orange, pink; chunky pills and cards with hard black offset shadows; one
    idea per section; short playful copy; nostalgic, anti-anxious). Feeling:
    designed for ADHD first — getting things done feels overwhelming. This
    is the key to relaxing: through the gate I get to play, without the
    feeling I've screwed up or blown it, no sick feeling going to sleep.
    Hard, but on my side. Implications: one next step at a time; visible
    progress toward the key/unlock; no red or failure language for the
    student — "not yet" always with a concrete next step; parent page can
    stay plain. Tension: Tin Can is daytime-bright, this is used at night —
    borrow warmth/shapes/voice, dim and warm for evening.
    Second reference: https://camp.com/ — warmth on dark grounds (deep navy,
    chocolate brown, cream text, warm brights as accents: lime-yellow,
    orange, teal, red), chunky soft-serif display + rounded sans, wavy
    section edges, dots and plaid, enthusiastic copy. Shared taste:
    retro-warm, chunky friendly type, physical, playful but confident, kid
    without babyish. Resolves the night tension: dark warm grounds, brights
    only for what matters. So A becomes "Camp at night".
    Also looked at (Sandy's message cut off, meaning unclear): getbrick.com
    (calm premium; "take back your time" — self-chosen limit, matches the
    student's "I want to") and bark.us (generic; "parental controls" —
    imposed, the opposite of the feeling).
    **https://heronaiapp.com/ — Sandy: "LOVE", "closest to what I want".**
    Drafting paper (warm off-white, grain, hairline frame, + crop marks,
    monospace title-block labels), pencil/stipple ink drawing, heavy tight
    uppercase sans headline, ONE orange-red accent used sparingly; intro
    draws the building line by line with a % counter. Calm, precise,
    grown-up. Fit: one accent = the eye always finds the next step; the
    night's work as a drawing being built, finished drawing = unlock;
    respects a 13-year-old; night = blueprint (deep blue paper, pale lines,
    same accent). Open question: does Heron replace the Tin Can/Camp warmth
    or keep some of it?
    Directions (third revision): A Drafting table — Heron straight, paper by
    day, blueprint by night (leading); B Drafting table, warmer — A plus
    Camp's warm night palette, softer type, Tin Can's voice.
    **Sandy: mix Heron's line drawings with 1890s natural-history books**
    ("childer" unclear — ask). → Lead direction **Field notebook**: Heron's
    paper, hairline frames, one accent (vermilion, like old plates' red
    ink); engraved specimens with PLATE / Fig. captions (public-domain
    scans: Haeckel's *Kunstformen der Natur*, Biodiversity Heritage
    Library — real engravings, not imitations); old-style serif (Libre
    Caslon / IM Fell) + mono labels; night = cyanotype (Anna Atkins'
    1840s botanical cyanotypes — white lines on Prussian blue). Tonight's
    homework = a plate that fills in as steps complete, finished plate =
    unlock; the learning-skills notebook = his field journal.
    **Sandy: "a field notebook for kids", mixed with Sprayground's
    shark-mouth backpacks.** Built as mockups (homework-gate PR #4, stacked
    on #3): tonight's plate = public-domain 1838 great-white lithograph that
    draws in as steps complete; the gate = a shark mouth (vermilion lips,
    interlocking white teeth) that opens on FREE TIME; one next step per
    screen; no red/failure language ("Not yet… That's information, not a
    verdict"); paper by day, cyanotype at night.
    **Sandy's reaction (step 3):** likes the shark mouth as the gate. Later,
    not now: when it's all the way open it swallows the to-do list and
    dances with you. Keep it a few seconds, tap to skip, quieter with
    reduced motion — it sits between him and free time.
    - Tedious: finding a public-domain image (Wikimedia API needs a user
      agent; most search hits were junk), converting it to ink, screenshot
      checks. Judgement: reading the references into a brief, the
      metaphors (plate draws in, jaw = gate), the copy.
    Earlier directions (superseded): A Camp at night; B The key (calm, single focus,
    key path fills as steps complete); C A+B (recommended). To build as real
    screens in Storybook: home, a tutor moment, a not-passed result.
  - For the design-system module's manifest: detect the stack → pick the
    Storybook framework; a "stories" dev route; tokens file; sample label;
    the drift test. A one-command "show me every state" is the payoff.

### Merged (2026-10-20, Sandy: "you can do all the merges")

idea-factory #1; homework-gate #3 (Storybook) and #5 (field-notebook
direction + `design/references.md` with the brief and reference
screenshots). **Mistake:** #4 was stacked on #3; merging #3 with
`--delete-branch` deleted #4's base and GitHub closed #4. Reopened as #5
against `main`. Factory lesson: with stacked PRs, retarget children to
`main` before deleting a merged base (or don't delete it until they're
retargeted). With many parallel PRs this is a real failure mode. Also: `gh`
inside `idea-factory/homework-gate/` resolved the wrong repo once — pass
`-R infinitedusky/homework-gate`.

### Answer-key baseline: dropped for now (Sandy, 2026-10-20)

"You are asking for an artifact that is too hard to get. Let's just trust it
for now and then do tests when the system is working." The app's own key
(solved by `assistant.py` from the uploaded sheet) is trusted; it was right
on every clean worksheet so far. Measure later, from real use: a "this
answer looks wrong" button on the parent page as an event, and maybe
released state-test items with official keys. This replaces Next step 1–2
above (20–30 photographed pages).
- **Factory lesson:** a test that needs an artifact the person can't easily
  produce won't happen. Ask for cheap evidence, or measure from the working
  system. Also: say which "answer key" — the app's own, or an outside one
  used only to grade the app — Sandy and the agent talked past each other.

### Audience: teenagers (Sandy, 2026-10-20)

"This really is for teenagers. Young kids are not getting homework and their
parents can control their devices more." The student is a teenager in
**8th grade**, in Sandy's family; his interests (a popular battle-royale game, short
sports videos) shaped the design. Consequences:
- Nothing that feels like a kids' app (drop/limit handwritten cheer,
  mascots, Khan Kids tone). Heron's grown-up look, the Sprayground shark and
  Brick's self-chosen framing already fit.
- Borrow from the games he plays: homework steps as daily quests, mastery as
  tiers, XP across nights, the gate opening as the win screen. From the short
  videos he watches: help is short and vertical (60-second explanations);
  tutor examples from sports.
- Product: teens have their own phones, so the gate must be something they
  accept — autonomy ("this is mine, it helps me") is the core, not the tone.
- Open: who is "the parent" in the interview — Sandy, the parents, or both?
- Sandy also asked to borrow from Khan Academy (mastery levels, colour by
  subject) and link out to Khan and other resources (no public Khan API
  since 2020 → search links). Comp to study: Khanmigo (Khan's AI tutor).
  The kid-style "fun pass" was stopped when the audience became teens.

### Next: a showable POC loop (Sandy, 2026-10-20)

"Let's hold off [the interview], get a POC good enough to start showing
people — we're in the weeds. The AI part is what I wanted to validate and I
think I have. It will work." Build the server and the iPhone TestFlight app
to show the loop: homework + quiz on the laptop → pass → his iPhone
unlocks itself.
- iPhone gating = Apple Screen Time API (FamilyControls / ManagedSettings).
  Development entitlement works now on devices installed from Xcode;
  **Family Controls (Distribution)** is needed for TestFlight — request on
  day one, reported waits days to months, per bundle ID.
- **Parent-managed** (Sandy): Family Sharing / child authorization, like
  Bark — a parent approves on his phone; he can't turn it off. Apple
  combines all apps' restrictions, so Bark/Downtime blocks still apply;
  for the demo Homework Gate must be what blocks games and video apps. Pitch:
  Bark watches and blocks; Homework Gate unlocks when he's earned it.
- Server: stays on this machine behind a tunnel (Cloudflare Tunnel or
  Tailscale) so the model stays on Sandy's subscription, personal use.
  Hosted + API key later, for real users.
- Fallback demo if Apple stalls: web app + "free time unlocked" push.
- $99 Apple Developer Program is required: Family Controls isn't available
  to free Personal Teams, even for development (Apple DTS on the forums).
- **Proposed order (from `brief.md`):** NextDNS first — per-device profiles
  rewritten through its API when the mode changes; gates the laptop *and*
  the iPhone (configuration profile, no Apple account or approval); ~$20/yr.
  One server switch unlocks both = the showable loop. Then hardening: the
  Windows agent (standard account, service + Firewall + App Control,
  browser secure-DNS off by policy — the corporate endpoint model) and the
  iOS Screen Time app. Risk: DNS leaks (open apps, IP-direct, VPN, profile
  removal — parent locks that in Screen Time); fine for a demo and an
  honest 13-year-old, agents close it later.

### The gate works on a real phone (2026-10-20)

homework-gate PR #8: locked by default; unlock periods (default every day
3–10 pm) set by the parent; inside a period it opens when he turns in
tonight's homework and passes the quiz, or the parent opens it; at the end
it locks no matter what. Locked = allowlist-only (Sandy: "only Google
Classroom and us"): every top-level domain NextDNS supports is blocked
(1,433 of IANA's 1,437; it rejects .kids .merck .music .web), the
allowlist wins. The server re-checks every minute.
**Tested by Sandy on Sandy's own iPhone (profile 483b54): "it works."**
NextDNS logs showed the phone's lookups blocked after the lock, including
iCloud Private Relay's `mask.apple-dns.net`.
- Lessons: pages and DNS answers already on the phone survive the lock for
  a minute or two (Sandy saw nytimes.com "work" — it was loaded before the
  lock); the first live run caught a bug the fake tests couldn't (TLD file
  header read as domains). Hammering the NextDNS API (~480 calls in
  seconds) tripped its rate limit and left stray blocks — slow, one-time
  sweeps only.
- **DNS isn't instant** (Sandy: had to close and reopen Safari after
  unlocking). Apps cache DNS answers — including failures — and keep open
  connections, so unlock may need an app restart and lock leaks for open
  apps (a video playing at 9:59 pm keeps going). Demo-acceptable; tell him
  "close and reopen the app" in the unlock message. Real fix: the native
  layer — iOS Screen Time shields are instant → raises the priority of the
  $99 Apple Developer account and the Family Controls request.
- Tedious: finding which TLDs NextDNS accepts (automated sweep). Judgement:
  the lock model itself — took Sandy three rounds (overrides → two locks →
  unlock periods) to land; the agent's first model was wrong.

### Idea raised: apps as posts (Sandy, 2026-10-22)

**Reframed (Sandy, later that day): "maybe a better framing is interactive posts."** Content with behaviour,
not apps to run; a spectrum from a paragraph with one slider to a full tool, so the constrained format is the
natural case. Precedent that matters: Distill shut down in 2021 because interactive articles cost too much to
produce; the format never lacked readers. The factory removes the production cost; email stays a teaser + link.
Idea file renamed to `ideas/interactive-posts.md`.

"If self-evident is the best way to build apps, maybe we add a distribution layer that resembles Substack,
where posts are not stories but apps. Apps become the way people express concepts." Captured as
`ideas/apps-as-posts.md`: a feed where each post is a small app that shows itself; the factory's demonstration
and telemetry make it self-evident; its telemetry is the read rate. Counterargument: the hosting graveyard
(Glitch 2025, Observable, GPT Store) — so a publishing format for sandboxed, browser-run apps, not code hosting.
Cheapest test: run it on Substack, posts as app links, measure subscribes, clicks, returning use.

### Idea raised: a minimal brand ERP, Lightsprint-style (Sandy, 2026-10-21)

"ERP very lightly": describe a business process in plain English → an agent wires the brand's SaaS tools
(Shopify, suppliers, inventory, shipping, accounting, email) into a workflow → preview on real data → approve.
Start with clothing, which Sandy knows. Fit: a second *app* the factory builds (database-driven, working on
external systems; the brand's own numbers propose and judge changes), not a second engine. Strain: positioned
as an extension of Shopify, not PostHog — different buyer; crowded (Odoo, ERPNext, Katana, Cin7, n8n agents);
new part is agent wiring + Sandy's industry knowledge. Decision: capture, don't build before the engine exists
(the engine builds it). Cheapest test, Sandy's: 3–5 clothing-brand owners, what they'd pay to stop doing by
hand, kill line set first.
**Sharpened (Sandy):** focus on manufacturing. The wedge is a **standardized tech pack**: manufacturers accept it
(or we convert to standards that exist), then advertise on our site. Findings: no open tech-pack schema exists
(Excel/Illustrator templates, PLM-vendor formats); nearby: ASTM/ISO sizing, GS1; the forcing function is the
**EU Digital Product Passport for textiles** (ESPR; JRC proposal 49 data points / 4 categories at batch level;
delegated act ~end 2027) — a DPP-ready tech pack is a standard with regulation behind it. Standards win by
converter + network: "send any tech pack, get a complete, factory-ready one, missing fields flagged" (agent-shaped
work); clean packs = fewer rounds for factories; listings bring RFQs; open schema + open converter fits the
open-source thrust. Counterargument: marketplace graveyard (Zilingo, Fashinza) — trust, MOQs, sampling, payment
are the hard parts, not formats; supply-side adoption is the risk. Cheapest test (Sandy's): 3–5 manufacturers —
share of packs needing clarification, would they list free if packs came clean; then a fake door (upload a real
tech pack). Engine first; the converter is a candidate first idea for the factory to run end to end.
**Then (Sandy): "It's hard to retrofit any company, easier if you start using this."** Be the default for
people *starting* a brand — no process to replace, the standard is theirs from the first garment; the converter
runs outward (our standard → each factory's existing format), so manufacturers change nothing either. Flips the
cheapest test to the demand side: people starting a clothing line (Shopify communities, print-on-demand
graduates, fashion-school grads); fake door "build your first tech pack, factory-ready"; a real sign-up is the
behaviour that costs. Manufacturers second, once packs arrive.
**Then (Sandy): all communication runs through the system and is recorded.** The communication is the data:
every factory clarification question = a missing field in the standard (the loop applied to a standard; events:
rounds per pack, fields questioned, time to first sample); the trust layer the graveyard lacked (what was
specified, changed, agreed, when); DPP provenance by construction; possible because new brands have no channel
yet. Counterargument: people route around channels (WhatsApp/WeChat/email; Upwork fights it; Alibaba keeps chat
because payment runs through it) → communication stays where the *obligation* lives: RFQ, quote, PO, sample
approval, change request, payment — make the actions happen in the system, let conversation attach, never a
rule against outside chat. Open (Sandy's): **do payments run through the system?** Decides completeness of the
record and the business model. Note: tech packs are IP; EU data → retention/consent from day one.
**Answer (Sandy): payments eventually — the revenue play after adoption. Then factoring, storage, shipping:
control fulfillment so you can pay against it.** The Faire playbook (marketplace → finance layer by controlling
the transaction; also Shopify Capital, Alibaba Trade Assurance, Amazon FBA). Sequence: standard → record →
adoption (free, open) → payments (money keeps communication in-system) → finance + fulfillment, underwritable
only because the record exists (what was specified, agreed, accepted) and delivery is controlled. Counterargument:
capital-heavy and regulated → after adoption, and rented (Stripe Treasury/Capital partners, 3PLs), the data is
the edge — don't build a bank, be the data banks lend against. Open-source resolved the PostHog way: open
platform code, the operating company is the business.

### Ideas raised, not yet decided (2026-10-20)

From Sandy trying the app live on `samples/fake-01-characteristics-of-life`:

1. **Tutor directives, ranked.** Primary: prepare him to do better over time
   — the subject and learning how to learn. Draft order: (1) better over
   time, understanding over answers; (2) learning how to learn (explain,
   self-check, spot own mistakes, pick a strategy, know when to ask);
   (3) tonight's homework done and understood; (4) keep going. "Never give
   the answer" stays a hard rule. Waiting on Sandy's ranking.
2. **Private explanation per tutor reply** (directive, move, expected next
   step), parent-visible. It's a claim, not evidence; evidence is the
   student's next behaviour.
3. **Learning-skills notebook.** Tutor names a meta-skill in one sentence when
   it comes up (e.g. multiple choice = pick the *best* fit, not just a true
   one — the squirrel item), records it, returns to it on later nights; parent
   page lists "talk about at dinner". Risk: over-firing/preachy; cap 1–2 a
   night.
4. **Spaced review in the quiz; the quiz as a learning moment.** Quiz adds
   due concepts from earlier nights and named skills from the notebook. "I
   don't know" opens a short tutor exchange after the result — closer to
   working with a parent than finishing homework. Scheduling: use FSRS
   (`py-fsrs`, open source; verify current) rather than building one.
   Risk: if untaught skill questions count toward passing, the quiz becomes a
   trap tied to his phone. Proposed: split quiz — gate (tonight, counts) +
   review (1–2 questions). Sandy's rule (Leitner-style spaced repetition): a
   first wrong review answer doesn't close the gate — the concept goes back
   to "ask again soon" and the tutor teaches it that night; wrong again on a
   later night closes the gate, and it reopens after a short re-teach plus a
   fresh question. The second ask only counts if teaching happened between. Test: randomize *by concept* (reviewed vs held back) and
   compare recall weeks later — a real within-student experiment at N=1;
   follow-up rate after "I don't know"; gate pass rate and quiz time not
   worse.
6. **Tutor directives: two layers** (Sandy, 2026-10-20). Universal (ranked
   directives + hard rules no profile can override) and student-specific
   (grows). The student layer starts with a **parent interview** and a
   **short talk with the child**, then grows from evidence (dated, with the
   evidence, visible and undoable). Proposed: profile has a private part
   (parent only) and a shared part written for him; write "what helps",
   not labels; expert review of the interview and format later. Same
   elicitation pattern as the design references — a reusable factory step.
   Proposed order: interview Sandy by hand in chat → directives + profile
   into the tutor's instructions + private explanation per reply →
   simulated students → child talk as an app screen.
7. **Prevent guessing** (Sandy). Gap: the tutor confirms right answers, so
   he can fish ("is it 5? 6? 9?"); multiple choice is 1-in-4 by luck.
   Principle: don't ban guessing, make reasoning the only thing that pays
   (picking the most likely is a skill — Sandy's earlier point). New hard
   rule: **never confirm an answer he hasn't explained** (or turn it into a
   self-check). Tutor notices rapid different answers and slows down,
   kindly. Quiz: fewer pure multiple choice; choice + one-line why, credit
   needs both; too-fast or flip-flopping answers recorded as signals for
   parent/profile, never penalties on screen. Guessing often means tired /
   too hard / anxious → profile ("guesses more after 9pm") → tutor adapts.
8. **Painless quiz: spoken or visual, like a game** (Sandy). Example item:
   "Walk me through how you would divide fractions." Hold-to-talk answer,
   one friendly follow-up for the why ("how many eighths fit in three
   quarters?"), credit for steps + meaning; "I don't know" opens the tutor
   (two-strikes rule). Plus visual items (drag fraction bars, pick the
   picture, order the steps) and quick taps for early wins; the shark eats
   a bit of the to-do list after each. Speech: browser Web Speech API first
   (Chrome/Edge on his laptop), a transcription provider later. Grading:
   model on the transcript against a short rubric, tolerant of messy maths
   transcription. Risk: speaking aloud at night isn't always comfortable →
   typing always available. Remove the visible per-question countdown and
   auto-submit; keep time as a quiet parent-page signal. Explaining aloud
   also answers "prevent guessing" (7).
9. **TVs and every screen — next after the phone loop** (Sandy: "the TV is
   important… sooner than later"). Need: when the parent's at work, the TV
   doesn't work until homework's done; brand-agnostic.
   **Tamper rule (Sandy): if any part of the gate goes quiet, everything
   locks** — unplug the TV gadget and phone + laptop lock; remove the
   phone's profile and laptop + TV lock; parent alerted. Turns every weak
   spot into a bad trade; makes cheap hardware good enough. Extends the
   brief's "failure means locked" and NextDNS last-seen heartbeat.
   Software *on* the TV is per-platform and mostly can't block other apps
   (Google TV via Family Link the exception) → rejected. Brand-agnostic
   software lives outside the TV: (1) home router → NextDNS, all DNS forced
   (every app on every screen; unplugging the router costs his phone's
   internet too); (2) an HDMI-CEC dongle (Pi-class, our software) for "won't
   turn on at all", tamper rule makes unplugging pointless.
   Recommended order: tamper rule + router next, dongle prototype after.
   Waiting on: router admin access at the house (else a cheap second
   router).
10. **Tutor as a side panel that can point** (Sandy, 2026-10-20, raised while
    step 3 ran). The tutor is a floating section on the right that you open;
    it pushes the page left, and it can move the page and highlight parts of
    it ("look at this"). Fits the explain-out-loud quiz and the field-notebook
    tutor screen. Captured, not chased.
5. **Bounties and a support circle** (parked). Parents post bounties for
   extra work; others in his life join in (an uncle reading with him 3 h a
   week; the parent offers a gift card to the helper) — framed as
   relationships forming his support group, not paying people. Research:
   overjustification effect (contingent rewards for things he'd do anyway
   can lower motivation; unexpected celebrations least harmful);
   self-determination theory (autonomy, competence, relatedness — the circle
   is relatedness). Risk (Sandy): nobody joins → "why is no one helping
   me". Rule if built: the circle is never shown as a count or ranking; he
   sees what people did, never who didn't. Needs a child psychologist
   before building. Cheapest evidence: text three relatives a real invite,
   see who says yes.
   - **Factory lessons:** capture without chasing; some ideas can't be
     tested cheaply or by the agent — say so and offer the cheapest real
     evidence; mark "needs expert" and keep parked rather than fake it.
- **How to test (proposed):** simulated students (answer-demander, guesser,
  quitter, solid) × the sample worksheet; judge scores replies against the
  directives; baseline tutor vs directive tutor; a deliberately bad tutor
  must score worse or the test is worthless. Then the real student over
  ~4 weeks: hint level per concept, unprompted self-checks/explanations,
  named skills used later unprompted, "just tell me" rate, dinner topics
  marked talked-about. N=1: trends, not proof.
- Policy question noticed: the tutor confirms correct answers ("Yes, D is
  right"). Seems fine; belongs in the directives.

## Plan is mockup, then prototype, then project; research is part of Ideate (Sandy, 2026-10-29: "prototype should be under plan … but it needs to come after mockup")

The process is meant to be one thread per idea, not separate stages.
- **The rail** is now 🔭 Observe · 🧠 Learn · 💡 Ideate · 📋 Plan · 🔨 Build. Validate is gone as a stage.
- **Plan is how an idea becomes something real,** in order:
  1. **Mockup: decide how it looks.** Stories with made-up data, with variants side by side when there's a choice.
     The chosen stories record what was agreed.
  2. **Prototype: decide how it works.** It is built from the chosen mockups, so it is about behaviour, data and
     flow. It is what you use yourself and show people.
  3. **Project: the analysis.** It takes in the mockups, the prototype and the feedback, and gives the plan, the
     migrations and the checks. Build then does it properly, from scratch.
  Not every idea needs all three. A visual tweak can go from mockup to project, a backend change can skip the
  mockup, and a one-line fix goes straight to a project. The agent proposes which steps an idea needs; the person
  can override it.
- **Plan's pages,** in that order: Mockups, Prototypes, Projects, then Issues and To-dos. A Storybook or prototype
  tab in front lights Plan.
- **Validate's other half,** holding the build to what was agreed, is checks while building, so it belongs to Build.
  The old Validate page is removed (it hardcoded Homework Gate's links) and `/validate` goes to Mockups.
- **Research belongs in Ideate** (Sandy: "I think research should be a part of ideate maybe"). It sits between an
  idea arriving and it being worth a mockup, and answers four things:
  - who does this best (cited comps, which the mockup starts from);
  - what already exists to use instead of building;
  - what our own numbers say (Learn feeding in);
  - the strongest case against it.
  An idea reaches Plan with its research attached. Not built yet.
- **Next, the whole thread on the idea's page:** idea, research, mockups, prototype, project, what landed. You see
  where each idea is and what it waits on.

## The prototype: built fast to be thrown away, then built again from scratch (Sandy, 2026-10-29: "we don't need a perfect build, we want the thing that allows us to build better, when we build")

Preview, the way it was built, was the wrong idea: a frame around an address. The stage it stands for is the
**prototype**. It carries out the 2026-10-21 thesis (decide fast on something real) as the first part of planning.
- **What it is:** the actual thing, built quickly in a worktree of its own so it works: something to use, iterate on
  and show people. Speed and change come first, and it only has to be good enough to demo and learn from. Shortcuts
  are the default: hardcoding, fakes, no error handling, edge cases skipped. It has no tests, no review and no
  conventions, and a change asked for shows in the tab in moments.
- **It can do any kind of work,** not just screens: schema changes, endpoints, jobs, config, dependencies.
- **Its data:** the app keeps its real database engine, and the data is fake. Scenarios are JSON files, labelled as
  made up. A throwaway database is built from the app's schema and filled from the JSON (Postgres:
  `CREATE DATABASE … TEMPLATE …`, then `jsonb_populate_recordset`). The app runs against it unchanged, through its
  database URL, so an app whose server talks to its database directly (Homework Gate's FastAPI) works too. The shape
  changes freely: edit the JSON or the schema and rebuild. No migration files are written while prototyping. Reset
  goes back to the scenario, and saving exports the state back to JSON for sharing.
- **Outside services get off-the-shelf stand-ins:** Stripe test mode for payments, Mailpit for email, and a
  "be this user" switcher for sign-in.
- **Setup for each app, once:** the start command, the port and the environment variable holding the database URL.
  The agent works these out from the app and asks for confirmation. There is nothing to switch on in the factory
  itself.
- **The rebuild from scratch is the feature.** When the prototype is ready, everything about it is analysed: the
  diff, the final data shape, the scenarios, the stories, the conversation, people's feedback, and what changed
  between iterations and why. That analysis gives the plan, the migrations and the checks. The real build starts
  from main and is written properly; none of the prototype's code is carried over. It is evidence, not a starting
  point, so there is no sunk cost.
- **Rejected:** json-server or MSW standing in for the backend. They are fast, but useless for an app whose server
  owns its database. They stay useful only for apps with no backend at all.

- **First slice built (same day):** a `prototype` row per prototype. Starting one makes branch `prototype/<slug>` and
  a worktree beside the builders' (`<repo>-worktrees/prototype--<slug>`). The engine runs the app's `prototype_cmd`
  there, in its own process group, on a free port passed as `PORT`. Stop, start again (on a fresh port) and discard
  (worktree and branch removed, the row kept). After an engine restart a prototype reads as stopped. The agent has
  `start_prototype`, `prototypes`, `prototype`, `run_prototype`, `stop_prototype`, `discard_prototype` and
  `set_prototype_command` (worked out from the app, confirmed with the person), and `open_tab` opens a prototype.
  The Preview tab and its address setting are gone. The rail's Prototypes lists them; a prototype's tab is named
  after it and shows its server in the old preview frame, or "Starting…" with its last lines, or "Stopped" with a
  way to start it. Tried end to end on a throwaway repo in a browser. `open_tab` and `stories` had been rated
  "moderate" by the gate, so the agent asked before opening a tab; they are free now.
- **Not yet:** the agent building in the prototype's worktree from the conversation (talk sessions have their own
  worktree), the throwaway database from JSON scenarios, stand-ins for outside services, sharing a link, and the
  analysis into the plan.

## The workspace, after Replit's (Sandy, 2026-10-28: "the left column agent and then tabs and split screen on the right, just like an IDE")

Self Evident is now one workspace, not pages under a nav.
- **The loop is an icon rail** on the far left, like VS Code's activity bar. Hovering an icon shows its name and the pages under it; clicking opens that page as a tab. The app picker sits at the top of the agent's column, like Replit's project switcher.
- **The agent is the left column.** It is resizable, ⌘J folds it, and it can still pop out into its own window. The floating drawer is gone.
- **Everything else is a tab on the right, in [Dockview](https://dockview.dev).** You split by dragging a tab to an edge, and each group is a card, after Replit's panes. A tab keeps its own history; ⌘-click opens a link in a new tab. Each app's layout is kept in the browser, and the address bar follows the tab in front.
- **What opens as a tab:** every page, Preview (the app's dev server, with address bar, reload, device widths and a way out to a browser tab; its address is a new setting), Storybook, and a sub-issue's **build log**, which is live: steps, then one line per action, with output folded under it.
- **The agent knows what is open:** every message carries the open tabs and which one is in front. It **opens tabs itself** with a new `open_tab` tool, which arrives as a `ui.open` event. The event stream takes `since=now` for readers that want only what comes next.
- **From the comps:** in the agent's feed, runs of tool calls fold into one "N actions" row with icons, and a finished turn reads "Worked for X". The agent's replies render as Markdown, in plain text, not bubbles.

- **Storybook opens at a story** (Sandy, the same day: "are we not able to open storybook to a specific story?"). The Storybook tab carries a story id. The agent finds ids with a `stories` tool, which reads the app's running Storybook's own `index.json`, and opens one with `open_tab` (storybook, story). If a Storybook tab is already open, the new story replaces the one in it rather than opening a second tab.

Dockview is pinned at 8.5.1, core included: the newest release was a day old. Starting a dev server for Preview is not built; Preview shows the address it is given.

## Stories lead the UI, and every screen has them (Sandy, 2026-10-28: "full coverage, and make sure it leads building")

- **Every page and component in `app/` has stories**, beside it as `<Name>.stories.tsx`. The real pages render
  against a fake engine (MSW through `msw-storybook-addon`, as SHAPE.md chose): `app/src/stories/sample.ts` is one
  made-up app, Sample Shop, typed against the engine's own types; `mock-engine.ts` answers every GET the UI makes,
  says ok to writes and keeps the event stream open and silent. A story changes what the engine says with
  `beforeEach: withEngine({...})`. The data is invented and says so: the repository is public.
- **The gate:** `pnpm --filter app test` fails when a page or component has no stories file (`src/stories.test.ts`),
  and the storybook project renders every story in a browser, so a screen that crashes fails too.
- **Stories lead:** for us, a new screen or state starts as a story and is built to match. For the factory, any app
  with Storybook set (`storybook_url` or `storybook_cmd`) tells the planner to make the stories the first step of a
  sub-issue that changes a screen, and tells the builder a screen without a story is not done.
- Found on the way: Settings used a `SkillList` that 9a3c141 had removed, so an app whose repo has its own skills
  crashed its settings page. Restored.

## Settings: All apps, then each app; apps override (Sandy, 2026-10-27)

Settings was every app as one long form, stacked. Now it is a page with its own side list: **All apps** first, then
one entry per app (Sandy picked this over nav sub-items or tabs, so every app stays reachable from Settings whatever
the current app is).

- **All apps** shows what every app gets: which skills each agent sees (talk and planner: ours and REA; the
  builder: none), each plugin's skills with their descriptions, REA's 229 tools by rating (121 free, 84 moderate,
  24 expensive), and the integrations' shared values. It is read from the engine (`GET /settings`, from
  `skills.ts` and `integrations.ts`), not a static list; `app/src/providers.ts` is gone.
- **An app** is grouped: Repo, Agents (with the skills in its own `.claude/skills/`), Landing, Storybook,
  Integrations. One Save.
- **Apps override, field by field** (Sandy: "PostHog may get overridden on a specific project"). An integration's
  values are set under All apps (`workspace.settings.integrations`, a new column) and each app may override any
  field (`app.setup.integrations`); an empty field inherits, shown in italics, an override is marked. Keys and
  tokens are never stored: a field names the `.env` variable that holds one.
- Plugins per agent are shown, not switched: switching them would need stored state and nothing asks for it yet. (Superseded the same day: plugins are switched now; next entry.)

## Plugins: installed, switched, filed by what we do (Sandy, 2026-10-27)

"REA is a plugin, so it needs a section and a way to add it, delete it, enable it, disable it."

- **Three words, three sections.** An **integration** is someone else's system we connect to (PostHog, Datadog,
  later Linear), whether by values or through an MCP server. A **plugin** is a self-contained thing we install that
  gives the agents new abilities: skills, tools (MCP servers), or both. A **skill** is instructions an agent picks
  by its description; it arrives in a plugin or in an app's repo, so it is filed, never installed on its own. MCP
  is the wire, not the category: REA's tools run on this machine and reach no one.
- **A Self Evident plugin is a Claude Code plugin.** No SDK of our own: Anthropic's plugin format is the spec, and
  ours documents only what we add (which agents get it; tools rated from their MCP hints, unknown asks).
- **Installed by Claude Code's own installer**, the SDK's bundled binary, into the factory's config dir
  (`PLUGINS_HOME`, default `~/.self-evident/claude`), never the operator's `~/.claude`. Add is a marketplace
  (owner/repo, git URL or path) and a name; remove uninstalls. What is installed is the installer's record. No
  `-y`: a plugin whose install runs a command is refused. `engine/plugin/` is built in: it switches off, never
  uninstalls.
- **Switched under All apps, overridden per app** (Sandy's pick): each plugin on or off, and which agents get it
  (talk, planner; the builder none). An app switches a plugin for itself (`app.setup.plugins`).
- **Skills filed by job**, the catalogue's categories (`engine/src/catalogue.ts`, from `research/skills.md`). One
  skill holds a job: agents choose by description, so two for one job compete; filing one where another is on
  switches the other off. Settings shows every job with what covers it: a plugin's skill, the engine itself
  ("built in"), or nothing yet.
- **REA's install is half broken upstream.** Its marketplace installs the npm package, which has neither the plugin
  manifest nor its dependencies: the skill arrives, the 229 tools don't (morluto/rea#5062). Until that ships, the
  engine starts REA's server from its own `rea-agents` while the installed plugin declares none; the shim retires
  itself when it does. Manifest-less, the SDK names the plugin after its folder (`unknown`), and the engine names
  skills by the same rule.
- Each machine installs REA once (Settings → Add a plugin: `morluto/rea`, `rea`). Checked on a scratch database:
  install, switch, file, app override, remove, reinstall; a live session got REA's server (229 tools) and exactly
  its one skill.
  Next candidates for the same override pattern: the agents' model, budget and turns as All-apps defaults.

## Skills in two layers; REA for reverse engineering (Sandy, 2026-10-27)

Sandy wants the agents able to study a feature someone else has shipped, to move fast on building our own. That
is REA (`rea-agents`, github.com/morluto/rea): one MCP server over Ghidra/IDA/Hopper, JADX, browser capture,
Electron/ASAR, .NET and ~25 format readers, with a skill that says when to use it. Its real reach: near-source for
web, Electron, .NET, Java and Python; one function at a time for native code; nothing on a server.

- **Two layers.** An app repo's `.claude/skills/` is about working on that app (the catalogue's "adopt",
  `research/skills.md`). `engine/plugin/` is what the factory brings to every app: our own skills (none yet; a
  folder under `engine/plugin/skills/`) and third-party plugins like REA. Both load through the Agent SDK
  (`plugins`, `skills`); no skill system of our own.
- **Who gets it:** the talk agent and the planner. The builder builds what the plan says and gets neither.
- **Named, not all:** each session's `skills` lists ours, REA's and the app repo's, so Claude Code's bundled skills
  (schedule, loop, update-config…) stay hidden. Checked against a live session: the model sees exactly those.
- **Gating, from REA's own catalogue** (each tool's MCP hints, `engine/src/skills.ts`): reads and local work are
  free; REA's own session edits and anything reaching outside (a browser, a device, an external analyser) are
  moderate; running or changing the target is expensive and always asks. The planner has no one to ask, so it gets
  only the free ones. Trade-off taken: REA labels some static readers open-world because they launch an analyser
  (`analyze_javascript_application`, JADX), so those ask at the default threshold.
- REA 6.8.0 ships its skill without a plugin manifest; the engine starts `rea mcp` itself. Its next release bundles
  the server in the plugin, and that line can go. REA asks for Node ≥24.22.1; the operator's machine moved to 24.22.1 for it (mise), and a first real analysis
  (`analyze-javascript-application` on our own `app/`) completed there.

## Skills: a catalogue by category (Sandy, 2026-10-27)

Gap noticed: we build every agent workflow ourselves while others trade skills by author. To address it without
moving the foundation, skills are sorted into categories (interview, spec and slice, build discipline,
demonstration and evidence, review, and so on), each with what we already have. Each new skill is judged against
that: what it does, its category or a new one, where it keeps state, who can start it, and whether it beats what
we have. Verdicts: **adopt** (stateless, into one of the two layers above: the app repo's `.claude/skills/` or
`engine/plugin/`), **borrow** (port the idea into the engine), **comparable**, or **skip**. The
engine never hands state to a skill. Catalogue and log: `research/skills.md`.
## Rebuilt in Linear's shape (Sandy, 2026-10-27: "rebuilding from scratch can be easier")

Step 1 of "Shaped like Linear", done as a new database rather than a conversion: schema written fresh, migration
history restarted, the old `ideafactory` database kept untouched and copied over by a one-off script
(`engine/src/db/copy-legacy.ts`: ids kept, so branches, PRs, links and summaries still point at the same things).
- **One table of issues.** Tasks, phases, to-dos, checklist lines and backlog items are all issues: `kind` code or
  todo; a sub-issue has a parent. Numbered once per app with the app's key: HG-1…HG-193, CS-1…, AP-1… (the copy
  numbers them in the order they were made). Issues can live in no project, be moved into one (at the end), and be
  ordered among their siblings.
- **Linear's states** (Triage, Backlog, Todo, In progress, In review, Done, Canceled, Duplicate) with their types. A
  code issue follows its sub-issues (any started: In progress; all landed: In review); its PR merging makes it Done.
  Planned but not started stays Todo.
- **The backlog is issues in a project's Backlog.** Take one on (Todo at the end), make it a to-do, mark it a
  duplicate of the issue that covers it, or cancel it with a reason. The project still lands only when none is left.
- **What is ours stays beside the plan**, keyed by issue id: `build` (the engine's status, attempts, worktree for a
  code sub-issue; the sub-issue's state follows it), file claims, runs, steps, questions, decisions, PRs. Phase
  dependencies are `blocks` relations.
- **Goals can be stated:** initiatives (with their projects) and cycles (dates, with their issues). The Summary reads
  them first and says whether its goals are stated or inferred. No pages for them yet: ask the agent.
- **Names everywhere:** routes (`/issues…`, `/backlog/:id/take|duplicate|drop`), events (`issue.*`, `build.*`), MCP
  tools (`plan_issue`, `create_issue`, `set_issue_state`, `reorder_issues`, `initiatives`, `cycles`…), the UI (Plan →
  Projects, Issues, To-dos; an issue page lists its sub-issues; a draft's issues reorder with ← →). Stacked PR
  branches are `project/<id>--hg-12`, so Linear's GitHub integration can link them.
- Not done yet: the plan-store boundary (step 2) and Linear itself (step 3); goals pages; creation through the
  conversation (the dock).

## Shaped like Linear (Sandy, 2026-10-27)

From the team conversation: on a big shared repo the plan lives in a tracker, probably Linear. Sandy: "we build ours
to match Linear and then we can slip it in. We can connect it or we can manage it ourselves." The mapping is in
SHAPE.md under Decided. Linear's agent model fits the engine closely: an agent delegated an issue gets an agent
session (our run), reports activities (thoughts, tool calls, questions, responses, errors), and shows a plan as a
checklist (our steps). Next, in order:
1. Rename to Linear's names and shapes in our own store (schema, engine, UI, MCP tools), statuses under Linear's
   categories. Initiatives and cycles added, so goals are stated rather than inferred.
2. A plan-store boundary in the engine: the planner, runner, Summary and tools read and write the plan through it,
   never the tables directly. Our database is the first implementation.
3. Linear as the second, per app: `@linear/sdk`, webhooks in, the agent session API for builds. Our own data
   (file claims, cost, evidence, decisions) is kept by Linear id.

## Summary page, first section: what we're focused on (Sandy, 2026-10-27)

A page the agent writes from everything the engine knows (nav: 📰 Summary, above My Stuff). The first section is the
Monday-morning round of the room: who is on what (you, the builders, the planner, the agent's to-dos, each teammate
by GitHub name; your own hand-opened PRs count as yours, by your `gh` login), then goals this week, next few weeks,
long term. One model call, no tools, structured output, about $0.20 on Homework Gate. Each line must cite ids
from the facts (projects, tasks, to-dos, ideas, questions, PRs); refs the model makes up are dropped, and a line left
with none is dropped too. Every write is kept (`summary` table) with the facts it was written from. Rewritten
when the newest is a day old and something has happened since (checked every 30 minutes; `SUMMARY=0` off,
`SUMMARY_HOURS` to change), or on "Rewrite now". Goals are inferred; stating them is the next step if they read
wrong. The other sections (state of the app, observability, learnings, open questions) show as placeholders.

## Stacked PRs: one per task, for a team (2026-10-26)

The third of three for team work. A per-app setting (Settings → Pull requests; `setup.pr_mode`): **one per project**
(as before) or **one per task, stacked**. In task mode each task lands on its own branch (`project/<id>--t<n>`, a
sibling of the project's branch, since git cannot hold `a` and `a/b`), cut from the previous task's branch; its PR is
against the previous task's PR while that one is open, else main, and says so ("stacked on #n: merge that first"). A
task's PR shows as ready to merge in My Stuff as soon as its own phases have landed, while later tasks still build.
The sync retargets the next PR to main when the one below merges and catches each task branch up from what it is
stacked on. Next: try it on Corner Shop with the laptop as a teammate (needs a CI workflow there and branch
protection, which is Sandy's call).

## GitHub sync (2026-10-26)

Second of three for team work (after MCP; before a stacked PR per task). The engine now reads GitHub through the
person's `gh` login every two minutes (and on demand: My Stuff's "Sync with GitHub", `POST /apps/:id/sync`, the
`sync_github` tool):
- **Our PRs**: merged or closed (the stale "PR waiting" rows go), the review decision, CI checks as one word
  (passing, failing, pending, none) with what failed, mergeable. Changes become events (`pr.merged`, `pr.review`,
  `pr.checks`).
- **PRs we did not open** (a teammate's, or one made by hand): table `outside_pr` (migration 0012) with the review
  asked of the person and the files each changes.
- **Main moving**: the default branch is fetched and merged into every open project's branch in a scratch worktree,
  under the landing lock; pushed when the branch already has a PR. A conflict is reported, never resolved
  (`project.behind_main`, with the files). New projects now branch from `origin/<main>` after a fetch, not from a
  local main that may be stale.
- **My Stuff**: changes requested or checks failing on our PR; "landed" rows say approved / waiting for review /
  checks state, and "ready to merge"; main conflicts with a project; a teammate's PR asking for your review; a
  teammate's PR touching files a running project claims.
- Corner Shop has no CI yet; the team test needs a workflow there.

## Self Evident from Claude Code, over MCP (Sandy, 2026-10-26)

Sandy, ahead of a new job on a big shared repo: "My biggest goal is to be fast… I want to think about how we can use
it in VS Code, if it is helpful. I can't have the UI slowing things down." Agreed order: MCP first (half a day, and it
makes the team test real), then GitHub sync, then a stacked pull request per task, tested on Corner Shop with a second
GitHub account on the laptop acting as a plain teammate (no Self Evident there).
- The agent's engine tools moved to one shared module (`tools.ts`); the web UI's conversations and the new MCP
  endpoint both use it, so they never drift.
- `POST /api/mcp/<appId>`: the official MCP SDK's web-standard Streamable HTTP transport, stateless, JSON responses,
  DNS-rebinding protection (localhost hosts only). Read-only tools carry the read-only hint. Planning starts and
  returns at once over MCP (a call that waits minutes can time out); the conversations here still wait for it.
- `pnpm se connect` finds the app from the repo you are in (a worktree resolves to its main checkout) and prints the
  `claude mcp add --scope local …` line.

## Observe is the app's signals; My Stuff is ours (Sandy, 2026-10-26)

Sandy: "Needs you shows up in Observe. That isn't good. Observe is about the app signals, not what we are doing in
Self Evident. Observe should be a set of metrics and any promises' status. We then Learn by testing hypotheses
against that data." And: "Above Settings there should be a My Stuff." The front door (needs you, running, just
happened) is now **My Stuff**, below the rule with Settings, outside the loop, and still the page that opens first
(`/`). **Observe** moved to `/observe` and holds the app's metrics and promises; both are honest placeholders until
Self Evident reads PostHog back (its query API, the app's own key) and promises (clauses and sensors as OpenTelemetry
spans) exist. Open: the first metrics for Homework Gate (proposed: nights started, gates opened, quiz pass rate, cost
per night).

## To-dos, built (Sandy, 2026-10-26: "can we build this? … really helpful right now for Homework Gate")

- Tables `todo` (numbered per app; owner person or agent; open, done or dropped with a reason; the project it
  unblocks) and `checklist_item` (one level; checked by whom; `waiting_on` for a line someone else has). Migration
  0011; a backlog item can now be covered by a to-do as well as a task.
- Done when the last line is checked; unchecking a line, or adding one, opens it again; a person can mark it done
  whatever the list says.
- **The agent drafts the checklist**: one model call with web search (Apple's process changes), told what the list
  already has. On Homework Gate's "Get approved for Apple" it drafted the path from two-factor sign-in and enrollment
  through the Family Controls (Distribution) request, marking Apple's waits. Two prompt fixes from that first draft:
  start from the beginning (it had assumed enrollment was done), and no lines about the tracker itself.
- Plan → To-dos (filters, cards with the checklist, notes, waiting badges only when every open line waits on someone
  else); Now lists open to-dos with the next line, stalled ones after; a project shows the to-dos it waits on; a
  backlog item has a "To-do" button. Agent tools: `todos`, `create_todo`, `update_todo`, `check_item`, `finish_todo`,
  `backlog_todo`.
- Found on the way: the agent drawer only recognised old `plan_` project ids, so on new projects it never knew which
  project you were on. Fixed.

## To-dos with a checklist; strategy and modes still open (Sandy, 2026-10-26)

Sandy asked where things like "get approved for Apple", "call Naya and get her fully set up" and "confirm PostHog
can match her anonymously" go: "strategy is one thing, but it's not really tactics either… like housekeeping." Then:
"are these a type of plan that sit outside the regular structure?" Agreed: they are **to-dos** on the app, outside
projects, linked to what they unblock, each with a **checklist** (Sandy: "get approved for Apple includes a lot of
things… we could just call it a checklist"). Goals as a grouping were floated and deferred. The rule is in SHAPE.md
under Decided. Not built yet.

Raised in the same conversation and still open (SHAPE.md, Open questions): a **strategy** section in Ideate (a
longer-term bet and how to get the evidence for it, including talking to customers with scripts), and **modes**
(a "wedge hunter" mode that skips Observe and Learn and builds fast while putting telemetry everywhere from day one;
the feel stays the same, only the gates change).

## A project has a backlog (Sandy, 2026-10-23)

Sandy: a project "should have tasks, but it should also have like backlog or something… somehow linked to the
ideas. Some way for you to say like okay, this is what I need to accomplish and I know it's all here and I don't feel
like I have to worry about forgetting anything." Shaped and agreed ("Sounds great"); the rule is in SHAPE.md.
- One table, `backlog_item` (migration 0010): text, optional detail, source (person, agent, idea, planner, builder),
  state (open, covered, dropped). A check constraint makes "covered" need a task and "dropped" need a reason.
- The planner's proposal gains `later` (things it noticed that the task should not do); the builder ends its summary
  with a `Later:` list when it has one, read once the phase lands. Both join the backlog as open items.
- Make a task from an item (it joins the end of the project; in a running project the engine plans it when its turn
  comes), cover it with an existing task, drop it with a reason, reopen it. The same as agent tools (`backlog_add`,
  `backlog_task`, `backlog_cover`, `backlog_drop`).
- The landing rule: every task planned, every phase landed, **and nothing open in the backlog**. When only the
  backlog is left the engine logs `project.backlog_open` and Now lists the project under "needs you". The PR body
  lists the backlog still open and what was left out on purpose.
- The project page shows the backlog above the tasks; the Projects list shows how many items are open.
- Found while building it, from the rename (#41): "plan this task" had become `POST /tasks/:id/project` (now
  `/tasks/:id/plan` again), the Tasks list and the project page looked for `task.project*` events (so planning never
  showed), and the button said "Re-project". All fixed.

## Names: project → task → phase → step; "plan" is the verb (Sandy, 2026-10-23; PR #41)

Sandy, after the engine was found running a level off: "plan needs to become a master plan, about an idea or goal
having multiple features, bugfixes or other changes" — then, settling it: "project, task, phase, step, and then plan
becomes what you're doing. It's the activity, not what you're creating… That way we can keep it saying Plan, not
Planning; otherwise we would need Ideation, Learning, Observing, Building." So the nav keeps its five verbs
(Observe, Learn, Ideate, Plan, Build); the things carry nouns: a **project** (an idea or goal with several changes;
owns the branch and the PR) holds **tasks** in order (one change each); the planner turns a task into **phases**
(the graph that runs); a phase's **steps** are the builder's checklist (the 0/4). Under Plan: Projects and Tasks.
Renamed everywhere: table `plan` → `project`, `plan_id` → `project_id`, constraints and indexes (migration 0009,
renames only; drizzle confirms no drift), the engine, `/projects` routes, `project.*` events, the agent's tools
(`projects`, `project_graph`, `create_project`, `start_project`, …), the CLI (`pnpm se project …`), the UI. The verb
stays: the planner, planning runs (`run.kind = 'plan'`), `plan_task`, "Plan" on a task. New project ids start
`proj_`; existing ones keep `plan_` ids and branches; old `/plans/…` links redirect.
- First live run of "a project runs task by task" (PR #40), on Corner Shop: task 1's four phases landed and the
  engine planned task 2 by itself a few seconds later. Then merging #41 restarted the engine mid-planning, which was
  recorded as a failed planning and not retried; a restart now counts as an interruption and planning resumes.

## A plan runs task by task (Sandy, 2026-10-23)

Sandy: "we are operating a level off. Plans are a set of tasks. Those tasks have phases. The phases is where the
graph execution lives. Phases have steps, which show up as 0/4." The engine still treated the plan as the thing that
runs: a plan *landed* when every phase it had was done, so Corner Shop's plan would have landed (and opened its PR)
after task 1, with tasks 2 and 3 never planned; and a running plan couldn't plan a task at all. Now a plan runs task
by task: when every phase of the tasks before it has landed, the engine plans the next task itself (the planner
reads the code that just landed), its phases join the graph and run, and the plan lands only when every task has
phases and all have landed. A person can press Plan on a task in a running plan too. If planning a task fails, the
engine doesn't retry on its own; the task shows it and a person re-plans. Test: task 1 lands, task 2 is planned once
after it, runs, then the plan lands. Also, the nav: Plan is a section; Plans and Tasks sit under it (#38, #39).

## Retry, pause, and losing the model (Sandy, 2026-10-23; PRs #32, #33)

Before driving Corner Shop through the UI, Sandy asked for three controls. **Retry** a failed (or cancelled) phase:
three more attempts, the builder told why the last failed; "from scratch" starts over from the plan's branch;
retrying in a stopped plan resumes the plan. **Pause** a plan: nothing new starts, running agents stop but keep
their worktrees and sessions, a phase that is landing finishes; **Resume** continues each from its session.
**Losing the model is not a failure**: a run that dies on a rate limit, usage limit, overload, auth or network
error gives its attempt back, its phase is queued "waiting for the model", and the engine holds all dispatch with
backoff (1, 2, 5, 10, 15 minutes), resuming the same sessions when the model answers; Observe shows the hold with
"Try now". All three are in the UI and available to the agent (retry_phase, pause_plan, resume_plan). Tests for
each path; 51 in all.
- Then the two gaps left (PR #34): **the planner** treats an outage as waiting, not failure (run interrupted,
  `task.plan_waiting`, plans again by itself after the same backoff; the task chip says "waiting for the model");
  **a conversation** says it is waiting and sends the person's last message again after the backoff, resuming the
  same session. 52 tests.

## The test bench: Corner Shop (Sandy, 2026-10-23)

Sandy: the bones are in place but it isn't functional; narrow down and make specific areas work, starting from
Observe — and "I'm not trying to figure out whether Homework Gate is good, I'm trying to figure out whether our
user interface is functional for building applications." Decision: a purpose-built test bench, **Corner Shop**
(`infinitedusky/corner-shop`, private), a tiny Next.js + SQLite shop with a real funnel, PostHog events and
feature flags, and a seeded simulator of scripted personas (browsers, mobile abandoners, coupon hunters, regulars)
that plants problems with known answers. Every stage of Self Evident gets graded against ground truth: can Observe
show the planted pattern, does Learn find it with the right numbers, does Ideate turn it into a usable idea, do
Plan/Validate/Build ship a fix **behind a flag**, does the experiment report the planted effect (e.g. +12% mobile,
nothing desktop) with the right confidence, and does a rerun of the same seed show the number move. Scripted
personas, not a model playing shoppers: determinism and known answers are the point. Homework Gate stays the
second app, the check that we didn't build for a toy.
- Built **through Self Evident**: plan `plan_9FGbB0iNKsCA` with three authored tasks (the shop; every step
  measured; shoppers with planted problems), planner running on task 1. Tasks 2 and 3 are planned after task 1
  lands, so the planner reads the real code.

## Briefs a person can read (Sandy, 2026-10-23)

Sandy: "we need our briefs to have much more legible descriptions" (with a screenshot of #29's brief: one
paragraph of `CLERK_SECRET_KEY`, `authorized_parties`, routes). The brief is the builder's text; a person had
nothing else. Now every task and phase has a **description** — one to three plain sentences, what will be
different for the people using the app, no file names or code — shown first everywhere; the **brief** is the
builder's Markdown, folded under "For the builder". The planner writes both (title as an outcome, description for
a person, summary in short paragraphs, one action per step with its technical note under it); the composer and
the agent's `create_plan` take a description. Existing plans: a `describe` step (one model call per plan, no
tools, structured output; `POST /plans/:id/describe`) wrote 42 descriptions across Homework Gate's five plans.
Migration 0007.

## The wall between apps (Sandy, 2026-10-22; PR #20)

Sandy: "we still have the issue of app_id not being a hard wall between the apps. I am seeing plans when I switch
apps that stay the same." Three gaps, all closed: a plan page is addressed by id and stayed put when the app
changed — now the app follows the plan you open, and switching the app while on another app's plan leaves it for
that app's Plan/Build list; the list pages kept their last result until the next fetch — they clear on switch;
and the agent's engine tools were not scoped — now each conversation's tools see and touch only its own app
(plans, ideas, now, events filtered; anything addressed by id is checked and refused if it belongs elsewhere).
The list routes (`/plans`, `/ideas`, `/now`) refuse to answer without `?app=`. The database side (`app_id` on
every row, composite keys) was already there; this is the wall in the two places that read it.

## Conversations: several at once, pinned, each in its own worktree (Sandy, 2026-10-22; PR #19)

Sandy: "we need to have multiple agent sessions. And the session gets somehow pinned to what it worked on… the
ability to move around to radically different places without abandoning the current conversation." Then: "maybe
that's just context." Both: the page context travels with every message (already); the pin is what survives when
you walk away — the name, the link, and the files the conversation is touching. Built: open conversations are
**tabs** in the drawer, across apps; picking one doesn't change the page. A conversation is **pinned on first
contact** (the plan or idea it started on, else the first thing said; renameable). Each gets **its own worktree**
of the app's repo on `talk/<id>` cut from `origin/<default>`, so edits are cheap by the risk rule and a PR is the
natural end; ending it removes the worktree and keeps the branch only if it has commits. Seen live: a
Homework Gate conversation pinned to "Spaced repetition" edited `poc/README.md` on `talk/zoihqo` with the main
checkout untouched; a Self Evident one answered from its own worktree; ending it removed the worktree.
- Caught on the way: "ended, branch kept" fired because the branch was compared with local `main`, which was
  behind `origin/main` (PR #6 had been merged from elsewhere); now compared with the base it was cut from.
- Open question for later: a conversation that opened a PR could show that PR in its tab, and Build could list
  conversations' branches alongside plans.

## Auto-approve by risk in the agent's conversations (Sandy, 2026-10-22)

Sandy: "we need to use the auto approve based on risk or (cost) in the chat sessions." The planner's rule — the
server sets the cost, the person decides the expensive ones — applied to the agent's hands. `engine/src/risk.ts`
rates every tool call, never the agent: **free** (reads, the engine's read-only tools), **cheap** (edits on a
branch, tests, typecheck, builds, keeping an idea, drafting a plan), **moderate** (commits, branches, pushes,
PRs, installs, running a process, edits in a checkout that is on main, running the planner, answering a question
for the person), **expensive** (main, force, deletes, merges, publishing, remote writes, starting a plan, anything
outside the checkout). A PreToolUse hook rates each call: up to the conversation's threshold it runs and is
logged as an `auto` row; above, a card asks, showing the risk and why; expensive always asks. The threshold is a
select in the drawer (asks for everything / runs cheap things / runs up to moderate), default cheap, stored on
the session (migration 0004). 40 tests, six of them on the rating itself (pipelines, redirects, main vs branch).
- Found on the way: the agent's cwd is the app's main checkout, so any edit there rates moderate ("main is
  production"). The right shape is a worktree per conversation on its own branch, so edits are cheap by
  construction and a PR is the natural end; next.

## On main: the web UI, the agent, the name (2026-10-22, PR #12 merged, with #10, #11, #5, #13)

Sandy: "anyway merge it you need to or whatever." Merged #13 (MIT license, root README) first because the repo
was already public without one, then the whole chain as one merge of `web-first` retargeted to `main` (it carried
#5, #11 and #10; GitHub marked #10 and #11 merged by inclusion, #5 closed with a note). Before merging: the latest
log merged in, `main` merged in, typecheck, 34 tests, a UI build. The brother's details in this log were softened
to "a teenager in 8th grade, in Sandy's family" first.
- **Fresh-clone test** (the thing a stranger does): `git clone … && pnpm install && pnpm dev` → engine and UI
  answering in 4 s. The README's "Try it" is written from that run, with the honest requirements: Docker, Node
  24, pnpm, Claude Code signed in.
- **Nav, final for now** (Sandy: "we don't need a talk page… add plan to the left nav instead of mockup, that is
  part of building, or planning, maybe we have a validate section: plan, validate, build"): 🔭 Observe · 🧠 Learn ·
  💡 Ideate · 📋 Plan · 🧪 Validate · 🔨 Build, then Settings. Plan lists the drafts and starts new ones; Validate
  holds the mock-ups, variants and previews and the checks a build is held to; Build is what runs and what landed,
  with Graph under it. The Talk page is gone; the agent is the drawer.
- The dev stack now runs from the main checkout; merged worktrees removed. Doc-only changes like this one go
  through small PRs I merge myself under the same "merge it if you need to".

## The name, again: Self Evident (Sandy, 2026-10-22)

Sandy, after a day with Olimb: "less sold on this name" — properplan, buildrite, then "Self Evident is nice too,
the thing proves itself." The test that settled it: the goal is strangers trying it on GitHub, so the name has to
say the idea before anyone reads a line. Olimb named the loop but needed the five icons to explain itself;
properplan and buildrite each named one stage (and the last one, ceremony). **Self Evident** names the idea: the
mock-up makes the decision self-evident, the shipped build proves itself through telemetry, the promises are
clauses the app asserts about itself. Checked: `selfevident` free on npm and PyPI; `self-evident.dev`,
`selfevident.dev/.ai/.io` no DNS; three repos on GitHub with the name. Repository renamed to
`infinitedusky/self-evident` (GitHub redirects `olimb` and `idea-factory`); it is **public** as of today.
In code: packages `self-evident` / `@self-evident/engine`, CLI `pnpm se …` (`if` kept), wordmark "Self Evident."
with the accent period, the five icons stay as the nav and the loop; the agent introduces itself as Self Evident's.
The adverb is the engine's voice ("Landed, self-evidently"). Lesson for the record: a name that needs its logo to
explain it is a name for people already inside.

## The name: Olimb (Sandy, 2026-10-22)

Sandy: "olimb… stands for observe, learn, ideate, mockup, build." The acronym is the thesis in order — Observe
(telemetry, the floor) → Learn → Ideate (the inbox) → Mockup (decide on something real) → Build (plans, phases,
PRs) → back to Observe — and it sounds like "climb". Checked the same minute: `olimb` is free on npm and PyPI;
`olimb.dev`, `olimb.ai`, `olimb.io` have no DNS (confirm at a registrar); `olimb.com` is taken; the GitHub user
`olimb` exists, `infinitedusky/olimb` is free. Same day: Sandy renamed the repository to `infinitedusky/olimb` (private still; going public next), and the
product is renamed in code on PR #12 — brand **O.L.I.M.B** in the UI with the five words under it, packages
`olimb` / `@olimb/engine`, the CLI `pnpm olimb …` (`if` kept as an alias), the agent introduces itself as
Olimb's, PR bodies say "Built by Olimb"; the app row inside the factory is now "Olimb". Kept as they were: the
local folder name (Claude Code's memory is keyed by it), the Postgres user/database/container `ideafactory`
(renaming would orphan the volume for no gain). "Auto Olimb" (Sandy) is the name for the mode where nothing
waits for a person: a PR merges itself when its checks hold and rolls back on the signal. SHAPE.md's title
changes when PR #6 lands.
- **The logo** (Sandy, same day): the five steps as five emoji, close together — 🔭🧠💡✏️🔨 — "it is fun."
  Considered first (`app/public/logo-ideas.html`, kept as the record): "climb" with the C closed into an O by a
  pencil, by a climber, by a thin line; a tree whose hollow is the O; the letters alone with accent periods; the
  letters with the five words under them. The emoji won on the thing that matters for this product: it is the
  loop, readable by a teenager, and nobody has to be told what it means. Known cost, accepted: emoji render
  differently per platform; if that ever bothers us, swap in one fixed set (Noto or Twemoji) as inline SVG. Then settled
  (Sandy): the **wordmark** O.L.I.M.B at the top of the site, the **five icons as the nav** — the nav *is* the
  loop: 🔭 Observe (Now), 🧠 Learn, 💡 Ideate (the inbox), ✏️ Mockup, 🔨 Build (plans, Graph as its view), then
  Talk and Settings — and the **emoji row as the logo outside** the site (README, social). Sandy: "plan and task are
  not really part of that, they are a way of building" — so Build is the stage and plans/tasks/phases are its
  machinery, the way Now is inside Observe. Learn and Mockup exist as pages before their content, each saying what
  exists today and what lands there, so the loop is whole in the nav from day one. The bulb is the favicon.

## Talk: an agent you can talk to, in the UI (2026-10-22, idea-factory PR #12)

Sandy: "the big missing piece is an agent we can talk to. We need this environment." Built as `engine/src/talk.ts`:
an interactive Agent SDK session the engine owns — the same Claude Code the planner and the builders run, with a
person on the other end. Its cwd is the factory checkout (so CLAUDE.md, LOG.md, SHAPE.md are its context) or an
app's repo; **the engine is its MCP tools** (`createSdkMcpServer`: now, plans, plan_graph, ideas, create_idea,
create_plan, plan_task, answer_question, start_plan, cancel_plan, events); reads are free, **edits and commands
wait for the person's yes in the UI** (Allow / Allow for this conversation / Deny — Claude Code's default mode,
in the browser). The transcript is rows (`session` now has kind/cwd/agent_session_id; `session_message` has
kind/payload; migration 0002) plus `talk.*` events, so a conversation survives a restart and resumes from its SDK
session id. Streaming input: one long-lived `query()` with an async-iterable prompt; each person's message is
pushed in; each turn ends in a `result` row. UI: `/talk`, sessions on the left, the conversation (tool calls
folded, results collapsible), permission cards, Stop / End.
- First exchange, from the web: "What needs me right now?" → it called `mcp__engine__now`, answered with the open
  spaced-repetition question and the demo plan ready to run, and recommended which to do first. 5 rows, one turn.
- Decided on the way: the agent may edit the factory itself from the web, every edit and command approved; no
  hard deny on push/PR for this agent (the person is the guard), unlike the builders.
- **Then, same day (Sandy: "overlaid on the whole app, so it follows you around and you can ask it to do
  whatever")**: the agent is a drawer on every page (floating button, ⌘J), one conversation carried along; each
  message is sent with where the person is (`context: {path, planId, appId}`), which the engine turns into one
  line the agent sees ("The person is looking at plan … (drafting; 1 task, 3 phases, 1 open question)") while the
  transcript keeps the plain text. Checked on the spaced-repetition plan: "what's still open on this plan?" → it
  called `plan_graph` for that plan unprompted and answered specifically.
- **One app at a time** (Sandy): the current app is picked in the nav and highlighted; Now, Plans, Ideas, the
  Graph and the agent's working directory follow it (`?app=` on the routes). **The Idea Factory is now an app**
  (repo `infinitedusky/idea-factory`, local checkout, `pnpm -r test`), so it is built through the same
  machinery as Homework Gate — the "build the factory inside the app" loop Sandy asked for.
- **The app is the conversation** (Sandy: "the app you are on should determine the chat and only one at a time,
  so we can remove the dropdown"): one open conversation per app (`POST /talks/current` finds or starts it); the
  drawer and the Talk page show the current app's and switch when the app switches; Start over ends it and begins
  a new one; earlier conversations about the app are listed, read-only.
- **app_id on every row** (Sandy saw Homework Gate ideas while on the Idea Factory app; asked whether the tenant key
  belongs on every table or only on the parent — answer: every table, the multi-tenant norm, because derived
  scoping leaks the first time a join is forgotten, and RLS/sharding need the column). Done: every table below an
  app carries `app_id`, required; composite foreign keys tie each row to its parent's app (`(plan_id, app_id) →
  plan(id, app_id)` and likewise task/phase/idea/session); `(app_id, …)` indexes; migration 0003 hand-ordered
  (add nullable → backfill from the parent → drop development chatter with no app → require → keys). Conversations
  and events now require an app; a talk session's cwd is the app's checkout. The visible leak was the UI: the
  design-note idea files were shown regardless of app, and pages fetched once before the current app was known.
- Next: previews per branch; decisions approvable. With this, the loop closes: work in the UI, talk to the agent
  there, come back to this chat only when the factory itself needs a fix the agent can't make.

## Web first: the UI becomes the place Sandy works (2026-10-21, idea-factory PR #12)

Sandy: "I need to get Idea Factory to a place where I can start interacting with it on the web, or else I'm never
going to know what it's doing… building Homework Gate through there, coming back here when we notice problems to
fix on Idea Factory." Decision: the web UI is the working surface; this chat is where the factory gets fixed.
Local only for now. Done tonight on `web-first` (stacked on #11 → #10):
- **One command, one address**: `pnpm dev` at the root brings up Postgres, the engine and the UI
  (http://localhost:5180); `pnpm start` serves the built UI from the engine on :4000. API under `/api`,
  migrations on boot, deep links.
- **Now** at `/`: needs-you (failed phases, open questions, drafts to plan or run, landed plans with a PR waiting),
  each with its action; running plans with each live phase's current step and what's held; just-happened. Live.
- **Settings**: apps and repos (test command, model, budget) edited on the web; add an app. No CLI for setup.
- **Plan page**: Plan / Re-plan a task (clears the planner's output and runs it again), Discard draft, Cancel plan
  (agents aborted, landed work kept, worktrees removed; an aborted run no longer re-queues its phase).
- **Graph**: edges only, left to right by what a phase waits on; the dashed file areas are gone.
- **Ideas inbox**: type it, it's kept; "Make it a task" (a plan of one, the body as the brief) or "Break it
  down" (the composer prefilled). Tonight's two captured ideas went in through it.
Still to do for "usable for Homework Gate": previews per branch (`preview_cmd`), decisions approvable. Waiting on
Sandy: merge #5 → #11 → #10 → #12, and the two POC variants on homework-gate #18. The dev stack runs from the
`web-first` worktree until then: http://localhost:5180.

## The factory by hand: the spaced-repetition POC (2026-10-21, homework-gate PR #18, draft)

The first task done the thesis's way: a proof of concept to react to *before* planning, instead of decision cards.
Branch `spaced-repetition-poc` in its own worktree; Storybook stories rendered from the real templates with sample
data; app on 8002, Storybook on 6008 (`STORYBOOK_APP` override added so a Storybook can point at any checkout).
- **What it shows**: quiz with a returning question in slot 3, unmarked (two variants: new version / exact same);
  result page for *first miss, still passes* (banner says it will come back), *second miss holds the gate* (the
  4-of-5 banner that explains itself), *returning question cleared* (two variants: done / comes back once more);
  parent page with a **Coming back** card (first missed, how often, waiting / due / holding the gate) and tags in
  the quiz table. Templates render nothing new without the new data; no routes, storage or grading touched.
- **What it took**: ~25 minutes by hand. Three template conditionals, ~60 lines of sample data, two manifest
  edits, the existing `test_stories.py` as the check that every story renders (it caught a missing `endif`).
  Compared with the planner's run on the same task: $1.16 and 220 s produced seven decisions to *read*; this
  produced eight screens to *look at*, and the two real questions fell out as variants rather than cards.
- **What the tool needs, from doing it by hand**: (1) a *POC phase* the planner emits first for anything with a
  surface — stories + sample data + manifest entries, landing as a branch, verified by "every story renders";
  (2) **a preview per branch**: a Storybook (and app) per worktree, with a link on the plan page — I had to find a
  free port and add an env override by hand; (3) variants as a first-class thing: a question = two stories side
  by side, and the pick becomes the decision row; (4) the agreed POC should become the phase's checks: each story
  a verification shot, the behaviours in it the clauses.
- Waiting on Sandy: look at the eight stories, pick the two variants, and say whether this is a plan to build.

## Telemetry floor: PostHog live for Homework Gate (2026-10-21)

Sandy supplied the PostHog project (677236, US cloud): a personal API key (`phx_`, for reading — engine `.env`)
and the project token (`phc_`, for sending — Homework Gate `poc/.env`); both gitignored, never committed. PR #9
tested from a detached worktree before merge: parent sign-in, open, close, schedule → three `parent_action`
events in PostHog within seconds, super-properties `app=homework-gate`, no free text. 22 tests pass. Recommended
merge; after it, restart the app on 8000 with the key, then the engine's first `evidence` read from this project.
- **Decided (Sandy: "we can start, we aren't being perfect")**: OpenTelemetry is the protocol apps speak (clauses
  and sensors are spans); **PostHog is the destination** — it ingests OTLP traces over HTTP (alpha,
  `/i/v1/traces`, project token) alongside product events, so evidence reads come from one place. No Jaeger of
  our own (InDusk shipped Jaeger + otelcol binaries; that weight stays behind). Fallback if querying spans back
  out of PostHog proves thin: a stock OTel collector fanning out to PostHog and a local Jaeger for development.
- Idea captured, not chased (Sandy): PostHog as the design comp for a more teenager-friendly Homework Gate; a
  mascot *team* from Tchaikovsky's *Children of Time* — a jumping spider, an octopus, a pair of crows, a mantis
  shrimp. For the design pass.

## The thesis: decide fast on something real, then let the machine hold the line (Sandy, 2026-10-21)

Sandy, questioning whether PRs are the right unit: the goal is speed, and the expensive mistake in the usual way
of working is deciding *after* building (sunk cost). So:
1. **Decide fast, on something real.** Pre-plan proofs of concept and mock-ups — a Storybook story, a clickable
   prototype behind a flag, two variants side by side, a measurement for plumbing. Agreement is on the thing, not
   on a description of it. The brief and the planner's decision cards were a document standing in for this.
2. **The decision becomes the checks.** Every behaviour in the agreed POC turns into something the machine holds:
   a story, a test, a clause the running app asserts. The build is verified against the decision and keeps being
   verified. Regression by promise, not by suite: only what someone agreed to is ever tested.
3. **Telemetry catches the rest; recovery is the metric.** No attempt at full coverage; accept problems in
   production that get fixed very quickly. The signal arrives with enough context to revert the PR or open a fix
   task on its own. Optimise time-to-fix, not time-between-failures.
Consequences: the PR stays the delivery and rollback unit but stops being what anyone watches; the UI leads with
the POC before a plan and the signal after a merge; the planner's first phase for a task is the POC phase, landing
as stories; telemetry is the floor, not a later feature (Homework Gate: the PostHog token and PR #9 are next). The
cross-plan / lazy-planning engine work (entry below) is paused as premature until this is tested by hand: the
spaced-repetition POC in Storybook (quiz with a returning question unmarked, result page saying why 4-of-5
failed, the parent's "coming back" card, the two open questions as variants), agreed, then re-planned from it.
SHAPE.md should open with this once PR #6 lands.

## Plans know about each other (Sandy, 2026-10-21)

The model, in Sandy's words: a **rough plan** — tasks with briefs, in order; some tasks run in parallel, others are
*planned* only after what they depend on has landed, so the planner reads the result instead of predicting it.
**Plans know what other plans are doing**: plan B can say "wait for phase 3 of plan A to land before we plan our
phase 3; but phases 1 and 2 are plumbing we need regardless, so they go now, in sequence; and our phase 3 depends
on their phase 4." In engine terms, three missing pieces on top of what runs today (global scheduling across
plans, file claims, planning per task on a click):
1. **Dependencies cross plans** — a phase may depend on a phase in another plan (`addPhases` currently refuses).
   Crossing a plan means crossing a PR boundary, so the dependent phase's base must include the other plan's
   landed code: **stacked** (merge `plan/A` into B's branch when B.3 starts; B's PR marked "stacked on A", can't
   merge first) rather than waiting for A to reach `main`, which would park B behind A's review. Decision pending
   Sandy's yes on stacked.
2. **Lazy planning as a rule** — a task declares what it plans after (the task before it; a phase of another
   plan); when that lands the engine plans it, or marks it ready to plan when a person wants to read the result
   first.
3. **The planner sees the app graph** — other plans' tasks, phases, files and status in its prompt, so it can
   declare cross-plan dependencies and keep off files another plan is mid-way through.
**Edges imply a planning step** (Sandy). At every level: an edge into a task means "plan this task when that has
landed" (the planner runs then, reading the result); an edge into a phase means "build this when that has
landed" (the builder starts then, reads the real code, writes its own steps). A plan is the rough shape — tasks
and the edges between them, inside the plan or into other plans' phases; phases are what planning a task
produces; steps are what building a phase produces.
**Files are not a concept anyone designs.** They come out of planning: the planner just read the code and
declares what each phase touches; the scheduler uses the claims like locks. The order between two phases that
share a file is never anyone's decision, so it is not structure in the graph: show it only when it bites — the
held reason on the waiting phase, and the file list on a selected phase. The per-file dashed areas (tried today;
unreadable when one phase touches eight files) come out. Graph = edges only, every edge "planned after".
Also: a dependency means "built on the other's *landed code*"; no human decision sits between phases — the
coarser unit for "look at the result first" is the task. Idea captured, not chased: the whole graph isometric,
in layers like a circuit board.

## The planner (2026-10-21, idea-factory PR #10; UI on PR #11)

InDusk's planning approach on the new foundation, as `engine/src/planner.ts`. `POST /tasks/:id/plan` runs one
Claude Code session read-only in the app's checkout (Read/Glob/Grep/LS, read-only git/ls/cat; everything else
denied) with the task's brief, the plan's why, the earlier tasks and the test command, and gets back **one object
the SDK validates against a JSON schema**: phases (summary for a stranger to the plan, steps with technical notes,
behavioural checks, done-when, files, depends-on), decisions (chosen, rejected, reason), questions (options with
what each changes, a recommendation, a cost), notes. One self-review pass inside the same run, no hash-chained
review. Rows: phases through the same `addPhases` a person uses (brief composed from the proposal), `decision`
provisional until approved, `question` open; a `run` of kind `plan` on the task carries cost and session. **The
server sets the cost**: any option that changes what was agreed makes the question expensive, whatever the agent
said (InDusk's rule, kept). Events: `task.planning`, the run's messages, `question.asked`, `task.planned` /
`task.plan_failed`; the request returns 202 at once (`?wait=1` to hold). Tests with a fake proposer; 27 passing.
- **First live run** (plan `plan_s7LcjyCmlBFn`, one authored task, "Spaced repetition on missed questions", brief
  in Sandy's words): Opus, 10 turns, 220 s, $1.16 est. Three phases in a chain (memory + due logic → wired into
  the quiz and the gate rule → parent page), each with files, steps with technical notes, checks and done-when;
  **seven decisions** each with rejected alternatives and a reason (kept the 4-of-5 threshold; returns from the
  next night, never a same-night retry; returning questions take slots inside the five, unmarked; plugs in only
  through `quizzes.passed`; a `review_items` table); **two questions**, both raised to expensive by the server
  because an option declares what it changes ("same question or a new version of it?", "done after one right
  answer?"); notes with its assumptions. It read as a plan I would approve. Started from the UI's Plan button;
  the page updated live.
- **Found while watching it: every agent guard so far was inert.** The SDK auto-approves bare names in
  `allowedTools` before `canUseTool` is consulted, and allow rules from settings files shadow the callback too
  (Sandy's own settings allow `Bash(git push:*)`). So "no push / no checkout / no gh pr", "edits only inside the
  worktree" and the planner's read-only rule never fired; nothing went wrong only because the agents did as told.
  Fixed in `engine/src/guard.ts`: the guard is a **PreToolUse hook** (consulted for every call, before any allow
  rule) and `canUseTool` as the fallback; `tools` restricts the set, `allowedTools` holds only the read tools.
  Verified live with `settingSources: ['user', 'project']`: `git push --dry-run` and a piped `git log | head`
  denied by the hook, `git status` through. Lesson for the log: a guard that has never been seen to refuse
  something has not been tested.
- Kept out on purpose: the plan-level conversation (say the brief back before planning), approval of decisions,
  late answers opening follow-ons, re-planning a task that has phases (remove them first).
- The UI moved to the vocabulary too (PR #11): phases are the nodes, labelled with their task; tasks in order
  above the graph; steps live on the node; the composer authors tasks with optional phases.

## Vocabulary and promises (Sandy, 2026-10-21)

- **idea → plan → task → phase → step.** An idea is one task or a plan of several. A plan is tasks *in order*
  (an InDusk master plan). A task is authored: title + brief (an InDusk plan). Phases are the atomic unit the
  engine schedules — one agent, one worktree, one commit, files and depends-on — generated by the planner from
  the task's brief (a person may still write them). Steps are the builder's own todo list while it builds a
  phase, captured from Claude Code's TodoWrite and shown live. Task order is an implicit dependency between
  phases. Branch and PR stay per plan. Renamed in the engine (`task` → `phase`, new `task`, new `step`);
  the initial migration regenerated and the dev database reset, since nothing has shipped.
- **Promises stay; the registry goes.** InDusk's mistake: a promise became the required way of telling the agent
  what to build. The brief does that. A promise is what must hold, **mapped directly to OpenTelemetry**: a
  **clause** is an OTel span written as true/false (a promise asserting itself inside the running app); a
  **sensor** is an OTel span that measures something, for a test or a monitor. Evidence and phase checks point at
  clauses and sensors, not prose. Schema pass after the rename: `promise`, `clause`, `sensor`.

## Planning: InDusk's approach on the new foundation (2026-10-21)

Sandy: Lightsprint's plan/task ≈ InDusk's master plan/plan; under plans InDusk had **phases**, which the agent
creates from the plan's brief — the person never writes them. "Here is where InDusk had it correct." The approach
was right; the file-based process ("how to work with AI to develop") turned into an app is what made it slow. Port
the approach, not the process: the brief is a row, the planner is an agent run, phases/decisions/questions are
rows, the graph runs the phases. Mapping: idea ≈ master plan; plan = title + brief (authored); phase = generated,
one agent / one worktree / one commit, declares files and depends-on. The hand-written composer rows from PR #11
were a stopgap: the real flow is brief in → proposed phases out → edit → run. A read-out of InDusk's planner
(`research/planning-from-indusk.md` when written) comes first; vocabulary rename task → phase pending Sandy's
yes.

## The graph is at the step level, across all plans (2026-10-20, idea-factory PR #10 and #11)

Sandy, restating the design (it's InDusk's, not new): **the step is the atomic unit of development** — one agent,
one worktree, one commit — and the unit telemetry and tests point back to. Steps declare what they depend on and
which files they touch; anything open and unblocked runs, whichever plan it belongs to; plans are grouping and
the PR. The engine had it one plan at a time (`tick(planId)`), so two plans never ran together and shared files
across plans were never checked. Now: one dispatch pass across every running plan, file claims namespaced by app
(different repos never collide; no claims = the whole app), one global cap; an app-level graph endpoint and a
top-level **Graph** page showing every step of every plan with dashed links between steps that share a file.
Test: two plans at once — steps on different files overlap, two on the same file never do, both land.
- Branching, confirmed with Sandy: a plan is a *branch* (no worktree), steps are worktrees cut from it at
  dispatch and landing back into it; a dependent step starts seconds after its parent lands on the plan branch,
  not when the plan's PR merges. Cross-plan dependencies aren't modelled yet (same plan, or stacked plans later).
- A detour worth recording: I proposed a recursive task/parent model; Sandy hadn't asked for it and it wasn't
  needed. The flat step graph with plan grouping is the design. Lesson for the agent: restate before redesigning.

## Engine step 4, first half: the live graph in the web UI (2026-10-20, idea-factory PR #11)

Sandy: "do we have a UI to look at?" and "we don't really have the planning setup yet to show the tasks."
Half right: plans exist as rows (three real ones), but could only be made from a JSON file. So step 4's first
half is the Plans pages in the web UI: the list, a plan's live graph (xyflow + dagre over `/plans/:id/graph`,
refreshed from `/events` over SSE), the selected task's detail, the event ticker, the PR badge, and a New plan
composer (tasks as rows) so plans can be made without the CLI. Verified live in a browser: a by-hand transition
produced the event and the node changed with no reload. The same graph component is what the VS Code webview
will host (second half). The planning *agent* (description → proposed tasks → edit → run) is the step after and
fills the same composer.
- Tedious: Vite/Storybook dependency churn restarting the dev server mid-check (twice mistaken for a bug);
  another session reclaiming port 5173. Judgement: what a node should show (status, why held, last run's cost);
  by-hand transitions only for drafts, never for running plans.
- Also raised by Sandy, captured not chased: a dyslexia-friendly font toggle (retracted a moment later; noting
  it anyway as cheap and worth doing in the design system).

## Engine step 3: parallel for real (2026-10-20, idea-factory PR #10)

Several tasks under the cap, dependents only after their parents land, retries with the reason (from the log,
so it survives a restart), recovery on boot (interrupted runs marked, tasks re-queued, the agent session
resumed, stray `claude` processes in our worktrees reaped), clean shutdown (live runs aborted), worktree cleanup
once a plan lands. Live on Homework Gate: four tasks (three independent + a README task depending on two of
them) → **PR #15 in 66 seconds**: three agents at once, landings serial (suite 21 → 22 → 27 passing on the
merged commits), the README task started only after its parents landed, PR opened at the first landing and
updated after each, four worktrees removed at the end. Runner tests with a fake executor cover the cap, the
ordering, retries, recovery and cleanup (19 tests in all).
- Found by the tests: on macOS, git reports worktree paths with symlinks resolved (`/private/var/…`), so a retry
  tried to re-create an existing worktree; and an error while preparing a worktree left the task stuck at
  `ready`. Both fixed (realpath comparison; preparation errors count as a failed attempt).
- Brief quality is the new bottleneck: the README brief claimed the file mentions CI; it doesn't, and the agent
  said so rather than inventing a section. Good behaviour; bad brief. A plan step that checks briefs against the
  repo before dispatch belongs in step 5+.
- Not exercised live yet: the restart path (covered by a test). Skipped the kill-mid-run drill to keep PR #15
  clean; worth doing once before step 4 ships.

## Engine steps 1 and 2 (2026-10-20, idea-factory PR #10)

Step 1: schema as migrations, Hono server as single writer, `event` log over SSE via `LISTEN/NOTIFY`, pure
scheduler with tests, `if` CLI. Step 2: one task end to end on Homework Gate — the engine cut `plan/<id>` from
main, a worktree per task, ran Claude Code through the Agent SDK on Sandy's login (7 turns, 27 s), merged, ran
the suite on the merged commit (22 passed), fast-forwarded by compare-and-swap, pushed, and **opened
homework-gate PR #13 itself** ("Health endpoint for the POC"). First engine-made PR.
- Bugs found only by running: CHECK constraints rendered as `$1…` placeholders (parameterised literals in DDL);
  an edit script that silently matched nothing. Both caught before commit.
- Tedious (→ the engine does it now): worktree, branch, merge, test, push, PR. Judgement: the task brief and
  file claims; reading the agent's diff. Left behind on purpose until step 3: the task worktree and branches.

## InDusk, paused

Nothing is running. Left as it stands, nothing archived:

- `admin-pages-load-fast` — landed; promise changed to "every admin page
  answers in under ten seconds"; its re-approval card needs Sandy's click; not
  closed.
- `plan-state-is-a-database` (first plan of master `state-in-a-database`) —
  planning stopped after a plan-review loop (15 of 39 fixes failed recheck).
- `run-the-graph` — approved, not built.
- `one-agent` — draft brief: one agent for the whole admin. Its idea (one
  conversation that knows the page you're on, summarises sub-agents) may
  belong in the idea factory instead.

Salvage map with paths: `research/salvage-from-indusk.md`.

## How Sandy works

- PRs exclusively: `main` is production, never commit to it directly.
- Short answers; lead with the answer. State, next step and who takes it.
- Questions are questions, not instructions to change things.
- Lead with the strongest counterargument; give a recommendation, not a survey.
- Telemetry over tests: a real signal from the running app is the proof.
- Say "local" / "this machine", not "laptop".
- Pronouns: they/them.
- Don't reinvent: check for an existing library or official integration first.
- Write decisions into the documents (this log, SHAPE.md) the moment they're
  made; the next session only knows what's written here.

## Files on the graph (Sandy, 2026-10-22; PR pending)

Watching the schedule plan run on Homework Gate (homework-gate PR #21), Sandy saw "#12 shares files with #10" and said
the hold is a dependency and should read as one; then that the dependency is on the *file*, not the phase; then asked for
the file on the graph with the phases connected to it. Research (Bazel's action graph, Make, Dagster's assets, Petri
nets) says the same: two kinds of node. Done: the scheduler names the file it held on; the engine turns it into
"waiting on phase #10 (api.py)" and lists the shared files in the graph; the UI draws each as a node between its
claimants, the holder pointing at it, it pointing at the ones waiting, undecided claimants hanging off it. Idea:
`ideas/files-on-the-graph.md`. Follow-up on the same model: claims with a mode (append), so phases that only add to a
file run together and only true overlaps re-run.
- Lesson from writing the schedule plan by hand: don't put `api.py` in three phases of one task; one phase per
  file-heavy module, or split the module. The engine's rule was right; the plan's granularity was mine.
