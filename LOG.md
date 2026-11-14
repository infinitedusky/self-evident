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

## Conversations belong to an app (Sandy, 2026-10-29: "we need to make sure that we separate conversations between apps")

The agent's tabs show only the conversations of the app picked in the nav. Switching apps switches the tabs, and
each app remembers which of its conversations was open.

## Task, not issue (Sandy, 2026-10-29: "standardize our use of task instead of issue … if you integrate Linear it will map tasks to issues")

- **Everything people and the agent see says task and sub-task:** pages, tab titles, the address (`/tasks`;
  `/issues` redirects there), the agent's tools (`create_task`, `plan_task`, `set_task_state`, …), its prompts, and
  the errors you see.
- **Connecting Linear maps tasks to Linear issues** and sub-tasks to sub-issues. Settings → Integrations says so.
- **Underneath it stays "issue":** the database, types, API paths, event names, tool parameter names like `issueId`,
  and the CLI's commands. The agent is told that those fields still say issue. Renaming them would be a large
  migration with nothing to see for it.

## Settings: which settings across the top, sections down the side (Sandy, 2026-10-29: "maybe that should be a top nav, and then the left nav is the different sections")

Settings was one long form per app. Now it's laid out like VS Code's Settings, which has User and Workspace tabs
across the top and its sections down the side:
- **The top bar** chooses which settings: All apps, then each app, then "+ App". An app inherits All apps until it
  overrides it.
- **The side lists that scope's sections,** one shown at a time, each at its own address with its own Save.
  - All apps (`/settings/<section>`): Plugins, Skills by job, Integrations.
  - An app (`/settings/apps/<id>/<section>`): Repo, Agents, Plugins, Landing, Prototype, Storybook, Integrations,
    Workflow rules.

## Workflows: the steps listed once, shaped per workflow, inherited downward (Sandy, 2026-10-29: "you don't need to attach a workflow to a project or task but you can. And it inherits")

- **The steps are one list:** research, brief, mockup, prototype. They're the same everywhere.
- **A workflow shapes them.** For each step it can switch it on or off and make it required or optional, and it can
  set an order and enforce it. This is borrowed from Jira's workflows, kept to these few settings.
- **Fixed in every workflow** (Sandy, same day: "the one constant is that a brief is always required"; then "starts
  as an idea … should be always there, but you just choose required or not"):
  - "starts as an idea" is always there and always first; a workflow makes it required or not. It can't be switched
    off, because any idea can always be converted into a task;
  - research comes next: on or off, required or not;
  - the brief is always there and always required;
  - mockups and the prototype can go before or after the brief, on or off, required or not;
  - after the brief come checks that a workflow adds or removes: an ADR, the blast radius (risk analysis), a brief
    audit, and the like.
  The rules live in one module, `engine/src/steps.ts`, which the app imports too.
- **Making a task or project, you choose its rules** (Sandy, same day: "you should be able to choose the workflow on
  the task when you create it … we just grey out the workflow that requires an idea"):
  - The New task form and the New project page have a Workflow rules picker. Rules that start everything as an idea
    are greyed out. It starts on the app's default if that allows making things directly, else on the first rules
    that do.
  - The chosen rules become the task's or project's own.
  - Only when *every* set of rules starts things as an idea do New task and New project give way to **From an
    idea**. The engine refuses the same way. Ways to enforce more come later.
- **Attaching one is optional.** A workflow can be attached to the app, a project or a task, or to none of them.
  Without one, every step is optional and the order is free.
- **It inherits:** a task uses its own workflow, or else its project's, or else the app's. The page says where it
  came from ("from the project").
- **Workflows are configuration, so they live in Settings** (Sandy, same day: "it needs to be clear that this is about
  configuring how workflows work… there shouldn't be metrics"). They're named "Workflow rules" in each app's settings.
  Nothing runs them. Plan links to them as "Configure the rules", without counts. `/plan/workflows` now redirects there.
- **Built** (PRs #72, then this one):
  - **Workflows:** stored per app; attached to the app (its default), a project or a task; inherited downward. The
    rules are one module, `engine/src/steps.ts`, which the app imports too.
  - **A task's brief** needs a person's approval. A changed brief needs approving again. Planning waits for the
    approval, and so does completing the task, along with its other required steps. Briefs written before this
    count as approved, so nothing under way got stuck.
  - **Enforced order:** a step, and the brief's approval, wait for the required steps before them.
  - **Converting an idea** into a task or a project takes its research, mockups and prototypes with it. Its rough
    draft becomes the brief, waiting for approval. "Ask the agent to convert it" lets the agent decide which.
  - **A workflow that starts tasks as ideas** refuses a task made directly.
  - **Pages:** Plan (`/plan`), which the rail opens; Workflows (`/plan/workflows`); the steps on the idea, task and
    project pages; Start hands a step to the agent in a new conversation.
  - **Not yet:** mockups are attached by story id, by the agent; there's no picker. The checks (ADR, blast radius,
    brief audit) are notes the agent writes; nothing runs them by itself.
- **The first stories** are the rail without sub-menus, the Plan page, the steps on an idea, task and project, and
  the workflow view and editor. Made-up data; built once Sandy has looked at them.

## Ideas, tasks and projects: what's possible on each, not a fixed path (Sandy, 2026-10-29: "you can't complete a task until … the brief has been approved")

This corrects the two entries below. The aim is composability: say where things are possible and what is required,
not strict definitions or a path you must walk through.
- **An idea is exploration.** It can be a single sentence. Research, mockups, a prototype and a rough draft of a
  brief can be done on it, all without committing to anything. An idea has no real brief: there isn't yet the
  rigor for one, so it would have no purpose.
- **Converting an idea** makes a task or a project. The agent reads whatever the idea has (even if it's only one
  sentence) and proposes which.
- **A task can also be made directly,** when you know it will be one. Being a task means "we're actually going to
  build this".
- **A task has a brief,** and it can't be completed until the brief is approved. Until there is a brief, the later
  steps of building it can't really happen. Research, mockups and prototypes can be done on it at any time, before or
  after the brief.
- **A project holds tasks** and has no brief of its own. It can still have mockups or a prototype.
- **Making a mockup or a prototype doesn't create a brief.** That line in the entry below is withdrawn. The brief is
  a deliberate step on a task.
- **Workflows** can still require steps or an order (unchanged).

## The rail is the stages of work; everything else is inside them (Sandy, 2026-10-29: "you don't go to projects from the left nav. You go to plan")

- **The rail holds only the stages:** Observe, Learn, Ideate, Plan, Build. They are the categories of work on the way
  to deploying something, so they have no sub-items: no Projects, Mockups or Prototypes under them.
- **Each stage opens on its own page,** and what you work on is there. Plan has projects and tasks; a task has its
  brief and its steps.
- **Steps are things you do to an idea or a task,** not places: research, brief, mockup, prototype. Listing them in
  the rail would make the process look fixed, when it is meant to be composable.
- **An idea is an ephemeral task or project.** Research, mockups and a prototype can be done on the idea, without
  committing to anything. When it's brought into Plan, they come with it into the task's brief.

## A task does its steps in any order; workflows can enforce one (Sandy, 2026-10-29: "you can do it whatever order you want … but you could create workflows that would enforce a specific order, the way Jira works")

This replaces the fixed order in the next entry (mockup, then prototype, then project).
- **A task is a named thing with a description.** That's all it needs to start. In the schema it is an issue, which
  already has a title, a description for people and a brief for the builder.
- **Its steps:** research, brief, mockup, prototype. They happen in any order, and any can be skipped. You work with
  the agent on the task and say "do this, do that".
- **The brief is where the steps come together** for the build. (Corrected in the next entry up: making a mockup or a
  prototype does not create a brief.)
- **The prototype is the agent's quick attempt at the task, actually coded and working.** It skips the planning
  process. It still uses sense about security and the rest, but doesn't go through the full process. It becomes a
  key artifact in the real development, which starts from the brief.
- **Workflows are optional and enforce an order.** Like Jira's workflows: a workflow can require steps, or an order,
  for the tasks it covers. Without one, every step is optional and the order is free. Where a workflow is attached
  (app, project or kind of task) is still open.
- **The nav:** everything stays under Plan, but Plan doesn't list the steps. Mockups and prototypes are reached from
  their task. Plan's pages become Projects, Issues and To-dos.
- **In code, not built yet:** the prototype points at its task (an issue) instead of a project; mockups get attached
  to tasks (today they are only Storybook stories); workflows are new.

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
- **The agent builds it (same day).** Each prototype has its own conversation, which works in the prototype's
  worktree (not one of its own, so ending it leaves the prototype alone). It acts up to moderate without asking,
  since a prototype is for speed; expensive actions still ask. `start_prototype` takes a brief, written by the agent
  that starts it from everything said so far. The new conversation begins with that brief (shown as a card) and
  builds a first version at once. The engine then switches the agent's column to that conversation (a `ui.talk`
  event) and opens the prototype beside it.
  - The prototype rules are in its system prompt: speed over quality; shortcuts by default; made-up data; no
    migrations; never push, open a PR or merge.
  - The agent commits after each change with what and why, and marks faked work with `shortcut:` lines. Those
    commits are the record the analysis reads.
  - A restart keeps the same port, and the open tab follows its server's events and reloads.
  - 💬 on a prototype brings its conversation to the agent's column.
  - Tried live on a throwaway repo. From the brief alone, the agent built a product list with a cart count, committed
    it with two `shortcut:` lines, restarted and checked it answered. A follow-up typed in the UI changed it again,
    and the tab showed the change by itself.
- **Sharing: Cloudflare quick tunnels** (Sandy, 2026-10-29). `cloudflared`, no account: a random trycloudflare.com
  link per prototype while it runs.
- **Its data (same day).** An app's `prototype_db` names three things: its development Postgres server, the variable
  it reads (default `DATABASE_URL`), and its schema command.
  - Each prototype gets a database of its own on that server, `proto_<slug>`. It is made by the schema command, run
    in the prototype's worktree, so the prototype's own schema changes count. It is then filled from a scenario:
    `.prototype/scenarios/<name>/<table>.json`, each file an array of rows, committed with the prototype.
  - Rows load with `jsonb_populate_recordset`. Foreign keys are off while loading, so files can come in any order,
    and serial columns are moved past the loaded rows.
  - Reset builds the database again from a scenario (or empty) and restarts the server. Save writes the current
    rows out as a new scenario, leaving out migration bookkeeping. Discard drops the database.
  - The server and the conversation both get the variable pointing at the prototype's database.
  - Agent tools: `prototype_data` (reset or save) and `set_prototype_database`. The prototype prompt tells the agent
    to write a scenario for each situation worth showing.
  - The tab shows "Made-up data" with the scenario, rebuild, and "save as".
  - Homework Gate fits: its server reads `DATABASE_URL`, and its schema comes from its own SQL migrations.
  - Tested against a real Postgres: schema from a command, a child table loaded before its parent, save, reset to
    each scenario and to empty, the variable reaching the server, drop on discard.
  - Found and fixed: `tsc -p .` in `app/` checks nothing (the root tsconfig only references others). Use
    `pnpm --filter app typecheck`, new. Two unused imports from #65 had broken `pnpm build`.
- **Not yet:** stand-ins for outside services, sharing, and the analysis into the plan.

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

## A task's own nav (Sandy, 2026-10-29: "the task show the steps where it is in its workflow … a home for the task … you can't go to them until you've done the ones that are required")

- **A task is laid out like Settings:** its own nav down the left, after Linear's issue sidebar.
  - **Overview** first: what it's for, what still stops it completing, the next step, and the workflow in force.
  - **Its steps**, in the workflow's order, each marked ✓ finished, ◐ started, or ○ not started. A dot marks a
    required step that isn't finished.
  - **The build:** sub-tasks, and Plan.
- **Each section has its own address** (`/tasks/:id/:section`) and its own page. A step's page says what the step is
  for, shows what it has so far, and gives the way on: start it with the agent, ask the agent to carry on, mark it
  done, or open what it made. The brief's page holds the brief and its approval.
- **Locked:** with an enforced order, a step after an unfinished required one is greyed out ("after the brief's
  approval"), and so is the build until the brief is approved. Opened by its address, a locked page says what comes
  first and links there, so it's never a dead end.
- **Sub-tasks and to-dos** keep the single page.
- **Found on the way: one event stream per address.** Each view used to open its own stream. Over HTTP/1.1 Chrome
  allows six connections per host, so a workspace with a second task tab open ran out, and the next page hung on
  Loading (likely the spinning seen earlier). Views now share one connection per address (`openEvents`).

## A task always has a workflow (Sandy, 2026-10-29: "it's either the default … or it's one of them. But it can't be nothing")

- **Every app has a default workflow.** A new app gets one called "Default": the idea, research, mockups, the
  prototype and the brief, in any order, with only the brief required. The app's default can be changed but never
  cleared, and the "None" option is gone from Settings and the new-task picker.
- **A task follows its own workflow, or else its project's, or else the app's default.** Its nav names it, e.g.
  "Workflow: Default, the app's default".
- **Existing apps (migration 0006):** an app with workflows but no default took its oldest one (Homework Gate:
  "Main"); an app with none got "Default".

## Integrations: their own settings, a shape, and steps (Sandy, 2026-10-29: "we create like integration steps essentially within the workflow")

- **Asked:** could a step like the ADR publish an RFC to Confluence? Rather than hooks hidden behind a step, an
  **integration step** goes in the workflow between other steps, so it shows in the task's nav, can block, can fail
  visibly, and can be run again. Linear can work the same way (create the issue after the brief, comment the ADR,
  move it as the build goes), a lighter way in than Linear as the plan store.
- **No fees** (Sandy: "I want to give this away"): official APIs and SDKs, keys in the engine's environment, no
  Composio. Lightsprint doesn't run on n8n: it publishes an n8n node so n8n users can call it, which we might do one
  day for the same reason.
- **Order:** (1) Settings → Integrations: a list and a page for each (what it does, its values, its key, a check of
  the connection, the actions it offers), with Linear and Confluence added; (2) integration steps in workflows and a
  runner; (3) the actions themselves, Confluence's publish first.

## PostHog finds, Self Evident builds: the plan (Sandy, 2026-10-31)

- **Why:** Sandy wants the benefits now without building the harness first. PostHog's self-driving loop is "exactly
  the right thing", but it runs its own copy of Claude Code (in its cloud, or PostHog Desktop on its credits), not
  ours. Its inbox is open over MCP and the API, so Self Evident can sit on top of it: PostHog finds and fixes small
  things; we take the bigger ones through our steps. Detail in SHAPE.md.
- **For a new project today:** Claude Code with Superpowers (brainstorm → plan → build), Conductor for parallel
  worktrees, and PostHog with its scouts on. Self Evident keeps going alongside and takes over as its steps beat that.
- **The project** (Self Evident, `proj_ZSHO1EEJS91N`), tasks in order, each waiting on the one before:
  SE-1 documents pass a reader test · SE-2 find what PostHog's inbox gives us · SE-3 PostHog as an integration the
  engine calls · SE-4 agents can query PostHog · SE-5 reports in Observe · SE-6 take a report · SE-7 PostHog's PR as
  a task's build · SE-8 resolve the report when our work lands · SE-9 show what changed after it shipped · SE-10 docs
  for the PostHog connection.
- **Docs, and skills for them:** the catalogue had no Documentation job; added to research/skills.md. Anthropic's
  `doc-coauthoring` is the best found: we borrow its reader test (SE-1); the rest is interactive with its own file.
  PostHog's official `signals` skill is adopted for the agents with its MCP server (SE-4). The Diátaxis skills on
  the marketplaces are unvetted copies: skipped for now.

## Switching apps: a strip of its own, and no snapping back (Sandy, 2026-10-31: "changing takes it back to self evident again and again … we are switching tenants, not just agents")

- **The bug:** each app keeps its own tabs. A Self Evident project page had been saved among another app's tabs, and
  a project page used to switch the app to its own when it opened. Switching to that app restored the tab, the
  tab switched back to Self Evident, and so on.
- **Fixed:** only the address you arrive by can change the app. A project or task link of another app switches to
  that app first and opens there. A project page saved among another app's tabs says which app it belongs to, with
  "Open it in …", and no longer switches the app itself.
- **Apps get their own strip** (Sandy: "a vertical tenant nav bar to the right of the main one. that is how slack
  does it"): a square per app beside the rail, the app's key on it and its name on hover, + to add one. The
  picker that sat atop the agent's column is gone: switching apps switches everything, not just the agent.

## One conversation, in the terminal and the UI (Sandy, 2026-10-31: "share sessions with selfevident so I can talk to the same agent here and in the UI")

- **Why it's possible:** the UI's agent is a Claude Code session (the Agent SDK), kept where Claude Code keeps every
  session (`~/.claude/projects/<folder>/<id>.jsonl`). `claude --resume <id>` in that folder continues the same
  session in the same file (checked: same id, same file). So the file is the conversation.
- **UI → terminal:** "Terminal" in the conversation's header hands it over. The engine lets go of it and gives the
  command: `cd <its worktree> && claude --resume <id> --mcp-config …`, which brings the engine's tools for the app.
  Refused while the agent is mid-turn, so the two never write at once.
- **Terminal → UI:** `pnpm se talk share` in the folder (or the `share_session` tool, for a Claude Code session
  connected with `se connect`) brings a session started there into the agent column, with its last 200 turns.
  Its folder is the person's own, so ending it in the UI never removes it.
- **While it's in the terminal,** the engine follows the file (every two seconds, read only when it grew) and copies
  in what's said there, marked "in the terminal". Which process wrote a line can't be told from the file (its
  markers depend on how each process was started), so copying happens only while the conversation is handed over,
  from the line it was handed over at. A message sent in the UI takes it back: the rest is copied, the note says
  so, and the engine resumes the session.
- **Not the same in both places:** the terminal session has the engine's tools but Claude Code's own permission
  prompts, not the UI's risk ratings, and not the UI's system prompt.
- Checked end to end with real Claude Code: brought in, a terminal turn showing up in seconds, taken back by a UI
  message, handed off again, and the terminal remembering what was said in the UI.

## Picking a Claude Code session from the UI (Sandy, 2026-10-31: "can the ui list the conversations here and let us select?")

- **⌨ in the agent column** lists the Claude Code sessions run on the app in a terminal or VS Code, newest first, the way
  Claude Code's own `/resume` does: title, when, branch. Picking one brings it in (the same as `se talk share`); one
  already here is marked and just opens. No command needed.
- **Which sessions:** the app's checkout and its other worktrees (`git worktree list`), not the engine's own under
  `<repo>-worktrees` (builds, prototypes, conversations started here). The 20 newest.
- **Titles:** Claude Code writes `custom-title` (`customTitle`, a name the person gave it) and `ai-title` (`aiTitle`).
  The person's wins. We had been reading a `title` field that isn't there, so brought-in conversations had no name.
  Read from the file's last 512 KB only (a long session runs to 150 MB); with no title, the first thing the person said.
- **Also fixed on the way:** the live feed sent one page of a long replay and then one page per new event, so a
  screen starting from the top of the log never reached live events (#87). The command is `pnpm engine se talk share`,
  not `pnpm se …` (no root script).

## The agent asks less (Sandy, 2026-10-31: "I keep having to say yes to different MCP commands, bash, etc.")

- Every recent ask was **moderate** (commits in its own branch, the engine's own actions like converting an idea,
  commands the engine doesn't recognise) in conversations set to **cheap**, the default for ordinary and brought-in
  conversations. Prototypes already started at moderate.
- **Now:** a new conversation starts at **up to moderate**: it works in its own worktree and branch, so moderate is
  contained. **Expensive still always asks** (pushing main, deleting, spending).
- **The level you pick sticks:** changing it in any conversation makes it where the next one starts (kept on the
  workspace, `talkAutoApprove`).
- **"Always" for a tool is kept** with the conversation (`session.always_allow`), so an engine restart doesn't ask again.

## Following the agent (Sandy, 2026-11-01: "the mcp crud calls bring up the page they just created or added to or edited … it would have a pulsing dot that matches the color of the conversation tab")

- When a tool changes something (creates or edits an idea, project, task, to-do, backlog item, initiative, cycle or
  step), the engine writes a **`ui.follow`** event with the page it shows on (`engine/src/follow.ts`). Reads send
  nothing; a failed call sends nothing.
- **One following tab**, after following someone in Figma or Live Share: it opens beside the tab in front the first
  time, then moves. It doesn't open a tab per change. A **burst lands once**, 700 ms after it settles: several
  pages of one project land on the project, otherwise the last.
- **Each conversation has a colour** (one of six, from its id): a dot on its tab, pulsing while it works. The
  following tab has **the same dot, pulsing**, and the page gets a brief ring in that colour each time it lands.
- **The switch** is in the agent's column ("following its changes"), kept per browser. Off: the following tab stays
  as an ordinary tab and nothing moves.
- **Claude Code over MCP:** the terminal command now names its conversation (`/api/mcp/<app>?session=<id>`). Without
  it, the engine uses the app's only conversation that is carried on in a terminal; otherwise the dot is the accent
  colour.
- **Not yet:** highlighting the item inside a page (the task row in a project). For now the whole page gets the ring.

## Explore fast, build rigorous (Sandy, 2026-11-01: "when I use VS Code, I can just move really quickly … then I try and use our process and it feels super clunky")

- Direction written into SHAPE.md ("Explore fast, build rigorous"): explore (ideas, mockups, prototypes) is fast
  and loose, with the running thing beside the conversation; "this one" on a prototype writes the brief (and in
  some workflows approves it); the build after that is automated and as rigorous as the workflow says.
- The agent shows where it is: a strip at the top of the conversation (path, explore → build steps, what it's
  doing now). Story first: `Components/AgentStrip`, five states with made-up data; not wired yet.
- Asking a busy conversation something forks it: a new conversation opens beside it with the history, says what
  it will focus on, and starts. Proposed: answers to its own asks, and Stop, still go to it; the fork works in its
  own worktree from the first one's branch.
- Open: what happens to the prototype's code (rebuilt from scratch today). Proposed: early, it's the starting
  point; later, a reference.
- Not doing: running tasks of a project at once with phases as the graph (Sandy: "I am worried that we are adding
  too much complexity that won't help"). Tasks stay in order; phases within a task already run in parallel.

## Tickets first (Sandy, 2026-11-04: "a ticket is the unit of work that everything starts with … for us, by the time we get a ticket, it's complete")

After reading Roger Gonzalez's tkt and rogs-skills (`research/comps-tkt.md`). Three decisions, the last two asked
and answered the same day:

- **One noun.** Ideas fold into tasks. A ticket is born in Triage with a title and a soft body (Problem, Soft
  scope, Acceptance criteria, Dependencies), is reviewed and edited on itself, and approving its brief is the hinge.
  Written into SHAPE.md (the loop's step 4, and Decided).
- **The review half runs Roger's skills.** review-pr in a fresh session, verify-pr's evidence and finish-ticket's
  merge gates, run from our executor on our project PRs, with the engine writing `docs/agents/*.md` into each app's
  repo from its settings. Our planner, scheduler and builder stay.
- **The plan is tickets.** Project "Tickets first" in the Self Evident app, its tickets in Triage, blockers first,
  each a tracer bullet in Roger's ticket shape. Sandy reviews and edits them there; that is the review loop we are
  building, done by hand first.

The phases, as the tickets' order:

1. **The ticket is the unit:** born with a title; comments on a ticket; relations between tickets; search before
   creating; the review loop (the agent proposes criteria, splits and edges as a preview you accept); ideas fold in.
2. **Modes:** manual, auto, auto-plan, yolo per ticket; a feature table per app with hard stops.
3. **The review half:** status lines as the contract between agents and the engine (Roger's lines verbatim, pinned
   by fixtures); `docs/agents/` written by the engine; Self Evident as a tracker for the rogs skills (add search,
   comment, relate, attach over MCP); a PR body with a human verification procedure; independent review at the exact
   head; verification with evidence; merge only on the person's word, one at a time, confirmations carrying over
   clean merges.
4. **Small things from tkt:** `se doctor`, drop, stats (time waiting on you), a hold during a GitHub incident, wait.

Not taken: tkt itself as the runner (herdr, worktrunk, one machine), and anything that would replace the
scheduler or the prototype before the plan.

Next: Sandy reviews the tickets in the UI; the first to build is "A ticket is born with a title", which changes no
schema.

## tkt is the runner (Sandy, 2026-11-07: "I really want to be able to use self evident to create and complete tickets … a good amount of the graph execution concept is not all that helpful")

Saturday night, a new engagement on Monday. Sandy's reading: the graph (scheduler over sub-tasks, file claims) is
for a fully autonomous loop we are not trying to run; what matters is creating a ticket in Self Evident and
completing it. Roger's point that tkt exists as a runner so he can mix DeepSeek, GPT and Claude (OpenCode is the
second harness; presets pair a harness and a model; a reviewer from another vendor reviews each plan) settled the
runner question: we cannot match that on the Agent SDK, which is Claude only, without rebuilding tkt.

**The spike, same night.** Go 1.27 → tkt v0.21.0 built from GitLab (its releases sit behind a Cloudflare challenge),
worktrunk 0.81, herdr 0.9.5, gh 2.103, the rogs skills installed globally. A throwaway repo (`~/code/sandbox/tkt-scratch`,
`infinitedusky/tkt-scratch`, private) with `docs/agents/` composed from his seeds, local-markdown tickets, every
feature off, watch autostart off. Ticket SCR-1 "Add slugify to the string helpers" went `new` → merged in 19
minutes: start-ticket asked one real question (accents), planned, `AWAITING_APPROVAL`; approved; work-ticket
committed, created the repo, pushed, opened PR #1, `READY_FOR_REVIEW`; review-pr in a fresh session posted a review
brief with edge-case probes, `READY_FOR_HUMAN`; the six human verification steps passed; finish-ticket merged
pinned to the reviewed head and moved the ticket to done; `tkt done` removed the worktree. The ticket file ended
with three comments: Approved implementation plan, Implementation handoff, Completion.

**What we learned.** tkt checks two environment variables (`HERDR_ENV`, `HERDR_WORKSPACE_ID`) and reaches herdr
over its socket, so the engine can drive it from outside a pane: resume, approve, review, merge and done all ran
from here. Three of four stumbles were "which tab am I in" (the agent's tab is for its dialogs only; commands go in
your own), which is the argument for Self Evident being the window. Questions mid-plan are the one thing still in
the tab; herdr alerts on them. No review bot and no CI worked with `bot_wait = "0s"` and the "no CI configured"
line.

**Decided.**
- tkt is the runner for the build half; Self Evident is where a ticket is born, reviewed and watched (SHAPE.md,
  Decided). The graph stays in the code, parked.
- "Tracker" is Roger's word for where tickets live. Tomorrow they live in Self Evident's database instead of a
  folder of markdown files, and the skills read and write them through our API. Comments are the one real
  prerequisite (the skills write the plan, the handoff, the review and the completion as comments, one per heading,
  and there is no gap rule for "no comments at all"); search is the duplicate check; lookup by identifier and a
  state filter round it out.
- tkt is a hard dependency we do not babysit. No settings screen, no registry of presets, no plugin bookkeeping
  for the skills: when tkt fails, show its own error (its errors carry a hint and a `--json` form) and say run
  `tkt doctor`.
- The plan shrinks: SE-18, 19, 21, 22, 23 and 24 are what tkt and the skills already do, to drop; SE-17 is
  surfacing tkt's modes; SE-20 is the centre, "Self Evident is the tracker for tkt", its brief approved tonight.

**Built tonight** (branch `tracker-for-tkt`): the `issue_comment` table (one per issue and heading; the same
heading again replaces), `GET`/`POST /api/issues/:id/comments`, the `comment_task` tool, the `issue.commented`
event; `GET /api/issues/:id` by identifier (`SE-12`) as well as id, and `PATCH` and `/state` the same; `?q=` over
title, description and brief, open and closed; `?state=a,b`; the ticket page's "On the ticket" panel, story first
(Pages/TaskPage › Commented); and `docs/tracker-self-evident.md`, the tracker guide in Roger's format, plain HTTP
against the engine so it works from any harness without MCP wiring per worktree.

Next: point tkt-scratch's `docs/agents/issue-tracker.md` at Self Evident and run a ticket through; then the client
repo on Monday morning: add it as an app, `/setup-rogs` with Self Evident as the tracker, first tickets. Then
the buttons: start, approve, review, merge from the ticket page, calling tkt.

## tkt per app (Sandy, 2026-11-08: "there are two things that we're talking about at the same time")

Sandy went to the tkt scratch app's settings looking for tkt and found nothing, which was last night's decision
(no settings screen, no plugin bookkeeping) doing exactly what it said. Sandy then separated two things I had
collapsed. One: Self Evident does not configure tkt to make sure it works; when it is used and broken, a sensible
error, and the fixing happens outside. Two: for any specific app we choose whether to use tkt or not, and a choice
has to be recorded somewhere, "a plugin or something, an integration". Settled in conversation: an integration, not
a plugin (plugins here are Claude Code plugins for the factory's own agents; the integration shape of 2026-10-29
already has per-app values, no secrets and a check), role Runner, and the one new thing in the model a switch
instead of values.

**Built** (branch `tkt-integration`). Engine: `tkt` in `INTEGRATIONS` with a `switch` field (`on` = "true") and
`perApp` (nothing to set for all apps); `integrationStatus` reads a switch as on or off, never incomplete;
`engine/src/tkt.ts` with `checkTkt` (tkt on the engine's PATH, a local checkout, `docs/agents/issue-tracker.md`
in it naming Self Evident and this app's id and key, `tkt doctor` passing there; the first thing wrong is the
answer, tkt's own `fail` lines verbatim, then "Get tkt working: gitlab.com/rogs/tkt") and `trackerGuide` (the repo
file composed from `docs/tracker-self-evident.md`'s Tracker, Operations, States and priority sections inside the
rogs-skills frame, filled with the engine URL, the UI URL (`UI_URL`, default :5180), the app's name, id and key),
served at `GET /api/apps/:id/tracker-guide`; a new top-level code task in a tkt app gets `delegate: null`
(`delegateFor`), from `POST /issues` and from the agent's `create_task`, so no more "with the planner" on a ticket
tkt builds; `issueDetail` says `runner: 'tkt'`. UI: the integration page with the switch (Edit → On or Off), the
check running by itself when the page opens, "The tracker guide" with Copy, "On a ticket" listing start, approve,
review, merge; the All apps page says per app; the ticket page's "run by tkt" badge. Stories first: Pages/Settings ›
AppTkt, AppTktBroken, AppTktOff, AllAppsTkt. Tests: `engine/src/tkt.test.ts`.

Left out on purpose: a workspace-level default for tkt (nobody asked), the buttons (after the rehearsal), and
anything that reads or writes tkt's own configuration.

Later the same day Sandy showed Roger's talk: tkt has a whole surface of its own (`tkt web`, the board with
needs-you cards and a chat; the plan viewer from present-plan), so where the tickets live had to be drawn, not
assumed. `docs/what-owns-what.md`: Self Evident alone, tkt alone with its board, and the two together. The fixed
point: tickets live in the tracker, never in tkt, which keeps only the run (preset, session, tab, stage) in the
repo's `.git/tkt/state`; for Roger the tracker is Linear through its MCP, for us it is Self Evident. Linear, if a
client needs it, is a mirror from Self Evident (the Linear integration's declared, unbuilt actions), never tkt's
business.

## Reachable at a name (Sandy, 2026-11-09: "I need a way to get to the idea factory at any time I want")

Not a DNS entry: Sandy's Mac already answers every `.dawn` name with 127.0.0.1 (dnsmasq) and runs Caddy at login
with a trusted local CA, one site file per project. What was missing was uptime: the engine and the UI died with
the Claude session that started them. Now **https://idea.dawn** is Self Evident on that Mac: a Caddy site file
proxies to the UI dev server, which proxies `/api` to the engine; a launchd agent (`com.thedusky.self-evident`)
runs `pnpm dev` from the main checkout at login and restarts it if it dies, so a merge and pull is still the deploy
(`tsx watch` and Vite reload themselves). Vite refuses unknown hosts, so the repo change is one line: `UI_URL`,
the variable the engine already writes into the tracker guide's links, also names the host Vite answers to.
Dev mode under launchd rather than `pnpm build` + `pnpm start`: the habit stays; production mode when there is a
reason (a second machine). The name works on this Mac only; a phone would need Tailscale or a Cloudflare Tunnel
with Access in front, since Self Evident has no sign-in. Not asked for.

## The code comes with the app (Sandy, 2026-11-09: "it should have you select the repo or point to the local location when you create a new project. If the location is not a repo, create one")

Sandy's first run at https://idea.dawn: a new app, its local checkout set to a fresh Vite scaffold, and the
conversation answered "internal server error". A conversation works in a worktree of the app's checkout, and the
folder had no `.git`: `git worktree list` failed, the engine treated it as unexpected, the page got a 500 where a
sentence belonged. Fixed by hand for Ragdoll Golf (`git init -b main`, one commit), then made the rule.

**Built** (branch `code-at-creation`). Engine: `engine/src/checkout.ts`, `prepareCheckout(path, defaultBranch,
appName)`: a folder becomes a git repository on the default branch; a repository with no commits gets its first (the
files as found, `node_modules` kept out when nothing says what to ignore yet; an empty folder starts with an empty
commit); a repository already on another branch gives the app that branch; a relative path, a missing folder, a file
or a detached HEAD is a sentence (a `PlanError`, so a 400 the page shows), as is anything git itself refuses. It runs
when a checkout is set: `POST /apps` now takes `repo: { fullName, localPath }`, prepared before the app exists so a
refusal leaves nothing half-made; `POST /repos` and `PATCH /repos/:id` the same; each answers with a `note` saying
what was done. `GET /github/repos` lists the person's repositories through `gh` (name, default branch, private) or
says in gh's words why there is no list. `startTalk` checks the checkout first (`checkoutProblem`) and answers in a
sentence. UI: "+ App" is a page of its own, `/settings/new`: name, GitHub repo (a datalist from gh's list, or typed),
local checkout; Add needs a name and one of the two; it lands on the new app's Repo page with the engine's note
("Set up · Made it a git repository on main, committed the 12 files as found"). The Repo page shares the fields and
shows the note after Save. Stories: Pages/Settings › NewApp, NewAppNoGh, AppRepoSetUp. Tests:
`engine/src/checkout.test.ts` against throwaway folders; `myRepos` in `github.test.ts`.

Left out on purpose: cloning a GitHub repo that has no local checkout (where to put it is a question for the person;
the Repo page still says "no local checkout set"), and any remote: a folder made a repository has no origin until
someone gives it one, and the engine's fetch is allowed to fail.

## Storybook is an integration (Sandy, 2026-11-09: "I think it should be a storybook integration and we should ensure that we have story flow add on")

Asked how the prototype settings should be set, the answer was: Storybook as an integration, with the screen map
(story-flow) checked. The Prototype group (the command and throwaway database for running the app itself) is how
this app runs, not a tool to connect to, so it stays the app's own.

**Built** (branch `storybook-integration`). Engine: `storybook` in `INTEGRATIONS`, per app, role Screens, fields
command and URL; they lived under `setup.storybook_cmd` and `setup.storybook_url` until now and move under the
integration when the engine starts (`migrateStorybookSetup`; `storybookSetup` reads both until then). `checkStorybook`
(`engine/src/storybook.ts`) reads the repo, first thing wrong is the answer: a Storybook anywhere in the repo
(`.storybook/main.*`, found through git so node_modules stays out), Storybook 10, the add-on installed, in main's
addons with a flowGlob, `.storybook/story-flow.css` there and imported in preview, the flow files excluded from the
vitest project when addon-vitest is present, at least one `*.flow.json`; then whether it answers at the URL, and the
map's docs link (from the first flow file's title) when it does. Actions now carry a `kind`: `start` (the engine
starts Storybook), `link` (what the check found), `ask` (`setupMapAsk`, the standard step by step, handed to the
agent through `/talks/ask`; it confirms each file). `GET /storybook/story-flow.css` serves the stylesheet for step 4.
`checkIntegration` takes `local: { tkt | storybook }` and returns `links`. UI: the Settings › Storybook group is
gone; Integrations › Storybook has the values, the check running by itself, and the actions as buttons under "From
here"; Mockups points there when nothing is set. Stories: Pages/Settings › AppStorybook, AppStorybookNoMap,
AppStorybookNotSet, AllAppsStorybook. Tests: `storybook.test.ts` against throwaway repos, and the move in the DB.

The same day Sandy gave the sequence from idea to build (SHAPE, "Explore fast, build rigorous": a quick mockup,
then Storybook, then the prototype environment, the plan, the audit, the blast-radius assessment, the build), so the
integration's role is Screens, not Mockups: Storybook is the step after the mockup. The quick thing's name is open.

Next: our own Storybook brought up to the standard, the first repo the check should pass, with a map of our screens.

## Our own Storybook meets the standard (2026-11-09)

The first repo the new check should pass is this one, and it didn't: no screen map. Built (branch `storybook-map`):
`@zigbang/storybook-addon-story-flow` in the app, wired in `.storybook/main.ts` with the glob under `src/stories/`,
`.storybook/story-flow.css` imported after the app's CSS, the flow files excluded from the storybook vitest project,
and the map itself, `src/stories/flows/self-evident.flow.json`: **Self Evident/Map**, 19 screens as nodes (every
page route, each with its page's stories as states and its address as a tag), 25 edges saying what you tap, four
scenarios (the loop; an idea becomes a project; a project and its tasks; setting up an app), all marked existing.
The nodes are the tab pages as the Workspace shows them; the frame around them (rail, agent) is
`Components/Workspace`. No trigger selectors yet: they want `data-testid`s on the pages, a pass of its own.
A paragraph in `app/README.md` says where the map is and how to add a screen.

## Set up what's missing (Sandy, 2026-11-09: "can we add a step with tkt where it auto configures anything missing?")

**Built** (branch `tkt-setup`). Engine: `setupTkt` (`engine/src/tkt.ts`) writes `docs/agents/issue-tracker.md` into
the checkout when it is missing or points at another tracker or app (uncommitted, said so), checks again, and if
tkt itself, herdr, worktrunk, the skills or anything `tkt doctor` flags is still missing, composes the agent's job:
the check's line, `tkt doctor`'s fail and warn lines with their own hints (`doctorFindings`; the pane warning left
out), where tkt comes from (its install.sh), where the other agent docs come from (/setup-rogs), and "confirm each
install and file change with me". `setupIntegration` dispatches (`integrations.ts`): tkt as above; Storybook hands
over the check's line plus the screen-map standard; off or incomplete values, or no checkout, wait on the person.
`POST /integrations/:key/setup` runs it and, when there is a job, starts the conversation (`startTalk`, `say`,
`showTalk`) and answers with what was done. UI: one button under a failed check, "Set up what's missing" (tkt) or
"Set up the screen map" (Storybook), with a note of what happened; the action no longer sits in the lists below.
Tests: `tkt.test.ts`, "set up what's missing".

## Set-up in one press (Sandy, 2026-11-09: "this is still a really annoying process … we need a way to do it fast and consistent … set it up")

**What happened.** Sandy pressed "Set up what's missing" on Ragdoll Golf's tkt page. The engine wrote nothing (the
tracker guide was already right) and the agent came back with a five-item yes/no list, two items for Sandy to do by
hand: type `/setup-rogs` (an interactive skill only a person can start) and download tkt's release build in a
browser (git.rogs.me sits behind a Cloudflare challenge). Sandy: "this is still a really annoying process", then "we
need a way to do it fast and consistent", and, on the proposal, "set it up". Then the wider rule: "for all the
integrations there has to be a default where I can just put the integration and say set up".

**What tkt actually needs** (read in tkt's source, `internal/lifecycle/lifecycle.go`, and the skills' contract,
`setup-rogs/references/contract.md`): two marked files, `docs/agents/issue-tracker.md` with a backticked ticket-id
pattern and `docs/agents/forge.md` with Remote and Base branch lines; `workflow.md`'s feature table decides what tkt
may run unattended. The rest (domain, the pull request template, the CLAUDE.md block) the skills read. Every blank
in the seeds is a fact Self Evident has or can read, or a house default (SHAPE.md, "The house profile").

**Built** (branch `tkt-house-config`). Engine: `lifecycle.ts`: `repoFacts` (git for the remote and the base, gh for
the merge style and templates, the files for CI workflows and their path filters, package scripts, pnpm workspaces,
hook runners, the glossary, where the block goes), `houseConfig` (fills the seeds in `docs/lifecycle/`, MIT from
gitlab.com/rogs/skills, and throws on a blank left unfilled), `writeHouse` (writes files that are new or carry
"Self Evident wrote it", leaves the person's alone, replaces the block in place or appends it, starts CLAUDE.md when
there is none). `setupTkt` (`tkt.ts`) now: the tracker guide, the house configuration, `tkt hook claude --install
--shared` and `tkt hook tmp --install` when doctor misses them, a commit on the base branch pushed (said plainly
when the checkout is on another branch or the push is refused), then the check; the agent gets only tkt itself and
what doctor still flags, the pi warning left out. Proof: the generator filled a throwaway repo and `tkt doctor`
there answered `ok lifecycle tickets match ^PB-[1-9][0-9]*$; forge GitHub infinitedusky/probe, base origin/main`.
Storybook: a switch (`on`), the command and URL optional with defaults from the repo (`storybookDefaults`,
`storybookValues`); the start-up move also switches on apps that had values. Fields gained `states` (what on and off
mean), so the UI's switch copy is the integration's own. UI: the switch copy from `states`, the default shown where
a value is unset, the tracker-guide footer no longer sends anyone to `/setup-rogs`. Tests: `lifecycle.test.ts`,
`tkt.test.ts` ("set up what's missing", with a fake machine: tkt, git, gh), `storybook.test.ts`.

**Also found.** The engine answering on port 4000 was a `pnpm dev` from Saturday evening that outlived its session;
the launchd agent's own engine crashed on every restart with EADDRINUSE. Same checkout, so current code, but wrong:
fixed by stopping the stray and kickstarting the agent.

**Next.** Installing Storybook to the standard when the repo has none (the same button, no questions); the Prototype
environment as an integration; the Sketches slot.

## Storybook from nothing, and an integration is a document (Sandy, 2026-11-09: "Storybook is fucking simple … it should not be hard to add to a repo")

**What Sandy said.** After the one-press tkt set-up: "I'm just confused why we need to do all this work to add an
integration. Why can't it just be add it and it works." Then the shape: "integrations have configuration documents
that just have all the stuff we need … that configuration file would then just tell the system what to do, how to
incorporate it", and "it can have installation instructions, right?" SHAPE.md, "An integration is a document".

**Built** (branch `storybook-install`). The first document: `docs/integrations/storybook.md` (what it is, the
standard, the installation in order, what the agent gets). The engine follows it (`storybook.ts`, `installStorybook`):
Storybook's own installer (`storybook@latest init --yes --no-dev --features docs --package-manager <pm> --no-agent
--disable-telemetry`, through the repo's package manager's dlx, in the package the UI lives in: an existing
`.storybook` decides, else the root when it has a framework or builder dependency, else the first workspace package
that has one); the add-on as a dev dependency; `.storybook/story-flow.css`; the add-on first in main's `addons` with
a flowGlob read from the first `stories` glob; `import './story-flow.css'` after the last import of preview (or a new
preview); a first map, `<stories>/flows/<app slug>.flow.json`, with the installer's example page as its first screen
(`example-page--logged-out`); "The screen map" in the README; one commit on the base branch of only what the install
touched (status before and after; the person's own changes stay as they were), pushed. Every step is skipped when
done, so the button is repair. Left for the agent, with the document: a main without an addons list, the vitest
exclude where a config runs the stories as tests, a Storybook older than 10, an installer that failed. The vitest
exclude is now required only where a config runs the stories as tests (`flowsExcluded`), in the check too. Switching
Storybook on in the UI runs the set-up at once (`Integrations.tsx`); the button stays. `commitOnBase` (`tkt.ts`) and
`remoteAndBase` (`lifecycle.ts`) are shared with the tkt set-up; a refused push now quotes git's own fatal line.

**Proof.** Storybook's real init on a copy of Ragdoll Golf's scaffold showed the shapes (a JS main with a quoted
`"addons"` list, a preview with no imports, `src/stories/Page.stories.js`). The engine's installer then finished that
copy in under a second (css, main, preview, map, commit) and the started Storybook's index listed `probe-map--docs`
and `example-page--logged-out`. A fresh clone with nothing went through the real init in 6 seconds (the scaffold's
package.json already carried the Storybook dependencies Sandy's agent had added by hand). Tests: `storybook.test.ts`
"installing it" (a fake installer that leaves behind exactly what the real one did; git real, with a bare origin).

**Side effect found.** Running Storybook's installer on the probes garbage-collected the Playwright browser build the
app's story tests use (`chromium_headless_shell-1248`); `pnpm --filter app exec playwright install chromium` put it
back. Worth knowing: a `playwright install` from any project prunes builds no project it knows of references.

**Next.** The remaining integrations (tkt, PostHog, Datadog, Linear, Confluence) move from `integrations.ts` into
documents and the engine becomes their reader; the Prototype environment as an integration; the Sketches slot.

## Sketches are a workflow step (Sandy, 2026-11-09: "we need to add a workflow step then")

**What Sandy said.** The first mockup in Ragdoll Golf did not show: it was written in a conversation's worktree
(`talk/3zqs3k`, `stories/mockups/SwingLab.mockup.stories.jsx`) and the engine's Storybook runs in the main checkout.
Then: "I wanted to do a simple mockup before storybook … about speed, we get how we like it, then we do a story
properly … Then that mockup is added to the brief", and "Proto comes after brief and is used to figure out the best
way to build it". SHAPE.md, "Where the brief sits, and what each step is for".

**Built** (branch `sketch-step`). `steps.ts`: a `sketch` step beside `mockup` (either side of the brief, on ideas,
tasks and projects); the default order is now idea, research, sketches, mockups, the brief, the prototype;
`normalize` gives a workflow saved before the step its sketches on, right before its mockups, and leaves a
switched-off one off. The agent's prompt (`talk.ts`) says what a sketch is (one plain HTML file per screen under
`sketches/`, CSS inside, no build, made-up data that says so) and the order of the three; `set_step` takes sketches
with the files as refs; the step's Start button asks for exactly that. No migration: stored workflows are normalized
when read. Tests: `steps.test.ts`.

**Not built yet.** Showing a sketch (the Sketches integration and its tab), the Mockup section of the brief, and
Storybook following the branch. Until the last one, a story on a conversation's branch shows only after it merges.

## Beside the conversation, from its worktree (Sandy, 2026-11-09: "It has to be right there when we're prompting")

**What Sandy saw.** The Mockups page showed a 502 and never the new story. Two causes, one gap: the engine killed
every Storybook it had started on each restart, and it restarts on every deploy (three that evening), so the page
met a restarting engine and a dead Storybook, and kept the error after the engine was back; and Storybook only ever
ran in the main checkout, while the story (`stories/mockups/SwingLab.mockup.stories.jsx`) was in the conversation's
worktree. SHAPE.md, "It shows beside the conversation, from the conversation's worktree".

**Built** (branch `beside-the-conversation`). Engine: `storybook.ts` `placeFor(appId, sessionId)`: a conversation
whose worktree has a Storybook gets that worktree's, at `http://localhost:<portFor(worktree)>` (6100 to 6899, from
the path, so it is found again after a restart by asking), the command given `-p <port>` and an install first when
the worktree has no `node_modules`; otherwise the app's. Storybooks are spawned detached with their output in a
file under the temp folder, and `stopStorybooks` at shutdown only forgets them; `endTalk` stops its worktree's by
port. `sketches.ts`: `placeOf(scope)` (a conversation's worktree, else the main checkout), `GET /api/sketches/:scope`
(the HTML files under `sketches/`, newest first) and `GET /api/sketches/:scope/file/*` (inside the folder only, a
few file kinds, HTML with `Content-Security-Policy: sandbox allow-scripts allow-forms`). The agent's `open_tab`
takes `sketch` with a file and stamps the conversation on Storybook and sketch tabs; `stories` reads the
conversation's Storybook. App: a Sketches tab (`pages/Sketches.tsx`: file chips, Phone/Tablet/Full, a frame keyed by
the file's change time, "Mockups →" as the way on); Mockups takes the conversation in front (`currentTalk` in
`workspace.ts`, set by the agent's column), says which branch it shows, and clears an error once a poll succeeds.
Tests: `sketches.test.ts`; stories `Pages/Sketches`.

**The frame itself was refused.** Looking at the real page after the deploy: the right Storybook, a blank frame. The
console: "Framing 'http://localhost:6385/' violates … frame-ancestors 'self' http://localhost:* …". Storybook 10 lets
only localhost frame it, so nothing had shown inside Self Evident since it moved to https://idea.dawn that morning.
Fix (branch `storybook-frame`): the local proxy gives each Storybook a name, `https://sb-<port>.idea.dawn`, speaks to
it as localhost and drops that header (`~/.indusk/proxy/sites/idea.caddyfile`); the engine's status carries `frame`
(`frameUrl`, from `STORYBOOK_FRAME=https://sb-{port}.idea.dawn` in the agent's environment) and Mockups frames that.

## Linear as the home (Sandy, 2026-11-10: "I've kind of lost the plot here … I'm thinking about trying to set up tkt's UI and have it connected to the same setup as Self Evident")

Sandy's read of the last rounds: nothing done wrong, but the work had become one request after another with nothing to
measure it against. The measure: run tkt's own flow (its chat and board, `tkt web`) beside Self Evident on one repo,
as two developers would, and see what each is for. One clone is enough: tkt gives each ticket a worktree, Self Evident
gives each conversation one, and they meet in pull requests. The repo is Ragdoll Golf, not Self Evident's own (tkt's
agents run without permission prompts, and Self Evident's main checkout is the running app).

- tkt's page is up for Ragdoll Golf: a herdr workspace `ragdoll-golf`, `tkt agent` in a tab, `tkt web` in the browser.
  herdr is its own open tool, not Roger's; tkt depends on it as it does on worktrunk and `gh`.
- Sandy then asked for Linear on both, and chose Linear as where a ticket lives (the other choice was Self Evident as
  the home with Linear a mirror). Built: the "Tickets live in Linear" switch on tkt (SHAPE.md, "An app's tickets can
  live in Linear"); `engine/src/linear-home.ts`; the skills' Linear guide as a seed, `docs/lifecycle/tracker-linear.md`.
- On this Mac, outside the repo: the MCP server `linear` (https://mcp.linear.app/mcp) added to Claude Code for the
  user. Sandy's to do: sign in to it, create a Linear API key and put it in the engine's environment as
  `LINEAR_API_KEY`, and name the team.
- The comparison's question, to answer in this log once two tickets of similar size have gone through, one in each
  system: at each step, what Sandy had to do, what Sandy could see, and where Sandy waited.

Next: Sandy's three Linear steps; then Integrations › Linear for Ragdoll Golf (team, key variable), the switch, and one
press of Set up what's missing; then the first ticket through each system.

### The tracker wiring, removed and put back (2026-11-10)

I misread Sandy twice in one afternoon. "TKT is never using Self Evident" and "the wiring goes away" were about the
test: Sandy wants to watch tkt with no Self Evident in the loop. I took them as a change to the product and removed
tkt's reading from Self Evident altogether (PR #113). Sandy: "I wasn't asking you to change the way those two
interacted with each other. I was just trying to be able to test it without any interaction." #113 is reverted. What
stands: tkt pulls from Self Evident; Self Evident is to pull from Linear (not built, it only pushes today); the
"Tickets live in Linear" switch from #112 stays, as the way to run tkt on its own for one app (SHAPE.md, "tkt reads
from Self Evident; a switch lets it run on its own against Linear").

Lesson for the factory: when a request could mean "for this test" or "for the product", ask which before building.


### tkt on its own, tried and put down (2026-11-10, evening)

Sandy tried tkt alone on Ragdoll Golf against Linear (team RSA, switch on, set-up pressed: Ragdoll `9e9361b`). The
real Linear lookup worked first time. No ticket ever ran. What stood in the way, in order:

- tkt's chat (pi) had no model: a second sign-in, in the terminal only, billed per token; the page showed nothing.
- The chat cannot create tickets; `create-ticket` is a Claude Code skill.
- The chat reads the ticket key once, at start. It had started under `RG`, so `/start RSA-804` only printed usage.
- worktrunk named the worktree `ragdoll-golf.RSA-804`; tkt needs the folder to be the ticket id. The entry in
  `~/.config/worktrunk/config.toml` is keyed by the repository's identifier (`github.com/owner/repo`), not its path.
  The chat said "Queued" and never reported the failure.
- Claude Code's trust question for the new folder.

Sandy: "I am starting to wonder if we need this at all … this just seems cumbersome", then "agreed lets just improve
self evident." The read we agreed on: tkt is the mechanical glue (a worktree, a tab, a prompt per stage, a loop);
the thinking is in the skills (`start-ticket`, `work-ticket`, `review-pr`, `verify-pr`, `finish-ticket`), which run
without it. Self Evident already makes worktrees and runs agents. What it lacks is the back half of the loop:
independent review in a fresh session, verification steps, the merge, each with a stop for a person. That comes from
the skills, with Self Evident driving. RSA-804's worktree was dropped; nothing was removed from Self Evident.

Not decided: whether the tkt integration leaves the product, and what Ragdoll Golf's tracker file should now say (it
points at Linear). Gaps set-up had, if tkt stays: the worktrunk entry, restarting a running chat after the tracker
changes, and `docs/agents/forge.md` keeping the old `RG` ticket link.

## The brief is the parent (Sandy, 2026-11-10: "it's not like step five … that workflow is all about getting us to a really solid brief")

**What Sandy said.** After putting tkt down: one conductor per worktree, deploying fresh agents where needed
(SHAPE.md, Decided). Then the workflow: the brief is the parent document of every step up through the blast radius;
the brief audit, ADR and blast radius run by themselves once the prototype is approved, and that finalizes the brief;
the brief references the assets produced on the way. A task is the brief stage and the build stage; a project is
tasks; the build is phases decided through the briefing.

**Built** (branch `brief-is-parent`). `steps.ts`: the brief is outside the order (no position, waits on nothing,
nothing waits on it), kept last in a stored workflow; a check's place is after the other steps, not after the brief;
`owed` lists the required steps a brief still waits on, and `approveBrief` refuses until they are done (before, an
approved brief could come first and a required blast radius after). The default order is idea, research, sketches,
mockups, the prototype. No migration: stored workflows are normalized when read. The page: the task's nav is two
groups, Brief (the brief first, the steps that feed it under it) and Build; the brief's page lists "What it stands
on", each step with what it has and a link, and says what approval waits on. The agent's prompt says the brief is the
parent and to name each step's assets in it.

**Not built yet.** The automatic run of the three checks as deployed agents after the prototype is approved; an
"approve the prototype" moment to trigger it; the brief's asset list written by the engine instead of the agent;
phases decided in the briefing. I assumed the audit runs last, after the ADR and the blast radius, so it reads the
brief with both attached; Sandy has not confirmed that order.

## A task's own agent (Sandy, 2026-11-10: "I don't know if that's right or not, but it's feeling like it's right")

**What Sandy said.** The agent's chat should sit inside the task, one per task, staying put across the steps of the
brief and the build, so it is plain it is the task's own and nothing is shared across tasks. The full-height agent on
the left stays, for creating (ideas, new tasks) and for looking at and discussing findings, and should fold away.

**Built** (branch `task-agent`), story first. `TaskAgent`: a column with the agent's name and stage (AgentStrip), the
fresh agents it has out, the conversation, a fold to a thin strip, and a start button when the task has no agent yet.
Stories with made-up data, one of them the whole task page in three columns. The left agent already folded (the
rail's S, ⌘J), but nothing on the column said so: it now has a fold button of its own.

**Not built yet.** The engine side: a task owning one conversation and one worktree for its life, steps started on
the task going to that conversation instead of a new one each, and the column on the real task page. Waiting on
Sandy's reaction to the story before wiring.

**Wired** (branch `task-agent-wired`, after Sandy: "Looks good"). Engine: `taskTalk` finds a task's own conversation
(the oldest open one pinned to it), `ensureTaskTalk` starts it once, under a lock, for a top-level code task only;
`POST /talks/ask` with a task says it to that conversation and no longer brings anything to the front of the left
column; `GET` and `POST /issues/:id/talk`; the conversation's prompt says it is this task's conductor and to send
anything else to the left column. Conversations were never pinned to a task before (the reference was dropped), so
no task starts with history; the old step conversations stay in the left column as they were. App: the task page has
the column, its fold remembered in the browser; a step's Start button opens it; the left column leaves task agents
out. Tests: `task-talk.test.ts`. Not exercised against a live agent: starting one on a real task is Sandy's to do.

**Next, from Sandy:** "we need a way to view sketches, mockups and prototypes. Each should have a way to detach the
viewer, which makes it a tab in Chrome; it can be reattached."

## The viewer, detachable (Sandy, 2026-11-10: "each should have a way to detach the viewer, which makes it a tab in Chrome")

**Built** (branch `viewer`). `Viewer`: sketches, mockups (Storybook) or one prototype, with Detach, which opens
`/view?tab=…` in a browser tab; the two sides find each other over a BroadcastChannel keyed by what is shown, so a
reload on either side keeps them in step; Bring it back (where it left) or Put it back (in the tab) closes the tab
and shows it in place again. Used in the workspace's Sketches, Storybook and prototype tabs, and on a task's
Sketches, Mockups and Prototype step pages once the step has something, reading the task's own agent's worktree
(the first file or story the step recorded opens first). The task's agent is also the conversation "in front"
while its page is open, so a Sketches or Mockups tab opened by hand shows the task's worktree: after #120 the left
column no longer named it. Stories: `Components/Viewer`, `Pages/TaskPage › Mockups Step`. Tried by hand: the
detached page against the live engine, on Ragdoll Golf's (empty) sketches. Not tried: a real detach and return in
Sandy's Chrome, where the pop-up rule decides whether the tab opens.

**The left agent's fold button was out of sight** (Sandy, twice: "the left global agent needs to be collapsible
too"). The button from #119 sat at the end of the tab row, which scrolls sideways: with two long conversation names
it, the +, the terminal and the pop-out buttons were all scrolled off. Now only the conversations scroll; the four
buttons stay at the right of the row. I had told Sandy the button was there without looking at the live page with
real conversations open: check the real page, not the story, before saying a control exists.

**Go there with the agent, and no width limit** (Sandy, 2026-11-10, after the first sketch on RG-1: "not crazy about
the split when the sketch opened up. I think we should go there with the agent instead of creating a new split";
"the tabs should have no width limit. The center area can get as wide as needed"). A task's own agent calling
open_tab with a sketch, a story or the prototype now sends the person to that step's page of its task
(`/tasks/<id>/sketch?file=…`, `/mockup?story=…`, `/prototype`), in the task's own tab, where the viewer shows it
beside the conversation; it never splits, whatever it asks for. It no longer "follows" its own task into a second
tab either. The step's page shows the viewer as soon as the task has an agent, at the file or story named. A tab's
page goes where it is sent from outside (PagePane), which the following tab needed too. The 1200px cap on a tab's
page is gone; text in a task's middle column keeps a readable line. The app's agent, in the left column, opens and
splits tabs as before. Tests: `follow.test.ts`.

**A step's page is two tabs** (Sandy, 2026-11-10: the step's summary "keeps pushing the screen down so it is
hidden … we have the brief content and then an asset. For the sketch that is the view. We make them tabs so you go
back and forth. Then the view can be visible"). On a task's Sketches, Mockups and Prototype pages, once there is
something to look at: **View** (the sketch, the story, the prototype; in front, with the height of the tab) and
**For the brief** (what the step wrote: its status, its notes, its files, its buttons), which is what the brief
points at. Detach sits on the row of the view's own controls. Looked at on RG-1's real sketches.

**Everything around the view folds** (Sandy, 2026-11-10: "how do I get the global agent back?"; "make the left nav
steps collapsible too"). The global agent, folded, leaves a thin strip where it was ("The agent ›") that brings it
back; the rail's S and ⌘J still do. A task's step nav folds to a strip of icons, each still a link with its name and
state in the tooltip, the choice remembered in the browser. With both folded and the task's agent folded, the step's
view has the tab to itself. Story: `Components/TaskNav › Folded`. Looked at on RG-1.

## The check mark is the person's (Sandy, 2026-11-10: "I see the check mark but not sure how that is decided")

**What was so.** A step got its check when its status became done, and the agent could set that with `set_step`;
only the brief had a person's approval. Sandy proposed an approve button per step; I asked whether the three checks
get one each or are approved with the brief, recommending the brief; Sandy: "perfect".

**Built** (branch `approve-steps`). `steps.ts`: `needsApproval` (on a task: the brief, research, sketches, mockups,
the prototype), `finished` now wants the approval there, `ready` is done-and-not-approved. `step_work` gains
`approved_by` and `approved_at` (migration 0010). `approveStep` (and `POST /issues/:id/steps/:key/approve`): approve
makes the step done and approved, in the workflow's order; withdraw clears it; `setStep` clears it too, so changed
work is approved again. The agent's tool and prompt say done means ready for the person. The page: Approve on the
step's page once it has anything (strong when the agent says it is ready), "approved by" with Withdraw after;
"ready for you" under the step in the nav and in the brief's "What it stands on". Mark done is gone from a task's
steps. Steps already marked done on existing tasks now read "ready for you" until Sandy approves them: nothing was
approved on Sandy's behalf.

**"The mockup for RG-1 is broken"** (Sandy, 2026-11-10). The mockup was fine: the task's agent had written new Swing
Lab stories (face-on, down the line, top, club head, skeleton, bone selected) and they render in the task's
Storybook. The viewer was opening `mockups-swinglab--at-address`, a story id the Mockups step recorded in an earlier
round, in another worktree, and Storybook answers a missing id with an error page. Two causes, both ours: the viewer
trusted the recorded id, and my deploy of step approval restarted the engine while the agent was mid-mockup, so it
never recorded the new ones. Fixed the first: the Storybook status takes the story asked for and says which one this
Storybook can show (itself, the first of the same component, or none, `resolveStory`); the viewer shows that and
says so in one line. Not fixed: an engine deploy still cuts a working agent off. Until it doesn't, check
`/talks?open=1` for a busy conversation before merging an engine change.

**The agents a task has out, in sight** (Sandy, 2026-11-10, after the conductor of RG-1 started a prototype and
said "its own conversation beside you": "this is confusing as hell, if there is a sub agent we should see some
indication"; and "the agent is also showing up in the global agent as a tab too"). The prototype's agent was real
and working, but only as a tab in the app's column, which Sandy had folded; the task's page said nothing. Now
`taskAgents` lists each prototype conversation started on a task (`GET /issues/:id/agents`), and the task's agent
column shows them as tabs beside "This task's agent": a dot that pulses while one works, "working" beside its name,
and its conversation when pressed. `listTalks` marks a conversation with the task it belongs to (`taskId`: its own
agent, or a prototype's), and the app's column leaves those out. The conductor is told how its prototype's agent
shows and to name the tab, never "the conversation beside you". Stories: `TaskAgent › Prototype Agent Out`,
`TaskPage › Prototype Agent Out`. Tests: `task-talk.test.ts`. Still to do: the three checks as deployed agents in
the same list.

## The prototype, read before anything is decided from it (Sandy, 2026-11-11: "it's really a prototype audit, prototype analysis or something like that")

Sandy asked why the task's agent starts the prototype's agent but does not drive it (it was built before the
conductor rule, as a conversation for the person), what approving the prototype does (it only recorded the
approval), and whether the brief audit looks at the prototype (nothing told it to). Then: should the prototype come
after the ADR? Decided, in SHAPE.md: it stays before, and a new check, the **prototype analysis**, sits between
them, because a prototype built fast mixes findings with shortcuts and the ADR must not lean on a shortcut.

Built (`engine/src/checks.ts`). Approving a task's prototype (`POST /issues/:id/steps/prototype/approve`) starts the
checks its workflow has, in order: analysis, ADR, blast radius, then the conductor is told to bring the brief up to
date (a Prototype section: the branch, the analysis, what to keep and change; the ADR's decision; the assets), then
the brief audit, then the conductor is told the reports are in and tells the person the brief is ready. Each check
is a fresh agent in a conversation of its own (`subjectRef: {checkOf, check}`), with no editing tools, reading the
prototype's worktree (the analysis) or the conductor's (the rest), told where the prototype is and which earlier
reports to read (new tool `get_step`), and recording its report with `set_step`. What comes next is worked out from
what is stored each time a turn ends on the task (`nextMove`, tested without agents), so an engine restart loses
nothing. The task's agent column shows each as a tab (`taskAgents` now lists them, with the step's icon); the app's
column leaves them out. Stories: `TaskAgent › Checks Running`, `TaskPage › Checks Running`.

Not done, and worth knowing: a check runs only when the task's workflow has it, and the default workflow has none,
so they are added under Settings › Workflows; a check whose agent was cut off (an engine restart mid-turn) waits
until someone opens its tab and says "carry on"; a prototype approved a second time does not run finished checks
again; the planner is not yet told to treat the prototype as a map (the brief's Prototype section says it instead).
None of this has run against a real task yet.

## The conductor directs its agents (Sandy, 2026-11-11: "talk with one agent throughout the task lifecycle and it can manage the whole thing")

Asked whether the one-agent set-up was in place, the answer was "partly": one conversation per task, but a change to
the prototype had to be typed into the Prototype tab, and nothing came back to the task's agent. Built: three tools
for a task's own agent, `agents_out` (who is out, working or idle, what each last said), `tell_agent` (a message to
one, by its sessionId, `prototype`, or a check's key) and `read_agent` (its recent conversation, tool noise left
out). `tell_agent` returns at once; the ask is marked on the message (`payload.from`), and when that agent's turn
ends `takeReply` finds the open ask, marks it answered and the engine says the agent's last words to the conductor
("Back from the Prototype agent"), which starts the conductor's turn to tell the person. Nothing is held in memory.
The conductor's prompt now says to pass changes on instead of pointing at the tab. Stories: `Conversation › Directs
Its Agents`, `Conversation › Asked By The Conductor`. Tests: `task-talk.test.ts`.

Also fixed, from #131 before it ever ran: `get_step` was not rated as a read, so a check's agent (which acts without
asking only up to cheap) would have stopped on a permission card when reading an earlier report. It is free now.

Not run against a real task yet.

## The agent's tabs close with an × (Sandy, 2026-11-11: "the tabs to close with an x and not delete the worktree")

The only way to be rid of a tab in the app's agent column was End, which removes the conversation's worktree. Built:
`session.closed_at` (migration `0011_close_tab`), `POST /talks/:id/close` and `/reopen`, an × on each tab (always on
the one in front, on hover for the others), and a ▾ after the tabs with the count of closed conversations: its list
reopens one or ends it. Closing changes nothing but the tab; `showTalk` clears it, so a conversation the engine
brings to the front comes back. Stories: `TalkDrawer › Closes With An X`, `Closed Conversations`, `Reopened`, `All
Closed`. Test: `task-talk.test.ts`.

Sandy also asked that a new conversation get a worktree and that only the current app's tabs show. Both were already
so and are unchanged (`startTalk`; `TalkDrawer`'s filter on the nav's app). Sandy saw "agents from other apps" on
Ragdoll Golf: by app id all four tabs there were Ragdoll's, but two are named "Self Evident's Storybook check for
Ragdoll Golf" and "Self Evident's tkt check for Ragdoll Golf", the set-up checks handed to an agent in Ragdoll's
repo, which read like another app's. Not confirmed with Sandy that these are the ones meant.

## The database moves to Fly (Sandy, 2026-11-11: "we should deploy the db on fly using the homework app server")

Sandy is moving to a laptop and wants the data off this Mac. Decided: Self Evident's database is its own database
and its own role (`selfevident`, not a superuser, password set by Sandy) on the Fly Postgres app Homework Gate uses,
`homework-gate-db` (one `shared-cpu-1x` 1 GB machine in `iad`, Postgres 18, a 1 GB volume, private address only).
Each Mac reaches it through `fly proxy` on localhost:15432, so the server stays private; `DATABASE_URL` is in the
launchd plist, nowhere else. Shared, not a machine of its own, because it is 25 MB today and moving it later is one
dump; split when the volume is half full or Homework Gate has users who would notice an outage. One engine at a
time: two on one database would both schedule and build.

Built for it: the engine's LISTEN connection is made again when it drops and nudges the open streams to catch up
(before, a dropped connection ended the process, and nothing starts it again under `tsx watch`); the pool logs an
idle connection's error instead of dying; the engine waits for the database at start; `db:up` starts the local
container only when `DATABASE_URL` is the default. The tests still run on the local container
(`TEST_DATABASE_URL`). Test: `events-bus.test.ts`.

The move was done the same day: the restore's counts matched (21 conversations, 5,753 messages, 307 issues, 11,023
events, 31 tables), the engine came up on the Fly database, and a deliberate restart of the proxy was survived (the
log shows the connection lost and back). A request now takes about 0.3 s, the round trip to `iad`.

## Moving between Macs is two commands (Sandy, 2026-11-11: "a command to sync everything, that way I can move back and forth between laptops. We can use doppler for env stuff")

With the database on Fly, what one Mac still holds by itself is the settings, each open conversation's worktree, and
the conversations' histories (Claude Code keeps a session file per conversation in the home folder; the agent
resumes from it). Decided, with Sandy:

- **Settings are in Doppler**, project `self-evident`, config `dev`: `DATABASE_URL`, `LINEAR_API_KEY`, `UI_URL`,
  `STORYBOOK_FRAME`, `STATE_REPO`, `FLY_DB_APP`. A project of its own, because Homework Gate's deploy copies its
  whole Doppler project onto its Fly apps. The launchd files hold no secrets any more: the engine's runs `doppler
  run -- pnpm dev`, and `pnpm arrive` writes both files, so nothing is copied between Macs by hand.
- **A worktree's work travels through the app's own GitHub repository** (Sandy chose this over a private mirror):
  `leave` commits anything uncommitted as "Handoff: work in progress, from <Mac>" and pushes the branch; `arrive`
  clones a missing checkout and makes the worktree again from the branch, at the same path. The database stores
  paths, so both Macs use the same ones, which means the same user name (lifted the next day: "A computer
  registers its root"). An app whose GitHub repository Self
  Evident was not given (Avoca practice) is never pushed or fetched. A main checkout is the person's: reported when
  it has unpushed work, never committed for them.
- **Histories travel through a private repository** (`STATE_REPO`, Sandy chose it over Mac-to-Mac copying), kept in
  `~/.self-evident/state`: each open conversation's session file, and the memory Claude Code keeps beside each
  app's checkout. Only the conversations' own sessions go, not everything Claude Code has in those folders.
- **One engine at a time is enforced, not remembered**: the state repository says which Mac holds the engine.
  `arrive` refuses while another Mac holds it (`--force` for a Mac that is gone); `leave` stops the engine here and
  lets go; `leave` refuses while an agent is working.

`pnpm leave` here, `pnpm arrive` there; `pnpm handoff check` shows what leaving would send and changes nothing. A new
Mac needs the tools (mise, pnpm, `gh`, `fly`, `doppler`, Claude Code, each signed in), a clone of this repository at
the same path, then `pnpm arrive`. `https://idea.dawn` and an app's Storybook inside the page still need Caddy and
dnsmasq, which this does not set up. Code: `engine/src/handoff.ts`, `engine/src/cli/handoff.ts`; test:
`handoff.test.ts` (bare repositories stand in for GitHub; the other Mac is this one with its folders deleted).

Found on the way: Ragdoll Golf's prototype branch has Mixamo's X Bot model in its first commit (deleted two commits
later; the agent's note says it isn't CC0) and the repository is public, so that branch is not pushed until Sandy
says how (`pnpm leave --except <branch>` leaves it on this Mac).

## A computer registers its root; paths are stored from it (Sandy, 2026-11-12: "as long as our folder structure is identical, we can move between the two … computers should register their username, their root folder")

The day before, moving between Macs needed the same user name on both, because the shared database held full paths
(`/Users/<name>/code/sandbox/ragdoll-golf`) and a full path names one computer. Decided: what two computers share is
the folder layout under a root, not the user name.

- **Paths are stored from the root.** The five columns that hold a path on disk (an app's checkout, a conversation's
  folder and worktree, a build's worktree, a prototype's folder) store `~/code/sandbox/ragdoll-golf`, and each
  computer puts its own root back when it reads (`engine/src/db/home-path.ts`, a column type, so the engine's code
  sees full paths as before and nothing that reads one changed). The root is the home folder, or `MACHINE_ROOT`. A
  path outside the root is stored as it is. Migration `0012_machine_root` rewrote the stored ones.
- **Each computer registers itself**: its name (the Mac's own, which doesn't follow the network), its user and its
  root, in the `machine` table, when its engine starts and when it arrives. `pnpm handoff check` lists them.
- **Histories are filed by their place under the root.** Claude Code names a conversation's folder after the full
  path it works in, so the state repository keeps the root's part of that name as `ROOT`, and `arrive` puts each
  folder back under the arriving computer's own name for it.

Not rewritten: full paths inside old events and old messages (history, as it was said), and inside what a person
typed (Homework Gate's test command names a folder under this Mac's user; it needs editing to run elsewhere). Not
tried yet: resuming a conversation on a computer with a different user. The session file lands in the right folder
(tested), but its turns still mention the first computer's paths, and what the agent makes of that is unknown until
a real move. Tests: `machine.test.ts`, `handoff.test.ts`.

## Reference apps: read the other repo, never change it (Sandy, 2026-11-12: "when I'm working on one, I want to be able to use the other one as a reference for how do I build it")

Sandy has a product in two repositories, a backend and a frontend: most features touch one, pull requests are
separate, and the need is to read one while building in the other. The engine has always used one repository per
app (the `repo` table allows several; about a dozen places take the first). Decided, with Sandy: **two apps, each
naming the other as a reference**, not one app with two repositories. Each app keeps its own tasks, worktrees and
pull requests; a reference is another app whose checkout this app's agents may read and never change. One app with
member repositories would give a shared backlog, which wasn't asked for, at the cost of every task choosing a
repository; the reference is needed in either shape, so it comes first.

- Kept on the app as `setup.references: [{ appId, note }]`: by app, not by path, so it means the same on every
  computer. Settings › an app › Repo › Reference apps: tick another app, say what it is to this one.
- Every agent of the app gets each reference's main checkout as an extra folder (the Agent SDK's
  `additionalDirectories`) and is told where it is, what it is, and that a change there is a task for that app: a
  conversation, a check, a prototype's agent, the planner and the builder.
- An edit to a file in a reference is refused outright in a conversation, not asked about (before, any edit outside
  the checkout was rated expensive and asked). The builder's guard already keeps edits inside its worktree and the
  planner changes nothing.
- A reference whose app has no checkout on this computer is left out, and the Settings page says so.

What it reads is whatever is checked out in the other app's main checkout, normally the default branch; pointing
at an unmerged worktree is not built. A feature that touches both is two tasks, one per app; nothing links them
yet. Not covered: a shell command that writes into a reference is not refused by path (a conversation rates and
asks about shell commands as before; the builder is told not to). Not tried with a live agent yet: that the SDK's
extra folder reads as expected. Code: `engine/src/references.ts`; tests: `references.test.ts`, and the story
`Pages/Settings › App References` (made-up apps).

## One guide to running it, and every agent knows where it is (Sandy, 2026-11-12: "make sure all our docs are up to date so I can ask the agents in self evident for any help regarding this")

Two days of set-up decisions (the database on Fly, Doppler, leave and arrive, a computer's root, two GitHub
accounts, reference apps) were spread over this log in the order they were made. `docs/running-it.md` now says how
things are, in one place: the two ways a computer runs it (its own database, or the shared one), moving between
computers, adding an app and what the GitHub field turns on, a second GitHub account, a product in two
repositories, a table of what goes wrong and what to do, and the known limits. This log keeps the why.

Every conversation's agent is told where that file is and to read it before answering a question about Self
Evident itself, whichever app it is working in (`GUIDE` in `engine/src/talk.ts`); `guide.test.ts` fails if the
file moves or loses a section the agents are told it has. Linked from CLAUDE.md, the README and `engine/README.md`,
whose own account of running it now points there.


## The workbench: an app is one or more repositories (Sandy, 2026-11-12: "a single project that could have multiple repos underneath it … the agent's job was to make edits to the repos and to do PRs for those repos, create work trees")

This reverses the morning's decision ("Reference apps": two apps, each naming the other). What changed: Sandy's
work on the two-repository product arrives as Linear tickets, per team and not per repository, and a ticket can
touch the frontend, the backend or both. Two apps would make every ticket choose an app, or become two tasks.
InDusk had this as the workbench: one project, its repositories under it, a worktree and a pull request in each
one a piece of work touches. Decided, with Sandy ("let's just get it over with"):

- **An app is a workbench of one or more repositories. A task belongs to the app; a worktree and a pull request
  belong to a repository.** The `repo` table already allowed several and `pr` rows already name their repository.
- **One definition** of which repositories an app is made of: `engine/src/workbench.ts` (InDusk's lesson, from its
  `worktree/repos.ts`: two places answering that apart disagree silently). The eleven places that took "the first
  repository" of an app, in whatever order the database gave it, now ask for the home repository.
- **Home and mates.** Home is where an agent starts and where the app's Storybook, test command and prototypes
  run: `setup.home_repo` (a repo id), else the first by name. A mate is any other repository with a checkout here
  that may be written to. A piece of work with a worktree at `<home>-worktrees/<slug>` has `<mate>-worktrees/<slug>`
  in each mate, on the same branch, cut from that repository's own base branch. The path is the record: no new
  column, and the same on every computer.
- **Built first: conversations.** Starting one adds a worktree in every mate; its agent gets them as extra folders
  and is told a change in more than one is a commit and a pull request in each; an edit in a mate is rated by that
  worktree's branch, like an edit at home (before, it was "outside the checkout" and always asked); ending removes
  them all and keeps a branch only where it has commits.
- Reference apps stay, for code that is read and is not part of the app's work.

Not built yet, in the order planned: the builder and a task's own agent (they still work in home only), the
planner, checks and prototypes; catching up from main for the mates' branches; Settings for a second repository
and for choosing home (the API takes both today; Settings edits home only); merging the two apps of that product into
one; then tasks from Linear tickets, which is what this is for. Known gap: the GitHub sync matches a pull request
to ours by number, and a `pr` row recorded without its repository could match the same number in a mate. Code: `workbench.ts`; tests: `workbench.test.ts` (two real git repositories).

**Tried the same day, with a live agent.** The two apps of Sandy's two-repository product were made one (the
second repository and its kept pull requests moved under the first app, the emptied app removed; by hand in the
database, since nothing in the API moves a repository). A conversation there got a worktree in each on one branch,
its agent named both folders and said a change in both is a pull request in each, and ending it removed both.
Found by that agent: those repositories' own rules want a branch named after the ticket, and ours are `talk/<id>`.
Open, and it belongs with tasks from Linear tickets: the branch should come from the ticket.

## An app's repositories are chosen by folder (Sandy, 2026-11-12: "repo needs to be choosing multiple repos … select local folder and make that a chooser … then it will have a list of the repos in that folder … choosing them should give you the remote for each automatically")

Settings showed one repository, the first, with a typed path; a second one was there and could not be seen.
Decided, with Sandy: the Repo page lists every repository of the app, and they are added by choosing a folder.

- **Choose folder…** asks the engine, which is on the person's computer, to open the system's folder dialog (a
  web page is never given a folder's path). The engine says which git repositories are in the folder picked: the
  folder itself, or the ones directly inside it. Each comes with the GitHub name read from its origin remote
  (whatever the host is called in `~/.ssh/config`) and its default branch. Ticking one adds it; nothing is typed.
- With more than one, a radio button says which is **home**. **Remove** takes a repository out of the app (and the
  teammates' pull requests kept for it); the folder is not touched. One Save applies the lot, as on the rest of
  the page. "Add one by hand" keeps the old two fields, for a repository with no checkout here or a system without
  the dialog (it is the Mac's, through `osascript`).
- A repository added to an app that already has a home no longer changes the app's default branch: it carries its
  own base branch when that differs.

Code: `engine/src/folders.ts` (`POST /folders/choose`, `DELETE /repos/:id`), `Repos` in `app/src/pages/Settings.tsx`.
Tests: `folders.test.ts` (real git repositories); stories `Pages/Settings › App Repos`, `App Repos Folder Chosen`,
`App Repos Empty Folder`, `App Repos None` (made-up repositories). Not done: New app still takes one typed
repository; a saved row cannot be edited, only removed and added again. Not tried: the dialog itself, which needs
a person at the screen.

## Tasks from Linear tickets (Sandy, 2026-11-12: "we should be able to create plans and tasks from linear … it needs to be connected to self evident")

Until now Linear was one way and mostly on paper: the integration declares create, comment and move, and nothing
read a ticket. Sandy's work on the two-repository product arrives as Linear tickets, so the first thing built is
the other direction. Decided, with Sandy:

- **A ticket becomes a task.** On the Tasks page of an app whose Linear team is set (Integrations › Linear: team
  key, key variable), "From Linear" lists the team's open tickets: the person's own, unassigned, or everyone's,
  with a filter. The ones ticked are brought in. A task made this way has `source: 'linear'` and
  `sourceRef.linear` (the ticket's id, identifier, URL, the branch name Linear gives it, its Linear project), the
  ticket's words as its description under a line saying where it came from, and its priority.
- **Once.** A ticket already brought in shows the task it is and is not offered again; bringing it in through the
  API again updates that task's title, description and priority and makes no second one.
- **Read only.** Nothing is written to Linear. A task's state here is its own: a ticket someone started there is
  still to do here until work starts here.
- **The key stays where the engine runs.** A personal API key, in the variable the app names; for a company's
  Linear that is this computer's environment, not the shared settings.

Not built: a Linear project becoming a project here (the project's name is kept on each task, so it can be done
from what is stored); the task's branch taking the ticket's branch name (kept, not used yet: conversations still
cut `talk/<id>`); moving the ticket in Linear as the task moves; a ticket changing in Linear after it was brought
in (nothing re-reads it until it is brought in again). Code: `engine/src/linear-import.ts`
(`GET /apps/:id/linear/tickets`, `POST /apps/:id/linear/import`), migration `0013_issue_from_linear` (the task
source `linear`), `app/src/components/LinearImport.tsx`. Tests: `linear-import.test.ts`, against a stand-in for
Linear; stories `Components/LinearImport` and `Pages/Tasks › With Linear` (a made-up team). Not tried: the real
Linear API, which needs a key in the engine's environment.

**From Linear is beside New task too** (Sandy, the same day: "I don't see the ticket option in the new task").
The panel was only on the Tasks page, one click from where a task is made. Plan's header now has From Linear next
to New task, for an app whose Linear team is set; it opens the same panel on the tickets. Tried against the real
Linear API that day: the team's open tickets were read with a personal key in the engine's environment. Story:
`Pages/PlanHome › From Linear`.

## Text someone wrote is shown as Markdown, everywhere (Sandy, 2026-11-12: "make sure that we are formatting md where ever there is text")

A task brought in from a Linear ticket showed its description as one run of raw Markdown: headings, lists and
links as marks. Briefs, comments and the agent's messages were already rendered; descriptions, notes, reasons,
questions and decisions were not. Decided: one component, `Md` (`app/src/components/Md.tsx`), for any text a person
or an agent wrote, so every page reads it the same way. A block takes the size and colour of where it is put;
`inline` is for a line inside a sentence; `clamp` shows the first few lines in a list row, the rest on the thing's
own page. Links open in a new tab.

Used for: a task's and a sub-task's description (the task page, the Tasks list, a project's backlog and phase), an
idea's body and notes, a to-do's notes and why it was dropped, a question, its options and its reason, a decision
and its rationale, why a task was canceled, a run's summary, the summary page's lines, a question on Now. Left as
typed: what the person says in a conversation, tool output, errors, and one-line labels from the engine. Stories:
`Components/Md`. New text shown anywhere should go through `Md`.

## The type is Linear's (Sandy, 2026-11-12, a task beside the same ticket in Linear: "can we update the font to be a little more linear like")

The fonts were InDusk's and marked provisional: Bricolage Grotesque for headings, IBM Plex Sans for text. Decided:
Inter for both, as Linear has it, with semibold headings, a 1.6 line height and smoothed rendering; IBM Plex Mono
stays for code. Written text (`Md`) follows Linear's issue page: larger section headings with room above them,
looser lists, code in a bordered chip, and links in Linear's indigo with no underline until hovered (a new token,
`--link`). Storybook now loads the same fonts as the app (`.storybook/preview-head.html`); before, stories fell
back to the system font. The palette is still InDusk's and still provisional.

## A task can be deleted, when nothing has been done on it (Sandy, 2026-11-12: "we need a way to delete a task")

Until now a task could only be canceled, which keeps it, with a reason. That is right for work that was started
and dropped, and wrong for a task made by mistake, a test, or a ticket brought in from Linear that shouldn't have
been. Decided:

- **Delete removes it and leaves nothing behind:** the task, its sub-tasks, and what was written on them (comments,
  steps, decisions, questions, planned builds and file claims). An open conversation pinned to it is ended first,
  which removes its worktree. The event log keeps one line, `issue.deleted`, with its name and title. Its number
  is not handed out again unless it was the app's last.
- **Only a task with no work on it.** One an agent has run on, or with a pull request, a recorded check or a live
  prototype, is refused, and the page says to cancel it instead: its record is what happened.
- On the task's page, top right, behind a confirmation that says what goes. A ticket deleted here can be brought
  in from Linear again; nothing in Linear changes.

Code: `engine/src/delete-issue.ts` (`DELETE /issues/:id`), the button in `app/src/pages/IssuePage.tsx`. Tests:
`delete-issue.test.ts`; stories `Pages/TaskPage › Delete Refused` and `Delete Declined`. Not built: deleting
from the Tasks list, or several at once.

## Assets: what an app or a project is worked from (Sandy, 2026-11-12: "I would like a place to put like project or app level assets")

A task's steps leave their own assets (a sketch, a story, a prototype, an ADR), and nothing held what belongs to no
one task: the design file, the requirements document, the build order, an architecture diagram. They were said
again in each conversation. Decided, with Sandy:

- **An asset is a name, where it is, and a line on what it is.** Where it is: a link, or a path on this computer.
  Self Evident keeps the pointer, never a copy.
- **An app has assets; a project has its own on top.** The app's are on Plan, a project's on its page. Add and
  remove there.
- **Every conversation is told them:** the app's always, and the project's when the conversation is about that
  project or a task in it (`assetPrompt`, beside the reference apps). The agent is told to read the one a question
  turns on, and to say so when a link needs a sign-in it does not have.

Also said that day, and already there: a task has two kinds, code (a brief, built by agents, a pull request) and
to-do (work outside the code, a checklist and notes). Setting up a development environment is a to-do.

Code: `engine/src/assets.ts`, the table `asset` (migration `0014_asset`), `app/src/components/Assets.tsx`. Tests:
`assets.test.ts`; stories `Components/Assets`. Not built: editing one in place (remove it and add it again);
ordering them by hand; the planner and the builder being told (conversations and a task's own agent are); the
agent adding one itself; a file kept by Self Evident instead of pointed at.

## A project can start empty, be drafted by the agent, and take tasks that already exist (Sandy, 2026-11-12: "when I create a project, I shouldn't need to create a task … it could be just a prompt that would trigger an agent to create the tasks for you … add tasks that already exist to a project or move them from one to the other")

Making a project asked for its tasks up front, written by hand. With tasks now arriving from Linear, the project
often comes second: the tasks exist, and the project is how they are ordered. Decided, with Sandy:

- **A project is a name.** No task is needed to make one (`createProject` no longer refuses an empty list; the
  agent's `create_project` tool neither).
- **Or a prompt.** New project has "Have the agent draft the tasks": what it should cover, in the person's words.
  The project is made, then a conversation about it is opened and handed the job (the same `talks/ask` a page uses
  for any job): read the code and the assets, make the tasks in order with `create_task`, plan no sub-tasks, start
  nothing, and say what it made. Writing them by hand is still there, below.
- **Tasks move.** The engine already let a task change project (`updateIssue`, sub-tasks following); only a task in
  no project had a control for it. Now: on Tasks, a task in a project has Move… (another open project, or no
  project); on a project's page, "Existing tasks" lists the app's other open tasks to add or move in. A moved task
  goes to the end of the order.
- **Not out of a running project.** Its tasks are built in order, so the engine refuses until it is stopped, and
  the project page does not offer those tasks.

Code: `createProject` in `engine/src/projects.ts`, the guard in `updateIssue` (`issues.ts`),
`app/src/pages/NewProject.tsx`, `app/src/components/AddTasks.tsx`, Move… in `app/src/pages/Issues.tsx`. Tests:
`projects.test.ts`; stories `Pages/NewProject` (Blank, Drafted By The Agent, Written By Hand), `Components/AddTasks`,
`Pages/Tasks › Moving`. Not tried: the agent drafting a real project. Not built: picking several tasks at once;
choosing where in the order a moved task lands (reorder it on the project's page after).

## A project's Add task(s): new, existing, or from Linear (Sandy, 2026-11-12: "We need to be able to select issues from linear when adding existing tasks. It should be Add Task(s) and allow you to create new ones, select existing ones, or choose from Linear")

The project page's "Existing tasks" panel is now **Add tasks**, opened by **Add task(s)…**, with three ways in:

- **New**: a title and, if wanted, a description. The task is made in this project; the form clears and says what was
  added, so several can be written in a row.
- **Existing**: as before. The app's other open tasks: Add (from no project) or Move here (from another open project).
- **From Linear**: only when the app has a Linear team. The same ticket list as the Tasks page (`LinearImport`, now with
  `embedded`), and the ticked tickets become tasks and are put in this project. A ticket that already is a task is
  named, not ticked: it is under Existing.

Decided: the Linear tab brings the tickets in with the import as it was, then moves each new task into the project,
one call each. No change to the engine. If a move fails part-way, the tasks exist in no project and are under Existing.

Whatever comes in goes at the end of the project's order.

## Set up Storybook upgrades an older Storybook itself, and one set-up runs at a time (Sandy, 2026-11-12: "Set up storybook doesn't seem to work")

Merman had Storybook 8. The screen map's add-on needs 10, the engine stopped there and gave the whole job to an agent,
and the page's only sign was one line. Sandy pressed again and a second agent started the same upgrade in a second
worktree.

- **The upgrade is the engine's.** A Storybook older than 10 gets Storybook's own `storybook@latest upgrade --yes`
  (tried on a copy of Merman: 8.4.7 to 10.6.7 in one go, and it builds), then the package manager's install without
  the frozen lockfile (the upgrade's own install runs frozen under `CI=1` and fails on the lockfile it has just
  outdated), then the standard as before, in the same commit. The upgrade's `debug-storybook.log` is removed. Only an
  upgrade that does not reach 10 is said and left.
- **One set-up per app.** The conversation the set-up hands to is marked (`subjectRef.setup`, subject "Set up
  Storybook"). A press while it is open shows it and starts nothing; a press while the engine's own part still runs
  waits for the same answer. tkt's set-up goes through the same door.

## A task can be planned and built on its own (Sandy, 2026-11-12: "stand alone tasks should be possible. Maybe we create a throwaway project for each solo task, deleting it if the task is moved to an actual project?")

An agent in Merman said "The planner only plans tasks that are in a project, so I'm making a 'Marketing site' project
for MER-1". Sandy: that isn't right.

Planning is the small part; the runner, landing, the branch and the pull request are all keyed to a project, so the
project stays and goes out of sight (`engine/src/solo.ts`, column `project.solo`):

- **Made on first plan.** Planning a task in no project makes a project named after it, marked solo, and plans it
  there. Refusals (no approved brief, not taken on) come before anything is made.
- **Never a project to the person.** It is not in Projects, Plan's projects or the agents' `projects` tool. The task
  stays under "In no project" on Tasks and Plan, and `tasks` with project "none" returns it. Its plan and build are
  the project page, reached from the task ("Its plan and build"), with "Run it", back to Tasks, and no Add task(s).
- **Joining a real project.** Before building starts: the task and its sub-tasks move, the planner's questions and
  decisions go with them, and its own project is put away as superseded, not deleted (its events stay). Once building
  has started (running, paused, landed, stopped) the move is refused: the branch and the pull request are its own.

Not done: the task's own page does not answer questions or run the build itself, it links to the project page; a solo
project's name does not follow a later rename of the task.

## The build is quiet; clean-up happens after the prototype (Sandy, 2026-11-12: "why there would be questions during the build is sort of crazy to me. The build is like everything has been figured out … It should be very fast")

Merman's MER-1 collected eleven backlog tasks while it was planned and built (MER-21 to MER-31). Read against its
brief, none was work the build needed: two restated the brief, two were things the brief had already deferred, the
rest were "consider…" suggestions, tooling trivia and two small bugs. They existed because we asked: the planner's and
every builder's instructions ended with "if you noticed something someone should do, list it under Later", and each
line became a numbered task that held the project open.

I first built a clean-up phase after the build to triage those notes (branch `cleanup-notes`, parked, not merged).
Sandy: that is the wrong end. The prototype exists so that everything unplanned is found before the brief; clean-up
(is anything written twice, what should be a function, what to refactor, how is this cleaner) is a question for the
prototype's code, not for the finished build.

- **No notes from the build.** The planner no longer returns `later`, builders are no longer asked for `Later:` lines,
  and neither adds to a project's backlog. A builder fixes a small slip in its own files, builds what the brief says,
  and if the sub-task cannot be built as written it stops and says exactly what is wrong.
- **Clean-up is part of the prototype analysis** (first shipped as a check of its own, `cleanup`, in PR #155; Sandy
  the same evening: "Clean up should just be part of the analysis, right?"). The analysis has a section, Cleaner: what
  repeats and should be one function, what could be simpler or more efficient, what to refactor so this fits, what
  to leave out. The conductor writes it into the brief as instructions to the builder. Nothing to switch on: every
  workflow with the analysis has it.
- The backlog is back to what people, the agent and ideas put there.

Not changed: the planner can still ask a question when the brief leaves a choice open. By the same reasoning that
should be rare or gone; left for Sandy to say.


## Only a task's agent has a worktree (Sandy, 2026-11-13: "They shouldn't be doing that anymore, only tasks should … They are now just different conversations about the app as a whole")

Every conversation started in the left column was cut a worktree and a branch the moment it opened, before a word was
said. Most never touch a file (a question, an idea, a new task), an empty one kept its worktree until someone ended
it, and Merman had seven.

- **A conversation in the left column is about the app as a whole.** It starts in the app's checkout with no worktree
  and no branch (`subjectRef.app`), whatever page, idea or project it was started from. It has the reading tools and
  the shell, no editing tools, and a shell command that leaves a mark asks first whatever the auto-approve level.
  It is told that anything that changes files is a task's work: create the task, send the person to it.
- **A worktree is cut for a task's agent** (`ensureTaskTalk`), as before, and for an integration's set-up handed to the
  agent, because that ends in a pull request. Prototypes keep their own.
- Ending a conversation without a worktree removes nothing. The column's wording no longer promises a worktree.

Not changed: conversations that already have a worktree keep it until they are ended. Left open: the Sketch and
Mockup steps on an idea or a project still hand the step to a left-column conversation, which can no longer write the
files; those steps belong on a task now. And two conversations sometimes start a second apart from one press.

## An app can run on its own Claude account (Sandy, 2026-11-13: "how do we configure the claude code account or api an app will use? … it uses the default or can override")

Until now every app's agents ran on whatever the engine process had: the Claude Code login on the machine, or
`ANTHROPIC_API_KEY` when the engine's environment had one. One account for everything, which is wrong when one app is
someone else's code and should go through their account.

Now, under Settings › an app › Agents, **Claude account** is one of:

- **The engine's default**: as before.
- **This app's own API key**: the *name* of an environment variable (say `WORK_ANTHROPIC_KEY`). The key stays in the
  engine's environment, never in the database, as with Linear's.
- **This app's own Claude login**: a config folder (say `~/.claude-work`), logged in to once with
  `CLAUDE_CONFIG_DIR=~/.claude-work claude auth login`.

It is kept in `setup.account` (`key_env` or `config_dir`) and applied in `engine/src/account.ts` to every place the
engine starts an agent: builder, planner, conversations, the focus summary, to-do drafting, descriptions. Settings
shows what the engine finds for the saved choice: who the account is (it asks Claude Code), or what is wrong.

Decided:

- **Never a quiet fall back.** An override that can't be used (the variable unset, the folder missing) stops that
  app's agents with a sentence saying why. The point of an override is that this app's code does not go through the
  other account.
- **With an override, every other credential is taken out** of what the agent is given, so the default key or token
  can't win over the one chosen.
- **A login's sessions live in its folder.** Claude Code keeps sessions under the config folder, so for such an app
  the terminal side of a conversation (reading the session file, the sessions listed to bring in, the command to
  continue in a terminal) uses that folder too, and the command is prefixed so the terminal is on the same account.
- Not done: conversations begun on one account are not moved when the app's account changes; they stay in the folder
  they were written in, so an open conversation should be ended before switching a login. No default override at
  the All apps level: the default is the engine's own environment.

## An app can choose its own skill for a job (Sandy, 2026-11-13: "can we also have the skills by job be app level overridable?")

Skills are filed under jobs in All apps, one skill on per job. An app could switch a whole plugin for itself, never a
skill. Now, under Settings › an app › Plugins › **Skills by job**, each job that has a skill filed follows All apps
unless the app picks another skill filed under that job, or none.

Kept in `setup.skills_by_job` (`{ <job>: <skill key> | null }`; a job left out follows All apps) and applied where a
session's skills are resolved (`skillOnFor` in `engine/src/skills.ts`), so it reaches the planner and conversations.

Decided: filing stays in All apps. An app chooses among the skills already filed under a job; it does not file a skill
under a different job for itself. A choice whose skill is later refiled or uninstalled is dropped at the next save, and
until then gives that job no skill in that app. The plugin switch still wins: a skill chosen from a plugin that is off
for the app is not given. Skills in the app repo's own `.claude/skills/` are not filed under jobs and always apply.

Changed the same day (Sandy: "I don't see it and it shouldn't be a plugin, it should have its own nav"): it was a list
at the bottom of the app's Plugins section, shown only when some job had a skill filed, so on an install with none it
was simply absent. It is now its own section of an app's settings, **Skills by job**, and lists every job, grouped as
in All apps: a job with skills filed has the menu; a job with none says "No skill filed" and what the engine does
there itself; and with nothing filed anywhere the page says how to get something to choose.

## An idea has an agent of its own, like a task (Sandy, 2026-11-13: "when you go to one and 'work on it' you get a dedicated agent. It should really be a task in all but name until you convert. That allows you to work through the sketches etc etc without committing to full task")

With left-column conversations no longer able to write files, an idea's Sketch and Mockup steps had nowhere to go.

- **An idea's page is a task's page.** Its steps are down the side, each with a page of its own (`/ideas/<id>/<step>`),
  and its own agent is in a column beside them (the same `TaskNav`, `StepSection` and `TaskAgent`). It has no Build
  section and nothing is approved on it. After Linear, where an issue in triage has the same page as any other.
- **The agent and its worktree start on "Work on this idea"** (Sandy picked this over a worktree cut on the first
  write, and over none). An idea nobody works on has neither. One conversation per idea (`ensureIdeaTalk`), told it
  is the idea's agent; a step started on the idea goes to it, and a sketch, story or prototype it shows opens on that
  step's page of the idea. The left column leaves the idea's agent and its prototype's agent out.
- **Converting to a task takes the agent with it.** The same conversation, worktree and branch are re-pinned to the
  task (`convertIdea`), so the sketches and stories are already there; the agent is told, and starts its next turn
  with the task's instructions. Converted to a project, the conversation stays on the idea's page.
- "Ask the agent to convert it" goes to the idea's agent when it has one, else to a conversation about the app.

Not built: an end to the idea's conversation when an idea is dropped, and the same page for a project's steps (those
still go to a conversation about the app, which cannot write files).

## An app's skills for the steps of its workflow (Sandy, 2026-11-13: "this is where we want to be able to apply a skill to a part of the workflow. So like having a skill that can be used in sketch, or mockup etc. This allows an app to have special context")

The app's Skills section (it was "Skills by job") now opens with **Skills by workflow step**. Each step that an agent
does (research, the brief, sketches, mockups, the prototype, and the checks: prototype analysis, ADR, blast radius,
brief audit) takes any number of skills. This is where an app's own way of doing a step lives: its design rules for a
sketch or mockup, its standard for a decision record.

- **What can be chosen**: the skills the app's conversations already get, which are its repo's own
  (`.claude/skills/`) and those of the plugins on for it. Choosing one for a step does not switch anything on; it
  says when to use it.
- **How it reaches the agent**: kept in `setup.step_skills`. A conversation's prompt lists the app's steps and their
  skills and says to invoke them before doing that step (`stepSkillPrompt`, engine/src/skills.ts). A check's fresh
  agent is told only its own step's skills, and that where the skill and its instructions differ on the form of the
  result or where it belongs, the skill wins: the app's standard for an ADR beats the engine's general shape.
- **A skill that is gone** (removed from the repo, its plugin switched off) is left out of the prompt, never
  promised, and shown as missing in Settings.

Not done: the skills are read from the app's first repository only, as before, so a skill kept in a second repository
of a workbench isn't offered. The builder and the planner get no step skills: the steps are done in conversations.
"Skills by job" stays below it, unchanged.

## Your own skills, outside every repo (Sandy, 2026-11-13: "can we then add skills somewhere that sit outside the repo we are using that become available for any app?")

Skills came from two places: an app repo's own `.claude/skills/` (that app only, and it means putting files in the
repo) and installed plugins. Nothing held a skill you write yourself for every app, without touching a repo.

Now there is a folder on this computer, `~/.self-evident/shared/skills/` (`SHARED_SKILLS_HOME` moves it), one folder
per skill with a `SKILL.md`. The engine loads it as a built-in plugin named `shared`, so nothing else had to change:

- it is listed in Settings › All apps › Plugins, with a **Write a skill** form (name, when to use it, what it says)
  that writes the file, there to edit by hand afterwards; the same name again replaces it;
- its skills are filed under jobs in All apps like any plugin's, and offered for a step in every app's Skills, where
  a session names one `shared:<name>`;
- it switches off, for all apps or one, and does not uninstall.

Checked against the real Claude Code: a skill written there is loaded by a session as `shared:<name>`.

This is the third home for the decision-record skill discussed on 2026-11-12, and the one that puts nothing in the
code repos or the docs repo: write it here, then choose it for the ADR step of the app it is the standard for.

Not done: the folder is on one computer. It is not carried by the state repository, so on a second computer the
skills are copied by hand. There is no delete or edit in Settings: remove or change the folder.

Added the same day (Sandy: "can we also point to a repo and pull all the skills of that repo, or update if we already
have them and the repo has changed?"): **skills from a repository** (`engine/src/skill-sources.ts`). In the `shared`
block, give a git URL or a folder on this computer that is a git repository. The engine clones it (shallow) under
`~/.self-evident/shared/sources/`, finds every folder holding a `SKILL.md`, and copies each into the shared skills
with its files. **Update** fetches the repository again: changed skills are replaced, new ones added, ones the
repository dropped are removed, and it says which. What was pulled, and at which commit, is in
`~/.self-evident/shared/sources.json`.

Decided:

- **A skill from somewhere else is never overwritten or removed.** Each copy carries a marker naming its source; a
  name already held by a hand-written skill, or one from another repository, is left alone and reported as skipped.
- **Nothing in the repository is run.** Files are copied. Git uses this computer's own access (SSH aliases work).
- **Update is by hand.** A button per source; nothing fetches on a timer.
- This is also how a second repository's skills reach a workbench app: pull that repository's folder, and its skills
  are offered for a step like any other shared skill.

Not done: only folders with their own `SKILL.md` are copied, so a skill that leans on a sibling folder of shared files
arrives without it. A pulled skill edited here by hand is replaced at the next update that finds it different.
Tried on two real repositories on this computer: 4 and 8 skills pulled, and a second pull reported nothing changed.

Changed the same day (Sandy, asked whether there was anything in the UI for this, then "yes" to moving it): your own
skills were a block named `shared` inside All apps › Plugins, which is not where anyone looks for skills. They are now
their own section, **All apps › Your skills**: the skills with where each came from (written here, or pulled from
which repository), the form that writes one, and the repositories to pull from. Plugins lists installed plugins only.
Underneath it is still the `shared` plugin, and an app's own Plugins switches still name it that way.

## The ADR step is a draft; the planner settles it (Sandy, 2026-11-13: "I think maybe the ADR should be part of that process, not part of the pre-process that we go step by step … draft ADR is what the step should be")

The ADR was a check before the brief was approved: a fresh agent decided the architecture and wrote a decision record
as a report on the task. Then the planner, reading the code to cut sub-tasks, made architecture decisions again. And
the record stayed a report: never a file in the repository, so never in the pull request, which is where a team that
keeps decision records expects it.

Now:

- The step is **Draft ADR**. Same place in the line, same fresh agent, but it proposes: the options, the choice it
  would make, why, and what it is unsure of. The blast radius and the brief read it as proposed.
- **The planner settles it.** It is given the draft with the brief, records the choice as a decision (the draft's or
  a better one, saying why it changed), or asks it as a question when the person might want it either way.
- **The build writes the record.** For a decision worth a record, the planner adds the record's file and a step that
  writes it to the sub-task that first builds on the decision. It follows how the repository keeps its records (it
  looks for `docs/decisions/`, `docs/adr/`, or what CLAUDE.md or AGENTS.md says), or the app's skill for the Draft ADR
  step, which the planner now gets too and which wins on place and form.
- A task whose workflow has no draft step still gets a record when its plan makes a decision that deserves one.

Not done: a decision row does not say whether it has a record; that is read from the sub-task's files. The planner
is told the skill only when its session has it (the app repo's own skills and plugins on for the planner). Not tried:
a real planning run on a task with a draft.

## A prototype's bar is two rows (Sandy, 2026-11-13: "The header is too crowded, the address bar doesn't need to be so wide. As you narrow it it gets worse. We need a second row I think")

On a task's Prototype step the bar held everything in one row (reload, address, device widths, made-up data, open in
a tab, talk, restart, stop) and Detach was laid over its right end, so in a narrow column it covered the restart and
stop buttons and the device widths ran into the address.

- Row one is where it is and its server: reload, the address (no wider than 460px), then open in a tab, talk, restart
  and stop at the right. On a step's page the row leaves room for Detach after them.
- Row two is how it is shown: the device widths and the made-up data. It wraps when the column is very narrow.
- Nothing is hidden at narrow widths any more (the device widths used to go under 760px, the "Made-up data" label
  under 1000px).

Stories: PrototypePane › Narrow, Viewer › Prototype embedded (Detach is checked to sit right of the stop button).

## What an agent asks shows in its conductor's column (Sandy, 2026-11-13: "these sub-agents for the different steps are managed by you. I don't think I should be waiting for those … you should be telling me how the progress is going")

A prototype's agent asked to run a command above its threshold (it already acts up to moderate by itself; expensive
always asks). The card showed only in the Prototype tab. The conductor's `agents_out` said "working" and `read_agent`
showed nothing pending, so the conductor reported it busy while it sat until the person happened on the card.

- **The card goes to the conductor's conversation too**, headed "The Prototype agent asks" (or the check's name), with
  the same Allow / Always allow / Deny. It is answered in either place, and both conversations say how it went. This
  covers a prototype's builder and the fresh agents on checks, on a task or an idea.
- **The agent is never "working" while it waits.** `agents_out` and `read_agent` give its state as "waiting for the
  person to allow Bash (expensive): <the command>", and the conductor is told to say in a line what it wants and why.
  On the task's page the agent's tab reads "asks you" in amber and the conductor's dot turns amber.
- **An ask nobody answers** still lapses after ten minutes, but now says so ("No answer in 10 minutes, so … was not
  run") in both conversations, and the agent is told to say what it needs and stop, where before it read as a denial.

Decided against: the conductor answering for the person. Up to the threshold the engine already allows without
asking; above it the answer is the person's, and a model deciding it would be the threshold in name only. Also not
done: waking the conductor with a message when an agent asks (the card in its column is the notice, and a turn costs
money). Not tried: a real agent asking, end to end; the engine test drives the ask with a stand-in for the live
conversation.

## A prototype's code, beside it running (Sandy, 2026-11-13: "For prototypes, we are building a sample of what will eventually get merged. We should have the view of it functioning, and we should have a diff view of all the files that changed. The agent should be able to add files to that view for reference if the user asks a question. It can then highlight areas, or show docs pages")

The prototype's step now has three views: **View** (it running), **Code**, and For the brief.

- **Changed.** Every file that differs from where the prototype's branch left the app's default branch, committed
  or not, including new files nobody has added yet, with lines added and removed. Pick one for its diff; a changed
  file can also be read whole, and a Markdown file as a page. The diff is read from git each time, never stored.
- **Shown by the agent.** `show_code` puts a file from the prototype's worktree (changed or not) into the view with
  a note saying why and the lines to look at highlighted, or a page on the web (a library's docs) in a frame with a
  link out, since many sites refuse to be framed. Showing the same file again replaces its note and lines; `remove`
  takes it out, and so can the person (×). Kept on the prototype's row (`shown`, migration 0016), newest first, 40 at
  most.
- **The person is taken there.** Showing something moves the task's (or idea's) tab to the prototype's step, on Code,
  with that thing selected (`?shown=<id>`), the way open_tab takes them to a sketch. Lines the agent highlights show
  in the diff when the diff holds them, else in the whole file, scrolled to.
- Both the prototype's agent and the task's conductor have `show_code` and `prototype_code` (the list of changes);
  both are told to answer a "how does this work" question in a line or two and show the place, not paste code.

After GitHub's "Files changed": the list with counts, one diff at a time, a note on a range of lines.

Not done: syntax colouring; the code of an app's other repositories (only the worktree the prototype was cut in);
the Code view on a prototype opened as a workspace tab of its own or one that belongs to no task or idea (it is on
the step's page only); highlighting inside a docs page. Not tried: a real agent calling `show_code` in a
conversation; the engine test runs against a real temporary repository, and the screens against made-up data.

## A prototype is built the way we would ship it (Sandy, 2026-11-13: "a prototype's code is essentially what we'd go live with; only what's outside the system is faked, through seams")

The engine told every prototype agent the opposite: "Speed over quality. Shortcuts are the default … No tests, no
review, no conventions to keep … write no migrations." Those lines came before anything a conductor or a skill said,
so an agent given the new mandate got two sets of rules. The checks then read the prototype and described its
shortcuts as the thing to build.

- **The prototype agent's instructions** are rewritten: build it as the repository builds things; fake only what is
  outside the system, through a seam; turn the brief's requirements into a checklist and meet each end to end;
  report one line per requirement, what is not met first; never call it ready with a requirement open. The
  "shortcut:" commit lines are gone.
- **One skill holds the whole mandate.** Self Evident now brings a `prototype` skill (`engine/plugin/skills/prototype`,
  the first skill in its own plugin) and puts it on the Prototype step of every app without any setting: the
  prototype's agent is told to invoke it before writing anything, and the conductor gets it for the step. A skill
  named `prototype` in Your skills replaces the built-in one (a person's skill wins over Self Evident's of the same
  name, for any name), so the text can be edited without touching the engine. An app's own skills for the step come
  after it.
- **The conductor** is told what a prototype is, to write its brief as checkable requirements with what is outside
  the system, and to hold the agent's report against them before telling the person.
- **The prototype analysis** no longer looks for "shortcut:" lines. It checks each requirement end to end, the code
  against the repository's conventions, lists every seam and stub (existing or added; recorded or assumed), and
  names anything faked inside the system as a defect. The draft ADR treats the prototype as the reference for the
  build, where it used to say "never as code to carry over".
- **A stop command per app** (`setup.prototype_stop_cmd`, Settings › app › Prototype, or `set_prototype_command`
  with `stop`). The engine only stops the start command's own processes; a command that brings up containers left
  them running. The stop command runs in the prototype's worktree, with the same `$PORT` and database variable,
  when a prototype is stopped, restarted or discarded. It never blocks the stop: if it fails or takes more than two
  minutes, what it printed shows where the server's last lines do.
- Wording changed to match in the tools' descriptions, the step's one-line description, the prototype pane's empty
  state and the code comments.

Unchanged, and worth a decision: the prototype's branch is still not merged, and the build still starts from the
default branch, now with the prototype as its reference. If its code is what we would ship, building it a second
time is a cost; whether the build should start from the prototype's branch is open.

Not done: the stop command is not run when the engine itself shuts down (prototypes are only signalled then), nor
for a prototype that never got a port. Not tried: a real prototype built under the new instructions, or a real
stack torn down by a stop command; the tests run a stand-in command against a real temporary repository.

## Acceptance criteria are part of the brief, built as the task goes (Sandy, 2026-11-13: "we need to add acceptance criteria to the brief, and this is something that the agent should build as it's building the prototype … part of what you approve before you actually start building is whether or not your acceptance criteria is sufficient")

- **A list of their own on the task** (`issue.acceptance`, migration 0017), beside the brief's text, so each can be
  added, sharpened and marked one at a time. A criterion is one statement a person can check, how we will know (a
  page, a scenario, a test, a script), and what the prototype showed for it: shown, with where to see it; not shown,
  with what is missing; or not tried.
- **Built along the way.** `set_acceptance` adds, changes and removes them. The conductor writes the first ones as
  soon as it knows what is asked and sharpens them as research, sketches and mockups settle things. The prototype's
  agent takes them as its checklist, adds what building turns up (edge cases, guarantees) and records for each what
  the prototype showed. When the reports are in, the conductor brings them up to date with the brief.
- **Checked before approval.** The prototype analysis reports against each criterion and checks the agent's claims.
  The brief audit asks whether they are sufficient: requirements with no criterion, criteria nobody could check,
  missing cases, guarantees the blast radius says matter.
- **Approved with the brief.** The brief's page lists them under the brief, with the marks, and the button reads
  "Approve the brief and its N criteria", naming how many the prototype did not show. The person can add, reword and
  remove them there. Changing a statement or how it is checked after approval takes the approval back, like a change
  to the brief's text; recording what the prototype showed does not.
- **Carried into the build.** The planner is given them and must make each one a check of the sub-task that makes it
  true, with its id; one no sub-task can make true comes back as a question.

Not a gate: a brief with no criteria can still be approved; the page says that approving it then approves no way of
knowing it is done. Not done: checking the criteria again against the finished build (a sub-task's checks carry
them, but nothing reports per criterion after landing); criteria on an idea before it is a task; showing them on the
prototype's step. Not tried: a real conductor and prototype agent building them through a task.

## A criterion can be left to the final build (Sandy, 2026-11-13: "maybe we want acceptance criteria to be marked as prototype-skip or final-build only or something, so that the prototype agent knows it can ignore it")

A criterion can be marked **final build only** (`buildOnly`, with `why`). The prototype's agent is told to skip
those: not build toward them and not list them as gaps. The analysis says "left to the build" for them; the planner
still makes each a check of a sub-task, since they are still required.

- **Who marks it.** The task's agent (told when: polish, what only real traffic or the real vendor can show, what
  costs more to prototype than it teaches; never a hard one the prototype exists to prove) or the person, in the
  criterion's edit form. The prototype's own agent cannot: the engine refuses it, so it cannot excuse itself from a
  hard one. It says which it thinks should be, and why.
- **What it costs.** A criterion left to the build is approved with no evidence. The brief's page counts them apart
  ("N for the final build only") and the approval line says "N left to the final build, unproven". The audit checks
  whether each reason holds.
- Marking or unmarking one does not take the brief's approval back: what must be true is unchanged.

## Two marks on each criterion: the prototype's and the final build's (Sandy, 2026-11-13: "You should have probably prototype and final build check marks and the acceptance criteria")

Each acceptance criterion now carries two marks, side by side on the brief's page under "Prototype" and "Build", each
column with its count.

- **Prototype**: shown, not shown, not tried, or skipped (a criterion for the final build only). Set by the
  prototype's agent, as before.
- **Build** (`built`, `builtEvidence`): met, not met, or not checked yet. The task's agent is told to set it from
  what landed, as sub-tasks land and before it calls the task done, with where to see it, and never to copy the
  prototype's mark across. The person can set it with a click on the mark. The prototype's agent cannot set it.
- Neither mark takes the brief's approval back. The lines given to the planner and the checks carry both.

Not done: nothing stops a task being completed with a criterion unmet or unchecked, and the builders themselves do
not set the mark (they have no engine tools); the conductor does, after they land. That closes most of "nothing
reports per criterion after the build", but by instruction, not by a step of the engine.

## A prototype is fast on the real path; the analysis makes the code good (Sandy, 2026-11-13: "The goal of the proto is speed so we can see the shape of things fast and then improve"; "cleanup is meant to be part of the analysis … could the code be cleaner, is there a better way to accomplish this that is more maintainable, simpler, dryer")

This sharpens the mandate of earlier today, which said "built the way we would ship it" and could be read as "clean
code". The two halves:

- **Strict about the path.** Every layer real and present, real schema and migrations, the repository's conventions,
  fakes only outside the system through seams, every criterion shown end to end. Unchanged.
- **Not about clean code.** Speed is the point. The prototype's agent gets each criterion working and stops: no
  refactoring, abstracting, de-duplicating, tidying or polish. Duplicated or clumsy code is fine; a skipped or faked
  layer is not. It reports, a line each, where it knowingly took the quick way.
- **The analysis is where the code is made good.** Its Cleaner section starts from the quick ways the agent named
  and finds the rest; duplication and clumsy structure are no longer counted against the conventions.

The `prototype` skill (built in, and the person's own copy, which was brought level with it), the prototype agent's
instructions, the conductor's and the analysis's all say so.

## Cleaning up after a prototype: a stop command and a discard command (Sandy, 2026-11-13: "how does it cleanup the environment after the prototype")

A conductor reported it had no tool to set the stop command. It had one (`set_prototype_command` took `stop`), but
only as a side door that also wanted the start command again, and one command could not serve both a restart (keep
the data) and throwing the prototype away (remove it all).

- **Two commands per app**, both optional, run in the prototype's worktree with the start command's `$PORT` and
  database variable: **stop** (`prototype_stop_cmd`), when a prototype is stopped or restarted: stop the stack, keep
  its data. **discard** (`prototype_discard_cmd`), after stop when a prototype is thrown away: remove its containers,
  volumes and data. Both are in Settings › app › Prototype.
- **A tool of its own**, `set_prototype_cleanup` (stop, discard), and the `prototype` tool now says whether each is
  set. The conductor is told to see that an app whose start command brings up a stack has both.
- Neither blocks: a command that fails or runs past two minutes leaves its output where the server's last lines show.

Not done: neither runs when the engine itself shuts down; a prototype discarded before these were set has left its
containers and volumes behind, to be removed by hand.

## Sharing a prototype, mockups or sketches with someone outside (Sandy, 2026-11-13: "I want to be able to share something with people to say, 'Take a look at this prototype and tell me what you think.' We need to have a tunnel system built in, ready to go … I think it's critical"; "Same with mockups and sketches as well")

A **Share** button sits beside Detach over every view (a prototype, the mockups, the sketches). It opens a panel that
says what sharing does, makes a public address, then holds the link to copy and the way to stop. While something is
shared the button reads "● Shared" in the warning colour.

- **The tunnel is a Cloudflare quick tunnel** (`cloudflared tunnel --url`): no account, no setup, a random
  `trycloudflare.com` address. Chosen over ngrok, which wants an account and a token before the first link. It needs
  `cloudflared` on the computer (`brew install cloudflared`); without it the panel says so.
- **One thing per address, never the engine.** A prototype: its server. Mockups: the Storybook of the conversation's
  worktree. Sketches: a small server of their own that reads only the `sketches/` folder, with a front page listing
  them. The origin is asked for as itself (`--http-host-header`), so a dev server that checks the host still answers.
- **Ready means connected.** `cloudflared` prints its address before it has connected; until then the address shows
  Cloudflare's error page. A share is handed over only once the tunnel reports a connection, and if it never does
  (45 seconds) the panel says the network may be blocking it.
- **It ends**: when stopped, when the prototype is stopped or discarded (a restart keeps its port, so the link goes
  on working), after 8 hours (`SHARE_HOURS`), and with the engine. Nothing about a share is stored.
- **A person's decision.** The agent has `share`, `stop_sharing` and `shares`; `share` is rated expensive, so it
  always asks. The conductor is told never to share unasked.

Tried for real once, with a throwaway page: the installed `cloudflared` gave an address, which then answered with
Cloudflare's tunnel error because it had not connected yet. That is what the "ready means connected" rule comes
from. A link working end to end from another computer has not been seen yet.

Not done: anything for the person at the other end to say what they think (they answer wherever the link was sent);
a password or a list of who may open it (anyone with the link can); an app whose pages call a second port on
`localhost` from the browser (only the one port is tunnelled, so those calls fail for a visitor); a stable address
(each share gets a new one); a list of everything public in one place in the UI (`GET /apps/:id/shares` and the
agent's `shares` have it).

## ngrok as the second tunnel, for networks that block Cloudflare's (Sandy, 2026-11-13: "make the link is taking a long time … Let's add ngrok as a second provider")

The first real share failed after 45 seconds: Sandy's work laptop is managed, and its network refuses outbound port
7844, which a Cloudflare tunnel connects on (tried both of its protocols; both timed out at the edge). The tunnel
prints an address anyway, which is why "ready means connected" caught it.

- **Two providers, tried in order** (`SHARE_TUNNEL=auto`, the default): Cloudflare first, since it needs no account;
  ngrok when the network will not let Cloudflare connect. ngrok goes out on the ordinary HTTPS port. `SHARE_TUNNEL`
  set to `cloudflare` or `ngrok` uses only that one.
- **Blocked is noticed in seconds.** Two refusals from Cloudflare's edge with no connection is a blocked network, said
  at once instead of after the whole wait, and remembered for an hour so the next share goes straight to ngrok.
- **ngrok's limits are said in words**: no token on this computer; its one free address already in use by another
  tunnel on the account (that is the case on this laptop today, where an ngrok tunnel was already running); not
  installed. When both fail the message gives both reasons.
- A share says which tunnel it goes through (`via`); for ngrok the panel adds what a visitor sees on a free account
  (ngrok's notice page first) and that only one thing can be shared at a time.

Checked against the installed ngrok: its flags (`--host-header` is accepted though no longer listed) and the shape of
its JSON log, including the refusal. Not seen: a share through ngrok working end to end, since this account's one
address was in use; the tests use stand-ins for both programs.

## Freeing ngrok from the share panel (Sandy, 2026-11-13: "There should be a free up ngrok option when you share")

A free ngrok account has one address. On Sandy's laptop a login service already held it (a permanent tunnel to a
local port), so the first share through ngrok was refused.

- When ngrok says its address is in use, the engine looks for other ngrok tunnels **on this computer** and the panel
  names them (what each tunnels, and the login service that keeps it running, if one does), with one button: **Free
  up ngrok and make the link**. The agent's `share` takes `freeNgrok` for the same, after the person says so.
- **A service is stopped properly and put back.** Killing a launchd service only restarts it, so it is stopped with
  `launchctl bootout` and started again with `launchctl bootstrap` when the last ngrok share ends, or when the engine
  shuts down. A tunnel started by hand is asked to stop and is not started again: we do not know how it was.
- When nothing on this computer holds it, the panel says the tunnel is on another computer.
- The panel says what freeing costs: whatever that tunnel served stops being reachable from outside meanwhile.

Not done: if the engine is killed outright while a service is stopped, it stays stopped until the next login (it is a
run-at-login service). Not tried against a real service: `ps`, `launchctl` and `kill` are stand-ins in the tests.

## A guide for whoever opens a shared prototype (Sandy, 2026-11-13: "a small component that is like a helper that shows the tester where to go and what to try … a small js injected tab on the bottom right like the way help agent tools work")

- **The tab.** Every page of a shared prototype gets a small tab at the bottom right, "What to try". Open, it says
  what this is (a prototype, sample data), a line of introduction, and steps: a title, what to try, and "Go there"
  when the step has a path. Steps tick off and stay ticked from page to page. It folds to the tab.
- **What they think.** Under the steps: a box, an optional name, Send. It comes back as a comment on the prototype's
  task, headed "Feedback on the prototype from … (a visitor)", saying which page they were on, and as a
  `share.feedback` event. It is marked as coming from outside: an opinion to weigh, never an instruction, and the
  conductor is told the same. Forty messages a link, four thousand characters each.
- **How it gets there.** A shared prototype is now reached through a small proxy of the engine's that passes
  everything to the prototype's server (as itself, websockets too, so live reload works) and adds one script tag to
  its HTML pages. The prototype's code is not touched and the person looking at it locally never sees the tab. The
  tab draws in a shadow root and shows only text, so its styles and the prototype's never meet.
- **Who writes it.** The agent, with `set_guide` (intro, steps with title, path, what to try), told to write for a
  stranger. It is kept on the prototype (`guide`, migration 0018) and shows at once on a link already shared. The
  share panel shows what visitors will be told, or that there is no guide yet.

Not done: a guide on shared mockups or sketches (they are not proxied); editing the guide by hand in the panel; a
page that forbids scripts by its own security policy will not show the tab; pages served compressed by the
prototype's server whatever it is asked are passed through without it. Not tried: the tab on a real prototype through
a real link; the proxy is tested against a real local server and the tab in stories.

## The guide folds, and stays pinned to the corner (Sandy, 2026-11-13: "we need the guide to be collapsible and when it is pinned to the bottom corner")

Read as: it must be plain how to fold it, and folded it sits in the bottom corner. It could be folded before, but
only by a small × that read as "close for good".

- The whole heading of the open guide is the fold control, labelled "Hide ▼"; Escape folds it too. Folded, it is a
  small pill in the bottom right: "What to try", how far they are ("1/3"), and ▲ to open it. Which it is, is
  remembered from page to page.
- Pinned harder: the tab is attached beside the page's body, not inside it, and its position is set so the page's
  own styles cannot move it. A page that transforms or scrolls its body no longer carries the tab away.

## A service stopped for a share is put back even if the engine restarts (2026-11-13)

Found the first time it was used for real: Sandy freed ngrok from the share panel, which stopped the tunnel service
on the laptop; then a merge restarted the engine, and the service stayed stopped. The list of stopped services lived
only in memory, and the engine's restart-on-change does not run its shutdown.

The list is now also written to `~/.self-evident/ngrok-paused.json`, before a service is stopped, and a starting
engine puts back whatever is in it (no share outlives the engine, so nothing still needs the address). The service
was started again by hand that day.


## Save points and task branches (Sandy, 2026-11-13: "I get to a point and I don't know if it's right to move forward yet … but I also don't want to stop")

Talked through at length before building; what was decided, and why the other shapes were dropped.

- **A save point** is a name ("Proto before review"). Saving commits what is uncommitted in each of the task's
  worktrees, puts a git branch `<its branch>--<name>` at that commit in each, and copies the task: brief, acceptance
  criteria and marks, approvals, steps, comments, sub-tasks, the prototype's guide and shown files. Work carries on
  where it was. The engine makes its own at "Prototype approved" and "Brief approved", keeping the latest of each.
- **A task branch** is a version of the task ("essentially we're talking about allowing for task branches"). Going
  back to a save point starts a new one there: every worktree switches to a new git branch cut from the save point,
  the task is put back as saved, a running prototype restarts, and the task branch that was current is set aside
  whole (uncommitted work committed with it, its comments with it). A set-aside one can be made current again.
- **Which worktrees**: the prototype's, the task's own conversation's, and that worktree's companions in the app's
  other repositories. A worktree the task did not have at the save point is left as it is, and said.
- **Deleting is easy** ("it should be very easy to get rid of one of these"): one flat list on the task's overview.
  A save point goes at once (only the way back is lost). A set-aside task branch asks once and says what is only on
  it. The one being worked on cannot be deleted. Clear all removes the lot. Marking the task done clears them too:
  the task branch being worked on is the one that counts.
- **Comments belong to the task branch** they were made on: they are part of the copy, so going back hides the ones
  made since and switching back returns them.
- **The prototype's database is not forked.** One per prototype; a move leaves it as it is unless "also rebuild from
  its sample data" is ticked. Its name now comes from the prototype's folder, not its git branch, so it survives.
- **Refused**: a move while a sub-task is being built, or to before a pull request that has merged. Sub-tasks made
  since the point moved to are canceled, never deleted, and come back when their task branch does.
- **The agents**: `save_point` (cheap), `task_branches` (free), `go_back` and `delete_saved` (always ask). A move
  puts a message in the task's open conversations saying what was done before it is no longer in effect.

Dropped on the way: checkpoints restored in place (a reset, and a force push once pushed); a new set of worktrees per
version (minutes per move and a database each, for running two at once, which is not wanted); a copy of the task as
its own task (it makes you stop and move into the copy); renaming the plain git branch on going back (the force push
again). Git tags were dropped for branches, which are visible and delete the same way.

Not done: a save point at "build started" (the one at "Brief approved" is before the plan and the build); deleting a
pushed git branch's remote copy; a fresh conversation for the agent on a move (it gets a message instead); the
prototype's data per task branch; sizes on disk. Not tried: any of it on a real task with a real prototype; the
engine is tested against real git worktrees, the list in stories.

## Save points live in the task's nav (Sandy, 2026-11-13: "maybe at the bottom … then a list could start and the one you are on could be shown")

On the overview they were a panel you had to go and find. Now the task's left nav ends with a Save points section:
the task branch being worked on first ("working on"), then each save point, then what was set aside, and "＋ Save
here", which takes a name and Enter without leaving the page you are on. Before the first save there is only the
button, and the list starts from there. Every row goes to a Save points page of the task (`/tasks/<id>/saves`), which
is the full list with go back, work on this, delete and clear all; that list left the overview. Folded, the nav
shows one icon with the counts in its tooltip. The nav reads the list again on each page of the task and when the
task changes, so a save point an agent made shows up.

## Save points, made clearer (Sandy, 2026-11-13: "the arrow looks like you can collapse but you can't and when you click on one they all highlight"; "there is no main in this list")

Three things read wrong the first time it was used. The mark beside the task branch being worked on was an arrow,
which reads as "open this"; it is now a filled ring, with "working on" beside the name. Every row in the nav went to
the same page, so opening it lit them all; now the section has one row of its own, "Save points", which is the only
one that lights, and the task branch and the save points sit under it as the steps sit under the brief. A save
point's row in the nav opens the page with that save point marked. And the page's list did not show the task branch
being worked on, so nav and page disagreed; it is now the list's first row, saying the save points below are points
on it.

## Summaries on the reports, and a merge guide on the pull request (Sandy, 2026-11-13: "really comprehensive but they're really long … very hard for a human to read"; "the PR is going to need … a merge guide")

Two readers were being given one text.

- **A summary on each report.** A step's work has a `summary` beside its body (migration 0020). Every check (the
  prototype analysis, the draft ADR, the blast radius, the brief audit) is now told to record both: the body for the
  next agent, as long as it needs, and the summary for the person: at most eight one-line bullets in plain words, in
  the order what they must decide (with what the agent would choose), what is wrong (with what it costs), what is
  risky (with how we would know), then one line for all that holds. The step's page shows "What you need to know"
  and folds the report under it, with its word count. A long report with no summary (those written before today)
  says so and how to get one; the conductor is told to write a summary when one is missing (`set_step`, summary
  alone, which changes nothing else and does not ask for an approval again).
- **A merge guide.** The pull request now opens with it, above the sub-task record, which stays for reference. It is
  put together by the engine from what the task holds, so it is the same every time and nothing is written for the
  occasion: a first line on what to act on (criteria not met, sub-tasks not landed, or that all are met); what it
  does (the task's description); how to check it (each acceptance criterion with the build's mark, not met first,
  with the evidence or the way to check); decisions made (the ADR's summary and the planner's decisions with why);
  risks and how we would know (the blast radius's summary); how to undo it. A project's pull request heads each task.
  The task's build page shows it before there is a pull request, with Copy, and the conductor reads it with
  `merge_guide` before saying a build is ready.

Not done: an agent writing the guide's prose after the build (the risks are the blast radius's, written before the
build, so what the build itself turned up is only there if a criterion or a decision records it); a summary on the
brief itself; summaries for reports already written (ask the task's agent). Not tried: a real check writing a
summary, or a real pull request opened with the guide.

## The build starts from scratch, on purpose (Sandy, 2026-11-13: "starting from scratch is meant to avoid the fixing is slower than building correctly")

Asked more than once as an open question since the prototype's mandate changed to "essentially what we'd go live
with": should the build start from the prototype's branch? No. Fixing a fast prototype is slower than building it
correctly once the shape is known, so the build starts from the default branch and reads the prototype as a map.
Settled. What may still carry over as files, not as code to fix: the sample data and scenarios, the recorded stubs
and seams, and the checks behind the acceptance criteria. Not built; to look at after a real run shows whether
builders redo that work.
## The planner shows as an agent the task has out (Sandy, 2026-11-13: "the planner should show up as a sub agent just like blast radius … I can't see if the planner is running or not")

The checks are conversations, so each had a tab in the task's agent column. The planner is a single run that returns
the sub-tasks in one go, so it had none: while it worked, the page showed nothing. Now the task's latest planning run
is one of its agents out, a tab like the others: a pulsing dot and "working" while it runs; once back, what came of
it ("planned: 3 sub-tasks", "waiting to try again", or "failed" in the warning colour). The tab shows what the run
read, searched and said, oldest first, following it live, and the outcome with the run's cost. It is read only and
says why: there is nothing to say to a planner; change the brief and plan again. The conductor sees it too
(`agents_out`, `read_agent`); telling it something is refused with that same reason.

It is still a run, not a conversation. Not done: making the planner a conversation one can answer in; the same tab
for a sub-task's builder, which is also a run.

## A canceled sub-task is out of the plan (Sandy, 2026-11-13: "canceled sub-tasks show as 'queued' and count toward '14 sub-tasks' … it also needs to remove the canceled from the graph")

Found on a real task whose planner had run twice: the first run's six sub-tasks were canceled as duplicates, and
still showed as queued beside the eight real ones, in the count and in the graph. Canceling a task canceled its
sub-tasks' builds; canceling one sub-task by itself left its build as it was, queued, and the page showed the
build's status over the task's state.

- A sub-task's build follows it: canceled or marked a duplicate, its build is cancelled, so the engine never builds
  it; reopened, it is queued again. Rows already in that state are repaired once (migration 0021).
- The project's graph leaves canceled sub-tasks out: not drawn, not counted, not in the pull request's lists, and a
  sub-task that waited on one waits no longer. A task whose sub-tasks were all canceled can be planned again.
- The task's page counts only the live ones (the badge, the nav's "done/total") and folds the canceled ones under
  the list, "6 canceled, not counted, not built", each shown as Canceled with its reason.

Also: the "Go back" story of the save points list read the list before it had been read again after the move, and
failed now and then under load; it waits for it now.

## Telemetry hook points come out of the prototype (Sandy, 2026-11-13: "we need that to be part of the planning and a key part of what we learn from the prototype. With that built we can select all the hook points for telemetry"; "this should be part of the prototype analysis process")

Found on a real task: asked for its telemetry plan, the conductor had only scraps, and nothing would have shown in
production whether the feature worked or was used. Its worst case was a silent one: the vendor changes its format,
findings quietly drop to zero, and nobody notices.

- **The prototype** lists its hook points in its report and emits the cheap ones (the built-in skill now says so,
  the same text Sandy put in the shared copy).
- **The analysis** has a Telemetry hook points section: it finds the app's own channels first and uses only those,
  then a table, one row a hook point: where on the path the prototype built, what it records (counts and states,
  never personal data), the question it answers, the alert, and whether the prototype already emits it. It covers
  data in, writes, failures, the latency of new reads and the user actions that show use, and names first the
  failure that would otherwise be silent.
- **The brief** gets a Telemetry section with that table when the conductor brings it up to date, and the
  acceptance criteria get the telemetry's own, marked not shown unless the prototype emits it.
- **The audit** checks that the section has every hook point, that a criterion holds the build to each kind, and
  that the silent failure is covered.

Also found there: **a sub-task an agent added by hand was not buildable.** Made with `create_task` and a parent, it
had no build, no builder and no place in the graph. There is now `add_sub_task` (after: what it waits for; before:
what waits for it), which makes it as the planner makes them; `create_task` with a code task as parent does the
same; and the ones already there are repaired once (migration 0022).

Not done: a telemetry step of its own in the workflow; checking after release that the hook points report. Not
tried: a real analysis writing the table.

## Reports: the end-of-day note and the weekly status (Sandy, 2026-11-13: "a way to do a daily report of what was built or what was worked on that I can produce and report every day … It would be on an app level and we could ask for today or last week")

A Reports page per app, beside Summary. Ask for a period (today, yesterday, this week, last week), add what the
engine cannot know (a meeting, a review given, what is next), and a draft comes back in about a minute: edit it, copy
it, send it yourself. Nothing is sent from here. Earlier ones are kept and listed.

- **What it is written from** (`reportFacts`, kept beside each report): what moved on each task in the period, under
  its top-level task and named by the team's own ticket id when it came from their tracker; the steps finished and
  what each says in a line; what was written on the tickets; pull requests opened and merged, ours and the ones the
  person opened by hand; the commits in the app's repositories by the person; and, for "tomorrow", what is in
  progress, the pull requests waiting, the open questions.
- **How it is written**: one model call, no tools. Told to write as the engineer, for readers who know the product
  and its tickets and have never heard of this tool: outcomes ("prototyped the page", "planned the build in 8
  parts"), never steps, briefs, sub-task ids or agents; only what the facts hold.
- **The person's format wins.** Each app keeps the person's own format for each kind, with real reports of theirs
  as examples (`setup.report_format`): the shape, the section names, the tone and the level of detail come from
  them, their content never. The built-in shapes are the fallback: "Today / Tomorrow", and "Where it stands / Done
  this week / Delays and why / Next week / Open decisions and risks". The examples live in the app's settings on the
  person's computer, not in this repository.
- The app's agent can write one when asked (`write_report`).

Not done: sending it (Slack, email); writing it by itself at a set hour; a custom range in the page (the engine takes
from and to); work done outside the app's repositories and tasks, except what the person adds. Not tried: a real
report written by the model from a real day.

## A task's workflow can be changed on its page (Sandy, 2026-11-13: "we need a picker on the page that you can change")

A workflow could only be chosen when the task or project was made, or by changing the app's default; the engine
could already change one task's (`POST /issues/:id/workflow`) and no screen called it. Now the task's overview, under
"Where it stands", reads "Workflow **name**, from its project. Change". Change turns the sentence into a list of the
app's workflows with "Follow its project or the app" on top; choosing saves at once and it reads as a sentence
again (a label you press to change, as a property on a Linear issue). A workflow that starts everything as an idea
is greyed out for a task that was made directly. The steps in the task's nav follow the new workflow straight away.

Not done: the same for a project (the engine route exists); a tool for agents to change it.

## Tab area: clean corners, and a task page laid out by its tab's width (Sandy, 2026-11-14: "you can see the pointed corner coming out from behind it … the center column is overlapping the left column")

Three fixes in `app.css`. Dockview painted its own white rectangle behind the tab groups, so square white corners
showed outside each group's rounded stroke: that background is now clear. The task and idea pages chose their
columns from the window's width, but a page lives in a tab that is narrower than the window, so in a narrow tab
the agent column sat on top of the middle one: `.tab-page` is now a container and those two breakpoints are
container queries (the agent goes under the page below 960px of tab, one column below 620px). The steps nav is one
grid track that cannot grow past its column, so a long step name is cut short and not pushed under the panels
beside it. That last one showed on Sandy's screen and not in headless Chromium, so it is fixed by reading the CSS,
not by seeing it go away.

The right edge was still cut (Sandy, same day: "the top right corner and bottom right corner are still square"):
dockview sizes the tab area a pixel or two wider than the frame holding it, and the frame clips and can scroll, so
one side of each group lost its stroke and corners (the right for Sandy, the left in Playwright, where the frame had
scrolled). The frame no longer clips; the shell's 8px padding has the room.

That was the wrong cause, and Sandy still saw it ("now the left edge is gone, the right corners are still not
curved"). The real one was ours: the rule that draws the one divider beside the conversation column
(`.ws-split .dv-split-view-container > … > .dv-view:first-child`) was a descendant selector, so it also gave every
nested frame inside the tab area a 1px right border. Three of those made the tab area 2px wider than its frame and
drew straight lines over the groups' rounded right corners. The rule now names the split's own child (`.ws-split >`),
every frame measures the same width, and the no-clip rule from the paragraph above is taken out again. Lesson: when
a fix checks out in Playwright and not on Sandy's screen, measure every box in the chain before patching.

## A task starts with a hand-over (Sandy, 2026-11-14: "there's a little bit too much of a disconnect between the global agent and the task sub-agents … I'm finding myself copying questions from the task agent into the global agent")

The conversations about the app create the tasks, and a task's own agent then started from a title and a short
description, so its first act was to ask for what the other conversation already knew. Sandy: "the global agent is
creating the tasks, which is why the task agent wants to first get as much information as it can before it starts
working"; and "there can be more than one global agent … the agent should identify itself … I created this".

- **Who made it.** `create_task` already recorded the conversation (`source_ref.sessionId`). The task's detail now
  resolves it (`madeBy`: the conversation's name, and whether it is still open) and the overview shows it.
- **The hand-over.** When the task's agent is started (`ensureTaskTalk`), and at the latest when it opens, the
  engine forks the conversation that made the task (the Agent SDK's `resume` with `forkSession`, and
  `persistSession: false` so the fork leaves no file), asks the fork once for everything said about the task under
  five headings (what it is for, decided, ruled out and why, constraints, still open), and keeps the answer in
  `issue.handover`. It goes into the task agent's instructions, marked as that conversation's account, with "where
  it and the person disagree, the person is right". The conversation gets no turn and is not changed.
- **Nothing is fine.** A task a person made has no conversation; a conversation that never started has nothing to
  read; and a conversation that said nothing more than the title answers NOTHING, which is kept as an answer so it
  is not asked again. A failure to write it never stops the task's agent from starting.
- **On the page.** A "Hand-over" panel on the task's overview: the conversation's name, what it said, and "Write it
  again" (`POST /issues/:id/handover {again}`), for when more was said after the task was made.

Why not fork the task's agent from that conversation: it would carry the whole history (other tasks, other
topics) on every turn, go stale with the next thing said, and a task made on the Plan page has nothing to fork.
Why not one shared context: two agents cannot write one conversation; what is shared is a document.

Tried for real on a scratch conversation and the local test database: the fork answered from the conversation,
the conversation's file was unchanged, no file was left, and the hand-over held the four things said about the task
and left out an unrelated one (4.7 s on Haiku). Not tried: a long real conversation (each hand-over re-reads it, so
it costs more when that conversation has gone cold), and one brought in from the terminal.

Not done: the task's agent asking that conversation a question later (the second half Sandy and I talked about;
wait and see how many questions are left); editing the hand-over by hand; a hand-over for a project's tasks made by
the planner, or for an idea.

Found on the first look at a real task (MER-50 showed no creator): only `create_task` recorded the conversation.
A project made by an agent with its tasks in one call (`create_project`) did not, so those tasks read as made by a
person. `createProject` now takes `madeIn` and marks each task. Past tasks: MER-50 to MER-54 were made by one
`create_project` call in the conversation "Cloud Playground" and are marked by hand in the live data. A first
attempt to trace others by "the first conversation whose tool result names the task" was wrong (a later
conversation that merely looked the task up matched) and was undone for RG-1 and RG-2, which stay unmarked.

## Planned work shows in Build, with the button that runs it (Sandy, 2026-11-14: "after the plan is done, we need the planned task to show up in the build tab, otherwise I don't know how to trigger it to build")

Build listed only projects that were running or had landed, so a task that was planned and waiting to be run was
nowhere on it; "Run this project" existed only on the project's own page. On Merman, MER-50 was planned in four
sub-tasks inside the draft project "Library foundation" and nothing said how to start it.

- **Build's page** has "Ready to build" on top: every draft with at least one planned task, naming the planned
  tasks and their sub-task counts, with "Run this project" on the row. A task planned on its own (its hidden
  project of one) is listed there as the task, with "Run it"; `GET /projects?solo=1` includes those and each
  project now carries `plannedTasks`.
- **The task's Build section** says "Planned in N sub-tasks. Nothing is built until its project is run", with the
  same button.

Running a project with one task planned out of several is what the engine already does: the others are planned in
turn as it runs, once their briefs are approved.

## A task is brief, plan, audit, build (Sandy, 2026-11-14: "I just don't understand what I'm supposed to do here … why are we building at the project level?")

Decided in conversation, not built. It started from the Build tab: after #193 it listed the project, not the task
Sandy had planned, and the project's page lit Plan in the rail. Walking through it showed the real mismatch: a new
project cannot run until something is planned (the engine refuses), the first task needs approve, then Plan it,
then Run this project, and every later task of a running project plans and builds by itself. Sandy's diagnosis:
"we built the thing at the wrong level, and then we fixed it by … making it so that the sub-task, not the tasks,
would be nodes in the graph. But we never uncoupled the building with the project itself … projects are just a way
of organizing things into a group where the agent is able to … understand the overall goal."

What ties building to the project in the engine today: the integration branch (`project/<id>`), the one pull
request per project, and the runner walking the project's task list and planning the next task when the ones before
have landed. A task on its own is wrapped in a hidden project of one (solo.ts) because the project is the only
thing the runner can build; that wrapper is most of the machinery a task-level build needs.

The shape (SHAPE.md has it in order): **brief** (what and why, short, the person approves) → **plan** (prototype
analysis, then the ADR, then the sub-tasks with telemetry, tests and a test plan) → **audit** (with the blast
radius; its output is the merge guide: what and why, and the risks) → **build**. On the word: "a brief used to be
literally brief, and it was the thing … we want to build. How to build it … is a question for the architecture and
the planner." On questions: "the whole reason for adding a prototype is so we would figure everything out, but
there should be zero questions after that"; when one is needed, "the task agent, the parent, should stop and say, I
have a question for you."

What exists already and only moves: the prototype analysis, the draft ADR, the blast radius, the brief audit, the
merge guide and the planner. Today the first four are steps that feed the brief, before its approval, and the
brief is "brought up to date" with them, which is how it stopped being brief. The change is to run them after the
approval, under Plan and Audit; to make the ADR final there (today the planner may settle a draft ADR, PR #165);
to take the Run button off the project and Build out of the rail; and to build a task as a task.

Open, to be answered before building: who starts the build (by itself after the audit, or the person after reading
the merge guide); a pull request per task or per project; and how a task that needs an earlier task's work gets it
(wait for the merge, or branch from the earlier task's branch). #193's "Ready to build" on the Build page and the
"Run this project" button on a task's Build section stay until this is built; they are the wrong level but they
are the only visible way to start a build today.

Later the same day Sandy settled who starts the build: nobody. "Once we've approved the prototype … it should all
just be automated from that point forward. Because once you have a prototype … there's nothing that's unclear about
what we're trying to do here." A prototype is required ("I think a prototype should be required for this whole
thing"). Trade-offs that turn up are rated cheap, medium, expensive; "those should stop things and they should send
an alert to the person who approved the brief … hey, you have a question … but then it should just do the whole
thing." So the person's presses are the brief and the prototype; the merge guide is read on the pull request, not
as a gate before the build. Still open: which ratings stop, where the alert goes outside the app, a pull request
per task or per project, and a task that needs an earlier task's work.
