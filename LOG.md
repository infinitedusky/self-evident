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

## A task builds itself, on its own branch (Sandy, 2026-11-14: "let's make this work the way it should be working")

Sandy asked for the history to be checked first: "what is now called a project is what used to be called a plan,
and what's now called a task used to be a project … we put project stuff in the plan." Checked against InDusk
(`~/code/sandbox/dusk`) and this log. InDusk had a master plan (plans in order), plans (a brief and an
implementation document each, and "worktree-per-plan, the project default"), phases and checklist items. Sandy
remembered the middle level as "projects"; InDusk's word was "plan"; the structure is as Sandy said. Carried over:
master plan → project, plan → task, phase → sub-task, item → step. The slip is in this log on 2026-10-21: "Branch
and PR stay per plan", written when "plan" here meant the top level. So the branch, the pull request and the start
button that belonged to InDusk's plan (the task) were left on the master plan's successor (the project).

First step of the fix (the shape is above, "A task is brief, plan, audit, build"):

- **A branch and a pull request per task is the default.** The engine already had it as an app setting for teams
  (`pr_mode: issue`, branches.ts): each task's sub-tasks land on the task's own branch, cut from the task before
  it, with its own pull request stacked on the previous one until that merges. It is now what an app gets unless
  it asks for one per project. A project keeps the mode it started with (`project.pr_mode`, migration 0025, which
  marks every project already started as it was), so nothing under way moves. That also answers "how does a task
  get an earlier task's work": it starts from the earlier task's branch.
- **Approving the brief builds the task.** `runner.buildTask`: plan it if it has no sub-tasks, then start the
  build; a task that is already planned just starts. No "Plan it", no "Run this project". The project (a hidden
  one of its own for a task in none) is only where the engine keeps the build. An app can say no
  (`auto_build: false`, Settings › Landing: "It waits: I press Plan it and Run").

Tested: a task with only a brief, in a project, is planned, built and landed on its own branch and the project's
branch carries nothing; a task in no project the same. Not tried on a real app: the first approved brief is the
live test.

Mind: on an app whose repositories belong to someone else, approving a brief now ends in a pull request on their
GitHub with no further press. Turn it off there in Settings › Landing.

Not done, next: the trigger moving from the brief's approval to the prototype's (the brief approved first and
short, then the prototype, then analysis, ADR, plan, audit and build with no press); the technical steps moving
from "feeds the brief" to Plan and Audit on the task's page; Build leaving the rail and the Run button leaving the
project; stopping on an expensive trade-off and alerting the person who approved.

## Build is the phase after the plan, and it lists tasks (Sandy, 2026-11-14: "we can leave build … it also needs to be the place where questions are asked or anything that stops. Everything needs to happen in there. After the plan is done, it's done. Now we're in the build phase")

Build stays in the rail and stops being a list of projects. `Build.tsx` at /build lists every task past its plan
(`now().tasks`, one row per task with sub-tasks), what needs the person first, after Linear's My Issues:

- **Waiting for you**: a task that is asking (the question with its cost and its options, answered there with one
  press), has a failed sub-task ("Try it again") or a held one, or whose build is paused.
- **Planned, not started**: "Build it" (`POST /issues/:id/build`, `runner.buildTask`): for a task approved before
  tasks built themselves, or an app set to wait.
- **Building**: progress, the sub-tasks at work and what each is doing, the pull request.
- **Landed**: with its pull request.

A row leads to the task's own Build section, and that section now lights Build in the rail, not Plan (it used to
look like being sent back to planning). The start button left the project: a project's page has none ("you don't
hit build at the project level"), a task's Build section has "Build it" when it is planned and not started, and
the "Ready to build" list of projects from #193 is gone. My Stuff still offers "Run it" on a planned project
(`run_project`); that one is left for the next pass.

Not done: answering a question in free text on Build (the options are there; anything else is on the project's
page as before); the alert to whoever approved; the trigger moving to the prototype's approval; the steps moving
under Plan and Audit.

## Requirements: what every plan must cover (Sandy, 2026-11-14: "there's also the need to say what exactly are the requirements that we're planning for … is OpenTelemetry a requirement … a test plan, all the things that need to get taken care of after the prototype needs to be known")

A workflow said which steps a task goes through and nothing said what every plan has to contain. Now an app has a
list of requirements (`setup.requirements`; `requirements.ts`), each a name and a sentence saying what it means for
this app. An app with none of its own starts from four to edit: telemetry (OpenTelemetry), tests, a test plan,
docs. "Configured at a project or at an app level": a project can switch one off or on for its own tasks
(`project.requirements`, `PUT /projects/:id/requirements`).

- **The planner** is given the ones in force and must answer each by its key: how the plan meets it (naming the
  sub-tasks), or that it does not apply and why. It is told to put the work into the sub-task where it belongs,
  not into a sub-task of leftovers. The answers are kept on the task (`issue.requirements`); one the planner did
  not speak to is kept as "the plan does not say", never dropped.
- **The task's Build section** shows "What the plan covers".
- **The merge guide** on the pull request has "What this app requires of every change", each one met, not
  applicable (with the reason) or not addressed.
- **Settings › Landing** has the list: read by default, "Edit the list" to change, add or take out.

Not done: the audit checking that the build really did what the plan said for each requirement (today it is the
planner's word); a project's switches on the project's page (the engine has them, no screen yet); "what it means
to land" beyond the test command already in Settings › Landing; and the other half of what Sandy raised in the
same breath, the workflow still being one flat list: the steps after the prototype (prototype analysis, draft ADR,
blast radius, brief audit) are still switches in a workflow and should be fixed and out of it ("some of these
things I don't think we want to be deciding anymore").

## An optional step is done or skipped, never just left (Sandy, 2026-11-14: "if you aren't going to use it, you have to mark it as being skipped … you have to basically check it off as skipping it. If you skip the prototype, then the acceptance criteria doesn't have a prototype column")

An optional step could be left untouched and the brief approved around it, so nothing said whether it was passed
over on purpose. Now a step has a fourth state, **skipped** (`step_work.status`, migration 0027), set by a person
on a task's optional step ("Skip this step" on the step's page; "Do it after all" takes it back). A required step
cannot be skipped, nor the idea or the brief. The brief's approval waits on every optional step being finished or
skipped ("still to do or skip: Research, Prototype"); the nav shows a skipped step with a dash and the brief's row
says "do or skip …". An agent cannot skip a step: its tool has no such state.

When the task has no prototype (the step is skipped, or its workflow has none), the acceptance criteria lose the
prototype column and everything that speaks of one: one mark each, for the final build.

Not done: the prototype's checks (analysis, draft ADR) skipping themselves when the prototype is skipped: they are
each skipped by hand if they are optional, and if a workflow requires them the prototype has to be done.

## An unanswered question is in the graph (Sandy, 2026-11-14: "could we put a question, an unanswered question, into the graph? … there should be a question there. It's like a different type of icon")

The graph drew sub-tasks and the files they share; a question holding work up was only a line of text elsewhere.
Now an open question is a node of its own in the project's graph and the app's (`PlanGraphView`, `QuestionNode`): a
note with a "?", red when answering it is expensive, with a dashed arrow to each sub-task it stands over: the
sub-task that asked, or every sub-task of the task whose planner asked. It sits before them in the layout, as a
shared file sits between its claimants. Pressing it goes to Build, where it is answered. The app's graph now
carries its open questions (`appGraph().questions`).

Not done: the engine does not hold a sub-task because its task has an open question (the scheduler does not read
questions), so the arrow says "this is unanswered and concerns these", not "these are stopped by it".

Two more in the same change, both Sandy's, the same day. "They should have the interface where I can answer a
question in the task as well": one component, `QuestionAsk` (the cost, the options as buttons with the recommended
one marked, and "Answer in your own words" for anything else), is what Build and the task's page both show, so a
question is answered where it is read; the task's planner panel no longer sends you to the project to answer. And
"the task should also have a graph when you're in the build area": the task's Build section draws its own
sub-tasks, the files they share and any unanswered question (`TaskGraph`, the project's graph cut to this task).

## A page that lost the engine said nothing and never came back (Sandy, 2026-11-14: "none of the agents are responding to prompts … there's no error or anything telling me what's going on")

They were responding: MER-50's agent had answered three prompts within seconds each. The page had stopped
listening. Every merge of an engine change restarts the engine (`tsx watch`), and while it is down the UI's proxy
answers the open event streams with an error page. A browser retries a stream whose connection drops, but one
refused with an error status it closes for good, and `openEvents` shares one stream among every view, so the whole
workspace went quiet until a reload. Eight engine merges that day did it eight times.

- `openEvents` re-makes a stream the browser has given up on, every 1.5 s until it opens, carrying every view's
  listeners over, and resumes from the last event the page saw (`since=<seq>` in place of `since=now`), so what
  was said in the gap arrives. The engine also honours `Last-Event-ID` for the browser's own retries.
- `EngineLink`: once any stream has been down for 2.5 s, a bar over the workspace says "Not connected to the
  engine. What agents say will not show until it is back. Reconnecting by itself…" with "Reload now". It goes when
  the streams are open again.

Checked by watching a page on the fixed UI through the engine restart of this very merge. Still true: a restart
cuts off an agent that is mid-turn; this fix is about hearing it afterwards.

That fix did not work, and watching a page through the next restart showed why: no error event ever fired. The dev
proxy keeps the browser's side of the stream open after the engine dies, so the page hears nothing and is told
nothing. The stream is now judged by the engine's own ping (every 15 s): one that has been silent for 35 s is
closed and made again, from the last event seen; the first ping of a stream carries the place it started, so a
stream that had seen no event yet resumes from there too. Watched for real through a deliberate restart with
nothing running: restart at 18:00:34, the bar up at 18:01:00, both streams re-made (one at `since=15645`), the bar
down at 18:01:12. So an open page is deaf for up to about 35 seconds after a restart, says so, and then catches up.
Lesson: the first fix was merged on a guess about how the stream fails; it should have been watched failing first.

## A plan made again replaces the plan before it (Sandy, 2026-11-14: "decided items that don't match … it says like Merman/Core, Merman/Playground are decided on, but then below that it says it should be Bonkai")

MER-50 had been planned twice: at 14:28 with the packages named `@merman/core`, and at 17:26 after the rename to
Bonkei. "Clear the plan" deletes a plan's decisions and questions, but the task's agent re-planned the other way,
by canceling the first plan's sub-tasks and planning again, and that path left the first run's nine decisions on
the task beside the second run's twelve. The page showed both. Now a planning run that succeeds removes what
earlier runs of the same task decided and nobody confirmed, and what they asked and nobody answered
(`finishPlanning`). MER-50's nine stale decisions were deleted from the live data by hand.

## Workflow settings read in three parts (Sandy, 2026-11-14: "in the settings, we haven't changed the workflow rules to match the change that we made in terms of like different sections")

A workflow in Settings was one flat list of up to ten steps with the same switches on each. The card now has the
three parts a task has: **On the way to an approved prototype** (the idea, research, sketches, mockups and the
prototype: on or off, required or optional, in order; an optional one is "done or skipped on each task"),
**After the prototype is approved** (prototype analysis, draft ADR, blast radius, brief audit, then the plan and
the build: "runs by itself, in this order"), and **The brief** (always, approved by the person), with a pointer to
the app's requirements under Settings › Landing. Editing follows the same three parts.

This is the page only. The engine still treats the four checks as a workflow's choice: the card says "Not in this
workflow: …" for the ones a workflow lacks, and Edit still lets them be put in or left out. Making them fixed (in
every workflow whenever there is a prototype, gone when it is skipped) changes what the brief waits on for tasks
under way and what a task needs before it can complete, so it is its own change, with the move of the trigger to
the prototype's approval.

## What follows the prototype is fixed, and the build starts by itself after it (Sandy, 2026-11-14: "okay lets do 1")

The first of the open items: the four checks stop being a workflow's choice, and the trigger moves.

- **The checks are fixed** (`steps.ts`, `normalize`): a workflow with a prototype has prototype analysis, draft ADR,
  blast radius and brief audit, all required, in that order; a workflow without one has none. Whatever a workflow
  had saved about them is dropped when it is read, and nothing puts one in or takes one out. On a task they are
  there only while the prototype is in play: required by the workflow, or begun; gone when it is skipped; absent for
  an optional prototype nobody has touched, so a task that never prototypes owes nothing.
- **The brief does not wait for them** (`owed`); the build does (`checksOwed`). They still block completing the
  task (`blocking`).
- **The trigger** (`server.ts`, `maybeBuild`): a task is planned and built by itself once two things are true,
  whichever comes last: its brief is approved, and the checks that follow its prototype are done. So with the
  brief approved first, approving the prototype is the last press: the checks run, and when the last one is in the
  task is planned and built (`onChecksDone`). With no prototype in play, the brief's approval is enough, as before.
- **An approved brief is not rewritten.** The conductor was asked to bring the brief up to date from the reports
  before the audit; when the brief is already approved that step is skipped, and at the end it is told the brief
  stands and to raise anything that would change what is built with the person.
- **Settings**: the workflow card's "After the prototype is approved" is a fixed list with nothing to set.

On the live data one open task has a prototype in play, RG-1 (Ragdoll Golf): its prototype is approved, its brief
is not, and its old workflow had only the audit. It now owes the analysis, the ADR and the blast radius too; they
start the next time a turn ends on that task. That is the new rule reaching Ragdoll Golf, not a change to its
workflow's own steps.

Not done, and what the shape still asks for: the order analysis, ADR, **plan, then audit** (the audit still reads
the brief and runs before the plan is made; it should read the plan); the brief shrunk to what and why (today's
brief still carries the builder's instructions when the conductor finalizes an unapproved one); the audit's output
as the merge guide; stopping on an expensive trade-off and alerting whoever approved.

## The plan comes before the audit, which reads it (Sandy, 2026-11-14: "lets do the reorder")

After an approved prototype the line was analysis, ADR, blast radius, the brief brought up to date, a brief audit,
and only then the plan and the build, so the last read before agents started was of the brief, not of what they
were about to do. Now (`checks.ts`, `nextMove`):

    prototype analysis → draft ADR → the plan (sub-tasks) → blast radius → audit → the build

- **The plan** is the planner's run, started by the line itself when the ADR is in (`onPlanWanted`, `runner.planTask`:
  plans and stops, where `buildTask` plans and builds). It is made from an approved brief. If the brief is not
  approved when the ADR is in, the conductor brings it up to date once from the analysis and the ADR and tells the
  person it is ready; the line waits, and approving the brief carries it on.
- **The blast radius** reads the plan's sub-tasks, not the ADR's intention: what that plan touches and how we would
  know it broke. It is still what the merge guide's risks are made from.
- **The audit** (it was "Brief audit") reads the plan against the brief, the ADR, the code, the prototype and the
  reports, and against what the app requires of every plan: what the brief asks that no sub-task does, sub-tasks
  nobody asked for, wrong order, two changing the same thing, a requirement the plan claims and the sub-tasks do
  not do. It leads with whatever should stop the build.
- When the audit is in, the task is built (`onChecksDone`, as before). An app set to wait plans by hand and the
  readers follow the plan once it is there.
- The task's own agent is told the new order, that an approved brief is the person's word, and that it cannot skip
  a step.

Not done: the audit does not stop the build. It reports, the build starts, and the conductor is told to raise
anything that would change what is built. Making an audit finding hold the build (a question with a cost, on Build)
is the "expensive trade-offs stop and alert" piece. A task with no prototype is still planned and built from its
brief with no ADR and no audit. The merge guide takes the blast radius and the ADR as before; the audit's own
summary is not on it yet. Not tried with real agents: the first prototype approved from here is the live test.

## One approval, and the ADR and the plan are put right before the build (Sandy, 2026-11-14: "the audit and the blast radius should … make any changes they need to make to the ADR and the plan … and set out the … merge checklist. Only then do we build")

Asked to say the order back, Sandy gave it with two things the tool did not have: "I approve the brief, which
basically ends with the prototype", and a "final ADR" between the audit and the build.

- **One approval.** Approving the prototype approves the brief with it when the brief is ready for that
  (`server.ts`, the step-approval route). Where it is not (no brief written, a required step owed, an optional one
  neither done nor skipped), the prototype stands approved and the answer says why the brief was not; the brief
  stays the person's to approve, and the line waits for it after the ADR as before.
- **A fifth step after the prototype: "Final ADR and plan"** (`final`, last of the checks). Until now the blast
  radius and the audit only reported, and the build started whatever they found. This step's agent reads both and
  changes things, through the task tools: it writes the final ADR over the draft, brings sub-tasks' briefs up to
  date, adds one where no sub-task can hold a finding, cancels one nobody asked for, and writes the merge
  checklist. It is told not to re-plan and to leave alone what no finding touches.
- **It can hold the build.** A finding that changes what is built, not how, is not its to decide: it records the
  step as started with "NEEDS YOU:" and the question, and stops. The step is not done, so the build does not
  start; the person answers in that agent's tab on the task and it carries on.
- **The merge checklist** is that step's summary and goes at the top of the pull request's merge guide as "Before
  you merge", boxes to tick.

So after the one press: prototype analysis → draft ADR → the plan → blast radius → audit → final ADR and plan →
the build.

Not done: the held question does not show under "Waiting for you" on Build (it is in the task's agent column, on
the step); the same line for a task with no prototype; nothing outside the app tells the person the build is held.
Not tried with real agents.

## A build held for the person shows on Build, and nothing builds around the reading (Sandy, 2026-11-14: "go ahead")

Three things, the last two found while doing the first.

- **Held builds show where the person looks.** `now().tasks` gives a planned task two more states: `checking`
  (planned after a prototype, with steps still to come before the build) and, when the last step recorded "NEEDS
  YOU:", `stopped` with the question and that step's conversation. Build lists the first under "Planned, being read
  before it is built" and the second under "Waiting for you", with the question and a box whose answer goes to
  that step's agent, which carries on and lets the build start.
- **No "Build it" around the reading.** A planned task whose steps after the prototype are not all in showed as
  "Planned, not started" with a Build it button, on Build and on the task. The button is gone there and the engine
  refuses it (`POST /issues/:id/build`).
- **A hole in the reorder, closed.** In a project that is already running, sub-tasks start the moment they are
  planned, so a task planned mid-line would have been built before its blast radius, audit and final step. The
  dispatch pass now holds a task's sub-tasks while those steps are owed ("its plan is read before it is built;
  still to come: …"), only for a task whose build has not begun, so nothing under way is stalled.

Tested through a real dispatch in a running project and through `now()`. Not tried with real agents.

## A brief is what and why, in 200 words (Sandy, 2026-11-14: "lets do the shrinking, I am going to harp on that we need less text so that people can actually consume it")

A task's brief had become the builder's instructions: after a prototype the task's agent was told to fold into it
a Prototype section, the analysis's Cleaner list, the ADR's decision, a telemetry table and the assets of every
step, and the person was then asked to approve that. Nobody reads eight hundred words of it.

- **The form** (`brief.ts`): at most 200 words, three parts: What, Why, Not in this task. No file names, functions,
  libraries, steps or instructions to a builder. How it is built is the ADR's and the plan's; how we will know it
  is done is the acceptance criteria.
- **Held, not asked for.** An agent cannot save a task's brief of more than 250 words (`update_task`,
  `create_task`, `create_project`): it is refused with the form. A person can write what they like. A sub-task's
  brief is the builder's instructions and has no limit.
- **Nothing is folded into it.** After a prototype, if the brief is not yet approved, the task's agent only
  corrects what the prototype changed about what is being built, cuts the brief back if it has grown, and brings
  the acceptance criteria up to date.
- **The planner reads the reports itself.** What the brief used to carry for it now goes to the planner directly:
  the prototype analysis, whole, beside the draft ADR, with what to do with its Cleaner list, its telemetry hook
  points and its keep-or-leave. The audit checks the plan's sub-tasks for the hook points, not a section of the
  brief.
- **On the page** the brief shows its word count; over 200 it says so, with one press that asks the task's agent to
  cut it back (not once it is approved).

Briefs already written are not touched: a long one shows its count and the offer. Not tried with real agents: the
next brief an agent writes is the test of whether 200 words is the right number.

## An app's abbreviation can be set, and changed (Sandy, 2026-11-14: "can we have a field to set the ABBR for the project?")

Read as the app's: the prefix of its tasks (MER in MER-50) and its square in the app strip. It was made from the
name when the app was created and could not be seen or changed anywhere. Now the new-app form has an Abbreviation
field (left empty, it is made from the name, and the hint shows which), and the app's settings have it beside the
name. Two to five letters or digits, starting with a letter; not another app's.

Changing it renames every task at once, since a task's name is the abbreviation and its number (MER-50 becomes
BON-50), and the field says so before it is saved. What was already written keeps the old one: branch names, pull
request titles, text in comments and briefs. If Sandy meant an abbreviation for a project (a group of tasks), that
does not exist: a project has no prefix of its own.

## One tab per thing (Sandy, 2026-11-14: "if you click on settings or a task or something, and there is a tab open, it takes you to the tab … instead of creating a new one? The exception would be if you right click a tab and say duplicate")

A tab was matched to an open one by its exact address, so Settings pressed in the rail made a second Settings tab
whenever the first had moved to another of its pages, and a link to a task turned the tab it was pressed in into a
second copy of a task already open elsewhere.

- **A tab is about a thing** (`tabThing`): Settings is one thing whatever page of it is showing; a task, an idea
  or a project is one thing whatever section; anything else is its own address. Opening a thing that has a tab goes
  to that tab. Asked for the thing alone (Settings, a task from a list), the tab stays where the person left it;
  asked for a place inside it (a task's Build section), the tab goes there.
- **Links inside a tab too.** A link to something another tab already shows brings that tab forward and leaves the
  tab it was pressed in as it is (`claim`, caught before the link acts). Moving about inside one thing is still
  that tab's own business.
- **Duplicate.** Right-click on a tab: Duplicate (a second tab on the same thing, beside the first) and Close. That
  is the only way two tabs come to show one thing.

Not done: tabs already doubled in a saved layout stay until closed; a page that moves by itself in code (a button
that navigates, not a link) is not caught.

## Steps on the graph's nodes, and a project's to-dos with their words (Sandy, 2026-11-14)

"Can we add the step count to the subtask nodes in the graph? … what it's working on and how many there are total."
A node carried "steps 1/3" in small type at the end of its last line, and only once its agent had started. Now each
sub-task's node has a row of its own: a bar with one segment per step (done, the one it is on, to come) and the
count, with "Step 2 of 3: …" under it while it builds. Before it starts the steps are the ones the planner wrote in
its brief, so the node says "6 steps" from the moment it is planned; landed, they are all done (`stepProgress`).

"On the project page the todos are not rendering": each card showed its boxes with no text, an empty badge and
"Reopen" on an open to-do. The project's graph sent its to-dos as bare rows, and the card it shares with the to-dos
page reads each line's `text` and `done`, and the to-do's `status` and `owner`. The graph now sends them in that
shape (`todos.ts`, `view`), with a test.

## An agent may not stop processes by name or by port (Sandy, 2026-11-14: "it says attempt four. So it's tried it four times and it's failed")

BON-71 had not failed at its work. Its builder, tidying up the dev servers it had started for a screenshot check,
ran `pkill -f "pnpm dev"; pkill -f "vite"`, and on later attempts `pkill -f "vite --port 5180"` and
`pkill -f "pnpm --parallel"`. Those match Self Evident's own processes (5180 is its UI). The whole `pnpm dev` was
killed, launchd started it again, the engine saw an interrupted build and started BON-71 from the top, and about
four minutes later the new attempt did the same. Three times, plus once from a merge of mine made while a build
was running. Each loop also restarted the engine under every other open conversation. The project was paused by
hand to stop it.

- **The rule** (`guard.ts`, `stopsOthers`): `pkill`, `killall`, `fkill`, `kill-port` run as commands, and `kill`
  fed from `pgrep`, `lsof`, `ps`, `pidof` or `fuser` (by substitution or through a pipe) are refused. `kill 4321`,
  `kill $!`, `kill %1` and `kill $(cat x.pid)` are not: an agent stops what it started, by the pid it kept.
- **Where**: the builder's guard, and every conversation's hook (a task's agent, a prototype's, a check's), where
  it is refused outright and not put to the person, since saying yes takes the engine down.
- **What the agent is told** when refused, and in the builder's instructions from the start: stop only what you
  started, by its pid; pick a port of your own above 6200; if a port is taken, pick another, do not free it.

Tested against the three commands the builder really ran. Not done: an attempt is still used up, and the work
started again from the top, when the interruption was the engine restarting; and my own merges must wait for a
running build, which the wait I had did not enforce (it timed out and went on).

## A task links to its pull request (Sandy, 2026-11-15: "can we add a link to the PR in the tasks?")

Build already linked a task's pull request; the task's own page and the task list did not, so a task "in review"
gave no way to what is being reviewed.

- **The task's page**: a badge beside its state, "Pull request #3 · open", opening it on GitHub. A sub-task shows its
  task's, since sub-tasks have none of their own.
- **The task list**: the same link on each row that has one.
- **Which pull request** (`projects.ts`, `prOf`): the task's own; else its project's one pull request, for an app
  that lands a project in one.

## An app can be removed (Sandy, 2026-11-15: "we need to be able to remove apps"; asked which, "Both")

Two steps, so a mistake costs nothing and a real deletion is deliberate.

- **Removed (put away)**: Settings › the app › Remove, one press, nothing asked, since it can be undone (Things does
  not confirm what can be put back). The app leaves the rail and every list; its running projects are paused, its
  running prototypes and Storybooks stopped, its agents let go; GitHub is no longer read for it. Its rows stay. Its
  abbreviation is free for another app meanwhile (the unique index now covers only apps in use, migration 0028).
  Refused while it is building or an agent of it is replying: the person stops those, not this.
- **Brought back**: Settings › All apps › Removed apps. Its projects stay paused for the person to resume. Refused
  when another app took its abbreviation meanwhile, saying which.
- **Deleted for good**: the same list, only for a removed app, and only with its name typed (GitHub's way before
  deleting a repository). The confirmation says what goes (its tasks, projects, ideas, conversations, history) and
  what stays where it is (the repo on GitHub, the folder, the worktrees folder). One transaction: all or nothing.
- **How the delete finds everything** (`apps.ts`, `deleteForGood`): it reads the tables from the database, not from
  a list in the code. Every table with an `app_id` is the app's, emptied children first; what points at its rows
  from outside is cleared when it may be empty and deleted when it may not. So a table added later is covered, and
  the test checks no table with an `app_id` keeps a row of a deleted app while its neighbour is whole.

Not done: a removed app's pages still open by their address, and a write to one is not refused everywhere. Nothing on
disk is cleaned: the worktrees of a deleted app stay until removed by hand.

## The checkout follows main (Sandy, 2026-11-15: "there should be a pull system in the SE right?" … "yes")

The sync fetched main every two minutes and brought open project and task branches up to date, but never moved the
`main` in the app's own folder, so the folder a person opens fell behind (Bonkei's was 16 commits back).

- **Now** (`github.ts`, `pullCheckout`, in the same pass): after the fetch, the checkout's default branch is
  fast-forwarded to the fetched one. On that branch with no changed tracked files, the files move too. On another
  branch, only the branch's pointer moves.
- **Left as it is** when a tracked file has changes, when the branch has commits of its own, or when it is open in
  another worktree. Never a merge, never a switch of branch.
- **Not Self Evident's own checkout** (`ownCheckout`): new engine code restarts the engine and cuts off what is
  building, so that one still moves only when someone chooses the moment.

## A project's page leads with its tasks (Sandy, 2026-11-15: "the project page is kind of burying the lead. The tasks are what is important")

The page opened with the whole description as raw markdown, then the project's steps, assets and add-tasks, with the
tasks a row of chips far below.

- **Tasks first**, as a list in build order: name, state, its own pull request, sub-task progress, Plan. The title
  opens the task. Add tasks sits under it, then the graph, questions and decisions.
- **The description is formatted** and shows its first three lines, with Show all.
- **The project's own steps are folded at the bottom** ("Steps for the project as a whole"), after to-dos, backlog
  and assets. Sandy: "not sure what to do with the steps section at a project level." Not removed: a project can
  still carry research or a prototype for all its tasks. Open whether to remove them.
- **The header's pull request badge** shows only a project's one pull request. With a pull request per task it
  showed the first task's as if it were the project's.

Also fixed: `ideas/review-access.md` had a colon inside a front-matter value, which broke the pages and stories that
read idea files. It went in with a docs-only merge that did not run the app's tests; a file under `ideas/` is read
by the app, so it needs them.

## An idea's tab says which idea (Sandy, 2026-11-15: "it just says idea … like idea: ReactFlow adapter")

A tab on an idea read "Idea" whichever idea it was; a task's read its name. Now "Idea: ReactFlow adapter", clipped
like a task's. The workspace asks the engine for the one idea (`GET /ideas/:id`, new: ideas were only listed per
app). An idea kept as a file in `ideas/` is named the same way.

## A built prototype shows what it wrote, not a button (Sandy, 2026-11-15: "if prototype is started this shouldn't show up, we should see the content")

On a prototype's step, "For the brief" showed only "Ask the agent to carry on", even with the prototype built, on
tasks and on ideas. Two causes, both in `StepSection`:

- **The notes were never fetched for a prototype's step.** Every other step's were. They are now, so what the
  prototype wrote for the brief shows. With nothing written, the page says so and points at View.
- **An idea's prototype was looked for by task.** It is found by the idea now, so an idea's step has View and Code
  like a task's.

The carry-on button is gone once a prototype exists: it is talked about with its agent, not started again.

## A prototype's guide shows inside Self Evident too (Sandy, 2026-11-15: "is that only share or should it be included in the embedded prototype viewer as well?" … "yes")

The guide an agent writes for a prototype (where to go, what to try) showed only to whoever opened the shared link.
The person judging the prototype here saw one line about it in the Share panel.

- **Now**: the same "What to try" tab sits in the bottom right corner of the embedded prototype, folded, with how
  many steps were tried. Open, it lists the introduction and the steps; the step the view is on is marked, and
  "Go there" moves the embedded view to a step's page.
- **Self Evident's own panel** over the stage (`PrototypeGuide.tsx`), not put into the prototype's page as the
  shared one is, so the prototype is untouched and a step can drive the view.
- **No feedback box**: the person here has the agent beside them. What was tried and whether it is open are kept
  per prototype in the browser.
- No guide written: nothing is shown.

## The guide covers three quarters at most, and is a little see-through (Sandy, 2026-11-15)

With nine steps the "What to try" panel filled the prototype's whole height and hid it. Now it is at most three
quarters of the height and scrolls inside, with its header staying in view, and its background lets the prototype
show through faintly. Both versions: the one inside Self Evident and the one on a shared link.

## A guide's links are checked before it is kept (Sandy, 2026-11-15: "is this an app wide issue" … "yes")

An agent wrote a nine-step guide whose last six paths were guesses at where Storybook lived; they were saved, and
the person found out by pressing one. The cause is not one app's: a guide step is a path on the prototype's own
server, and nothing asked that server.

- **On save** (`share-guide.ts`, `setGuide`, `deadPaths`): each path is requested from the prototype. One that does
  not answer, or answers 404, 410 or a server error, refuses the whole guide and names the paths. The agent is told
  that only pages the prototype itself serves can be a path, never a Storybook story or another server.
- **A page behind a sign-in** (401, 403) counts as there.
- **Prototype not answering at all**: the guide is kept, and the agent is told its paths were not checked.
- **A server that answers any address** (a single-page app's does): the guide is kept, and the agent is told an
  answer proves little there and to open each path itself. The check is a floor, not proof.

Not done: a step that points at a story, opened in the Storybook view. That is what the guessed paths were reaching
for. On a shared link it needs the Storybook shared too.

## The app's tests type-check first (2026-11-15)

`pnpm --filter app test` ran the story tests only, and Vite does not type-check, so type errors reached main unseen:
eleven of them. One was a real bug: Plan's step marks filtered on a place, 'after', that no longer exists, so the
checks after a prototype showed as marks. The rest were types behind the code (a step's `skipped` and `none`, a
task's `updatedAt`, the app graph's questions) and sample data. All fixed, and the test command now runs
`tsc -p tsconfig.app.json --noEmit` before the stories.

## A prototype with no screen is tried by Run buttons (Sandy, 2026-11-15: "can we add a command line window if that is the prototype access point"; asked which, "Run buttons")

Homework Gate's OpenTelemetry collector has no screens. Its Prototype tab started the app's web server, which failed,
and the way to try it was a list of commands in the chat.

- **A guide step can be a command** (`run`) in place of a path: one line, written by the agent, with what it should
  print in `try`. Refused: two lines, a path beside it, anything that stops other processes.
- **Run** (`prototype-run.ts`): the person presses Run beside the command; the engine runs exactly that, in the
  prototype's worktree with its environment, and the tab shows what it printed and how it ended. One at a time per
  prototype, Stop ends it and what it started, twenty minutes at most. Each run is an event on the prototype's task.
- **Not a terminal** (considered, not built): nothing can be typed and only a step's own command runs. A shell behind
  Self Evident's address, which tunnels and shared links pass through, is a bigger thing to lock down.
- **In the tab**: a prototype whose server is not running and whose guide has commands shows them as its page. With
  its server running, command steps run from the "What to try" panel too.
- **No server for it**: `start_prototype` takes `server: false`, so nothing is started that is bound to fail.
- **On a shared link** a command step shows the command as text; a visitor cannot run anything.

Not changed: writing a guide is still rated a cheap action for an agent, though it can now carry a command. The
person sees the command before pressing. Output is kept in memory only and is gone when the engine restarts.

## An idea converted to a project starts with a task (Sandy, 2026-11-15: "it needs to generate at least one task, but more if it makes sense … I've lost the task. I've lost the prototype")

Converting an idea to a project made an empty project and hung the idea's research and prototype on the project
itself. With the project's own steps folded at the bottom of its page, the page showed no tasks and nothing of the
idea: it looked lost. It was not, but nothing led to it.

- **Now** (`work.ts`, `convertIdeaTx`): the project is made with one task, named after the idea. The idea's
  research, mockups, prototype, rough draft (as the task's brief) and its own agent go to that task, exactly as when
  an idea becomes a task. A project only groups.
- **More tasks when it makes sense**: the idea's agent, now the task's, is asked at once whether the idea is one
  task or several, and to add the others to the project and trim the first (`splitPrompt`). An idea with no agent
  of its own gets the one task.
- The person lands on the project's page, its task leading.

Also found: the app's type-check is `pnpm --filter app typecheck`; plain `tsc --noEmit` in `app/` checks nothing
(the root tsconfig has no files). Checks run that way through 2026-11-15 were empty, and main carries 11 type errors
the tests do not catch. Fixed next.

## The engine's own Doppler scope is not handed on (Sandy, 2026-11-15: "HG-259 still not working when I start the prototype")

A Homework Gate prototype's API died with "HG_SECRET is not set" though its command runs under `doppler run --`.
The engine is itself started with `doppler run`, which puts DOPPLER_PROJECT, DOPPLER_CONFIG and DOPPLER_ENVIRONMENT
in its environment. Everything it starts inherited them, and the Doppler CLI obeys them over the folder it is in,
so an app's own `doppler run --` read Self Evident's secrets in place of the app's. Shown both ways in that
prototype's worktree: project `homework-gate` from a terminal, `self-evident` with the engine's two variables set.

- **Now** (`own-scope.ts`, imported first by the server): the three names are removed from the engine's environment
  at start, so a prototype, a guide's command, a Storybook, an agent and what it runs all resolve Doppler by their
  own folder. The engine never calls Doppler itself.

Not done, and it matters: the engine's own secrets (its database address, its Linear key) are still in the
environment of everything it starts, because they are in the engine's. That is a separate change: read them once,
then take them out too.

## A task's checks carry on after its plan, however it was planned (Sandy, 2026-11-15: "the blast radius, audit and final ADR aren't running even though they've all been answered … is that supposed to happen automatically")

BON-51, a task in a running project: prototype approved, analysis done, then its plan was started while the draft
ADR was still being written, and after the plan nothing more ran.

- **Cause 1**: a running project plans its next task by itself (`runner.planNext`, from before a task was what is
  built). It did not know about the checks, so it planned ahead of the analysis and the ADR the plan is made from.
  Now it leaves a task alone while either is owed; the checks' line plans it when they are in.
- **Cause 2**: only a plan asked for by the checks' line handed back to it. A plan started any other way ended
  without a word, and the blast radius, the audit and the final step never started. Now every finished plan tells
  the checks (`planner.onAnyPlanned`).
- **An answer nudges the line too**, and **a restart carries a line on**: at start, tasks with a check written in
  the last day and checks still owed are moved on by one (`checks.resumeChecks`). Only those, so a restart does not
  start the checks of a task nobody has touched.

Left as it is: BON-51's plan was made before its ADR was finished. Its final step exists to put the ADR and the plan
right against each other, so it is not planned again.

## A step that is under way shows what was written, and asks for nothing (Sandy, 2026-11-15: "we don't need to push a button that says ask the agent to carry on … what we need is the content of what it built")

On Homework Gate's idea "The tutor has nothing to point to", the rough draft's page showed its one-line status and a
button. The agent had written the draft; the page never loaded it.

- **An idea's rough draft is loaded** (`StepSection`): a task's brief is on the task and passed in by its page, so
  the brief was left out of the steps whose work is fetched. On an idea the rough draft is a step like the others.
  The same gap as a prototype's notes, fixed earlier today, in the one place left.
- **"Ask the agent to carry on" is gone**, on every step. Once a step is under way its agent is beside the page.
  "Start with the agent" stays on a step nobody has started.
- **Under way with nothing written** says so, so an empty page is not taken for a broken one.

## An agent in a worktree is not asked below expensive (Sandy, 2026-11-15: "we can't have this thing stopping to ask us if I can do bash … I got caught three times now waiting for a really long time, not realizing something was stuck … if they're questions, stop")

A check's agent started at "runs cheap things", and the engine rated any command it did not recognise as moderate,
so read-only lines (a grep with an alternation, a variable set first, `git -C`, `jq`) stopped it on a yes that nobody
was there to give. Sandy sent four of them.

- **The rule** (`gate.ts`): expensive (hard to undo, or outward-facing) is always put to the person. In a worktree
  everything below it runs, whatever the conversation's level, unless a person set that conversation to ask for
  everything. A check's agent never waits on a yes below expensive: in a worktree it runs; in the app's own checkout
  a command that leaves a mark is refused with the reason, so it carries on. A conversation about the app as a
  whole, in its own checkout, is as before.
- **The rating** (`risk.ts`): a line is cut at `;`, `&&`, `|` outside quotes only; `NAME=value` in front and
  `git -C <dir>` are read through. The four commands are free now. The same reading closed a gap: `git -C <dir> push
  … main` was rated moderate, not expensive.
- A check's agent starts at "runs up to moderate".

Not done: when an agent is waiting on an expensive yes, nothing outside its conversation says so. Build should.

## Two speeds: careful and fast (Sandy, 2026-11-15: "it's moving very slow … very good for a group project where there's a lot of stakeholders" … "let's build the two speeds")

After an approved prototype a task went through the analysis, the draft ADR, the plan, the blast radius, the audit
and the final ADR and plan before anything was built: about an hour of agents reading and writing, one after
another, for every task. That is what lets other people trust a change, and too much for one person building.
This takes back part of 2026-11-14's "the checks are fixed, not a workflow's choice": they are fixed when a task
goes carefully, and absent when it goes fast.

- **Careful** (as it was, and still what an app does unless told): every check, then the build.
- **Fast**: approving the prototype approves the brief, and the task is planned and built. No checks. The scrutiny
  is on the pull request, which still opens with its merge guide.
- **Where**: per app in Settings › Landing ("After a prototype is approved"), `setup.speed`. A task can have its
  own, on its overview beside its workflow (`issue.speed`, migration 0029); a sub-task goes at its task's.
- **How** (`steps.ts`): the speed rides on the workflow resolved for the task (`fast`), so everything that asks
  which checks are in play gets the same answer: the page, the brief's approval, the build's gate, the scheduler's
  hold. Changing a task's speed carries it on at once.

Not done: nothing reads the plan on a fast task's pull request beyond the merge guide. An audit of the pull request
after the build is the natural place for it.

## A check cut off by a restart is picked back up (2026-11-15)

Found while waiting to merge: a check's line treats any open conversation for a check as "out", working or not. An
engine restart in the middle of a check left its conversation open and silent, so the line waited on it for good,
with nothing to say so. That made every restart during a line a way to strand a task.

- **At start** (`checks.resumeChecks`): for a task whose line is under way, a check that is not done and whose
  agent was cut off mid-turn is told to carry on from what it has saved. When its turn ends the line moves as usual.
- **Cut off** (`talk.cutOff`) means: it was given something to do, or had begun doing it, after the last time a
  turn of its ended. An agent that ended its turn, finished or waiting for the person, is left alone.

## Approving the prototype is the last press (Sandy, 2026-11-15: "I approved the prototype. Like, that ends the brief, right? Then we move forward to the plan")

HG-259: prototype approved, analysis and draft ADR done, then nothing. Its agent had brought the brief up to date
and written "the brief is ready for your approval" in its own conversation, the only place that said so. And
approving would have been refused: sketches and mockups were neither done nor skipped. 2026-11-14's "one approval,
not two" only held when the brief could be approved in the same moment as the prototype.

- **The approval carries** (`checks.approvalCarries`, in `advanceChecks`): once the analysis and the ADR are in and
  the conductor has brought the brief up to date, the brief stands approved by whoever approved the prototype, and
  the plan follows. No second press.
- **Optional steps nobody touched are skipped** when the prototype is approved (`work.skipUntouched`). A step that
  was started is left for the person: that one is a choice.
- **When it does wait on the person** (a started step left open, a required one owed), "its brief is ready; nothing
  more happens until you approve it" is listed under what needs you on My Stuff, with the way to it
  (`now`, `approve_brief`).

## A prototype is full or rough (Sandy, 2026-11-15: "the HG 260 prototype is taking way too long" … "prototypes can be set as being full or rough")

HG-260's prototype had been building for a quarter of an hour: a migration, the lookup module, the API, a set-up
step, a settings card, tests, and a three-minute run of the whole suite. That is what a prototype's agent is told
to do since 2026-11-13: build it the way we would ship it. And after approval the task is built again.

- **Full** (as it was, and the usual one unless an app says otherwise): every layer real, so an analysis and an ADR
  can be read out of it.
- **Rough**: quick, to learn. The agent names the one thing in doubt and builds that for real; everything around it
  is the fastest way. No migration discipline, no new tests, no full test run, no polish. If the only doubt is how
  it looks, it says so and stops: that is a mockup's job. It is thrown away; the build does it properly, once.
- **Where**: Settings › Prototype, "How thoroughly a prototype is built" (`setup.prototype_depth`). A prototype can
  be started as either whatever the app's usual one is (`start_prototype`, `depth`; kept on the prototype,
  migration 0030), so "make a rough prototype" works when said to an agent.
- **The prototype analysis is told** when it reads a rough one: not to fault what was left rough, not to treat the
  code as a base, and to list what the real build has to do that the prototype did not.

The rule that keeps rough from being a slow mockup: real on the one thing in doubt, rough everywhere else.

## A build with no reported steps says what it is doing (Sandy, 2026-11-15: "they seem to be stuck on the first step of each, or the node drawing is wrong")

The drawing was wrong. A sub-task that is building showed an empty bar, which reads as stuck on step one.

- **Cause**: no builder has reported a step since 2026-11-01 (the last `run.steps` event), in any app. The engine
  reads a builder's steps from its `TodoWrite` calls; the agents stopped making them. So the step count put on the
  graph on 2026-11-14 has only ever shown the planned number, never where a build is. Not noticed then because a
  landed sub-task shows every planned step done, which looked right.
- **On the node now**: with no steps reported, a building sub-task says "Building. Its agent has not said which
  step it is on" and its bar is outlines with "N planned"; one that is landing says "Built. Landing now: the tests
  run before it merges" with every step done.
- Not done here: getting the steps reported again (the engine has to listen for the task tools agents use now).

## A builder's steps are reported again (2026-11-15)

The cause of the graph's empty bars: the engine read a builder's steps only from `TodoWrite`, and since 2026-11-01
builders keep their list with `TaskCreate` and `TaskUpdate`, or not at all. No `run.steps` event in two weeks.

- **Both are read now** (`step-track.ts`): `TodoWrite` gives the whole list; `TaskCreate` adds a step and
  `TaskUpdate` changes one, found by the id the tool's result gives it.
- **The builder is told to keep the list**, plainly: list the steps before changing anything, mark each in progress
  and completed, because nothing else tells the people watching where it is.
- The task tools are in the builder's tool set and need no approval.

Not seen with a real builder yet: whether the model keeps the list when told this way, and what the task tools'
results look like in this SDK version (the tracker reads an id from JSON or from "Task #N", and counts from one
when it finds neither).

## An agent stays in its own tab; nothing is split by an agent (Sandy, 2026-11-15: "the task agent shouldn't open new windows. It just should move around different areas of that task or build or idea")

Three things were making tabs appear or split when an agent carried on.

- **A task's or an idea's agent stays in that thing's tab.** Its own agent, a check's agent on that task and a
  prototype's agent started on it all count (`ownerOf` in `follow.ts`). What it shows goes to a page of that task or
  idea: a sketch, a story, the prototype on that step's page, a build log on the task's Build page. A page outside
  it is not opened; the agent is told to say where it is. It no longer sends "follow me" at all, so building does
  not take the person to the project.
- **No agent splits.** `open_tab` lost `split` (an older call that passes it still works, as a tab); a new
  prototype no longer opens split to the right, and one started on a task or idea shows on that page's Prototype
  step. Splitting is the person's to do.
- **Open already means go there.** When the app's agent changes something whose tab is open, that tab comes to the
  front. The following tab is only used for things with no tab, and opens as a tab among the others.

## A finished task holds nothing up (Bonkei, 2026-11-15: BON-51 approved and its build did not start)

BON-80 to BON-84 sat queued on "blocked: BON-68 (BON-50, earlier in the project) cancelled". BON-50 was done and
merged; BON-68 was a sub-task of its first plan, cancelled when it was re-planned.

- **Cause**: a task's sub-tasks wait on every sub-task of the earlier tasks in the project, cancelled ones
  included, and a cancelled dependency blocks for good.
- **Now** (`impliedDeps`): a sub-task that is canceled or a duplicate is not waited on, and neither is any
  sub-task of a task that is done. A dependency the plan names itself still blocks when it fails.

## The whole test run is once per task, not per sub-task (Sandy, 2026-11-15: "running the full test suite for each subtask is dumb, we should test what we are building and then do the regression when the task is done… If it fails we analyze and create an additional subtask to fix the issue")

Homework Gate's test command takes 10 to 12 minutes and ran twice for every sub-task: once by its builder, once
to land it. HG-259 has seven sub-tasks. A web story that fails now and then sent finished Windows, Mac and iPhone
work back to be rebuilt.

- **A sub-task lands by merging.** No test command at landing. Its builder is told to test what it built and not
  to run the whole suite.
- **The whole run is once per task** (`testTask` in `runner.ts`, `wholeRun` in `landing.ts`): when the last
  sub-task of a task has merged, the app's test command runs on the merged work. The project is not called landed
  while it runs.
- **A failure is run again before anything is blamed.** Passing the second time is recorded as flaky
  (`task.tested` with `flaky`), and is not a failure.
- **Failing twice adds a sub-task**, "Fix what the whole test run found": find the cause first, fix it, and run
  the whole suite (the one sub-task that does). Two fixes at most; then a comment on the task says it needs a
  person.
- **The lines that failed are kept** (`failingLines`). Before, only the last 3,000 characters were, which showed
  the suite that passed last.

Not done: a setting to choose the old way per app; showing the whole run as its own node on the graph (today it
is events on the task, and the fix sub-task when there is one). Not seen on a real task yet.

## A task's graph is live (Sandy, 2026-11-15: "That needs to change when the status changes, I seem to need to refresh the page")

The graph in a task's Build section was read again only when the task's own detail showed a sub-task in a new
status. A step, a retry or anything missed while the engine restarted left a node on its old state.

- It now uses the same live read as the project's graph: every event of the project reads it again.
- Both graphs also read again when the event stream comes back after a gap, and every 20 seconds while the page is
  showing, so one missed event never needs a reload.

## Clearing its own scratch files does not stop an agent (Sandy, 2026-11-16: "this again", on `rm -f /tmp/bon85shots/*`)

Any `rm -f` or `rm -rf` was rated expensive, and expensive always asks. A builder clearing a folder of screenshots
in `/tmp` before taking new ones stopped and waited.

- `rm -f`/`rm -rf` whose every target is inside a named folder of a temporary directory (`/tmp/x/…`, `$TMPDIR/x`,
  `/var/folders/…`) is cheap now. `/tmp/*` itself, a path with `..`, or any target elsewhere is still expensive.

## Images can be dropped on an agent's prompt (Sandy, 2026-11-16: "add drag and drop files (images) to the task and project level agent prompt component")

Every agent's prompt is the same component (`Conversation`), so this is everywhere: the app's agent, a project's,
a task's, an idea's, a prototype's.

- **Drop or paste.** An image dropped anywhere on the conversation, or pasted in the box, waits above the box as
  a thumbnail with a way to take it off. Send works with pictures and no words. After Linear and Claude.
- **Limits**: PNG, JPEG, GIF or WebP; 5 MB each (the model's own limit); six in a message. Anything else says why.
- **Where they are kept** (`uploads.ts`): as files on this computer, `~/.self-evident/uploads/<conversation>/`.
  Not in the database: the message's row has only the id, name and type.
- **What the agent gets**: the pictures in the message, and their file paths in its words, so it can also use the
  file itself (copy a screenshot into the repo).
- In the transcript the pictures show under what was said, and open full size.

Images only; other files are refused. Not tried with a real agent yet (no test conversations on real apps).

## The merge guide is a screen, and the build is checked before the reviewer is asked (Sandy, 2026-11-16: "The merge guide is way way too long… The point is to make a reviewer faster")

BON-51's pull request opened with 30,900 characters: a 13,000-character guide, then every builder's summary. Its
first line was "18 acceptance criteria have not been checked against the build yet", followed by all 18 for the
reviewer to check.

- **A built task is checked against its criteria** (`verify.ts`). When a task's sub-tasks are all merged, the
  engine adds one more, "Check it against its acceptance criteria". Its agent checks each criterion and does not
  build; it ends with a verdict for each (met, not met, or left for a person, with one line of evidence). The
  engine reads the verdicts from its summary and marks the criteria. Once per task; the whole test run comes
  after it.
- **The guide has a size: 1,500 characters a task** (`GUIDE_MAX`, held by the code and a test). It says what to act
  on; what the build met is a count; only the criteria not met or left for a person are listed (five at most),
  then three decisions without their reasons, one line of risk, and a mark for each requirement. When that is
  still too much it cuts further, in a fixed order.
- **Nothing is lost: the record is folded away under it** (`<details>` on the pull request, the same on the
  task's page): every criterion with its mark, every decision with its reason, the risks, and what each builder
  reported.
- **Over eight criteria, the task's page says it is probably two tasks**, before the brief is approved, while it
  can still be split.
- The pull request no longer says each sub-task was "tested on the merged commit"; that stopped being true on
  2026-11-15.

Run against BON-51 as stored: 1,377 characters. Its criteria show as unchecked, since it was built before this.
Not seen on a real build yet: whether the checking agent ends with the block the engine reads. When it does not,
the criteria stay unchecked and the guide says so. Not done: telling the planner to split a task over eight
criteria (today only the page says it).

## Fast is a workflow's choice, not a separate switch (Sandy, 2026-11-16: "Fast mode presumably is just changing that. So shouldn't we add fast mode to a workflow and then make that workflow the default" … "three options, full, fast, fine-grain control")

The two speeds (2026-11-15) were a switch on the app and on the task. A workflow knew nothing of it, so its page
listed five checks "always, by itself" that a Fast task never ran. Two controls over one thing.

- **A workflow says what follows its prototype**, one of three: **Full** (every check), **Fast** (none: plan,
  then build), or **Your pick** (a box for each check). It is not stored by name: it is which of the workflow's
  check steps are on (`afterOf`, `checksOf`, `withChecks` in `steps.ts`). A workflow never set runs them all, as
  before. A check that runs is required, as before.
- **The separate switch is gone**: the select in Settings › Landing, the Careful/Fast picker on a task, the
  `PUT /issues/:id/speed` route, `setup.speed`. To go fast, make a Fast workflow and use it: as the app's default,
  or on one project or task.
- **Nothing changes for an app that was Fast**: at start, the engine switches every check off in that app's
  default workflow and removes the old setting (`speedIntoWorkflows`; a second run does nothing). Homework Gate was
  the only one.
- **Changing or choosing a workflow carries tasks on at once**: a task waiting on a check its workflow no longer
  runs is planned or built, as changing its speed used to do.
- `issue.speed` is no longer read. The column stays; no task had it set.

The engine already ran whatever checks a task's steps listed, so a subset needed no change there. Not tried on a
real task: a pick that leaves out the final ADR and plan (the merge checklist comes from it, so the guide has none).

## An app opens in a new browser tab with ⌘-click (Sandy, 2026-11-16)

- ⌘-click, Ctrl-click or the middle button on an app's square opens that app in a new browser tab; this tab stays
  where it is. A plain click switches here, as before.
- The new tab is told which app by its address (`/?app=<id>`), which is taken off the address once read.
- Each browser tab now keeps its own app through a reload (sessionStorage). Before, the app was remembered once for
  the whole browser, so two tabs on two apps would both come back on the last one picked.

## Learn reads the codebase (Sandy, 2026-11-16: "the learn section should have two roles… analyze observations… analyze the codebase. The latter would be the first step when you approach a new project. And… the learn agent can create ideas… the access point to the workbench docs")

Learn was an empty page. It has two halves now (SHAPE.md); the codebase half is built.

- **One press, "Learn this codebase"**, starts an agent in the app's checkout. It reads and changes nothing, and
  does not run the whole test suite. One at a time per app; pressing again goes back to it.
- **It writes four documents, the same four in every app** (`LEARN_DOCS` in `learn.ts`): what it is, the parts,
  running and testing it, what is fragile. A fixed set, so a person and an agent both know where to look.
- **Each has two parts**: a summary for the person, refused over 700 characters, and a body for agents (paths,
  commands, names), up to 8,000. The page shows the summary and folds the body under "For agents".
- **Kept in the database** (table `learning`, one row per document per app, replaced when learned again), with the
  commit it was written at. The page says when the code has moved since.
- **It keeps up to three ideas** with `create_idea`: what it saw that should change. The page points to Ideas.
- **Agents read them** with the `learning` tool, and write with `set_learning`.

Not done: handing the documents to the planner, the checks and the builders as they start (today they are a tool
an agent may call); the running-app half. Not run on a real app yet: the press starts a real agent.

## Learn has its own agent, and an idea remembers it (Sandy, 2026-11-16: "the learn should have its own agent that's broken off from the global… When you create an idea it sets itself as the source agent so that the idea/task agent can get info from it")

- **Learn's agent is on the Learn page**, beside what it wrote, and no longer a tab in the app's column: as a
  task's agent is on the task's page. One per app. Ask it there.
- **An idea Learn keeps remembers Learn's conversation** (`idea.source_ref`: `{sessionId, what: 'learn'}`; the
  source is `agent`). Anyone else's idea has none.
- **The idea's agent, and the task's it becomes, have it to ask.** It is listed with the agents they have out
  ("Learn: where this idea came from"), so `agents_out`, `read_agent` and `tell_agent` reach it, by `learn`. Its
  answer comes back the way a prototype's or a check's does. `tell_agent` and the others were a task's agent's
  only; an idea's own agent has them now.
- While Learn's conversation is open. Ended, there is nobody to ask, and the documents on the Learn page stand.

Ideas kept before this have no source. Not tried with real agents: an idea's agent asking Learn.

## Main: built in one go, then a checklist that is verified (Sandy, 2026-11-16: "Keep this in 'legacy', create a new main. In main we go through prototype and then we just build it in on one step… then it writes the PR, and then… our falsification / cleanup step that is another agent coming in and testing it out and making sure it works and probing it"; three rounds: "yes 3 is good")

The stages before a build were there to enforce things on the builder. The list goes in the builder's prompt now,
and a check after the build is what holds it (SHAPE.md, "The workflow is a verification checklist").

- **Two workflows in every app.** At start the engine gives each app a **Main** and makes it the default; what
  was the default is named **Legacy** when it had a stock name (`ensureMain` in `work.ts`). A project or a loose
  task already under way is pinned to the workflow it was using, so nothing changes under it. Run again, it does
  nothing. A new app gets both.
- **Main**: the prototype, required; no checks before the build; **built in one go**.
- **Built in one go** (`workflow.build = 'one'`, migration 0032; a setting on any workflow, beside "planned into
  sub-tasks"): no planner runs. The task gets one sub-task, "Build it", whose brief is the list it will be checked
  against (its acceptance criteria, the app's requirements in force) and the prototype's branch to build from
  (`oneGoBrief` in `planner.ts`). Do we need sub-tasks: not by default. One builder holding the whole task has no
  merges to wait on and reads the code once; a task too big for that is two tasks.
- **After the build** (`verify.ts`, `afterBuild`), each a sub-task built by a fresh agent, so it shows on the
  graph and survives a restart:
  - **Check**: every criterion and every requirement, a verdict each (met, not met with what is missing, does
    not apply, or left for a person). The requirements' verdicts are kept on the task beside the criteria's.
  - **Finish what the check found**, then **check again**, only what was not done. Three rounds; then a comment
    on the task says what is still not done and it waits for a person.
  - **Try to break it, and clean up**: an agent that did not build it runs it, tries what nobody wrote down,
    reads the change for what a build leaves behind, fixes what is small, reports what it left.
  - Then the whole test run, once, with its own fix sub-task when it fails (2026-11-15).
- **Legacy is as it was**: its checks, the planner, each sub-task merged in turn, its criteria checked once. No
  requirements check, no finish, no probe.
- The pull request is opened at the first merge and rewritten after each, as before, so it carries the check's
  marks and each agent's report.

Not done: the probe's "broke and left" in the merge guide itself (it is in the record under it); a way to say a
task needs no prototype in Main (it is required there). Not seen on a real task yet.

## A workflow is two choices: sub-tasks or not, and the requirements (Sandy, 2026-11-16: "what are our options? One is do or do not use subtasks… Two is… what does it need to check for… the really critical thing… you select the… requirements… It needs to create an ADR… telemetry coverage, test suite"; "These are both what's put into the instructions and what is checked at the end")

Two settings stood side by side that did not fit: what follows the prototype (full, fast, a pick) and how it is
built. Full with "in one go" ran five agents before the build, three of them to read a plan that was not there.

- **A workflow is one of two kinds** (`workflow.style`, migration 0033).
  - **Checklist**: two choices. **Sub-tasks**: in one go, or planned into sub-tasks. **What a build is held to**:
    a box for each of the app's requirements. Nothing runs before the build. The list is in the builder's
    instructions, and it is what the check after the build reads; then finish, check again, probe, test, as on
    2026-11-16, now with sub-tasks or without.
  - **Staged**: what there was, kept: checks before the build (full, fast, a pick), a plan, sub-tasks, criteria
    checked once. The full/fast/pick question is only asked here.
  - They do not mix (`fitStyle`): a checklist's checks before the build are all off; a staged workflow is planned.
- **The requirements are the workflow's to switch** (`workflow.requirements`, over the app's own switches; a
  project still has the last word). The app's list says what each one means: Settings › Landing.
- **Two more requirements**, off for an app until a workflow switches them on: **Decision record** (each real
  design choice written down, with what was turned down and why) and **Risks** (the pull request says what could
  break and how someone would notice). They are what the ADR and blast radius stages wrote. Main has both on. An
  app with a list of its own is given them once, off.
- **Main is a checklist**: in one go, held to the app's requirements plus those two. A workflow that was "in one
  go" before there were kinds becomes a checklist at start: it is what it already did.
- **An independent agent checks**, not the builder: one that builds marks its own work done with the blind spots
  that caused the miss. It costs an agent run a round.

Not seen on a real task yet.

## A checklist task's page shows its checklist (Sandy, 2026-11-16: "does the left nav on a task page reflect the difference?" It did not)

A task on Main still had one Build row, "Sub-tasks, not planned", and its list was only on the pull request.

- **Under Build, a checklist task has a row for the list and a row for each stage** it goes through by itself:
  Build, Check, Probe, Tests. Each says where it is ("built in one go", "round 1: 2 not done, sent back",
  "the whole run passed"). A staged task keeps the Sub-tasks row it had.
- **The list has a page of its own** (`/tasks/:id/checklist`): every acceptance criterion and every requirement
  the workflow has on, with the check's mark and what it saw. Not done first. Reading only.
- One read gives both (`checklist.ts`, `GET /issues/:id/checklist`); `stagesOf` works the stages out from the
  task's sub-tasks and its last test run.

Not done: the folded nav (icons only) still shows the one build icon.

## A pull request is submitted by the person, never opened by itself (Sandy, 2026-11-16: "there needs to be a way to make sure a PR never gets ahead of a manual check"; "we should move to 'submit PR' as a button that needs to be pressed so that I can't ever have this happen")

What happened: on a real task of nine sub-tasks, the engine pushed the task's branch and opened its pull request
when the first sub-task landed: ready for review, not a draft, titled the engine's way and not the repository's,
before tests only the person could run. The repository's own rules ask for drafts and a set title. The person closed
it; had another sub-task landed, the engine would have opened a second one, because it only looked for an open one.
The build was paused by hand to stop that.

Decided:

- **Nothing leaves the computer while a task is built.** No push, no pull request, however many sub-tasks land.
- **Submit pull request** on the task's Sub-tasks page is the only way one opens. It is refused while sub-tasks are
  still to land. It asks once, saying it pushes the branch and that the team can see it from then on, and names the
  acceptance criteria not marked as met by the build. After it, each landing updates the pull request as before.
- **A draft, by default** (`setup.pr_draft`, off in Settings › Landing for a repository that wants them ready).
- **Titled by the repository's convention.** `setup.pr_title` is a template ({ticket}, {id}, {title}, {project},
  {n}, {of}; the team's ticket id when the task came from their tracker). A task can carry its exact title
  (`issue.pr_title`, migration 0034) for what a template cannot say: a change type, a team code. The task's agent is
  told to read the repository's rules and set both (`set_pr_rules`, `set_pr_title`) before the build starts.
- **Its text says how many sub-tasks have landed**, and that it is not ready to review while some have not.
- **Closed means closed.** A pull request the person closed is not reopened and no second one is opened; nothing more
  is pushed. Submitting again reopens that one, as a draft.
- **No agent can submit one.** There is no tool for it, and the task's agent is told never to push or open one itself.

Not done: a line in "needs you" when a task is built and waiting to be submitted (the task's agent says so, and the
task's page shows it); marking it ready for review from here; the same panel on a project's page for an app that
builds one pull request per project (the endpoint is there). Not tried: submitting against a real repository; the
engine is tested against a local remote for "nothing is pushed", and the calls to GitHub are not exercised in tests.

## The engine stays up when the database connection drops (Sandy, 2026-11-16: "engine down?")

The engine's process ended, for the eleventh time by its log, and nothing started it again: under `tsx watch` a
crashed process waits for a file to change. Every agent and page was cut off until someone noticed.

- **Cause**: the live feed (`GET /events`) reads the events table each time one is committed, in a promise nobody
  awaits. When the database connection dropped under that read (the proxy to Fly resets idle ones), the rejection
  had nowhere to go, and an unhandled rejection ends a Node process. First seen 2026-11-15; a fix was offered then
  and not built.
- **The feed catches it**: the read is logged and tried again from the same place on the next event.
- **A last resort for anything else** (`stay-up.ts`): an unhandled rejection is logged and the engine carries on,
  quietly when it is a connection dropping, loudly ("UNHANDLED REJECTION … a bug to fix") when it is not. The log
  is observed, so a real bug still surfaces.

## Decided: an app says where it is smoke tested (Sandy, 2026-11-17)

From an idea pasted for Self Evident's agent (kept as idea #1 of the Self Evident app): a person checks a build by
hand for what an agent cannot judge, while Self Evident watches. Talked through, not built.

- It is the built code, not the prototype. But real code sits behind sign-in and must not be tried in production
  as its users see it, so it needs an environment.
- A smoke test in the usual sense is on a deployed build with a test account. Two legitimate ways: a staging
  environment, or production behind a feature flag. A third for what is never deployed (a library): run locally.
- So an app has two settings side by side, where it is prototyped and where it is smoke tested, "and they can
  either be the same or they can be different" (SHAPE.md).
- Open: which Homework Gate is; how Self Evident watches a deployed build (its telemetry, filtered to the test
  account and the time of the test, looks better than a script in the page); screenshots of a 3D canvas.

## The smoke test, first slice: the step and a person's marks (Sandy, 2026-11-17: "lets build it")

Idea #1 of the Self Evident app; the shape is in SHAPE.md ("An app says where it is smoke tested"). Built: the
setting, the step for a task, and the marks. Not built: watching while they test, and testers through a link.

- **The app's setting** (`setup.smoke`, Settings › Prototype, under the prototype's own): here like its
  prototypes, staging, or behind a feature flag; for the last two an address, who to sign in as (in words, never
  a password) and the flag.
- **The checks are what the check after the build left to a person** (`smoke.ts`). The checking agent is now told
  to write those for the person: where to go (a path, or a story's id) and what to do there and what passing
  looks like. They become the step's instructions.
- **The step is a page of the task** (`/tasks/:id/smoke`), and a row in its nav under Build. Here: the built
  code beside the checks, started with one press, in a worktree of its own at the branch's head (a commit, on no
  branch) with the prototype's command and a database of its own. Staging or a flag: the address to open, and
  the same checks. It says which commit; a mark made before the branch moved says so.
- **Pass or Fail, then a note** (a fail needs one). It goes straight onto the criterion as the build's mark, by
  hand, with the note as its evidence and the commit. No conversation in between.
- **A task with a check waiting is built but not landed** (`heldForSmoke` in `runner.ts`): its project stays
  running, and it is on My Stuff as waiting on you. Only a checklist task.
- **When every check is marked**: what failed is sent back in one "Finish what the check found", with what they
  saw; it is built, checked again, and comes back to them with what they said last time beside it. Nothing
  failed: the task carries on to its end.
- The merge guide's record says "Checked by hand" or "Failed by hand" with the note.

Found while testing: a build that failed to start, whose failure could not be recorded (the database gone), threw
where nobody was waiting. It is caught and logged now.

Not seen on a real task. Not done: the smoke worktree is not removed when the task ends; a feature flag's test
comes after the merge, and the step does not yet wait there.

## A smoke test can be on a preview of the pull request (Sandy, 2026-11-17: "yes", on Bonkei's per-PR installable previews)

Bonkei's agent proposed pkg.pr.new: an installable build of the library for every pull request, and a link to a
fresh app running it. That is staging with an address of the pull request's own, which the setting could not say:
it took one fixed address.

- **A fourth place an app is smoke tested**: a preview of each pull request (`setup.smoke.where = 'preview'`). The
  app gives the address as a pattern with `{pr}` where the number goes; the task's page fills in its own pull
  request's (`previewUrl`). The same fits a site's preview deployments.
- Before a task has a pull request, its page says so, and that one is opened once the first of its work is merged.
- Nothing else changes: the checks, the marks, the hold. A check can already point at any address.

For Bonkei both are worth having: its Storybook, run here, shows how a diagram looks; the preview shows that it
installs and runs in someone else's app. Its agent's "smoke-test app" is an install test, not this.

## A step says it is under way before its work starts (Sandy, 2026-11-17: "if it is going to do research it should first mark that in the db … and then do it")

A step's page said "Not started" while its agent was working on it: the task's agent did the research and recorded it
once, at the end, and the engine sent the checks' agents out without touching their steps. The page looked like
nothing had happened yet.

- **The agents mark it first**: the task's and the idea's agents are told to mark a step started with `set_step`
  before any search, read or file, with a detail line saying what they are doing, and to change it as they go
  (`STARTED_FIRST` in `talk.ts`; the tool's description says the same).
- **The button marks it**: "Start with the agent" marks the step started ("Handed to the agent") as it hands it over,
  so the page says so at once and after a reload. Not the prototype's step, which follows its prototype.
- **The engine marks the checks**: each check is marked started ("Its agent is on it") as its agent is sent out. A
  check sent just before a restart now counts as recent, so it is carried on.
- **The page says it plainly**: started with nothing written reads "Its agent is on this", not "ask it".

Not done: telling a step whose agent stopped from one still working; a step stays "started" until it is recorded
done.

## A build that runs out of turns carries on (Bonkei's agent, 2026-11-17, passed on by Sandy: "A build that runs out of turns hands off instead of retrying")

BON-113, the first task built in one go, hit the limit of 60 turns ten minutes in. The engine called that a
failure: it used an attempt and started a fresh agent, which had to find out what was already done. The limit was
sized for a planner's small sub-tasks; in one go, one run is the whole task.

Bonkei's agent proposed closing the sub-task as far as it got and making a new one for the rest. Done another way,
for the same end with less lost: the engine can already resume a run's conversation (it does after a restart).

- **Resumed, not retried** (`carryOn` in `runner.ts`): the same agent, in its own conversation, with everything
  it had worked out, told it ran out of turns and to carry on. The attempt is given back. Three times at most;
  then it fails as before.
- **More turns to start with** (`turnsFor`): 200 for a build that is the whole task, 120 for the check, the
  finish, the probe and a fix; a planner's sub-tasks as they were. An app's own limit still wins.
- Found by its test: with several runs set aside on one attempt, the engine resumed the first again and not the
  latest. It takes the latest now.

Why not a new sub-task for the rest: it needs the agent's own account of what is left, which is the thing it has
just run out of room to give, and the new agent starts from nothing.

## A checklist task's graph shows its whole flow before it starts (Sandy, 2026-11-17: "we should always show the workflow in nodes before it starts … the build and then a line that would be going to like check or verify, and then one goes to probing … you could look at a graph or share that with someone, and it would be obvious")

A task built in one go had a graph of whatever sub-tasks existed so far, unjoined: nothing until the build began,
then a lone node, then another beside it when the check was added.

- **The flow is worked out whole** (`flowOf` in `checklist.ts`): the build, the check (and each round of finish
  and check again), the probe, the whole test run, and the smoke test when there is one. A sub-task that exists
  is its own node; a stage still to come is a node too, drawn dashed, with where it stands.
- **Each follows the one before**, so the graph is one line from the first look, and a node takes its stage's
  place as it is made. Shown on the build page even while the build waits for the brief's approval.
- **The sub-tasks themselves are joined now**: what the engine adds after the build depends on what came before
  it (the first check on every sub-task of the build; anything later on the last one), so the project's graph
  shows the same line.
- A staged task's graph is as it was.

## The first real smoke test, on BON-52 (Sandy, 2026-11-17: "Failed to resolve entry for package bonkei … and then a blank screen")

- **Cause**: BON-52 makes Bonkei a real package, entered at its built output (`dist/`); a fresh checkout has none,
  and the command that runs Bonkei did not build first. On main the package is entered at its source, so this
  had never come up.
- **Set right in Bonkei's settings**: its run command builds the package first (`run --if-present build`, so a
  branch without the script is unharmed). BON-52's smoke test was started again and its page loads.
- **A finding for BON-52**, not only a setting: after it merges, the playground will not run from a fresh clone
  without a build. The smoke test did what it is for.
- **Fixed here**: a check's "where" can be a place said in words ("the first pull request on GitHub"). "Go there"
  took it for a story's id and made an address that goes nowhere. It is shown as text now, and the button is only
  there for an address, a path or a story's id (`goable`).

## A check says when it can be done, and a draft pull request is opened by itself (Sandy, 2026-11-17: "have the option added … and have it the default, to do draft PRs automatically so that we can do proper smoke tests"; and Bonkei's agent, passed on: "each check should say when it can be done")

BON-52's one check for a person was "the preview comment's install line works". It was listed with the checks to
do here, on the built code, where it cannot be done: it needs the pull request, and there was none, because
since 2026-11-16 one is only opened when the person presses Submit.

- **Each check left to a person says when** (`builtWhen` on the criterion; the checking agent sets it): **here**,
  on the built code; **on the pull request** (a bot's comment, CI, a preview); **after it is merged** (a release,
  a deploy, a flag). The smoke test page groups them. One on the pull request cannot be marked until there is
  one; one for after the merge holds nothing. A check written before this is read from its own words (`whenOf`).
- **A draft pull request is opened by the engine, by default** (`setup.pr_auto`, on unless switched off; Settings
  › Landing), once the task is built, checked, probed and its tests pass: never on half a build (what went wrong
  on 2026-11-16), always a draft whatever the app's own rule for the ones it submits, and never reopening one the
  person closed. Marking it ready for review stays theirs. Off: the press, as it was.
- So the order is: build, check, probe, tests, **draft pull request**, then the person's checks, here and on it.
- My Stuff says which: "try it", or, with the automatic draft off and only pull-request checks left, "submit its
  pull request".
- No deadlock was there: Submit needs every sub-task landed, not the project called landed, and a waiting check
  only holds the second.

Not done: a check for after the merge becoming a to-do when the pull request merges.

## The smoke test's set-up is ours, kept out of the app's repository (Sandy, 2026-11-17: "we should be able to define a script, a smoke test script that gets run when you launch it … spin up an environment and then run a SQL file or something to populate a database"; "one main reason for doing this is to keep any of this stuff out of the code base because we don't want this stuff to be versioned or part of a code base that we're working with for a client … This is about us being able to test"; "stored in our env and could be in the db for cloud, local for local setup")

I first proposed a script file in the app's repo, versioned with the code. Sandy said no: the point is that none of
it is in the code.

- **Three things, in the app's settings** (Settings › Prototype › Smoke test, local kind): a **script** (any number
  of lines; else the prototype's command), a **stop script** (for what the script leaves running), and a **seed**
  (SQL of made-up rows). They are in the app's row, so in whichever database holds the app: the shared one, or this
  computer's for an app kept local. Nothing is written into a worktree or committed.
- **When it runs**: the seed is run on the smoke test's new database after its schema, and also put in a file under
  `~/.self-evident/smoke/<app>/` whose path the script gets as `$SMOKE_SEED`. The stop script runs on Stop and
  before a restart. **Start clean** on the smoke test page makes the database again and tells the script
  (`$SMOKE_CLEAN=1`).
- **Agents** read it with `smoke_setup` and change it with `set_smoke_setup` (asks first, like the prototype
  command). A build's brief says the set-up is not the repository's and to change it there, never on the branch.
- Secrets stay in the engine's environment and are read by name; none go in a script.

Not done: prototype scenarios are still JSON files in the repo (`.prototype/scenarios/`), which breaks the same
rule for a client's code; a history of the script so a bad edit can be undone; a one-press job that has an agent
write an app's first script; a requirement the check verifies ("the set-up still brings up what this change needs").

## A prototype's made-up data is ours too, kept out of the app's repository (Sandy, 2026-11-17: "we don't want that to be part of the repo. The purpose of the prototype is for us to test to make sure it's working, and then we have a way to share it … The prototype then is essentially getting thrown away, and then we're building the actual thing that's going to be in the PR")

Scenarios were JSON files committed on the prototype's branch (`.prototype/scenarios/<name>/<table>.json`).
Nothing merged that branch, but nothing stopped a build copying the folder across either.

- **Scenarios are rows in Self Evident's database** (table `scenario`: the app, a name, its tables of rows), so in
  whichever database holds the app. Saving one writes nothing into the worktree.
- **A scenario is a prototype's own, or shared with the app.** Its own go when the prototype is thrown away. A
  shared one can be loaded by every prototype and by the smoke test, which loads the app's shared `default`
  first, then the seed.
- **The agent** writes one with `prototype_data` (write: a name and its tables), keeps the current data (save),
  loads one (reset) and reads one (show). It is told not to put sample data or a `.prototype` folder on the branch.
- One still filed in a worktree from before is read; none is written.

Not done: removing `.prototype/` folders already committed on old prototype branches; a place on the page to see
and share an app's scenarios (the tool only, for now).


## The smoke test on staged tasks too (Sandy, 2026-11-17: "can we add it to the other ones, goes after subtask in the build section")

The smoke test was a stage of a checklist task only, and its checks were the criteria the check after the build left
to a person. A staged task (the older workflow, and every task started before the checklist existed) has no such
check, so it had no smoke test at all. Now it does: in the task's nav, in Build, after Sub-tasks. On a staged task the
checks are every acceptance criterion no agent has marked, plus the ones the person already marked by hand; "how we
will know" is shown as what to look for. A pass or a fail is the build's mark on that criterion, by hand, as before.
One an agent marked is not offered here; it is changed on the brief's page. The nav shows how many are still the
person's, or that one failed. Unmarked criteria on a staged task do not hold its project from landing, as they did
not before: only the list and the marks are new there.

## Keys persist, in a file on this computer (Sandy, 2026-11-17: "We need a way to store integration settings persistently. We can't have them having to keep readding them over and over again. I'm fine with only saving the name of the key, but the key needs to be somewhere that persists in a dot file within .self-evident, the name of the app")

Until now an integration kept only the name of its key's variable and read the key from the engine's environment,
so the key had to be exported in whichever terminal started the engine, every time. This changes "keys live only in
the engine's environment": they may now be kept on the computer.

- **Settings and the database still hold only the name** (`key_env`).
- **The key is kept in a file**: `~/.self-evident/apps/<the app's key, lower case>/secrets.env` for one app,
  `~/.self-evident/secrets.env` for every app (set from the workspace's integrations). Plain `NAME=value` lines,
  readable by this user only (0600, the folder 0700). It can be written by hand too.
- **Where a key is looked for**: the app's file, then the shared one, then the engine's environment, which still
  works. Linear (the tracker and the import), Confluence, and every integration's status and check read it this way.
- **Pasted once, never shown again.** Settings › Integrations has a box under Key: paste, Keep it. After that it says
  only that it is set, where from (this app, every app, or only the terminal) and its last four characters, with
  Replace and Remove. A key that is only in the terminal is said to be gone the next time.
- **Where it does not go**: not the database, not an event, not anything an agent is given, and not the environment
  of what the engine starts (prototypes, agents). It is outside the folder a handoff copies. An app's file follows
  the app when its key changes.

Not done: encrypting the file (it is a plain file only this user can read, like `~/.netrc`; the macOS Keychain would
be the next step); the API key an app's agents run on (`setup.account.key_env`), which is still read from the
engine's environment; refusing on a shared database (the file is on this computer either way).

## An app can have several smoke test set-ups, and each check names the one it needs (Sandy, 2026-11-17: "each question should be able to reference a specific setup … if you have five questions that need the same setup, you just reference the same one … Those setups then we need to have defined in settings")

The case: a library's pull request that asks for two things at once, its docs site to see it is accurate and a demo
app to see the library works. An app had one set-up, a check could not say which it needed, and a task could have
one thing running.

- **Set-ups have names** (`setup.smoke.setups`: a key, a name, a line on what is checked there, then where, script,
  stop script, seed as before; eight at most). An app that lists none has the one it always had, key `main`.
  Settings › Prototype › Smoke test edits the list.
- **The check after a build is given the list** when there is more than one, and names the set-up for each check it
  leaves to a person (`setup` in its verdict, `builtSetup` on the criterion), the same one for checks that need the
  same thing. None named, or one the app no longer has: the first.
- **The smoke test page shows one set-up at a time**, with only its checks. Each is brought up once, in a checkout
  and on a port of its own, so two can be up side by side (`smoke_run` is per task and set-up).
- Agents: `smoke_setup` lists them; `set_smoke_setup` changes one by key or adds one with a name.

Not done: a demo app that lives with Self Evident for a library whose repository must not get one (a script can only
run what is in the checkout); the checks on a staged task have no set-up, so all go to the first.

## The engine looks at what a prototype or smoke test listens on (Bonkei's agent, passed on by Sandy, 2026-11-17: "the only test is whether the app answers on $PORT. A second server the app starts on a fixed port, like Bonkei's viewer on 5174, passes that test while quietly sharing one server between every prototype")

- **Once it answers, the engine lists every TCP port its processes listen on** (`engine/src/ports.ts`, by process
  group). One it was not given is a stray: said above the prototype and beside the smoke test, returned to the
  agent (`strayPorts`, `strayNote`), and recorded once per run (`prototype.stray_port`, `smoke.stray_port`).
- **More than one port is handed out**: `$PORT`, and `$PORT_2` and `$PORT_3`, each free at every start, so a second
  server has somewhere to go.
- **An agent writing an app's commands is told** (`set_prototype_command`, `set_smoke_setup`): search for fixed
  ports first; each must come from the ones handed out; one that cannot be moved without changing the code is a
  task before the first prototype.

Not done: running two copies side by side and comparing; a server that leaves its process group (a container) is
not seen; nothing stops the start, it only says.

## Fix: a single smoke test set-up's "what is checked there" was written and never read (2026-11-17, found by an app's agent on another computer)

`set_smoke_setup` with `what` on an app with the one set-up it always had saved the line beside its other settings,
but reading the set-up back built it without that line, so it came back empty. Now it is read (and a name, when
given). Settings shows the field with one set-up too, and the smoke test page says it.

## The guide is part of a finished prototype (Sandy, 2026-11-17: "I want every prototype to have one, because it's how I and anyone I show it to know what to try")

A prototype on another app was started, reported done and could have been approved with no guide. Agents only heard
of the guide in connection with sharing: the prompt, the `set_guide` tool ("write one before or when a prototype is
shared") and the prototype skill's definition of done, which never named it.

- **Every prototype has a guide**, shared or not: what this is and that the data is made up, then steps in the
  order to try them, covering every acceptance criterion the prototype shows. It is point 7 of the skill's
  definition of done and part of its report; the prompt and the tool say the same.
- **The engine refuses without one.** A task's prototype step cannot be set done by an agent or approved by a
  person while its prototype has no guide (or a guide with no steps). The step says why on its page (`needs`), and
  Approve is off until it has one. A task with no prototype of its own is not held.
- **A data rebuild checks the guide again.** Once the prototype answers, each path is asked for; the ones that no
  longer open are kept on the guide (`stale`), said above the prototype and to the agent, and recorded once
  (`prototype.guide_stale`). Writing the guide again clears it. What happened: an empty rebuild ran the seed again,
  every row got a new id, and the guide's links pointed at rows that were gone.
- **The rebuild button offers a kept scenario**, not empty, when none is loaded ("default" first).
- The skill's rule that scenarios are rebuilt from `.prototype/scenarios/` was stale since earlier today: reworded
  to the rows `prototype_data` keeps. No other mention of those files is left in the skill or the prompt.

Not done: checking that the steps really cover each criterion (it is asked for, not verified); a guide whose
steps are all commands is not rechecked after a rebuild.


## The smoke test stays when nothing is left to check (Sandy, 2026-11-17: "I might want to look anyway … let it stay")

On a task whose every criterion the check verified itself, the smoke test row left the nav the moment the check
finished (it was shown only with at least one check for a person), which read as something breaking. Now it stays
once the task is built: "nothing left to you; look anyway". The page says an agent checked everything and where
its evidence is, and the built code can still be brought up, each set-up as usual.

## A project's graph links tasks in the order they were built (Sandy, 2026-11-17: "they should be hooked up in the order in which they were built … I have a running one in the project and then there's a bunch of already completed nodes coming from it")

The links between tasks were drawn by the order tasks are listed in. A task listed late but built early had its
finished nodes hanging off a task listed before it that was only now running.

- **Between tasks** (`orderEdges`): tasks that have started come first, by when their first sub-task started; the
  ones not started follow in their listed order, which is what they will wait on. Scheduling is unchanged
  (`impliedDeps`); this is only what is drawn.
- **Inside a task**: a sub-task added after the task was under way, with nothing recorded about what it follows, is
  drawn after the one added just before it. The check, finish and probe sub-tasks made before 2026-11-17 recorded
  nothing, so each was drawn as starting the task: five lines out of one node. Now a check comes from what it
  checked.

## Pressing a node in a graph opens that sub-task's build (Sandy, 2026-11-17: "click on a node and it should open up the node and be able to see the status and what the agent is doing … like I would if I was building something directly within VS Code")

The live view of a build existed (the build log tab: its status, the builder's steps, then everything it says,
runs, reads and changes, as it happens) but only an agent could open it. Now pressing a node in any graph (a
task's, a project's, an app's) opens it beside the graph. A step drawn before it exists has nothing to open. The
project page still shows the pressed node's detail under the graph.


## Smoke test checks link to where they are tried (Sandy, 2026-11-17: "smoke tests should have links to test like the prototype guides")

A conductor had to hand the person three addresses with the run's port typed in, because the checks on a staged
task named no place: only a check after the build recorded one, and a staged task has no such check. Now:

- A check with no recorded place takes the first path its own words name (`placeIn` in `engine/src/smoke.ts`:
  what was left for the person, how it is checked, the prototype's evidence, the statement). An address on this
  computer gives its path, since its port was another run's. File names and fractions are not places. A recorded
  place always wins.
- The view gives each check a `link`: that place on the address of the set-up it needs, while that is up or
  deployed. The page shows it on the check as a link that opens in its own tab ("/import ↗"), beside "Go there",
  which sends the view next to it. Before it is running the path is shown as words.
- `set_acceptance` takes `where` when a criterion is written and `builtWhere` when it is updated, and says to give
  one for anything a person checks by hand. Neither asks for the brief's approval again.

Not done: a criterion whose words name no path still has no link (an agent or the person has to say where); the
place cannot be edited on the smoke test page itself. Seen while testing, and failing on main as well: the
stacked pull requests test in `github.test.ts`.

### The view is a small browser (Sandy, 2026-11-17: "back buttons and an address bar … so I can type in an address or I can go back")

Where the built code runs here, the bar above it now has back, forward, reload and an address to type in (a path
of the build, or a whole address), as the prototype's view has. Back and forward step through where this page
sent the view: an address typed, a check's "Go there".

Not done: links pressed inside the built code are not seen (it is another origin), so the address bar does not
follow them and Back does not undo them. Following them needs the build served through a proxy of ours that
reports its address, as a shared prototype's guide is.

## What takes an agent a long run is the person's (Sandy, 2026-11-18: "Certain smoke tests are asking for things that probably take a long time for an agent to do. If that's the case, we don't have the agent do it, right? That's the whole reason for having the smoke test")

A builder on a docs task wrote a script that opened about 45 pages in a browser and ran it twice in the middle of
the build, 12 minutes each: more than half of the build's time, to show things a person would see at a glance
while trying it. Nothing told it not to. The check left an item to a person only when an agent could not judge it.

Now every builder, the check and the probe are told the same thing (`LEAVE_LONG_RUNS`, `engine/src/verify.ts`):

- What would take more than about two minutes of running to show (every page in a browser, a whole journey,
  every size or device) is not run and no script is written for it. One or two cases, then it is left to the
  person, with where they look.
- The check gives such an item `met: null`, so it becomes one of the person's smoke test checks.
- A command that takes minutes is not run a second time to see a fix.
- The probe keeps each try to a minute or two and sweeps nothing.

It is wording only: nothing measures how long an agent's command ran or stops one. Not done: the engine noticing
a builder's long command and saying so in the build; a criterion saying up front that it is the person's.

## Smoke test: main beside the build, and an agent's try of one check (Sandy, 2026-11-18)

### Compare with main ("spin up a comp setup that uses main instead of whatever I'm building … so I can look at the two side by side"; "start with smoke test first … running it on a different port both at the same time")

A running local smoke test has **Compare with main**. It brings the same set-up up a second time, from main, on a
port, a worktree (`smoke--<task>--main`) and a database (`smoke-<task>-main`) of its own, with the same seed. The
two views sit side by side and follow one address bar, so a check's "Go there" shows the same place in both.
Stopping the build stops its comparison; restarting the build leaves it up.

- "main" is the commit where the build's branch left the default branch, not today's tip (mine to choose; said to
  Sandy first). The only differences on screen are then the build's own.
- A seed that names what only the build has (a new table) does not stop main coming up: its log says what did not
  load.
- Its run is kept in `smoke_run` under the set-up's key with `@main` after it. No migration.

Not done: the prototype's comparison (smoke test first, Sandy's word); staging and feature-flag set-ups, where the
comparison is an address, not a server; today's main as a second choice.

### Ask an agent ("a button that triggers the agent to do a test of it and gets their result. That doesn't pass it, but it gives us their result since we're no longer doing that as part of the regular workflow")

Each check has **Ask an agent**. One agent, in the smoke test's own checkout, tries that check against what is
running and says holds, fails or could not tell, with a line on what it saw. That is kept on the criterion
(`tried`) and shown beside the check; Pass and Fail stay the person's, and nothing is sent back by it. Six minutes
at most; it can read and run commands, and cannot edit. A try made on an earlier commit says so.

Not done: watching the agent work while it tries (only the result is shown); asking for every check at once; a try
lost to an engine restart is forgotten, not resumed.

### Each view has its own bar when main is up (Sandy, 2026-11-18: "when main spins up we need to split the address bar and back and refresh")

With main beside the build, each view has its own back, forward, reload and address, and goes its own way. A
check's "Go there" still sends both to the same place. With no comparison the one bar is as it was.

## Smoke test: a terminal, for checks that are commands (Sandy, 2026-11-18: "we need to have a way to do tests of things like installing etc. for that the smoke env would be a temp folder on the machine and a terminal where it runs commands and you see it working")

Some checks are commands, not pages: that the docs install the packed package and not the source, that the library
installs in a new app. Asked which, Sandy chose a **real terminal** (not run-and-watch) and **both folders, set per
set-up**.

- **A set-up can be a terminal** (Settings › Smoke test › Where: "In a terminal"; an agent sets it with
  `set_smoke_setup`, `where: terminal`). Its folder is the build's checkout, or a new empty folder outside every
  repository that is thrown away when the terminal is closed. Its script, when it has one, is typed in at the start,
  so it is seen working. `$SMOKE_BUILD` is the build's checkout; `$SMOKE_URL` the build's address when one is up.
- **A set-up tested here has one too**: "Terminal" in its bar opens a shell in its checkout, under the view.
- **A check's command is a button.** A command in backticks in what a check says to do runs in the terminal with a
  press, once one is open. The check after a build is told to write commands that way.
- It opens when asked, never by itself. Coming back to the page shows what was said before.

How: `node-pty` for the shell and `xterm.js` for the page (what VS Code uses for both); `engine/src/smoke-terminal.ts`,
`app/src/components/SmokeTerminal.tsx`. What is said goes to the page as an event stream and what is typed comes
back as posts, like everything else here; no web socket.

It is a shell on this computer that a browser can reach, so:

- its routes take requests from Self Evident's own page only (the request's origin must be this computer or
  `UI_URL`; anything that types must be sent as JSON, which another site cannot do unasked). An app's Storybook,
  framed under `sb-<port>.idea.dawn`, is refused;
- it starts without the engine's own secrets (the database address, Linear, PostHog, Doppler, Anthropic).

`node-pty`'s helper comes without its execute bit when pnpm does not run install scripts; the engine sets it before
the first shell.

Not done: an agent's try ("Ask an agent") using the terminal; a record of what was run; a terminal on a prototype;
terminals are lost when the engine is started again.

### The terminal before it is started, and a throwaway one always (Sandy, 2026-11-18: "the terminal should be available before starting the smoke env. It may be we want to test starting it... Also I think we always want access to a terminal pointed at a temp throwaway folder")

- A set-up tested here has its **Terminal** button above the view whether or not the build is running: its checkout
  is made at the branch's head when there is none yet, so starting it by hand can be tried.
- Every set-up has a **Scratch terminal** beside it: a new empty folder, thrown away when it is closed. A deployed
  set-up has it too. A terminal set-up whose own folder is already a new one does not get a second.
- Both open under the view and can be open together. A check's command runs in the set-up's own terminal when it is
  open, else in the scratch one.

The scratch terminal is kept under the set-up's key with `@temp` after it (`scratchKey`).

## A new prototype's server waits for its agent (Sandy, 2026-11-18: "it seems to want to open the prototype right away, before the agent has had a chance to actually set up the work tree, and it ends up failing … it should just wait until the prototype agent has gotten started and set something up")

A prototype made with a brief (so an agent builds it at once) no longer has its server started with it: the worktree
is the default branch as it stands, with nothing set up, and the start failed. The agent is told it is not started
and starts it itself (`run_prototype`) once there is something to run. Until then the Prototype tab says its agent is
setting it up, with "Start it now" for the person. One made with no brief starts at once, as before.

Not done: a prototype with no screen and a brief shows the same "setting it up" line until it has a guide.


## The page from a phone, over Tailscale (Sandy, 2026-11-18: "could we have a mobile version that works not on the machine where this is running" … "So let's set up Tailscale then.")

Decided: a private network, never a public address. The page has no sign-in and can start agents and open a
terminal on the computer. Tailscale's Personal plan is free; `tailscale serve` gives the page an https name only
Sandy's devices can open. The page's server now answers to `.ts.net` names. How: docs/running-it.md, "From a phone".

Not done: screens made for a phone (what needs you, conversations, approvals, smoke marks); the views and the
terminal, which stay on the computer.

### Who has it open, and a code to scan (Sandy, 2026-11-18: "it works, we need some indicator that shows that a phone is connected" and "a button to send the link to the phone")

The rail has a 📱 above Settings, shown only when the page is served over Tailscale or a device is here. Hover: a
code to scan with the phone's camera (WhatsApp Web's way), the address, and Copy. A green dot and the device's name
while another device has the page open (Figma's "who else is here"). A device is here while it holds a live feed;
the engine tells it from the address `tailscale serve` adds to the request and names it from Tailscale's own list.
In memory only. `GET /api/devices`. The code is drawn by `qrcode.react`.

Not done: sending the link by message; a notice when a device joins; the smoke terminal from the phone.

## Steps, stages and probes: what was decided (Sandy, 2026-11-18, from CEB-79: "Builders … have no Skill tool and no step skills … every commit still came out as `feat(CEB-84): ...`"; then "let's do it. Probes and checks don't change code. They can create additional subtasks … or steps")

Found on CEB-79 (enterprise-dashboard, Main): the repository had a naming skill and no builder could use it; branch
and commit names came from the engine; skills could be chosen only for the steps before the build; only an app's first
repository's skills were offered; Settings › Skills was a flat list. Decided, to be built in slices:

- **A step has stages, each with an owner**: prepare (the engine: worktree, branch, inputs), do (the agent), verify
  (the engine: probes), report (the agent, in a fixed form). A step lists only the stages it has. Skills attach to a
  stage an agent does; probes attach to verify.
- **Probes and checks do not change code.** They report pass or fail with evidence, and what they find becomes a
  sub-task (or a step) for a builder. Today's "try to break it" fixes small things itself; that goes.
- **One list of what every change is held to.** A requirement (judged by the check's agent) and a probe (a command
  the engine runs, a skill run as a reviewer, or a built-in) are the same kind of thing with a different way of
  being verified.
- **Replace, do not add** (Sandy: "make sure that we're not just adding on, that we're actually removing the way we
  were doing things, so that the UI doesn't get overly complicated in the setting"). The new Skills page takes the
  place of "Skills by workflow step", the skills by job and the requirements list under Landing; it does not sit
  beside them. Each slice removes what it supersedes.
- **A name is checked where it is made**, not after: a commit as it is committed (below). The branch and the pull
  request's title are the engine's own, from the app's templates, so checking them afterwards would prove nothing.
- The prompts keep their words (nearly every line has a dated reason); a step's contract fills in around them.
- A skill attached and not invoked stops the agent from finishing once (a Stop hook), then is flagged; whether it
  was followed is a probe's to say. Builders get skills, never a plugin's tools.
- A second repository's skills come through what already pulls skills from a repository (`skill-sources.ts`), kept
  per app, not a second mechanism.

Order: names (this entry), the Skills page as a story, probes, skills on stages.

### Slice 1: the repository's names for branches and commits (`engine/src/conventions.ts`)

The cause of `feat(CEB-84)`: a builder was told only "You are building CEB-84 … a sub-task of CEB-79" and "commit with
a clear message". CEB-84 is our number for a sub-task; the task's ticket was known only to the code that titles the
pull request.

- **Every builder is told the ticket**: the team's when the task came from their tracker, else our task id, and that
  the sub-task's number is ours and goes in no commit, branch or file. With no convention set it is told to commit
  the way the repository's own commits are written.
- **Commit message** (`setup.commit_format`, Settings › Landing, beside the pull request title): the first line, like
  `{type}({ticket}): {subject}`. The builder is told it with the ticket filled in, and every commit an agent makes is
  held to it as it is made: `{type}` is one lowercase word, any other name in braces any text, the rest exact. A
  commit that does not fit is refused with the format, and the agent rewords it. It is a git `commit-msg` hook in a
  folder of ours (`~/.self-evident/hooks/`), named to git through the agent's environment only: nothing is written to
  the repository or its config, the engine's own git is not checked, and the repository's own hooks (husky and the
  like) still run, each passed on to. One setting, not a format and a pattern: which types are allowed is the
  repository's own hook's to refuse.
- **Branch name** (`setup.branch_name`): a new task's branch, like `feature/{ticket}-{title}`. Given once, when the
  task's branch is first cut, and kept on the task (`issue.branch`, migration 0038); a task already building keeps
  the name it had, and with no template, or one git would not take, the name is the engine's as before.
- **`set_pr_rules` sets all three** (title, branch, commit) from the repository's rules, so nobody types them.

Not done: the engine's own "Commit remaining work (engine)", made when an agent leaves changes uncommitted, is not in
the format; merge commits are let through as they are; a branch template applies to one pull request per task, not
to a project's single branch; no way yet to give one task an exact branch name, as `set_pr_title` does for a title.

### Slice 3: probes (`engine/src/probes.ts`; Sandy, 2026-11-18: "Yeah, we'll do main only"; "Probes and checks don't change code. They can create additional subtasks")

For a task on Main, what follows the check is no longer one agent that tries to break it and cleans up. It is the
app's probes, one shape for all: a name, what it runs, whether a failure blocks, and a result of pass or fail with
evidence, kept on the task (`issue.probes`, migration 0039; event `task.probed`).

- **Three kinds.** A command the engine runs itself on the merged work (exit 0 passes): the app's test command is
  one, and an app adds its own (lint, a type check). A skill run as a reviewer: a fresh agent that invokes that one
  skill and reviews the change by it. Built in: **Try to break it** (blocks) and **Comment discipline** (reports).
- **A check and a probe change nothing.** Their agents have no tool that edits, and anything left in the worktree is
  thrown away at landing, never committed. "Try to break it" used to fix small things and commit; it no longer does.
- **What they find goes back in one sub-task.** Each agents' probe runs once ("Probe: …"); when all have, what the
  blocking ones found is sent to a builder together ("Fix what the probes found"), and only the probes that failed
  run again. Three rounds, then a person. One that only reports, or could not be run, holds nothing.
- **Commands run last**, each once (the test run twice before it is called failed, as before), and a blocking failure
  is sent back as before ("Fix what the whole test run found", two at most), now with every command that failed.
- **An app's probes** are `setup.probes`; its agent sets them with `set_probe` (a command or a skill added, a built-in
  switched off or to report only). A client's own requirement is a probe, not a step.
- **The record says which skill was used**: a run's `Skill` call is logged with the skill's name (it kept only the
  input's keys before).
- **Removed**: `probeBrief` and the "Try to break it, and clean up" sub-task (`verify.ts`). A task that already had
  one is not probed again by the built-in two. Legacy is untouched: its criteria checked once, then the test run.

Not done: probes are not in Settings yet (the Skills page, slice 2's story, is where they go; until then `set_probe`
or the setup JSON); a task's page shows them only as sub-tasks, not as results; requirements are still a separate
list, judged by the check; a skill probe works for a skill the app's conversations already have, so a second
repository's skills are not reachable yet; a probe whose agent gives no verdict is recorded as not run and holds
nothing; no naming probe (names are checked where they are made, slice 1); nothing here has run on a real build.

## Settings › Skills as steps, stages and probes: the story (Sandy, 2026-11-18: "Redesign Settings › Skills around this: each step with its contract and stages, what's attached to each stage, and the probes, so a person can see at a glance what will happen and where")

The page is drawn before anything behind it is built (`app/src/components/StepContracts.tsx`, three stories, made-up
data). After GitHub Actions' run view and Linear's workflow settings.

- **Each step is one line**, in the order it happens, with what is attached and where ("Do · ticket-naming-convention",
  "7 probes"). Opened, it shows what it needs, what it leaves, when it is done, then its stages.
- **A stage says who runs it** (the engine, an agent, you). Skills are added only where an agent works; probes only
  where the engine verifies. A step lists only the stages it has.
- **The build has one Verify**, and Check, "Try to break it" and Tests are probes in it, beside the app's own: a
  command, a sentence judged, a skill run as a reviewer, or one built in. Each blocks or only reports.
- **A reading view**: nothing to press until someone means to change it.

It is the proposal for the page, to be agreed before the engine is built to it. Not done: it is not in Settings yet,
and nothing reads or saves it; when it goes in, "Skills by workflow step", the skills by job and the requirements
list under Landing come out.

### Slice 4: Settings › Skills is the steps page, and builders get skills (Sandy, 2026-11-18: "The skills page … hasn't changed at all. It still says like blast radius")

- **The page is in Settings.** An app's Skills section is its steps (`StepContracts`), drawn from the engine's
  contracts (`engine/src/contracts.ts`, which the web UI imports): only the steps the app's default workflow uses, so
  an app on Main lists no blast radius or audit; then the build and the smoke test. Read until **Change** is pressed.
- **Taken out**: "Skills by workflow step", the skills by job, and the requirements list under Landing, with the
  components that drew them. What an app chose for a job (`setup.skills_by_job`) is still honoured by the engine;
  there is no longer a place to set it per app (All apps › Jobs remains).
- **One list of what a build is held to**, on Build › Verify, in the order it is verified: the acceptance criteria,
  the app's requirements (judged by the check's agent), the agents' probes, then the commands. Each is switched on or
  off; a probe blocks or only reports; the app's own are removed; one is added as a command, a skill run as a
  reviewer, or a sentence to judge. A requirement the workflow switches says so and is not switched here.
- **The build takes skills** (`setup.step_skills.build`, Build › Do). Every builder of the app gets the Skill tool
  with those skills and no other, and is told to invoke each before it changes anything. The run records which it
  used and which it did not (event `run.skills`). Only skills the app's agents have are given.
- A skill is attached to a step's Do stage, which is the one stage of a step an agent's skills apply to; the other
  stages are the engine's or the report's fixed form.

Not done: a builder that does not use an attached skill is recorded, not stopped (no Stop hook yet); a requirement
cannot be reworded in place (remove it and add it again); the page follows the app's default workflow only, not a
second one; a second repository's skills are still not offered; builders' skills have not run on a real build.

## The page on a phone: one press starts it, and stops it (Sandy, 2026-11-18: "that should be a button that starts it no?" … "starts and stops that?")

Setting a second computer up was a terminal command. Now the rail's 📱 shows wherever Tailscale is installed:
**Open on a phone** runs `tailscale serve` for the page, **Turn off** takes it off. If the account has not allowed
serving, the panel links to where to allow it. Tailscale installed but signed out says so. Both buttons answer only
to the page on the computer itself (`POST /api/devices/serve`, `/serve/stop`), never to a phone or another site.

Not done: installing Tailscale from here (it needs the computer's password and an account).

## A sideways swipe does not leave the page (Sandy, 2026-11-18: "two fingers swipe left and right doesn't move back and forward in Chrome because it disrupts tests going on in prototype and smoke tests")

The page sets `overscroll-behavior-x: none` on its root (`app/src/app.css`), which is how Chrome is told not to turn a
two-finger swipe sideways into Back or Forward. Scrolling sideways inside anything that scrolls is as it was.

Not tried with a real swipe (a trackpad gesture cannot be driven from a test). Not covered: a prototype or smoke test
opened in a tab of its own, which is that app's page and not ours; Safari, which ignores this for its own swipe.

## A project is closed by a person, last (Sandy, 2026-11-18: "a close button on projects that can only happen once the pull request has been merged and everything has been checked or skipped")

The engine calls a project **landed** by itself, when its last sub-task is in: before anyone has merged anything, and
before the checks that can only be made after the merge. **Closed** is new, the person's, and last (`engine/src/close.ts`,
status `closed`, migration 0040).

- **Close project** is on a landed project's page. It can be pressed once every pull request of the project is merged
  and every check left to a person on its tasks is passed or skipped. Until then it is there and cannot be pressed,
  and the page says what it waits on ("Pull request #31 is not merged.", "SS-4: 2 checks of yours are not passed or
  skipped."). A check failed by hand holds it too.
- **A check can be skipped** (the smoke test, beside Pass and Fail): the person's choice not to try it, with a reason
  if they give one. It stops waiting for them and is recorded as skipped, never as passed ("Skipped, not tried: …").
  One for the pull request can be skipped before there is one.
- A closed project is over like a landed one: no new tasks, no planning, out of the open lists, with its own filter
  on Projects. To Linear it is completed, as landed is.

Read two ways and built as the first: "everything checked or skipped" is the checks left to a person (the smoke
test), the only things a person checks on a build; and "the pull request" is every pull request of the project, one
per task where that is how the app builds.

Not done: a task on its own (a solo project) has the same button only on its project page, not on the task's; a
closed project cannot be opened again; nothing is tidied at close beyond what landing already tidied; a closed pull
request that was never merged holds the project open, and the way out is to cancel the project.

## Closing is a task's, and it is what makes a task done (Sandy, 2026-11-18: "This is about closing tasks, not projects"; asked what Close does: "Close makes it Done"; and of the button put on projects by mistake: "Remove it; projects close themselves")

This replaces the entry above ("A project is closed by a person, last"), which read the request as about projects.

- **A merge no longer marks a task Done.** Until now a task went from In review to Done by itself the moment its
  pull request merged (`github.ts`, `mergedDone`, taken out), with checks of the person's still unmarked. BON-50 and
  BON-51 were Done with 22 between them. Now it stays In review.
- **Close task** is on a built task's page, and pressing it is what makes the task Done (`engine/src/close.ts`). It can
  be pressed once the task's pull request is merged and every check left to a person on it is passed or skipped.
  Until then it is there and cannot be pressed, and the page says what it waits on. Marking a built task Done any
  other way is held to the same rule.
- **Skip** on a check stays as built (the entry above).
- **A project has no Close button.** One that has landed is closed by itself when its last task is closed
  (`settleProject`); the status `closed` and its filter on Projects stay.
- **Once, at start**: a task marked Done by a merge, in a project still running, on a checklist workflow, with checks
  of the person's unmarked, is put back In review so it can be closed (`reopenUnclosed`). Nothing in a project that
  has landed or stopped is touched.

Not done: nothing tells the person a merged task is waiting to be closed (it is not under "needs you"); a closed task
cannot be opened again from its page; a task whose pull request was closed without being merged cannot be closed,
only canceled; Linear now sees such a task as In review until it is closed, where it saw Done at the merge.

## What a build is held to can be edited, and anything on it can report only (Sandy, 2026-11-19: "there is currently no way to edit a record, in the verify section, and there is no way to set blocks or reports")

Settings › Skills, Build › Verify, while changing:
- Every row but the acceptance criteria has a Blocks / Reports choice, in place of a badge that was a button nobody
  could tell was one. A new probe has the same choice as it is added.
- A judged one (a requirement) can report only too: `blocks: false` on the requirement. An unmet one is still marked
  on the list and the pull request, and the build is not sent back for it nor counted as stuck.
- The app's own (a command, a reviewer skill, a judged sentence) has Edit: its row becomes its fields, name and what
  it runs. Its key and kind stay, so results already recorded still belong to it. The engine's probes and the test
  command (Landing) are not edited here.

## An app's main on this computer follows GitHub past a person's edit, and says so when it cannot (Sandy, 2026-11-19: "we need to make pulling merged PRs to the local main happen when it detects that the PR is merged on github")

The pull was already there (2026-11-15): every sync fetches the default branch and fast-forwards the checkout's own
copy, in the same pass that sees a pull request merged. What was wrong, found on Bonkei: its main was 100 commits
behind after three days of merges, because one tracked file had an edit that was not committed, and any such edit
made the pull step aside without a word.

- A change that is not committed no longer stops it. In a file the new commits do not touch, git moves around it. In
  a file they do touch, the change is set aside and put back on top (git's own autostash), only when that is known
  beforehand to go cleanly (asked of git without touching a file) and nothing is staged. The person's change is
  never dropped and never left with conflict marks.
- When it cannot move (the change would collide, main has commits of its own, main is open in another worktree), it
  is said once, under what needs you: the app, how far behind, why, which files, and the folder. It is unsaid when
  the checkout catches up. Events `checkout.behind` and `checkout.pulled`, on the app.

Not changed: the checkout the engine itself runs from (Self Evident's own) is still never pulled by the sync, since
new engine code restarts the engine and cuts off what is building. Only an app's first repository is followed.

## An app's settings are saved a key at a time (found on Cloaked, 2026-11-19)

Setting Cloaked up, two requirements and the skills on a step vanished after being saved. The Settings page saved the
whole settings object as it was when the page loaded, and each agent tool rewrote the whole object from its own
read: whichever wrote last wiped the other. Now every writer sends only what it changes and the engine merges it
into what is saved at that moment, under a lock on the app's row (`setup.ts`, `patchSetup`): the page (`PATCH
/apps/:id`, where `setup` is now the changes, null removing a key) and the tools (`set_probe`, `set_pr_rules`, the
smoke and prototype set-ups, the report format). After a save the page takes the settings back from the engine, so
what changed elsewhere shows.

## Decided next for what a build is held to (Sandy, 2026-11-19: "still feels like we have too many rigid settings that should be defaults that you override or extend"; "This sounds good")

Not built yet; in this order after the save fix above.
1. One list, layered: a thing a build is held to is one kind of record (name, how it is judged, blocks or reports,
   on or off). The engine ships defaults; the app, the workflow and the project each keep only their differences.
   Requirements and probes stop being two stores.
2. Override in place: a row set by a workflow says so ("from Main") and can still be changed on the app's page, with
   a way back to what it inherits. Only the acceptance criteria stay fixed.
3. Tests is an ordinary command probe, edited in the list; the field under Landing goes.
4. The defaults are worded for any repository (telemetry is "the way this repository already does it").
5. One agent tool that makes every change the page can (judged ones, skills on a step, the test command).
6. Trying a change. A command is run once on a build known to be good as it is added, to show the command itself
   works. And a change to the probes can be A/B tested: the changed probe is run on past merged tasks and its
   verdicts are shown beside what happened to each, kept with the change it tested. Offered, never required
   (Sandy: "It's not required, but we would have, we have the setup to do it"). Probes replay safely because they
   change nothing; a skill on Do would need the task built twice, which is not part of this.
7. The pull request's title follows the commit format's rule: the engine fills what it knows, the builder the rest.

## One list of what a build is held to, in layers (built 2026-11-19; items 1 to 5 of the entry above)

- `engine/src/held.ts` is the list. The engine ships its two probes and six sentences. An app keeps only its
  differences (`setup.held`): a switch or a rewording of one the engine ships, or one of its own. A workflow, then a
  project, switches a sentence for its own tasks. `requirementsOf` and `probesOf` read from it, so the planner, the
  check and the runner did not change.
- The two stores there were (`setup.requirements`, a whole copy; `setup.probes`) are moved to `held` once, at engine
  start, and are read correctly until then. A copy of a default is the default again, so those apps now follow the
  engine's wording; a rewording is kept; a default an app had deleted is back on its list, switched off.
- Telemetry no longer says OpenTelemetry: "can be seen afterwards, the way this repository already makes things
  seen". An app says how (Cloaked: Datadog and PostHog) by rewording it.
- Settings › Skills: nothing is greyed but the acceptance criteria. A row its workflow switches says "from Main" and
  is switched for that workflow there, or left to the app again. A row the app changed has Reset. The engine's
  sentences can be reworded. The test command is the Tests row (Set, Edit, clear); its field under Landing is gone.
  `setup.test_cmd` is still where it is kept, because landing reads it.
- The page sends its changes to the list one by one (`held` on `PATCH /apps/:id`), applied by the engine to the list
  as it is then: the last place where a stale page could undo an agent.
- Agents: `set_held` takes the same changes the page makes (it replaced `set_probe`), and `set_step_skills` puts
  skills on a step. An agent can now set an app up without handing anything back.

Kept apart on purpose: a sentence and a command can both be called `tests`, so a sentence's id on the list is
`req:<key>`. A workflow or project switches sentences only, not commands or reviewer skills.
Not built yet: trying a command as it is added, the A/B of a change, the pull request title rule (6 and 7 above).

## The pull request's title follows the commit format (built 2026-11-19; item 7 above)

A title template can name what the commit format leaves to the builder (`{type}{scope}[{ticket}]: {title}`). Those
parts are read back from the branch's first commit that follows the format, so the title opens as
`feat(scan)[ENT-481]: …` with nobody writing it by hand. One that cannot be read is left out, never invented.
`set_pr_title` still sets an exact title for one task.

## A change to what a build is held to can be tried on past work (built 2026-11-19; item 6 above)

Sandy: "these setting changes are really sort of core to the way you build for an entire project, so I think it's
worth having … an A/B test … that gets linked to changes"; "It's not required, but … we have the setup to do it";
and "go" to: the last five merged tasks, the result kept with the change and shown under its row, agents too with
the cost said first.

- Try, on a row of Build › Verify while changing: the probe as the row shows it (saved or not yet) is run on the
  app's last five merged tasks, each at its merged commit in a scratch worktree (`engine/src/trials.ts`). The
  checkout is not touched and nothing is changed: a probe only reads and runs.
- What it said is kept with the probe as it was then (`probe_trial`) and shown under the row: "Tried on 5 merged
  tasks: 4 pass, 1 fail", opening to each task. Reworded since: "before it was changed". All five were merged, so a
  fail is the probe disagreeing with what was shipped.
- A command costs nothing. A reviewer skill, a sentence or one of the engine's own is an agent run per task: the
  button says so ("Try (5 agent runs)") and the trial records what it cost. A sentence is judged on its own in a
  trial; in a build the check's agent judges it with the rest of the list, so the two can differ.
- Agents have the same as `try_held`, and are told to say the cost before trying one that needs agents.
- One trial at a time for an app. One cut off by a restart is marked stopped.

Not built: choosing which tasks (it is always the latest five with a pull request of their own; a project with one
pull request for all its tasks has none to try on); trying a skill put on Build › Do, which would mean building a
task twice; running a command by itself as it is added (Try is pressed, or an agent calls `try_held`).

## What is judged by eye is the person's, what CI runs is CI's, and no step runs either (Sandy, 2026-11-19: "visual checks should be signed off on, not automated I think, we have the automated version we can trigger from the smoke test if we want. this is a probe and ci/cd issue")

Found on BON-204 (Bonkei): the step that tries to break a change ran the repository's whole docs smoke, every page
in Chrome, about fifteen minutes. BON-197's first criterion read "the whole docs smoke passes", and that step was
told to try each criterion "start to finish", which beat the rule about long runs.

- One rule, said to the builder, the check and the step that tries to break it (`EYES_AND_CI`, verify.ts): what is
  judged by eye is signed off by the person in the smoke test, where the repository's own automated version can be
  run if they want it; what the repository's CI runs on the pull request (its smoke, end-to-end or browser suite,
  anything a criterion says a CI job will show) is CI's. An agent's step runs neither, and says what it left to whom.
- The check leaves such a criterion to the person: by eye, to try here; CI's, on the pull request, naming the job
  to see green.
- Trying to break it is using what was built, in short scenarios. A criterion proved by a suite, a CI job or a
  person's eye is not a scenario.

A visual or browser suite in the build is a setting, never an agent's choice (Sandy, same day: "if we want to set
a visual test as a probe, we could do it, but it should be something that we … set as an option in the settings").
It is a command on the list of what a build is held to (Settings › Skills, Build › Verify, Add a probe: for Bonkei,
`pnpm docs:smoke`), set to block or to report. The engine runs it once on the merged work, and the app has chosen
the minutes it takes. Left off, it runs only in CI and when the person runs it from the smoke test.

This is wording, like the long-run rule before it: nothing cuts a command off. A limit on how long one command may
run in a step that only reads is the next thing if an agent does it again.

## Build shows the smoke test and what is closed, and can be listed by project (Sandy, 2026-11-19: "when I go to build tab, I am not seeing tasks that are at the smoke test stage and I don't see a closed section. I think build should also have projects so you can see it organized")

Build's list called a task "Landed" as soon as every sub-task was in, with its pull request still open and the
person's checks untouched. So everything built sat in one list that said it was over. First said as "Build should
only show landed if the task is closed, if it is merged it should say that but it needs to be closed to be landed".
Since Close (2026-11-18) a merge leaves a task In review and Done is the person's, and the list now says the same:

- **Smoke test: yours to try, then close**: every sub-task is in. The row says what it still waits on, in the Close
  button's own words (its pull request not merged, checks of the person's not passed or skipped), and leads to the
  task's Build section. With nothing left it says so, and the button reads "Close it".
- **Closed**: the task is closed (Done), and nothing else puts a row there. Folded, with a count.
- **By stage / By project**: the same rows under their projects, each with its stage as a badge; tasks that are a
  project of their own come last, and a project whose tasks are all closed is folded away. The choice is kept in
  the browser.

The word "landed" is gone from this page. The rule is `phaseOf` in `engine/src/now.ts`; what a task waits on is
`waitsOf` in `close.ts`. A project's own "landed" status (its work is merged; "closed" when its last task is) is
unchanged, and still shows on the project lists.

## A check says when it runs: every build, on the pull request, or nightly (Sandy, 2026-11-19: "I feel like this should be a nightly check or something"; "can self evident allow this configuration?"; "great lets do that")

Bonkei's CI ran its whole smoke, the every-page docs run included, on every pull request. The usual answer is a
nightly build: fast checks on each pull request, the slow suite on a schedule on the default branch. Self Evident had
no way to say it: a command on the list of what a build is held to was run on every build, and a criterion could be
left to the pull request's CI or to a person, never to a run that happens later.

Decided:
- **The schedule is the repository's** (Sandy: "the schedule would be set in github and we would just be able to
  select it"). A workflow with `schedule:` in `.github/workflows/` runs it. Self Evident runs nothing overnight and
  writes no workflow; it would only work while this Mac is on.
- **A command of the app's own says when** (`when` in held.ts): every build (as before); on the pull request, where
  it is a check of the repository's CI and names that check; or nightly, where it names the workflow's file. In
  Settings › Skills, Build › Verify, the form has "When it runs", and the check or the workflow is picked from the
  ones the checkout has (a nightly one from those with a schedule).
- **Neither of the last two is run in a build.** The check after the build is told what is left to each, so a
  criterion one of them proves is left with "when" pr or nightly, naming it.
- **Left to the pull request and blocking**: a task is not closed while that check is failing there (from the pull
  request's checks the sync already keeps).
- **Nightly only reports.** There is nothing left to block when it runs, so the choice is not offered. A criterion
  left to it is listed in the smoke test under "Left to the nightly run", nobody is asked to try it, and it does not
  hold Close.
- **A red night is said once and shows under what needs you**, on the home page and on top of Build: the check, how
  many runs in a row, the run on GitHub, and the tasks merged since the last green run, since one of them broke it.
  Under the row in Settings: the last run, and when it last passed.

How: `engine/src/nightly.ts` reads the workflow's last runs on the default branch with `gh run list`, with the
GitHub sync, at most every fifteen minutes an app; table `nightly` keeps one row for each (migration 0042). Only a run
that finished as passed or failed counts; a run on a pull request is not the nightly one. Events `nightly.failed`
and `nightly.passed`. The agents' `set_held` tool takes `when` too.

Not built: Self Evident writing the workflow file (moving Bonkei's docs run to a nightly workflow is a change to
Bonkei, made as a task); telling who broke it by running the suite on each merged commit; a notification beyond the
list.

## Verify is drawn in the groups that run it: judges and scripts (Sandy, 2026-11-19: "It isn't clear that checks and probes are judges vs scripts")

From Cloaked's set-up conversation: Verify was one flat list, and its agent had to explain from the code that a row's
kind decides who runs it, that the "command" in the Add form is a choice, and that picking a kind is picking check or
probe. The page never said any of it. Now the list is in four groups, in the order they run, each with one line:

- **The check**: judged. One agent reads the change and judges all of these in a single run (the acceptance criteria
  and every judged sentence).
- **Probes**: judged. A fresh agent for each, one after another. None edits anything (the built-in ones, and skills).
- **Commands**: scripts. The engine runs each one itself, last. No agent: exit 0 passes.
- **Run by the repository**: scripts. Its CI on the pull request, or its nightly run. Nothing here runs them.

The kind picker in the Add form says the same in its options ("Command: a script, no agent", "Skill: a probe, its
own agent", "Judged: a sentence, in the check"). Nothing in the engine changed: this is `StepContracts.tsx` only.

Raised by the same conversation and not done: commands run last though they are the cheapest, so a lint failure is
found only after the check and every agent probe. Running them first (fail fast) is a change to the runner's order.

## The builder is told what Verify will hold it to (Sandy, 2026-11-19: "the point is to trust the agent to just build and then verify. But that works only if you have told the agent what to do")

Verify and the builder's instructions are meant to be a pair, and they had drifted as Verify grew. Only the
acceptance criteria, the judged sentences and the test command reached the builder. A lint command, a reviewer's
skill and the engine's own two probes were first heard of when they failed, each at the cost of a round of fixes.

Now a builder on a checklist task is told, from the same list Verify runs (`builderHeld` in probes.ts), in the order
it happens:
- each command the engine will run on the merged work, to run on what it changed before it finishes;
- each skill a fresh agent will review the change by; the builder is given those skills too, with its own
  (`reviewerSkills`), so it can build to what it will be judged by;
- what "Try to break it" tries and what "Comment discipline" reads for, when they are on;
- what is left to the repository's CI and to its nightly run: not its to run, still its to keep passing.

One that is off is not said; one that only reports says so. Nothing is a second setting: adding a row to Verify is
what tells the builder. The check and the probes are told nothing new.

Not done: the planner is not told (a plan's steps do not yet name the lint or the reviewer); and commands still run
last, after the agents (LOG.md, the entry above on judges and scripts).

## An app's other repositories' skills are offered too (Cloaked's set-up, passed on by Sandy, 2026-11-19: "offer skills from a second repo (backend-core). This is the proper fix and also unlocks threat-modeling and supply-chain-audit")

An app can have more than one repository, and its agents start in the home one. Only that one's `.claude/skills/`
reached them, so Cloaked could not name backend-core's review skills for a step or as a reviewer in Verify. The way
round it (pulling the repository into the shared skills) gives them to every app and keeps a copy that goes stale.

Now each of an app's repositories other than its home one, if its checkout has skills, is given to that app's
sessions as a plugin named after the repository: `backend-core:security-review`, the way any plugin's skills are
named. Settings › Skills offers them wherever a skill is picked, saying which repository they are from.

- Nothing is written into that repository. The plugin is a folder of ours (`~/.self-evident/repo-skills/<app>/<repo>`)
  with a manifest and a copy of the skills as the checkout has them, made again each time a session starts. The same
  layout as the shared skills' plugin, which Claude Code already loads.
- Only that app gets them. The home repository's own stay named plainly, as before.
- A repository with no checkout on this computer, or no skills, gives nothing.

Known and left: a session started in the second repository's own worktree sees that repository's skills twice (plain,
and by the plugin's name), and not the home repository's. Nothing runs there today.

## A prototype's goal is said as a test: deployable as it stands (Sandy, 2026-11-19: "I had to really explain to this agent what the goal here was. That we actually want this thing to function exactly like what we're building, and that we should be able to technically deploy it and just point it at different APIs")

Every place that says what a prototype is for already said "built the way we would ship it" and "essentially the code
we would go live with". An agent on Cloaked still had to have the goal explained. "Essentially" left room, and
nothing gave the agent a way to tell a prototype from a convincing demo.

Now one sentence, the same words everywhere (`DEPLOY_TEST` in prototype.ts): it could be deployed as it stands and
made real by configuration alone, by pointing its addresses and keys at the real services; if going live would need
code changed, that part is not built yet. It is said to the prototype's own agent, to the task's agent (which briefs
the prototype and holds its report), in the `start_prototype` tool where the brief is written, in the `prototype`
skill, and in a line on Settings › Skills. The skill's report now answers it: the list of addresses, keys and
switches that point elsewhere is the configuration, and anything that would need code changed is a gap.

A rough prototype is unchanged: it is thrown away by design and says so. Not known: which agent on Cloaked needed
telling, and whether that prototype was a rough one or used an app's own `prototype` skill, which wins over ours.

Two rules the test implies, added the same day from that task agent's report (it had inserted Brad's 104 findings by
hand before being told, the other people's rows still were, and the scan was started by calling the route):
- **What the feature makes comes in through the path.** Seed only what exists before the feature runs (companies,
  people, settings). What it imports, computes or stores is never seeded or inserted by hand. Our own instructions
  invited it: "sample data lives in scenarios, made-up rows by table" did not say which tables.
- **Tried from the screen.** Each thing is tried the way the person will; a route called by hand is said so in the
  report, and is not finished.

## A stand-in is part of the prototype, and has a folder outside the repository (Sandy, 2026-11-19: "both please", on what a Cloaked task agent's report showed)

The agent had wired a vendor stand-in the right way (a base URL and a key, the app's own client none the wiser) and
kept it in `/tmp` with a compose file beside it: "If the prototype is restarted or reset, the stand-in and its env are
gone. Say so if you want it … made permanent." It also held a real person's recorded findings, which cannot go in the
repository, so there was nowhere else for it.

Decided:
- **A stand-in belongs to the prototype** (`prototype.stand_ins`, migration 0043; `engine/src/stand-ins.ts`): a name,
  a command that serves on `$PORT`, and the variables that point the app at it (`{url}`, `{port}`, `{dir}`, `{home}`,
  `{worktree}` filled in). The engine starts each one before the prototype's server, gives the server those
  variables, and stops them with it. A restart or a data reset brings them back, at the same address.
- **Each prototype has a folder outside every repository** (`~/.self-evident/prototypes/<id>`, `$PROTOTYPE_HOME`):
  its stand-ins run there, one folder each, and what they serve is kept there, recorded responses with real people's
  data among them. On this computer only (it does not move between Macs with the database), and removed when the
  prototype is discarded.
- **The agent sets them** with `prototype_stand_in` (set, remove); setting one restarts a running prototype so its
  server has the variables. The prototype's agent and the skill are told: never by hand, never in `/tmp`.
- **The page shows them**: by name beside the made-up data, each with whether it is up. A reading line.

Not built: recordings moving between computers; a stand-in for something reached other than over HTTP is still just
a command and its variables; making one from a recorded real run (the agent writes the stub and the recording).

## A real response is kept raw, with the task (Sandy, 2026-11-19: "can you do 4", on what the same Cloaked prototype showed)

A real run against the vendor had been made early, and only a copy reshaped for a sketch's screen was kept. When the
prototype needed a stand-in, the raw response was gone: its agent rebuilt the format from an assumption ("the scan
proves the code handles that shape, not that SixtyFour sends it"), and two fields the real items carry (evidence,
sources) were dropped without anyone deciding to. A prototype's own folder (the entry above) did not help: the run
was made before any prototype existed.

Decided:
- **Recordings belong to the task** (or the idea; else the app): one folder for each outside every repository,
  `~/.self-evident/recordings/<app>/<task>` (`engine/src/recordings.ts`), because a real response holds real
  people's data.
- **Every conversation is given it** (`$RECORDINGS`, and it may read and write there) and told: a real response
  from an outside service is saved there raw, before anything else is done with it, never only a reshaped copy. It is
  also told how many files are there already, so it looks before it assumes a shape.
- **The prototype and its stand-ins get the same folder.** A stand-in serves from it; the prototype tool lists what
  is there. The stand-in's own working files stay in the prototype's folder.
- **Discarding a prototype leaves it**: it is the task's.

On this computer only, like the prototype's folder. Not built: a page that shows them; moving them between computers;
recording a call by itself (the agent saves the response).

Tests no longer touch the person's own folders: `RECORDINGS_HOME`, `STAND_INS_HOME` and `REPO_SKILLS_HOME` point at
the temporary folder under vitest, as the shared skills already did.

## A stand-in reaches an app that runs in containers (Cloaked's agent, reading its set-up after the three merges, passed on by Sandy, 2026-11-19)

Its two obstacles: the vendor's stub listens on a fixed port (a wrapper that takes `$PORT` answers that, and is the
agent's to write); and "the compose override sets the key and workflow id but never passes a base URL to the
containers", with a start script that names its compose files itself, so a variable given to the start command stops
there. The second is every containerised app's, so it is answered here:

- `{container_url}` in a stand-in's variables is the stand-in as a container reaches it (`host.docker.internal`);
  `{url}` stays this computer's.
- Every stand-in's variables are also written, at each start, to `stand-ins.env` in the prototype's folder
  (`$STAND_INS_ENV`), there even when empty. A service that names it as an `env_file` once gets whatever the
  stand-ins set from then on: no line for each variable, and nothing for a start script to pass along.

Tried by hand on this Mac with a real container (`docker run --env-file`): it read the variable and fetched the
stand-in's recorded response through `host.docker.internal`. Not tried: Cloaked's own stack.

## Main beside a prototype (Sandy, 2026-11-19: "we had definitely built something that allowed us to compare main with whatever worktree we were building on … can we add this to the prototype?")

The smoke test had **Compare with main** (2026-11-18); the prototype's was left "not done" then. Now a running
prototype has the same button, in the second row of its bar.

- It runs the app's prototype command a second time, from where the prototype's branch left the default branch, on
  a port, a worktree (`<its worktree>--main`) and a database (`<its database>_main`) of its own, built from the
  scenario the prototype is on. A scenario that names what only the prototype has does not stop main coming up:
  its log says what did not load.
- The two views sit side by side under the one address bar and the one device width.
- Main is pointed at the prototype's own stand-ins, on the ports they are already on, so it reaches no real service
  either (mine to choose).
- Stopping the prototype stops main; restarting the prototype leaves it up; discarding removes main's worktree and
  database. The app's stop and discard commands are run in main's worktree too, for an app in containers.
- Kept in memory, no migration: after an engine restart there is no comparison until it is asked for again.

Not done: a tool for the prototype's agent to bring main up (the button is the person's); today's main as a second
choice; an app whose command uses fixed ports or one compose project name cannot run twice, here as in the smoke
test (the page already says when a server listens on a port it was not given).

## Storybook kept outside the repo (asked for by an app's own agent, relayed by Sandy, 2026-11-19: "Storybook outside the repo … run by a command")

An app whose repository must stay free of Storybook could not have mockups: a worktree got its own Storybook only
with `.storybook/` in git, the port was added to the end of the command, and the check and Set up assumed the repo.
Now the integration has a switch, **Kept outside the repo**. On, the command is a script of the person's own, run
for every checkout with `$WORKTREE` and `$PORT` and nothing added; the check only asks it for its stories; Set up is
never offered; builders are not held to stories in the repo; and a conversation's agent is told where stories go
(the new **Where stories go** value) and never to commit Storybook's files. In the repo, a command that names
`$PORT` is run as written too. How: docs/integrations/storybook.md, "Kept outside the repo".

Not done: the screen map for a Storybook outside the repo; the house defaults (there are none outside: the command
must be set).

### Each view has its own bar, and main can be detached (Sandy, 2026-11-19: "we need the browser address and back forward and refresh for both the proto and the compared main. Also a detach button for main")

Side by side, the prototype and main each have back, forward, reload and an address of their own, as the smoke
test's two views do; the bar is now one component (`Trail.tsx`) used by both pages. Alone, the prototype's bar gains
back and forward. A step of its guide still sends both views to the same place.

**Detach** on main opens it in a browser tab of its own, where it was, and gives the prototype the whole pane; **Put
main back** brings it beside the prototype again. Mine to choose: detaching is a plain browser tab at main's
address, not the viewer's own detached page, since main has nothing of Self Evident's around it to carry.

## The app's main, running (Sandy, 2026-11-19)

"For Cloaked, we don't have access to their actual website … there's always the current main that we need to see …
it shows us the functionality that's currently available. This is really important to have as a comp when we're
building. When I have something like Bonkei I don't need this because I just have bonkei.dev … I don't want to have
to go to the prototype and trigger it to create a prototype just so I can look at the main." Then: "you would turn
it on and turn it off because we don't want it running all the time … it would shut off if not active for a while",
and "compare would always just open the running main to whatever location you want to compare it against".

- **One per app**, owned by the app and not by a prototype or a task (`engine/src/main-running.ts`). The app's
  prototype command, in a worktree of its own (`<repository>-worktrees/main--running`) at the default branch's tip,
  on a port and a database of its own built from the shared "default" scenario.
- **A tab of its own**: "Main, running" in the + menu (tab kind `main`), with back, forward, reload, an address,
  device widths and Detach, like a prototype.
- **On and off by hand.** With nobody looking for 30 minutes (`MAIN_IDLE_MS`) it turns itself off. "Looking" is a
  view of it open in Self Evident (its tab, its detached page, or beside a prototype or a build), which says so
  every minute. Turned on again it keeps its address.
- **It never moves under the person.** When the default branch has moved on it says so, and Update brings it up
  there with its database made again (mine to choose, said to Sandy first).
- **Or an address.** `setup.main_url` for an app that is deployed where the person can look: nothing is run.
- **Stand-ins of its own** (`setup.main_stand_ins`), started and stopped with it, for an app that cannot show its
  screens without something outside it. Mine to add: Cloaked's main needs its vendor stood in.
- **Compare is this.** The prototype's and the smoke test's "Compare with main" turn it on if it is off and show it
  beside the work at the same place. What each had of its own (a second copy from where the branch left main, built
  2026-11-18 and earlier today) is removed: one main for the app, not one per piece of work. "Stop comparing" hides
  it; it is not that page's to turn off.
- The agent's tool is `app_main` (status, start, stop, set_address, stand_in, remove_stand_in).

Not done: a place in Settings to give the address or see the stand-ins (the agent sets them, on being asked); main
beside a mockup or a sketch other than by opening its tab; a smoke set-up with a script of its own (a docs site) is
compared with the app's main, not with that script run from main; after an engine restart it is off.

## Tailscale Funnel as a tunnel for sharing: two things at once (Sandy, 2026-11-19: "since we have Tailscale running now, should we be using that? And would that allow us to share more things at the same time?"; "let's do both")

"Both" is this and hosted links, so a share does not need the computer on. This entry is the first.

- **Order: Cloudflare, then Tailscale Funnel, then ngrok.** Cloudflare stays first: no account, any number at once,
  and a random address. Where the network blocks it, Funnel is next if the computer has Tailscale; a computer
  without it goes on to ngrok without a word. `SHARE_TUNNEL=funnel` uses only it.
- **Two at once, not three.** Funnel allows ports 443, 8443 and 10000. 443 is where Self Evident's own page is
  served to the phone, and that page has no sign-in, so a share never takes it: 8443 and 10000 only. With ngrok's
  one address after them, that is three things at once on a network that blocks Cloudflare.
- **Never Self Evident itself.** The page's port and the engine's are refused as what a share reaches, and a share
  is ready only when Funnel says it reaches the address it was asked for.
- **Asked as itself.** Funnel passes on the public name as the host, which a dev server refuses. A prototype and the
  sketches are already behind a server of ours; the mockups now go through a plain pass-on proxy when the tunnel is
  Funnel.
- **Stopping is checked.** The `tailscale` on the path is a shell wrapper round the app's program; stopping the
  wrapper left the program and the public address up (seen with a throwaway page). So the app's program is run
  directly, every stop is followed by a sweep for a funnel to that same address, and the engine's start closes any
  funnel of ours left by an engine that was killed.
- The panel says "Through Tailscale", that the link carries the computer's name, and that two can be shared this way.

Tried for real on the Mac Studio with a throwaway page: Funnel is already allowed on the account, it came up on
8443 in a few seconds and printed what the code reads. Not seen: the link opened from outside (this computer cannot
open its own Tailscale name, since Caddy holds its port 443 and nothing answers its 8443 locally), and a share
through the app on the laptop, which is where Cloudflare is blocked.

Not done: hosted links (next: which host is Sandy's choice); waking a stopped prototype when someone opens its link
(possible with Funnel, since its address does not change: asked about, not built); the smoke test as something to share.


## Compare with main is a main of the task's own (Sandy, 2026-11-20: "compare with main should be a new port. The app-wide main is just the default scenario that we can look at whenever we want … we should be able to spin up a new one. But there should only be one per task")

On 2026-11-19 comparing was made to open the app's one running main. That is undone: the app's main stays as the
thing to look at any time, and a comparison gets its own.

- **One per task.** Compare with main, on a prototype or a smoke test, brings up a second main for that task: a
  worktree (`main--<task id>`), a port and a database of its own, with the app's stand-ins. A task's prototype and
  its smoke test share the one; a prototype with no task has one of its own. What is done in it while comparing is
  not in the app's main, and comparing does not move or restart the app's main.
- **Stop comparing turns it off**, since it is that task's. With nobody looking for 30 minutes it turns itself off,
  as the app's does. Its worktree and database are kept between uses and removed when the task is done.
- It is the same code as the app's main (`engine/src/main-running.ts`), told which piece of work it is beside
  (`?for=` on the three routes). So it runs today's tip of the default branch, says when that has moved on, and its
  database is built from the shared "default" scenario (mine to keep as it was; said to Sandy).

Not done: the same data as the build (its database is separate, from the same scenario; pointing main at the build's
database would also test that a schema change is backwards compatible, talked about and not built); Update for a
task's main from the page (the app's tab has it; here it is stopped and started); a prototype's main is not removed
when a prototype with no task is discarded; `app_main` (the agent's tool) reaches only the app's own.


## Room for what is being looked at, on the smoke test (Sandy, 2026-11-20: "the ability to collapse the cards on the right for smoke tests and … more vertical real estate … we're taking up 1/3 of the screen before we get to the thing we're actually looking at")

Asked first as "open them as separate pages", then narrowed by Sandy to this. On a task's smoke test:

- **The checks fold away.** "Hide checks" puts the cards aside and the view takes the full width; the button keeps
  the count ("Show checks · 3 to check"). Remembered on this browser.
- **The task's head is one line** there: its id and title. The project line and the badges are on the task's other
  pages.
- **What the page is sits behind "About this smoke test"**, closed, on a line with the commit.
- **The view is as tall as the window has left**, not 640px at most; the checks beside it scroll on their own.

Not done: the same on the prototype's page and the other views (the smoke test is the first, Sandy's word); folding
the task's left nav and the agent's column with one press (each folds by its own); a page of its own for the smoke
test.


## A compared main's data is chosen: a copy, or the same database (Sandy, 2026-11-20: "we want the ability to choose the two options, one to literally use the same database and the other one is to mimic the data on its own")

A task's main (the one Compare with main brings up) always had a database of its own from the shared "default"
scenario, whatever the work beside it was on. Now "main's data", beside the button on a prototype and a smoke test:

- **A copy of this one's** (as it starts): main gets its own database, made again each time it is turned on, from
  what the work beside it was built from: the prototype's scenario (its own or a shared one); the smoke test's
  "default" scenario and the set-up's seed. Main's own schema. What is done in one is not in the other. What a
  scenario or seed names that main lacks is said in its log, and main comes up anyway.
- **The same database**: main is pointed at the work's own database and nothing is made or dropped for it. Main's
  code on the build's schema, as during a deploy: what is done in one shows in the other, and a change that is not
  backwards compatible shows as main breaking. It needs the work to have been run once.
- Changing it while comparing brings main up again on the other, at the same address. The view of main says which
  it is on. The choice is remembered on this browser. Asked for with no choice (the agent, an old tab), a running
  one is left as it is.
- `?data=copy|shared&beside=prototype:<id>|smoke:<task>:<set-up>` on the start route; the engine works out the
  database, scenario and seed (`engine/src/main-running.ts`, `MainData`).

Not done: a copy of the data as it is now (it is as the work started; the rows made since are only in the same
database); a choice of some other scenario for main; saying on the page, when main breaks on the same database, that
it is likely the schema; the app's own main is unchanged (its "default" scenario).


## A task's head, full or small (Sandy, 2026-11-20: "it still taking up a bunch of space … now we just have less information … reverting to what we had, but having a toggle")

Trimming the smoke test's head saved little room and lost what it said. Undone, and made a choice instead:

- **The full head is back by default**, on the smoke test too: the project line, the badges, and the paragraph
  saying what the smoke test is (no longer behind "About").
- **"▴ Less" on the task's head makes it small**, on every page of the task, remembered on this browser. Small is
  the id and title on one line, plus Close and Retry when they apply. Left out until "▾ Show all": the project
  line, the badges, Delete, what the task waits on before it can be closed, and the top of the page being worked on:
  what the step is (and the prototype's "last thing you press" note), or what the smoke test is.
- The smoke test's "Hide checks" stays as it was, on its own.


## Compare with: the app's main, or a new main on a copy or on the same database (Sandy, 2026-11-20: "the two options are copy it as it is now or share a database. If we want to look at the standard data set, we can just look at the main app level one. So it's like compare with app level … or do a new one in which you are copying or just running it off the same db")

Found on CEB-90, the first real use of a task's own main:

- **"The same database" cut out as if cancelled.** The app's start script migrates first; main's code did not have
  the build's new migration, so the script exited, and the page dropped the comparison without a word. The engine
  kept no record that a server had stopped by itself, and its output is replaced on the next start.
- **"A copy" showed the wrong data.** Main was started with the app's plain command, not the smoke set-up's script,
  so it signed in to the default company and seeded the sample one. And the copy was the data as the work started
  (scenario and seed), not as it is.

Now, one control on a prototype and a smoke test (`app/src/components/CompareMain.tsx`), three choices:

- **The app's main**: the one that is there to open any time, on its standard data. Turned on if it is off; not
  the comparison's to turn off.
- **A new main, on a copy of this data as it is now**: the task's own main, its database made again with main's
  schema and filled with the work's rows as they are (`copyData`, prototype-data.ts). A field main's schema does not
  have is ignored; a table it does not have is left out; a table whose rows it will not take is left empty. Each is
  said in main's log, and the rest loads.
- **A new main, on this same database**: the task's own main pointed at the work's database. The script is told
  with `MAIN_SHARED_DB=1`, so it does not migrate or seed a database that is ahead of its code (the script has to
  honour it; `set_smoke_setup` says so to the agent that writes one).
- **Beside a smoke test, main is started the way that set-up is**: its script, its stop script, its variables.
- **A main that stops by itself says so**: `exited` on its status (when, with what, its last lines) and an event,
  `main.exited`. The page shows it, and for the same database says what it usually is.
- The picker of "main's data" beside a button (earlier today) is gone: it is these choices.

Not done: telemetry on Self Evident itself (it has events and each server's last lines, in memory); a main beside
a prototype is started with the app's plain command (a prototype has no script of its own); replaying a recorded
vendor response into main so the same person can be scanned on both without paying twice; a main run with the smoke
set-up's variables can reach the real vendor, as the build can.


## The pull request is a step of its own, after the smoke test (Sandy, 2026-11-20: "a new step to the build section after smoke test, 'PR'. This will show us the PR status, the message, let us submit (new PR or draft to complete conversion) and let us see any comments. It will also in the future give us tools to help reviewers")

A task's pull request was a panel at the foot of its Sub-tasks page: a button and a badge. Now "🔀 Pull request" is a
row in the task's Build section, after the smoke test, with a page (`app/src/components/PrStep.tsx`,
`engine/src/pr-view.ts`, `GET /issues/:id/pr`):

- **Where it stands**: not submitted, a draft, open, closed or merged; what review says; its checks, with the
  failing ones named; a conflict with its base; the branch and what it is against.
- **The one thing to press**: submit it (as before: asked once more, pushed, opened as a draft by the app's rule;
  a closed one is submitted again), or, for a draft, **Ready for review**, which takes it out of draft on GitHub
  (`POST /issues/:id/pr/ready`). Both are the person's: neither is a tool an agent has. Checks of the person's own
  still waiting in the smoke test are said, with a link, and do not block.
- **Its message**: before it exists, what it will open with (the title by the app's rule, the body with its merge
  guide), worked out without pushing anything (`runner.previewPr`). After, what GitHub has; when that is an earlier
  version it says so, and what the next update sends can be looked at.
- **What was said on it**: comments, reviews with their verdict, and comments on lines with the file and line,
  oldest first, each with a link to it on GitHub.
- GitHub is asked each time the page is read. When it cannot be reached the page says so and shows what was last
  known. What it reads is kept: one closed, merged or made ready on GitHub is recorded as that.
- **Replaced, not added**: the Submit panel is gone from the Sub-tasks page, which now has a line linking here.

Not done: tools for reviewers (Sandy's "in the future"); replying to or resolving a comment from here; sending a
comment to the task's agent as work; editing the message here (the title has `set_pr_title`; the body is made from
the task); a project's single pull request (pr_mode "project") is shown on each of its tasks, whole; the row's
count of comments in the nav.

## Linear tickets come in as ideas (Sandy, 2026-11-20: "I think what we want to do is bring them in as ideas and then decide whether or not they should be projects or tasks. Because it might be that they should be a project with tasks. For one ticket")

A ticket brought in became a task straight away, which decided for the person that it was one thing to build. Now:

- **A ticket becomes an idea**, in the inbox, with its words and the link back (`source: 'linear'`, the ticket in
  `sourceRef.linear`). "As a task" or "As a project" is pressed on the idea, as for any other; as a project, its
  agent decides whether the ticket is one task or several (work.ts, `splitPrompt`).
- **The task an idea from Linear becomes names the ticket**: `sourceRef.linear` goes with it, so the branch
  (`{ticket}`), the reports and the runner still say SHOP-12. Only that first task carries it; tasks its agent adds to
  the project are their own.
- **Where:** the panel moved from the Tasks page to the Ideas page; Plan's From Linear goes there. A project's
  Add tasks › From Linear has decided already, so there a ticket still becomes a task in that project.
- **Bringing one in again** updates the idea's words, or the task's when it was made from the ticket directly. A
  task made from the idea is left alone (its title may be trimmed to its part of a project); the ticket is listed
  as that task.
- The idea's source allows `linear` (migration 0044); tasks already made from tickets stay as they are.

## The ticket, word for word, for every agent (Sandy, 2026-11-20: "I don't want the agent building like off a summary or a brief and not having access to the actual ticket … this should apply to all tickets, no matter where they come from")

What a ticket said reached the agents only as a task's description, which the planner and the builders never read,
and which the idea's agent is told to trim when it splits a project. Now:

- **An origin** (`origin` table, origins.ts): a ticket as its tracker has it: title, text, comments oldest first,
  what it links to, and the images in its text, fetched with the tracker's key and kept on this computer
  (`~/.self-evident/origins/<app>/<ticket>/`). Never edited here; brought up to date each time the ticket is
  brought in, whatever became of it. Linear is the first source; another tracker adds a source and calls
  `keepOrigin` and `keepFiles` the same way.
- **Ideas, projects and tasks point at it** (`origin_id`). A task with none of its own has its parent's, its
  project's or its idea's (`originOf`): every task split from one ticket, and every sub-task, has the whole ticket.
- **Every agent is given it whole** (`originPrompt`): the idea's and the task's own agents, the steps' and the
  prototype's agents, the planner, and every builder. They are told to follow what they were given (the brief, the
  sub-task), and where that leaves out or differs from the ticket, to say so, naming the part: never quietly drop it.
- **Shown** on the idea's and the task's overview as "Where this came from", folded; an image that could not be
  fetched is said in red, since the agents can't see it.

## A view's address bar follows the view (Sandy, 2026-11-20: "in prototype and smoke test, the browser screens have back forward refresh and address bars. But the address doesn't update with the site like a real browser. This makes the back and forward useless")

What a prototype, a smoke test or main runs is on a port of its own, another origin, so the page around it could
not read where it went: back and forward only stepped through addresses the page itself sent (typed, "Go there").

- **The engine stands a proxy in front of it** (`engine/src/frame-proxy.ts`, `GET /api/frame?url=`): one per
  local port, started the first time a view asks, on a port of its own on this computer. It passes everything
  through (websockets too, so hot reload works) and puts one script first in each HTML page. The script tells the
  page around it its address on each load, pushState, replaceState, popstate and hash change. Only addresses on
  this computer are proxied, and it listens only here.
- **The trail follows** (`app/src/components/Trail.tsx`, `Framed`): a link pressed inside the view is a step, as
  in a browser; a redirect or a replaceState changes the step it is on. The frame is loaded again only when the bar
  sends it somewhere it is not (back, forward, an address typed, a check's "Go there"), on reload, or on a restart.
  The address bar shows the app's own address, not the proxy's.
- Somewhere not on this computer (a deployed main, staging) is shown as it is, and only where the page sent it is
  known.

Not done: a page with a strict Content-Security-Policy that does not allow its own origin's scripts does not report
(it still shows; the bar behaves as before). A link in the app to its own absolute `http://localhost:<port>` address
leaves the proxy, and the view stops reporting until the bar sends it somewhere.


## A comment written on GitHub is shown as GitHub shows it (Sandy, 2026-11-20: "can we make sure that all the Wiz findings are formatted?")

On a task's pull request page a scanner's comment showed as its own source: GitHub lets a comment carry HTML (a
table with icons, a folded section), and our Markdown showed the tags as text. Now a pull request's message and
every comment on it are rendered with their HTML and then cleaned to what GitHub itself allows (`Md`'s `html`;
`rehype-raw`, then `rehype-sanitize`, whose list is made after GitHub's): tables, images and folded sections show,
and a script, a style or a handler does not get through (a story holds it to that). The few `:names:` bots use for
a status (`:x:`, `:white_check_mark:`, `:warning:` …) are shown as their signs.

Only where the text came from GitHub. Everything else that is Markdown is as it was.

Not done: findings a scanner keeps on its own site and only counts in its comment are not brought in (the comment
links to them); GitHub's own rendering (mentions, issue links, code at a commit) is not copied; a check's
annotations are not shown.


## A task has a team ticket and a name for the team; an app can require the ticket (from a client app's first pull request, passed on by Sandy, 2026-11-20: "Team tickets on tasks, and PRs that read like the team's")

A task that linked the team's ticket in its description had none recorded: only a task imported from the tracker
did. So {ticket} fell back to our id, and the branch and the pull request's title carried it; their CI rejects a
title whose bracket is not one of their keys. And {title} was our working title ("…, third build: …").

- **A task's team ticket** (`engine/src/ticket.ts`) is the first of: what was set on the task (`issue.team_ticket`,
  migration 0045); the ticket it was imported from; a link to a ticket in its description or brief; the same in the
  idea it came from. Only a link is read, never a bare "ENT-322" in prose, which may be another ticket.
- **It is set** on the task's head (a badge that says where the ticket was read from, and opens to edit), by the
  agent (`update_task`: ticket), and by `PUT /issues/:id/team`.
- **A name for the team** (`issue.team_title`; `update_task`: teamTitle): the task as the team would say it. It is
  the {title} of the pull request's title and the branch's name; without one it is our title. A title's description
  can also come from the first commit, as {type} and {scope} do: `{subject}` in the template.
- **An app can require a team ticket** (`setup.ticket_required`; Settings › Landing; `set_pr_rules`). Then our id is
  never used in its place: a task with none is held by the scheduler before its branch is first cut (a branch
  cannot be renamed once its pull request is open), its pull request is neither submitted nor opened by itself, and
  each says what is missing. Setting the ticket lets it carry on. A build held while ready to start now shows under
  what needs you, as a queued one did.

Not done: an app that requires a ticket and a task already building under our id (it is left as it is; the pull
request is still held); checking that the key belongs to the team's tracker; a task's ticket shown in lists.


## A pull request reads like the team's: a description written for them, our record folded under it, and a merge guide that does not contradict the task (from a client app's first pull request, passed on by Sandy, 2026-11-20)

The description of that pull request was 511 lines of our build log, opening with "Built by Self Evident from
project proj_…, task 1 of 1" and listing every probe and fix round. The repository's own pull requests are prose:
what changed and why, how it works, decisions, rollback and deploy notes, a test plan with numbers, risks,
follow-ups. And the merge guide on it was wrong twice.

- **A description written for the team** (`issue.pr_body`, migration 0046). When a task has one it leads the pull
  request and is all that shows. The task's agent writes it (`set_pr_message`: told to read the repository's
  template and recent merged pull requests, write what they write, and leave out everything that is ours), or the
  person does, on the task's Pull request page, which says plainly when it has not been written.
- **Everything of ours is folded at the very bottom**, under one line, whatever leads: which project of ours it is,
  the merge guide when a written description leads, every criterion and decision, what each sub-task's builder
  reported. Nothing of ours is above the fold. The banner that it is still being built stays, only while it is.
- **"To undo" comes from the task, never a default.** The guide said "revert this pull request" while the task's
  blast radius said never to revert after the first scan. Now it is the line the blast radius (all of it, not only
  its summary), the merge checklist or a decision gives; when the blast radius does not say, the guide says that
  and to ask before reverting; only with no blast radius at all is reverting named, as a default to check. The
  blast radius is now asked for that line. The body's own "Rollback project: revert this PR" is gone.
- **A requirement whose evidence says "not yet" is not shown as met.** Risks ✅ and Test plan ✅ stood beside "No PR
  yet: it needs…". Such evidence now shows ⬜ "not yet" in the guide and the record, and the check's mark is not
  kept as met in the first place (`notYet`, requirements.ts).

Not done: writing the description by itself when a pull request is submitted without one (it is asked for, and said
on the page); checking a written description against the repository's template; the same for a project's single
pull request (pr_mode "project"), which has no task to hold one; an open pull request is not rewritten until its
next update or submit.


## Update pull request: an open one is brought up to date by a press (asked for from a client app, passed on by Sandy, 2026-11-20: "push the current title and description without needing a new commit")

A description written after a pull request was submitted had no way to GitHub but the next sub-task landing. Now an
open or draft pull request's page has **Update pull request**: its title and description are sent as they stand
(and its branch pushed), with nothing new landed. It says when GitHub's is an earlier version, and "Updated" once it
is not. Its draft state is left as it is.

- `POST /issues/:id/pr/update` (`runner.refreshPr`): the same update a landing makes. Refused with nothing
  submitted (that is submitting) and for a closed or merged one (a closed one is submitted again, by the person).
- The person's, like submitting and marking ready: no agent tool does it. An agent writes the description
  (`set_pr_message`); the person sends it.
- Saving a description on the page now says to press Update to send it.

Not done: updating by itself when a description or a team ticket changes; a project's single pull request from a
project's own page (it is updated from any of its tasks).


## A page that calls an address fixed to this computer is said so (Sandy, 2026-11-20: "the reason I need to make this change seems like something that should be universally set for Self Evident, not just on this project … Why is it not in the database?")

An app's set-up gave its frontend `http://localhost:<port>/api`, so its pages loaded at that one address and failed
through any other. The fix was one line in that app's own set-up files. What is universal is the rule, not the
line: which variable a frontend reads is the app's, so Self Evident cannot set it; it can look, and tell.

- **It looks** (`engine/src/addresses.ts`). When a prototype or a local smoke test answers, its page and the scripts
  the page names on its own address are read (a dozen at most, each capped) for absolute addresses on this
  computer. A dev server's own paths and the page's own home are left out. Once as it comes up, again every few
  minutes.
- **It says so** beside the view, as a port the server chose itself already is: which addresses, that the page will
  not reach them through a shared link or a phone, that one on another port may be another copy (main, another
  prototype), and to call it by a path. Events `prototype.fixed_address`, `smoke.fixed_address`, the first time.
- **The agents are told**: `set_prototype_command`, `set_smoke_setup` and the prototype skill each say that nothing
  the app serves names this computer as its own address.

Why that app's line was not in the database: a set-up in Self Evident is a script, a stop script and a seed, and
this one needs files beside them (a compose override, a guard, helpers), which have nowhere to live in settings, so
they are in a repository of their own and the script calls them. Talked about and not built: a set-up keeping its
files in Self Evident.

Not done: that; the app's own main and a compared main are not looked at; it is a look at text, so an address in a
comment is reported and one put together at run time is not; not yet seen on a real app (none was running).

## A task shows only its own sketches (Sandy, 2026-11-20: "on a new task it has old sketches that are like defaults. But they are totally unrelated. I think a new task shouldn't show any old sketches")

Sketches are files under `sketches/` in the repository, so the ones merged with earlier tasks ride along on every
new branch, and a new task opened with them.

- **A conversation's sketches are the ones its branch made or changed**: what differs from where the branch left
  the app's main branch, plus what is not committed yet. The rest are counted and left out.
- **A conversation with no worktree yet has made none**: it used to show everything on main.
- **The earlier ones are a press away**: "Show N from earlier tasks", under the list. A new task's empty page says
  "No sketches for this task yet."
- The app's own Sketches page, with no conversation in front, still shows everything on main.
- Sharing sketches shares the same list: a task's own.
- When it cannot be told (not a git checkout, no such branch), nothing is hidden.

Not done: taking old sketches out of the repository once their task is done. They stay in git either way.


## Each step settles its own question (Sandy, 2026-11-20: "the whole point is during the sketch. It's really easy to change things when you get to the prototype. It's not easy to change things. Therefore we should do as much as we can in the sketch")

What was happening: a sketch Sandy did not like was called close enough and left for the mockup; the mockup's
faults were left for the prototype. Each step was allowed to add something of the step before's kind, so the
cheapest changes (layout, look) were carried to where they cost the most. Decided in conversation; nothing is built.

- **A step is a question, and it is closed before the next starts.** Sketch: what is on a screen and where.
  Screens: all that can be seen in a still. Mockup: the way through. Prototype: it works, and it is what goes live.
  Build: the code. The steps after Screens are conversions, not more design (SHAPE.md has the list).
- **Screens is a new step; Sketch stays what it is** (Sandy: "whatever the sketch right now should be called …
  we should say the way it is. Screens should be a new thing"). A sketch stays a plain HTML file, rough and
  instant. "Wireframe" was put aside for the exact one: most people read it as grey boxes.
- **Screens are rendered through the app's own build** (Sandy: "render through its own build I think is right"),
  so they use the components the app has, as they are. The other way, copying a component's markup into plain
  HTML, was put aside: a copy drifts. A new part is drawn in the screen, not made a component; that is the mockup's
  work, and a screen's list of what is new is the mockup's work order.
- **A state is a screen.** Otherwise the states are what slides to the mockup.
- **Each conversion is checked against the step before**, screen by screen: mockup against screens, prototype
  against mockup, build against prototype. The build's "follow and improve on" now means the code only.
- **Objections are sorted where they are raised**, and only the person passes a step.

**Where screens are rendered and where they are seen are two answers** (Sandy, 2026-11-20: "I think this is right
… I understand the risk and cost, but let's do it this way").
- **Seen on a page of their own**: a Screens page in Self Evident, all of a task's screens on one wall, each with
  its states. Storybook's own interface shows one story at a time, which is poor for going through ten.
- **Rendered by the app's Storybook, out of sight**: a screen is a story file in a folder of its own, framed by its
  plain address as a sketch is. Storybook is already the tool that renders a piece of an app through its own build;
  our own would be that again for every framework. The integration, the switch per app and the mockups' proxy exist.
- **Accepted**: a screen and a mockup are the same kind of file, so the line is held by separate folders, separate
  pages, and a screen having no behaviour at all; and an app with no Storybook has no Screens until it is set up.

**The agents are told** (Sandy: "we also just need the agents to be fully briefed on this … that they don't push
past or suggest to push past for no good reason"). `HOLD_THE_STEP` in `engine/src/talk.ts`, in what every
conversation's agent is told: an objection the step can show is fixed in that step; one it cannot show is written on
the step and opens the next; no "close enough", no proposing to move on, and only the person passes a step. The
build now "looks and behaves as the approved prototype does" where it said "follow and improve on". The prototype's
agent and its skill: what was agreed in a mockup is matched, and is not polish. Until Screens is built the mockup is
the first exact look, so the agents are told the mockup settles all that can be seen; that moves to Screens then.
Left as it is: a criterion marked final build only, which is the person's or the task's agent's stated reason, and a
rough prototype, which is thrown away.

Not decided: how a conversion is compared (by eye side by side, or by screenshots).

## An app's own form for a pull request's description (Sandy, 2026-11-20: "a way for us to say what needs to go where and how it should be, basically like a prompt kind of thing that has a template and then a prompt"; "let's add those")

The title and the commit message had templates in Settings › Landing; the description had none. Its agent was told,
in words fixed in the engine, to copy the repository's template and its recent pull requests.

- **Two settings, beside the title**: the description's sections, as text (`setup.pr_description`), and how to write
  them (`setup.pr_description_how`). Either alone works.
- **They come before the repository's own template.** The person set them for this app. With neither set, nothing
  changes: the repository's template and its past pull requests are followed.
- **The task's agent is told both**, in its own prompt: keep the headings and their order, fill each from what is
  true of the branch, leave none out. What already held still holds: nothing of ours in it, rollback from the blast
  radius.
- **Writing it by hand starts from the sections**: "Write it" on the task's Pull request page opens with the
  template in the box.
- The app's agent can set both (`set_pr_rules`), only when the person asks for a form of their own.

Not done: checking a written description against the template (a missing heading is not refused); a form per
workflow or per project; our folded record's own shape, which stays the engine's.

## Screens: every screen and state on one wall (Sandy, 2026-11-20: "go ahead")

The step between the sketches and the mockups, built as decided above.

- **A screen is a story whose title starts with `Screens/`**: one title per screen (`Screens/Checkout`), one story
  per state. That is the whole contract: no new file kind, no folder the engine reads. The agents are told to keep
  them in a folder named `screens` where the app's stories go, and that a screen is still.
- **The engine lists them** (`engine/src/screens.ts`, `GET /apps/:id/screens?session=&all=1`): the running
  Storybook's index, grouped by screen, with where that Storybook stands (not set, not running, startable), as the
  Mockups page has it. **A task's are its own**, as with sketches: the story's file is among what its branch made or
  changed (`ownFiles`, now shared with the sketches); the rest are counted, and "Show N from earlier tasks" brings
  them back.
- **The page** (`app/src/pages/Screens.tsx`, stories first): every screen a row, every state a tile, each tile the
  story's own frame (`iframe.html?id=`) drawn at its real size and scaled down. Phone, tablet and desktop widths.
  Press a tile and it is large, with Previous and Next through all of them and the way back to the wall. After
  Figma's frames on a canvas and Chromatic's review grid. It is the Screens step's view on a task, a tab of its own
  (`open_tab` kind `screens`), and detaches and shares as the Mockups do.
- **The step** (`screen`, "Screens", between sketch and mockup): on in a new app's workflow. **Off in a workflow
  saved before it**, mine to choose: an optional step that is on must be done or skipped on every task before its
  brief is approved, and tasks under way were not asked. Switching it on is the workflow's switch.
- **The agents are told**: how to draw them (the app's components as they are, a new part drawn in the screen and
  not made a component, nothing that responds), to show them on the wall, and that the mockup then makes the same
  screens clickable. `HOLD_THE_STEP` now says the screens settle what can be seen and the mockup the way through;
  with the step off, the mockup settles both, as before.

Mine to choose, besides the above: a title that starts with `Screens/` and not a file name or a folder as the mark,
because Storybook's index already says it and an app keeps its stories where it likes; the made-up screen the page's
stories frame is a static file Storybook alone serves (`app/.storybook/static`), since the mock engine cannot answer
a frame's own address.

Not decided: **who draws them** (Sandy, the same day: "would it make sense to have a mockups, sketches and screens
agent? … those agents know exactly what their job is"). Today the task's own agent does, told in its briefing. What
I suggested: the sketch stays the task agent's, with a skill; screens and mockups each get an agent of their own, as
the prototype has, with a skill that says what done is.

Not done: tried end to end on a real task (the listing is tested on its parts, the page on made-up data); a tile's
height is one guess per width, so a long screen is cut off on the wall and whole when opened; a share of the wall
itself (sharing shares the Storybook); comparing a mockup against its screens; the Screens step on the workflow
card's story; the planner and builders are not told to hold the build to the prototype in words of their own.


## The whole test run can be asked for again, and one a restart cut off is made again (Sandy, 2026-11-20: "the Tests tab shows an x and says the whole run failed. What is up with that?")

A task showed a failed run that was hours old and no longer true. The run had failed on a set-up problem, a fix
sub-task landed, and the run after the fix was under way when the engine restarted (a merge of ours, under the
watcher). Nothing recorded that run, nothing made it again, and nothing on the page could ask for one.

- **A run says when it starts and when it is over** (`task.testing`, `task.test_ran`). A start with no end is a run
  that was cut off. While one is going the Tests stage says so ("the whole run is under way").
- **At the start the engine makes a cut-off run again** (`Runner.recover`). When the engine stops by itself it ends
  the commands it had running, with everything they started (a group of their own), and says nothing of them: a
  run ended that way is not a failure.
- **A person can ask for it again**: "Run again" on the Tests line of the task's Checklist page
  (`POST /issues/:id/test`, `Runner.testAgain`). It runs on the task's branch as it is now, in a checkout of its own
  at the head and on no branch (`tests--<task>`), as the smoke test's does, because the last sub-task's worktree is
  not the head once anything else is committed to the branch. What follows is what follows any run: a failure adds
  a sub-task that fixes it, two at most.
- **The line says when the run was** ("ran 5 h ago") and, when it failed, shows what it said.
- The Tests row of the task's nav opens the Checklist page: the tests have no agent to watch on the build page.

Mine to choose: it is a person's press and not an agent's tool; it is refused, with the reason, while a sub-task is
landing or a run is going, and before the check and the probes are done.

Not done: the test checkout is not removed when the task is done (nor is the smoke test's); a run made again after
a restart starts from the beginning; the build page's graph does not show a run under way; not yet seen on a real
task (the one that showed this is the first to try it on).




## The engine went deaf to its own events, and now notices (Sandy, 2026-11-21: "I type something and nothing comes in, and then if I refresh the page I see it")

The engine hears of each new event on one listening connection to the database, and tells the pages. On this Mac
the database is reached through a proxy. The proxy's own link dropped and it kept our side open, so the engine's
connection was dead with no error and no end: it had reconnected six times that morning, said "is back", and the
seventh loss was never noticed. Every request was still answered, so a reload showed what a page had missed, and
nothing said anything was wrong. Seen in the database: the engine held no listening connection at all.

- **The listening connection is asked a question every 15 s**, and one that does not answer in 10 s is lost like
  any other: made again, and every open page told to catch up (`EventBus`, `engine/src/events.ts`).
- **Making it is given 10 s**, so an attempt that hangs is tried again and does not end the retries.

Mine to choose: a question to the connection and not a library (`pg-listen` does the same, and was last released in
2020). Not done: the pages are not told when the engine is deaf (they see its pings and think all is well); the
pool's own connections are dropped by the same proxy and each fails one request.

## Reviewable pull requests, step 1: the mock library (Sandy, 2026-11-20: "This is a critical feature"; from Cloaked, CEB-90)

A pull request is reviewable only if the reviewer can try it on data they can trust. ENT-322's findings arrive only
from a paid SixtyFour scan, so a fresh checkout shows empty screens; the made-up data and the vendor stand-in lived
in Self Evident, per prototype. The feature is three steps, each needing the one before: the mock library (this),
review environments (a `-review` branch per PR carrying the exported mocks), and the gate before review. Steps 2
and 3 are not built.

**The 18 Nov live run was not kept.** Cloaked's client buffers SixtyFour's CSV, parses it into its own tables and
drops the body; the recordings folders were empty, and the smoke database has only the parsed fields (the vendor's
`provider_raw_response_*` and pipeline columns are already gone). So SixtyFour has no mined mock yet: the first job
is one more live run, recorded this time.

- **The library** (`engine/src/mocks.ts`, table `mock`): one mock per service per app, `needs_recording`,
  `assumed` or `mined`. Its files (the server and its invented data) are kept in the database, since they hold
  nothing private, and written to `~/.self-evident/mocks/<app>/<key>/<version>/` when it starts. The recording is
  never copied; the row names its folder.
- **The engine records, not the agent** (`engine/src/recorder.ts`). A live smoke run (`POST /issues/:id/smoke/start`
  with `live: [key]`) points the app's base URL at a proxy that passes every call to the real service and saves each
  exchange raw in the task's recordings folder (`<key>/<when>/NNN.meta.json`, `.request.*`, `.response.*`), with no
  key, token or cookie kept. A JSON response's full addresses (download links) are rewritten to go through the
  proxy, so the CSV that follows is caught too; what is saved is the response as it came. The run is marked
  `SELF_EVIDENT_RECORDING=1`, and the Cloaked workbench's `up.sh` now runs its one-employee guard for it (a local
  base URL used to mean a free stand-in).
- **Mining is the task's agent's**, asked by the engine when the live run stops (`MINE_IT` in `smoke.ts`), or by
  Mine it on the Mocks page. It saves with the `mock` tool, op `save`, status `mined`.
- **The leak check** (`engine/src/mock-leaks.ts`) refuses a mined mock while any value of its recording is in it:
  emails, addresses, ids and long numbers anywhere; two or three word values (names) and any four words in a row of
  prose anywhere; one-word values as whole values, and inside prose when they look like a handle. Keys and column
  names (also those of a dict written out in a cell) are shape and never a hit. A value kept because it is shape
  (a status) is named in `provenance.kept`, shown on the page; an email, an address or a number cannot be kept.
  Export checks again while the recording is still on this computer.
- **Provenance** is on every mock and in its export as `PROVENANCE.md`: what it stands in for, what it was mined
  from and when (in counts, never the person), what is real, what is invented, what it covers, what it cannot show,
  what changed since the last one (required when a new recording replaces the one it was mined from).
- **Where it is used**: every prototype, main and smoke test starts the app's mocks as stand-ins
  (`libraryStandIns`), with their variables in `$STAND_INS_ENV`, unless it has its own stand-in of that key. The
  smoke test had no stand-ins before; now a plain run calls the mocks and costs nothing.
- **The trigger**: every prototype's and task's agent is told the library and to check it before building
  (`mocksPrompt`); a service with no mock, or one out of date, is raised with `mock` op `needs_recording`, with what
  a real call needs (a consenting person, the key by name, the cost). It shows on Now and on the Mocks page, which
  starts the live run. Until then an `assumed` mock may stand in, labelled so everywhere.
- **Export**: `GET /apps/:id/mocks/:key/export`, a tarball of the server, its invented data, `PROVENANCE.md` and
  `mock.json`. Step 2 will put it on a review branch.
- **Settings › the app › Mocks** (`app/src/components/MockLibrary.tsx`, stories first): each service, its state, its
  recording date and task, where it is in use, its provenance and files; record it, mine it, export, edit, remove.

Mine to choose: a mock's files in Postgres (they move between computers with the app) where recordings stay on this
computer; the recorder as a proxy rather than an agent instruction; mining by the task's own agent (it knows the
change) rather than an agent of its own; a library mock losing to a prototype's own stand-in of the same key.

**A response the person already has will do (Sandy, 2026-11-21).** "I have a copy of a CSV that I got back from
SixtyFour … That CSV is the content that our mock api should return. So the process is to anonymize." And: "does
every API that you might want to mock have the ability to accept a file? … If it responds with JSON, then I could
give you a JSON file, or I could reach out to the actual API and record it." And: "we know how our system works. I
got the file … a csv is sufficient." So a recording is either given or recorded:
- **Given**: on the Mocks page, the person gives one or more real responses they have (any text body: JSON, CSV,
  XML). `POST /apps/:id/mocks/:key/recording` keeps them untouched with the task, under `<key>/given-<when>/`, with
  `given.meta.json` (`giveRecording`); a file that is not text is refused, since the leak check cannot read it. The
  task's agent is asked to mine it (`MINE_GIVEN`): read the code that calls the service to see how the answer reaches
  the app, serve those calls as the code expects with the given bodies' shape and invented values, and name in
  `cannotShow` each call taken from the code rather than given. The same leak check refuses the mock while a value
  from the files is in it.
- **Which one**: the agent that raises a mock reads the calling code first and says in `needs.file` which responses
  would do ("the results CSV a finished workflow links to"), so the person can see they already have one. A live
  run records the whole exchange, for when the flow itself is in question.

Not done: SixtyFour's mock itself (raise it on CEB-90's task with `SIXTYFOUR_BASE_URL={container_url}`, then give the
CSV on the Mocks page; the address `https://api.sixtyfour.ai` is only needed for a live run); the smoke test's own page
does not show which mocks a run has on (the engine reports it); the Mocks page is not yet linked from a task's
prototype; mocks in review environments (step 2) and the gate (step 3). Not seen end to end on a real app.

## Mocks, reshaped: a server plus data, and a table per task (Sandy, 2026-11-21, a long conversation)

What was merged the day before (#330) treated a mock as one thing made in Settings. Talking it through changed that.
In her words:
- "The goal isn't to have a perfect mocking system. The goal is … for any prototype or smoke test, and then
  especially for any reviewer, it's easy to spin up a demo or a smoke test locally that is pulling in fake data so
  nothing's exposed and it's just testing whether or not the thing works. Meaning each task … should be set up
  uniquely to some degree … to begin with, every task could set it up from scratch."
- "The prototype code and the smoke test that we send need to be exactly the same code that would go live … just
  pointing at different endpoints."
- "I don't want to make a 20 minute call and spend 250 credits every single time I want to do a smoke test."
- "It is a real person. That's why we need a feature that will take the real person and make a fake version of it,
  kind of like a really rudimentary faker."
- "A more general setting in which we can say, for a prototype, for smoke, for a reviewer, where is the data coming
  from? … each one of them are going to come from the same CSV, but for the reviewer, fake it." And any mix: "record
  and fake for all three … file we provide directly for the reviewer, real API for our own."
- On Settings: keep it, as the app's defaults; making moves to the task (mine to propose, agreed).
- On history: changes to the Settings-level defaults are recorded; a task's own are not.

The shape is in SHAPE.md ("A mock is a server plus data"). What we went through and dropped, so it is not proposed
again: one mock per API with scenarios as a tree of endpoint overrides in a format of ours; Mockoon (Node, no
Docker) or WireMock (Java) to serve it; a runner of our own. Reading Cloaked's client settled it: a scan is sent in
chunks, each a job, and each row of a job's CSV must carry back the `tracking_id` sent for that employee (else its
position, guarded by `work_email`). A fixed answer shows empty screens. A small server in ordinary code does it.
Also found there: Meridian is the repository's own seed (`make seed`, 250 employees from a fixed seed), so a
reviewer's checkout already has the people.

Build order, a pull request each: (1) data apart from the server, and the faker; (2) the task's table and the
app's defaults, story first; (3) for real on CEB-90 with the CSV, through Cloaked's own pipeline; (4) the review
branch, then the gate.

Not known until built: how the faker does on the real CSV (long text, data packed in cells); how a server gives
recorded rows to the people it was sent; record-and-fake as one step by itself; how a mock sits in Cloaked's Docker
for a reviewer.

### Built first: data apart from the server, and the faker (2026-11-21)

- **A mock's data is its own thing** (`mock_data`, `engine/src/mock-data.ts`). The server's files hold no data; it
  reads what it answers with from the folder `$MOCK_DATA`, given the same file names whether they are real or faked.
  A set is `real` (a real response's own folder under the recordings home, served as it is; no files in the
  database, refused by the export), `faked` (made by the faker, checked against what it came from when made, when
  changed by hand and when exported) or `invented` (written by hand, checked against the newest real responses of
  that service on this computer; with none to check against, kept only when a person states it holds nothing real,
  and the note says "not checked"; an agent cannot state it). The first set made is the mock's default
  (`mock.default_data`); `libraryStandIns(appId, except, pick)` gives each mock its default, or the set a run picks.
- **The faker** (`engine/src/fake.ts`), pure: reads a file as the leak check does, goes into what is written inside
  a value (JSON, or a Python-style list or dict, written back in the same style), keeps structure (columns, keys,
  empties, booleans, small numbers, and what the plan names: `keep`, `keepValues`, `keepHosts`), replaces the rest by
  kind (email, web address, id, date shifted, long number, short text word for word, long text as "Sample data:"
  with its lines), the same real value to the same fake one. Lists inside a value lose a few items unless
  `varyCounts` is false. No fake word may be a word of the real response. A plan cannot keep an email, an address
  or an id. The salt is made once and kept with the set, so faking again changes nothing the plan did not.
- **Agents**: a `mock_data` tool (fake, write, use_real, default, remove); the mining messages now ask for a server
  that reads `$MOCK_DATA` and answers for exactly what it was sent, then a fake, then the people the response lacked.
- **The page** lists a mock's data with what each is, which is the default, and says when the default is a real
  response (it then cannot be exported).
- **Found by the faker's own tests, in the leak check**: a one-letter quoted value (`'x'`) mis-paired every quote
  after it, and a cell of written-out data was read as one sentence, so its keys in a row counted as a phrase of the
  response. Both fixed in `mock-leaks.ts`.
- Proved on two made-up services: one that answers a batch and must carry back each id it was sent (the same server
  serving the fake, then the real response), and a plain JSON one.

Not done here: the task's table (where a prototype's, a smoke test's and a reviewer's data comes from) and the app's
default table; the Data step in a task; record-and-fake as one step; a person providing an invented file on the page
(the engine takes it, `saveData` with `stated`; there is no control for it yet). Not tried on a real response.

### Built second: the table, the app's defaults and the Data step (2026-11-21)

- **The table** (`engine/src/mock-places.ts`, `mock_choice`, `mock.places`): for each mock and each place (prototype,
  smoke test, reviewer) a source: `live` (the real service, every run; a smoke run goes through the recorder),
  `replay` (the newest real response as it is; with none yet a smoke run is live once, then replays), `fake` (a fake
  of the newest; one made with a plan is made again by itself when a newer real response comes in), `data` (a named
  set) or `default`. The app's defaults are on the mock; a task's own choices are rows of their own, and a task with
  none follows the app. `planOf` says what a place gets; `plansFor` is what a run uses.
- **Runs follow it**: a prototype (its task's row; main uses the app's default for a prototype), a smoke test (its
  live services from the table are recorded as a "Record it" run is). A prototype set to `live` leaves the mock out
  and reaches the service by the app's own settings; that is not recorded, since only a smoke run has the recorder.
- **Nothing real leaves**: `live` and `replay` cannot be chosen for a reviewer, nor a set that is a real response; a
  default that is real blocks the reviewer's copy and says why; a prototype that holds real data (or calls the real
  service) cannot be shared by a public link (`realIn`, checked in `share.ts`).
- **The Data step** (`steps.ts`, key `data`, right before the prototype, optional): the task's own table and the
  app's mocks, there before any agent is asked, since the table needs none. Skipped, the app's defaults are used.
  On in a new app's workflow; off in one saved before it existed, as Screens was, so no task under way is asked.
- **Settings › Mocks** is now the app's defaults: the default table, each mock with its data and its history; a
  service is added on a task's Data step, not there, so there is always an agent to build it.
- **A file from the person** ("Add data from a file" on a mock): one that may hold real data is kept as a real
  response and faked; one they state holds nothing real is used as it is, and its note says it was stated.
- **History** (`mockHistory`): every change to a mock from the event stream, the app's own (no task) told apart from
  a task's, on the mock's card.
- **Found while testing**: a fake made again threw away people added to it by hand. They are now files of their own
  beside the fake's (`provenance.fakedFiles`), kept when it is made again; servers read every file in `$MOCK_DATA`.

Not done here: record-and-fake still needs the task's agent for the first fake (it makes the plan: what is
structure); a prototype cannot record. Not tried on a real response or a real app.

## A workflow's name can be changed (Sandy, 2026-11-21: "we have 2 main workflows on cloaked, we need to be able to edit the name")

The engine always saved a workflow's name, and tells the built-in one by how it builds (`ensureMain`: any workflow
built in one go), never by what it is called; the card just had no field for it. Editing a workflow now starts with
its name (`WorkflowCard`, story `Renaming`); one left empty cannot be saved. Nothing else reads the name.

### Adding a service is one form, and mining is said once (Sandy, 2026-11-21, giving the first real file on Cloaked)

Trying it for real: "the mocks I am a little less clear how to add a csv", then "I need to first 'mine it'". Two steps
where one would do, and a card that said "The task's agent is mining it" with a "Mine it" button under it.
- **Add a service** (on a task's Data step) takes the name and, in the same form, a real response the person
  already has; the address and variables, needed only to record a live run, are under "For recording a live run
  instead".
- **One line while it is being built**: a mock whose real response is in and whose agent was asked says so, with
  "Ask again" for when the agent did not start. The second line (a newer response nobody was asked about) shows only
  when that is true.
- A given file's own note (`given.meta.json`) is no longer counted as one of its files.

### A response belongs to an endpoint, and the page says which (Sandy, 2026-11-21, looking at the first real mock)

"There's some data that we're storing … that's a response. That has to map on to an endpoint, right? … I'm looking at
one and there's nowhere that I can see that it is linked to a specific endpoint. So if there were ten, how would it
know which one this is supposed to be serving and then fill in the other nine?" She was right: the link was inside
the server's code ("serve the CSV in the data folder"), which nobody could check, and nothing showed which calls had a
real response behind them.
- **A mock lists its endpoints** (`mock.endpoints`, `engine/src/mock-endpoints.ts`): every call the app makes to the
  service, each with a key, its method, its path and what it answers with. The agent that builds the mock declares
  them (`mock` op save, `endpoints`).
- **A response is one endpoint's, by its file's name**: `<key>.<ext>`, `<key>.<anything>.<ext>` for more added by hand,
  or the file an endpoint names outright (one kept under the name it came with). A data file that is no endpoint's
  is shown as unlinked.
- **Where a shape came from is read, not claimed**: a real response given for that endpoint, one recorded in a live
  run (the recorder notes each call's method and address, matched to the endpoint's path), or neither: the code.
- **A file can be given for one endpoint** from its row; it is kept under that endpoint's name.
- **A recorded run** is read under its endpoints' names (`keyed`: the last answer of each as `<key>.<ext>`, earlier
  ones beside it), so a server and the faker read a recorded run and a given file the same way.
- **The card** has the table: the call, what answers it, where its shape came from; "10 calls: 2 with a real response
  behind them, 8 taken from the code". A mock built before this says its endpoints are not listed, and its task's
  agent can be asked to list them.

Not done: a call the app makes that the mock does not have is still found by its failing, not reported by the mock.

### The Mocks page shows what is true now (Sandy, 2026-11-21: "still not sure what I am looking at")

She pasted a card saying "Needs a real response … the task's agent is building the mock" two minutes after the agent
had saved it: the page read the mocks once and never again. While any mock is being built the page now reads them
again every few seconds. Also: removing a mock said only that its recordings stay, not that its data and every
task's choices for it go; and a mock removed and added again showed the removed one's history as its own, with an
agent's work labelled "in the app's settings". The history now starts where the mock was added again, and removal
is in it.

### The Data step starts from what the task calls (Sandy, 2026-11-21)

"The brief, research, sketches, screens and mockup should all let us know by that point. The agent should know what
endpoints are required. In the data tab, it should list those endpoints, with some information about what it needs
to do. And then we should be able to … create mocks and link from the mock to the endpoints that are required. And
you can add additional endpoints if you think they're required and it's not listed."
- **A task lists its calls** (`task_call`, `engine/src/task-calls.ts`): the service, the method and path, and what
  this task needs from it. Its agent sets the list from the brief and the code (`task_calls`, op set: its own rows
  are replaced, the person's stay); the person adds what it missed.
- **Each call says what answers it**: an endpoint of the service's mock, found by method and path or tied by hand,
  with a real response behind it or from the code; a mock that lacks the call; or no mock.
- **From a call**: "Create a mock" makes the service's mock on the task with that call as its first endpoint; "Add it
  to the mock" adds the call to a mock that lacks it; "Give a real response" gives a file for that one call.
- **The Data step, top to bottom**: what this task calls, where its data comes from, then each mock in full, folded.

Also said, and next: "this is about mock API, but the other is data fixtures if any are needed": what must already be
in the app's own database for the task to be tried. The same shape (the task lists what it needs; each need says
what satisfies it: the repository's own seed, made-up rows of ours, or nothing yet), built with the review branch,
since a reviewer's rows have to travel in it.

### A file is given on the call it answers (Sandy, 2026-11-21)

"When I create a new service, at that point it asks me to upload a CSV. The thing is, a service can have multiple
endpoints, right? So shouldn't the CSV get uploaded per endpoint?" Yes: the service form with its file field was
from before a mock listed its endpoints. On a task's Data step there is no "Add a service" any more: a service comes
into being from a call (Add a call, or the agent's list), and every call's row has "Give a real response", whatever
answers it now. Where nothing does, the mock is made (or the call added to it) first, then the file is kept as that
call's. A mock that needs a real response and lists its endpoints points at those rows instead of taking a file of
its own.

### A clean slate, and every piece can be changed or removed (Sandy, 2026-11-21)

"I removed the mock so I didn't upload the CSV yet. Or if it's there, it's because it wasn't deleted, but it should
have been … I'm trying to start from scratch … it feels like there's legacy data that's hanging around, making it
just impossible to figure out what's going on." And: "make sure … there's edit and delete capability for all the
different components we're going to be dealing with."

What had happened: Remove left a mock's real responses on this computer on purpose, and the next mock of that
service took the newest one up as its own, so a mock she had given nothing showed a real response and was built from
it.
- **A mock's real responses are its own** (`recordingsFor`): those that came in since it was made. One left by a
  removed mock is never taken up. The leak check still reads every one on this computer.
- **Removing a mock asks** whether its real responses are deleted from this computer too, deleted unless unticked.
- **Real responses on this computer** are listed on the mock's card (what and from when, never what is in them),
  each deletable; one from before the mock says it is not used.
- **Everything can be edited and removed**: a call on a task (edit, remove, clear the list), an endpoint on a mock
  (edit, remove), a data set (rename, remove, as before), a real response (delete), a mock (edit, remove).

**Why the first full real file got no data** (found on the 89-column results file): the faker was right, the leak
check was wrong, twice. Data written out four levels deep was read as a sentence past the third level, so its keys in
a row counted as a phrase; and "(1)." was taken for a handle, so every "1" in the fake counted. Both fixed, and tried
on the real files: no leaks, and the person's name is not in the fake. Tightened on the way: a one-word value written
as a name is (a first name, a surname, a company) is now looked for anywhere in a mock, where before a single word
was only found as a whole value; and the faker no longer offers a column like `first_name` as "perhaps structure".

Next: a data agent with instructions of its own, called by the task's agent, that works in three steps and stops
after each (what the task calls; where each service's data comes from; build what was decided).

### Services are the app's, set up in its settings; a task picks from them (Sandy, 2026-11-21)

"I think we should have a section for services … the agent would say, these are the services we're calling, and then
for each of those services we're making certain calls." "When you go to add a call, it lets you write anything you
want in the service, and I don't like the idea that I could write 64 with an underscore and it looks like it's a
different service." "The services could be configured in the settings, and that way … the app only has certain
services it can connect to. And if we look at the code and find ones that aren't in the settings, then we set them up
in the settings."
- **A service is one of the app's** (it is its mock's row), set up in Settings › Mocks: its name and what it is
  (`addService`). A name that is one already there written differently (case, spaces, underscores) is refused, with
  the one it is. "Add a service" is back in Settings.
- **A task picks its services** (`task_service`): from a list on its Data step, never typed. One the app does not
  have is added to the app's services from there, under the same check. An agent that finds one in the code sets it
  up in the app's settings (`task_calls` op service) and it is marked as found for that task.
- **Calls sit under their service**: a call is added inside a service's block (method, path, what the task needs),
  and is on that service's mock as an endpoint from then on, so a real response can be given for it at once. A call
  to a service the app does not have is refused.
- **The Data step**: Services this task calls (each with its calls), where its data comes from, each mock in full.

### A service is described as it really is, not by how to mock it (Sandy, 2026-11-21)

Filling in a service she was asked for "the variables that point the app at it" and told to type
`SIXTYFOUR_BASE_URL={container_url}`. "container_url? what is that?" Then: "we don't have a mock yet, so the service
we should be defining the way the service actually works, not how to mock it. That way if we need the connection, if
we need to record anything …". So a service's form asks three facts about the real connection: its real address, the
name of the app's setting that holds that address, and the name of the setting that holds its key. From those the
engine works out the rest (`envFromConnection`): the address setting is given the mock's or the recorder's address
(as a container reaches this computer, or as this computer does, read from how the app is started and kept as an
agent set it), and the key setting a made-up key, so the real key never reaches a mock. No placeholder is shown to a
person; an agent still sets the variables directly. A mock's card says the connection in a line.


### A service is its real address and the environment variable to override (Sandy, 2026-11-22)

Sandy asked why the engine needs the app's variable at all, and we went round the options. Getting in the way on the
network (the app calls the real address and we answer it) was ruled out: the app would have to trust a fake
certificate and "our service has to be there for this to work". An app that checks what state it is in and branches
was ruled out too: the code a reviewer runs would not be the code that goes live. What is left is the ordinary
convention, and the rule from now on: **every outside service's address is read from an environment variable that
defaults to the real address.** The code is the same everywhere and only the value differs. "All we have to do is
define what the address is, and so we say the real address, and then we say the override variable." The form's
fields are now named that way (Its real address, The environment variable to override, and optionally the one for
its key). An agent that finds a service whose address is written into the code adds the variable as part of the
task; a library with no way to change its address is reported plainly. Mockaroo came up: it points the app the same
way (its address goes in the same variable), so it could only ever be a source of invented data, not a replacement.

### Real or mock per place, and data on the endpoint (Sandy, 2026-11-22)

Looking at the options for where data comes from: "Record and Replay seems like it is describing a step we would do
in the data tab. We either use real or mock, where the mock comes from is a separate concern." Then the layout: "in
settings each service has, top to bottom, definition (name, url, env vars), the default data source mock or real,
then a place to add endpoints where you define endpoints and set the mock data. Then on the data tab all of those
would be set and you could override." And: "In practice, all this means is that you can now override a single
endpoint. Because whatever you set in the settings will be the default set." Built that way:

- **The choice per place is the real service or the mock.** For a person's own prototype or smoke test the mock can
  be told to answer with recorded responses as they are; the default is faked. A reviewer has nothing to choose:
  always the mock, never anything real. The stored values are the old ones read anew (`live` the real service,
  `fake` the mock, `replay` the mock with recorded responses), so nothing was migrated; a named set (`data`) is no
  longer a choice.
- **Data sits on the endpoint** (`engine/src/mock-serve.ts`). Each endpoint has the app's data and, for a task, the
  task's own in place of it. What a run is given as `$MOCK_DATA` is put together endpoint by endpoint: safe files
  written out, recorded ones as links into their recording, so deleting a real response takes it out of everything
  that served it. Underneath, the data is where it was (the sets of `mock-data.ts`, the recordings on disk): a
  response given for one endpoint is faked into a set of that endpoint's own, and a task's own carries the task.
  Named sets are no longer shown, except on a mock that lists no endpoints.
- **Sensitive endpoints**, asked for while this was being built: "marking specific endpoints as being sensitive …
  if they're marked as sensitive, you aren't able to store non-faked." A real response of one is faked the moment
  it arrives (given, or in a live run) and the original deleted; marking an endpoint sensitive does the same to
  what is already on this computer. The fake uses the plan that endpoint's fake already had, else the mock's, else
  none, and is refused, with nothing kept, while the leak check finds a real value in it. Because the original is
  gone it cannot be faked again with a better plan: the form says so.
- **The pages.** A service in Settings reads top to bottom: definition, what each place is given, endpoints with
  their data (add, replace, remove; add an endpoint; mark it sensitive), then provenance, real responses and
  history folded away. A task's Data step shows the same for the services it calls: what each place is given with
  an Override, and its calls, picked from the service's endpoints, each with its data and an Override (or Add,
  which becomes the service's data in Settings, and says so). A call the service does not have is added to the
  service in Settings, and the form says so.
- **Recording** is a button on the service (a live smoke run of its task), not an option in the table.
- Removing a mock now also removes its folder under the mocks home (its server and the data folders written for
  its runs), so nothing of it is left.

Not done: the first fake of a real response still needs the task's agent (it says what is structure); the data
agent is the next piece and will own that. Export carries the app's safe data for every endpoint.

### A service's base settings sit at the top, like a profile (Sandy, 2026-11-22)

"Can we move the base settings to the top and show them like you would a profile where name is at the top?" A
service's card now opens with its name, then each base setting on a line of its own (what it is, real address,
variable to override, variable for its key, its mock), with Edit beside the name. Editing happens in that same
place, and the name can be changed there too (its key, which data and tasks go by, stays).

### Creating a service is creating its server (Sandy, 2026-11-22)

A new service's card said "Its mock: Not built yet. · Not in use right now". "What does building the mock entail?
It feels like you see something like that and you think, oh, I need to do something, but there's nowhere to do
anything from … how mocks get used should be really just an issue of creating endpoints and then pointing the
application at it." And on whether that is per task: "if it's not for every task, then it should be done at the
settings level … when you create a mock service, we also create the actual server, it then gets injected into the
reviewer code." Agreed, with one correction to her worry that a reviewer's code would then depend on Self Evident:
the server is copied to the review branch as a plain file, never linked.

- **A general mock server** (`engine/src/mock-general.ts`): one file with no dependencies that reads a service's
  endpoints and answers each call with that endpoint's data file from `$MOCK_DATA`. A call to an endpoint with no
  data fails with 501 and says which; a call that is no endpoint's fails with 404 and lists the ones it has. It
  accepts any key.
- **Any service with an endpoint is started with it** by a prototype, main or a smoke test, as long as its variable
  to override is set. A server an agent wrote for the service is used instead where there is one: that stays the
  way for a service whose calls depend on each other (a job started, asked about, then answered for what was sent).
- **"Not built yet" is gone.** A service says how it is served: straight from its endpoints (and how many have
  data), by a server written for it, or that it has no endpoints yet and needs one added. "Not in use right now"
  is no longer said; where it is in use is.
- **Export** of a service without a written server gives the general server, its endpoints and its safe data, with
  the command that runs them. Putting those on a review branch with one start command is the next step.

This is not the declarative format ruled out earlier: there are no rules or scenarios, only the files already on
the endpoints, and anything that needs behaviour still gets real code.

### The service tool: any agent sets up the app's services, and research adds endpoints (Sandy, 2026-11-22)

"Does the agent have access to like an MCP style thing to add endpoints, so that I can work with the global agent to
build out the 64 endpoints?" Only partly: the mock tools were shaped around tasks and written servers, so an agent
could not add an endpoint to a service outside a task, mark one sensitive, or give one endpoint its data. "I think
we need a settings MCP that any agent can use." And: "if we do it right, then … part of research would be adding
endpoints."

- **The `service` tool** (`engine/src/tools.ts`), for every agent of the app, the app's own conversation included:
  list the services; add one (name, what it is, real address, the variable to override, the variable for its key);
  edit it; add, edit and remove its endpoints; mark one sensitive; give an endpoint data it wrote, for the app or
  for one task alone; take an endpoint's data away. It calls the same functions as the Settings page.
- **Two things stay the person's.** An agent may mark an endpoint sensitive and never take it off. It cannot remove
  a service. And as before, data an agent writes is kept only when it could be checked against a real response of
  that service; with none on this computer, only the person can provide it. An agent never passes a real response.
- **Every change is in the service's history**, with who made it and for which task.
- **Research adds endpoints.** Task, idea and prototype agents are told that the calls they find while researching
  a change (in the code, in a service's documentation) are added to the service as endpoints, sensitive ones
  marked, and said in the research notes. The app's own agent is told what services there are and that it can set
  them up with the person. An idea's agent is now told of the app's services too.

Scoped to services for now, not every app setting.

### A call can have a next step; the endpoint it follows is intermediate (Sandy, 2026-11-22)

An endpoint on SixtyFour read "GET The download_url the links answer gives (a signed file link)". "This is a strange
endpoint … is it something that gets pushed to us?" It is the app fetching the file from a link the previous answer
held. "Ahh so then it's a child of download-links, a second step … endpoints should be marked as intermediate or
something and then you define the steps."

- An endpoint may say it **follows** another, and the **field** of that answer which holds its link. It has no
  path of its own; the endpoint it follows is shown as Intermediate, with the step right under it as "Next step".
- In Settings the endpoint form has "A next step: it is called on a link another endpoint's answer gives": pick the
  endpoint, name the field. The service tool takes the same (`follows`, `linkField`).
- **The general server follows the chain**: it answers the intermediate call with that field pointed back at
  itself (its own data kept otherwise; with none, just the link), and answers the step from the step's data. A
  signed link in recorded data is therefore never followed.
- Removing the endpoint it follows leaves a step standing alone; two endpoints cannot follow each other.

This takes away one of the two reasons SixtyFour needs a written server. The other stays: its results must be
answered for exactly the people a job was sent.

### Reviewable pull requests: what is left, with clean-up and the data holes (Sandy, 2026-11-22)

Talking through where real data sits and where it leaves this computer, Sandy assumed a prototype's and a smoke
test's database are removed when they are done with, "same thing … when we close a task". They are not: a
prototype's database is dropped only when it is discarded (not when stopped), a smoke test's only when a run is
started clean, and closing or merging a task removes nothing. "Put the cleanup into the list of things we want to do
for this." The list, in the order agreed so far:

1. **Prove it on CEB-90**: SixtyFour set up with the app's agent, the real results given, the fake made, its server
   written, and a smoke test run on the mock.
2. **The data agent**: one per task, called by the task's agent, in three stop-and-wait steps (list the calls, say
   where each service's data comes from, build only what was approved).
3. **The review branch**: the mock server, endpoints and faked data on a `<branch>-review` branch with one start
   command.
4. **The gate**: a task cannot go to Ready for review until its review copy can be made.
5. **Fixtures**: what must be in the app's own database.
6. **Clean up when a task closes**: discard its prototypes (dropping their databases), drop its smoke test's
   database, and delete its real responses from this computer, with what will go shown to the person first.

Data holes found in the same conversation, to close alongside:

- A prototype that ran on recorded responses keeps the real findings in its database; the block on sharing looks
  only at what its mocks serve now. Sharing should need a reset first.
- Not verified: whether a smoke test's evidence is kept out of a pull request when the run used real data.
- A prototype connected to a database that is not its own local one should not be shareable.
- An agent that makes a fake reads the real response, so it goes to the model provider and into the conversation's
  transcript. A sensitive endpoint avoids this (the engine fakes it and no agent sees it).
- The faker keeps numbers under seven digits, so counts could still point at one person.

### On a task, a call's next step comes with it (Sandy, 2026-11-22)

"Let's make the dependent call be one endpoint you add to the task, and have it indented like it is in settings."
On a task's Data step a call with a next step is one thing to add: the picker offers the call ("with its next
step") and never the step by itself, and the step is shown indented under the call, with its own data to override,
whether or not the task lists it. A step the task does list (an agent named it) sits under its call too, with what
the task needs of it. The checkbox "Recorded responses as they are" was not clear ("what is this in the data
source?"): it now reads "Use the real responses, not the faked copies (this computer only)".

### Adding data asks one thing: is it real data (Sandy, 2026-11-22)

"I'm not crazy about the way it said the response that was actually sent." Then, working it through: "one is
putting a flag on it to say yes, this is actual real data that I'm giving you, and one isn't. And then the question
is, should I fake it?" The answer is always yes when it is real, so the form asks only the flag: a box, "This is
real data", ticked to begin with. Real data is kept here and a faked version made; unticked, the file is used as it
is. Whether a person's own run uses the faked version is the place's switch, which now reads "Use faked version"
and is ticked unless they turn it off.

### Faked or real is the endpoint's to say; a place only says real service or mock (Sandy, 2026-11-22)

Looking at "Use faked version" on a place: "it matters what endpoint it is … starts to make me feel like that
should be at an endpoint level." Half of it moved. Real service or mock stays the service's, per place: the app
reads one address for a service, and a chain of calls cannot start on the real one and continue on the mock. Which
version of its data a call is answered with is the endpoint's: each endpoint with a real response has its own
"Use faked version" switch beside its data, ticked to begin with. Unticked, a person's own prototype and smoke test
get that endpoint's real response; a reviewer always gets the faked one, and a sensitive endpoint has no switch.
One switch covers both the prototype and the smoke test. A task starts from the app's answer and may set its own,
and put it back (`task_service.faked`, migration 0053). The stored source `replay` is refused from now on and read
as the mock where it was already chosen.

### A task's Data step is one section; nothing is shown twice (Sandy, 2026-11-22)

A screenshot of CEB-90's Data step: the services the task calls with their calls, and under it the app's SixtyFour
card with the same endpoints again. "We are duplicating info here, we can have this all in one endpoints section."

- On a task the app's own cards are no longer shown under the task's services. A line says where the rest of a
  service is (its address, its real responses, its history: Settings › Mocks).
- A call on a task shows what the call is as the service has it, where before it said "Nothing said yet"; what the
  task needs of it is shown as "This task needs".
- A service block on a task says when a real response is in and its agent is working on it, with Ask again, and
  names the service's endpoints the task does not use.
- A place no longer spells out which call's real response has no fake: it says how many, since the endpoint says it
  in full, and a reviewer's block says it once.

### Fixtures: the data is a template, the fixture supplies who (Sandy, 2026-11-22)

Checking CEB-90's set-up against the app's code: a smoke test would find nothing, because the app accepts a result
row only when it carries the id of an employee it just sent, and the general server answers with a fixed file. I
proposed two settings so the mock could answer for what it was sent. Sandy: "did we do all this work to get a
generalized mock system in place, and now we're just going to build an ad hoc one?" and then the better answer:
"I'm not testing to see how our mock properly returns the right users … the mock should also mock what is sent.
Send the same users that we have results for in our mock." And: "you'd use the fixture to create the fake data. The
CSV that you upload is just a template to use to fill out people."

- **A fixture is one of the app's shared scenarios** (`prototype-data.ts`): made-up rows by table, saved with their
  ids, so the ids do not change. Nothing new is stored. They are listed in Settings › Mocks and on a task's Data
  step, with their tables and row counts (`engine/src/fixtures.ts`).
- **An endpoint's faked or provided data can be filled out for fixture people.** Pick the fixture, the table its
  people are in, who to start from and how many, and which columns of the data are theirs (`tracking_id` is their
  `id`, `work_email` their `work_email`). Each person gets the template's rows with those columns set; where the
  real response the fake came from is still here, each person after the first gets it faked afresh, so they do not
  all read alike. Filling out again starts from the template, not from the last filling. Checked against the real
  response.
- **A task's smoke test database is built from the fixture its data was made for**, else the app's shared
  "default" as before. So what the app sends is who the mock answers for.
- Agents have the same through the service tool (`fixtures`, `endpoint_fixture`), and are told to do this where an
  app matches what comes back to what it sent, instead of writing a server.

Not done: a prototype is still built from the scenario chosen in its own panel, so its fixture is the person's to
match; fixtures cannot be renamed or deleted from this page yet; the two "answers for what it was sent" settings
were not built and are not needed for CEB-90.

### On the Data step, fixtures come first and the services section explains itself (Sandy, 2026-11-22)

"Fixtures should go above services, and the 'what this calls outside this app' should go at the top of the services
section." The order is now: fixtures (what is in the app's own database), then the services outside it, with the
paragraph saying what they are under that section's heading. The same order in Settings › Mocks.

Then the outline she wanted, as she wrote it: Data › Fixtures; Services › What the task needs, then each service
with Info, Source, Endpoints. The Data step is headed "Data"; the services section "Services", opening with "What
the task needs"; each service block has Info (what it is, real address, variable to override; changed in
Settings), Source (what each place is given) and Endpoints (the calls the task makes). Settings calls the same
part "Source".

### The Data step: one heading, and its agent's report at the top of the services (Sandy, 2026-11-22)

"You have Data as the page name, then another section that again says data": the inner heading is gone on a task.
And the agent's report ("What this task calls outside the app …") is what she meant by what goes at the top of the
services section: it is shown there, under "What the task needs", in a block that folds away, and no longer below
the whole panel.

That report, for CEB-90, names two things the engine refuses that it should not, to fix next: a fake of the given
results file is refused because three cells hold JSON objects whose keys name providers (the faker keeps keys as
structure, and a column named as text does not replace an object cell); and invented data is refused for the fixed
words the app needs (statuses, platform and channel names), because it is checked against every real response of
the service without the words a fake of them was allowed to keep.

### The two refusals that blocked CEB-90's fake (2026-11-22)

Both were reproduced in a test with made-up data before they were changed. CEB-90 and its results file are on
another computer, so neither is proved on the real file yet: that is step 4.

- **A column or key named as text is replaced whole, whatever it holds** (`fake.ts`). A cell holding a written-out
  object was gone into all the same, and its keys kept as structure, so naming the column in `text` did nothing.
  Now the cell becomes sample text, keys and all; a key named by its path (`detail.found`) that holds an object or a
  list is replaced the same way and the rest of its cell is still gone into. The cell is then no longer an object,
  so the tool tells an agent to name one only where the app does not read inside it.
- **Invented data is checked with what the service's fake plans keep, in every real response** (`mock-data.ts`). A
  fake's kept words are only the ones in the response it was made from, so a status that only another response has
  ("failed") was refused as someone's. Each real response is now read with the plans of the service's fakes (their
  keep, keepValues and keepHosts together), and what they would keep there is structure. What is someone's (an
  email, an id, prose) is never kept, as before. A service with no fake has no plan, and nothing changes for it:
  the results file has to be faked first, which the first fix allows.

### The Data step is rebuilt to the mockup's levels (2026-11-22)

Step 1 of the brief, applied to the real page and looked at on CEB-90 at two widths. Sandy has not approved the
look yet: it is on the branch `data-levels` for her to see.

- **The levels are the mockup's** (`DataStepLayout.stories.tsx`): Fixtures and Services are sections, ruled off
  and headed; a fixture and a service are the same kind of block; Info, Source and Endpoints are parts; a call is
  a row. On a task the page is no longer a panel inside the step's panel, and Source has no box of its own.
- **What stacks is decided by the width of the Data step, not of the window** (a container query). Beside the
  agent's pane the step is about 340px wide while the window is 1500, so the window's width said "wide" and three
  columns were squeezed into it, words breaking one to a line. The mockup had the same fault.
- **An endpoint's data is two lines, not five.** What it is (its badge and file, and "This task's own"), then one
  faint line: where it is from, who it is made for, and what can be done, as underlined words in place of boxed
  buttons. The same cell in Settings › Mocks.
- **The agent's report is "What the task needs", folded shut**, with its headings set at the size of a part. Open,
  it pushed the services a screen down and its headings were larger than the section's.
- **A fixture opens to its tables**, each with its first columns and its row count.

Not done, and not drawn on the real page: the fixture buttons of the mockup (make one from the seed, rename,
delete), which are step 3. CEB-90's app has no fixture: its list of shared scenarios is empty, so `ent322-findings` is not shared with the app
(whether it is one prototype's own was not looked up), and "Fill out for fixture people" has nothing to pick from
until step 3.

### A fixture is made from the app's seed, opened, renamed and deleted (Sandy, 2026-11-22)

Step 3 of the brief. A fixture is a set of tables: a saved copy of the app's own database, rows by table, with
their ids. What was missing is anything to do with one on the Data step.

- **An app has a seed command** (`prototype_db.seed_cmd`, in Settings beside the schema command; agents set it
  with `set_prototype_database`). Asked how a fixture should get its data, Sandy chose this over copying a
  prototype's database: Self Evident did not know the app's seed, because the app's prototype start script ran it.
- **"Make one from the app's seed"** (`makeFixtureFromSeed`, `fixtures.ts`): a database of its own is made from
  nothing, the schema command and then the seed command are run in the app's checkout, what is in it is kept as a
  fixture shared with the app, named "seed", and the database is dropped. Made again, "seed" is replaced, after a
  question. Where the app has no seed command, no database or no checkout here, the button cannot be pressed and
  what is missing is said.
- **A fixture opens to its tables and a table to its rows** (the first 50, every column, as text). It is made-up
  data, so it can be read. **Rename** carries along the data filled out for its people and the prototypes built
  from it; a name taken is refused. **Delete** leaves that data as it is, and says how much of it there is first.
- **A prototype follows its task's fixture** on its first start, as the smoke test does: the fixture its
  services' data was made for, else "default". One that already has a database is left alone.
- Agents have the same through the service tool (`fixture_make`, `fixture_rename`, `fixture_delete`).

Done for real on the app CEB-90 belongs to: its seed command is set, and its seed made a fixture in 18 seconds
(250 employees, 13 departments, 1 company, 1 tenant, 60 cohort rows, 6,525 score snapshots; 1.5 MB of the 2 MB a
fixture may be). `ent322-findings` was looked up: it is not a fixture. Two prototypes each have a scenario of
their own by that name; the one with 250 employees belongs to another task's prototype, and CEB-90's holds only 12
findings and a scan job.

Not known: whether the app's seed gives the same ids every time. If it does not, making "seed" again breaks the
tie to data already filled out for its people. Check before step 4 relies on it.

### A saved real response has "Make fake version" on its own row (Sandy, 2026-11-22)

"How do I make the faked version of the CSV? … I choose use faked version, but how am I supposed to make it?" There
was no way: the fake was the task's agent's to make, the row only said so, and the box "Use faked version" looked
like the control. "Let's add a button next to any value that is saved, make fake version."

- **The button is on the row of every saved real response** (`fakeEndpoint`, `mock-serve.ts`): one with no fake
  yet has "Make fake version" under "Not faked yet"; one with a fake has "Make the fake again" among its words.
- **A person writes no plan.** The plan its fake already had is used again (so what an agent said is structure
  stays), else everything not plainly structure is replaced. It is checked against the real response as always.
- **Refused, it says what was found**, and offers "Ask the task's agent", who can say what is structure. Nothing
  is made of a refused fake.

### The fill form starts on the people's table, and CEB-90's file has no column to match on (2026-11-22)

Sandy opened "Fill out for fixture people" on CEB-90's faked results file: it offered `score_snapshots (6525)` as
where the people are, "Starting from 1", and no columns.

- **The form starts on the table that says who someone is** (`peopleTable`, `EndpointData.tsx`): the one with a
  name and an email among its columns, or named for people; it was simply the largest. The columns guessed for it
  are guessed again when another table is picked, until the person changes one. An empty list says why and what
  a line is.
- **Found, not fixed: the file given cannot be matched to anyone.** The app matches a results row to an employee
  by `tracking_id` (the employee's id) and checks `work_email` against it; a file with no `tracking_id` column is
  refused whole (`vendor_csv_missing_tracking_id_column`). The file given for CEB-90 has neither column: `_row_id`,
  `first_name`, `last_name`, `company`, `job_title`, `Status` and nine of findings. Filling out only sets columns
  the data has, so it cannot make this file one the app will read. Open, Sandy's to say: give the file the
  service's download link really returns (which echoes both), or let filling out add a column the template lacks.

### What the results file is, and what it is not (Sandy, 2026-11-23)

A long turn of working out what we are doing with CEB-90's results CSV, written down so it is not worked out again.

- **The CSV is an example of enrichment, not somebody in the fixture.** "These 250 people are the baseline, the
  CSV is an example of how you would enrich those … there should be no thinking that the CSV is somehow actually
  applying to one of these people." The fill form started from "which person is this file for", which is the wrong
  question.
- **The migration applies to the database, not the fixture.** A prototype's or smoke test's schema is made by the
  task's own migrations, then the fixture's rows are loaded. CEB-90's migration adds two tables and changes none,
  so the fixture loads as it is and the new tables fill when the feature runs. Findings put straight into a fixture
  would show without the task's code having run. Not tested: a migration that adds a required column to a table
  the fixture has rows for.
- **A scan is for a list of people, one or many, in runs of at most 50**, and the app drops a results row whose
  id it did not send. So one fixed file for all 250 is not what the mock should answer with.
- **What a reviewer does**: imports one made-up person from a file they are given, the app scans that person, and
  the mock answers with a results file written for that same person. An imported person gets a new id, so the two
  are tied by email: the app takes a row with an empty `tracking_id` whose `work_email` matches (its own recovery
  path). Not run yet.
- **A fixture grown from an example or two is its own feature, and a Fixtures one.** "It very much might be the
  case that we're building a new feature and that feature requires the database to have seeded data, but we don't
  have that data. So we enrich the fixture … we give one or two examples, like a one or two shot example, and then
  have the whole database get updated … it's not a part of the services part of the data. It's part of the fixture.
  It's a pre-prototype fixture mutation of some sort." What "Fill out for fixture people" was reaching for belongs
  there. Not built; added to the brief.

### Test files: the third section of the Data step (Sandy, 2026-11-23)

"The one thing that's not a part of this data is the smoke test assets. Things that are required to test. In this
case a CSV that has the person who we're also enriching." "It could be more than one, an image for instance and an
id card."

- **A test file is a file and a line saying what to do with it** (`test-files.ts`, table `test_file`): any kind,
  as many as it takes. The app's are for every task; a task has its own beside them. The file is kept on this
  computer (`~/.self-evident/test-files`), its row in the database.
- **It holds nothing real, because it goes to a reviewer.** Whoever adds one says so, or it is refused. Text (a
  CSV, JSON) is also read against the real responses of the app's services on this computer and refused while a
  value of one is in it. A picture or a document cannot be read that way and rests on the person's word.
- **On the page**: "Test files" after Services on a task's Data step and after the app's services in Settings ›
  Mocks. A picture is shown small; a file is downloaded by its name. Agents have `test_files` (list, add text,
  remove), and are told to use the same made-up person in a test file and in the mock's answer.
- **A refusal shown on a page says what was found by its kind and never quotes it.** True of test files, and now
  of "Make fake version" too, whose refusal had passed the agent's list of real values through to the page.

Not done: nothing ties a test file to a mock's answer but the person's care; the smoke test's instructions and the
review branch do not point at test files yet.

### 2026-11-23: A real test file is faked on the way in

Sandy, on the "This holds nothing real" tick box: "it could be real data, we just need to fake it if it is"; "if it
holds something real, then what we should do is have it fake it or clean it". And on the notes: "remove the
specificity of the notes. makes it really hard to understand what the point of this is."

- **Adding asks one thing: made up, or real.** Made up is kept as it is. Real makes a fake version with the same
  faker the endpoints use and keeps only that; the real file is never written to this computer. Its line says
  "faked".
- **Only text can be faked** (a CSV, JSON). A real picture or document is refused, to be replaced by a made-up one.
- **A fake that still carries a value of the real file is refused**, by count alone, and nothing is kept.
- **The notes are short.** The section says "Files a tester needs to complete the review." The line on a file is
  labelled "File Context".

Not tried on a real file yet: the faker takes no plan here, so a column of fixed words the app needs (a status, a
role) is replaced like any other.

### 2026-11-23: Files are fixtures, with a real and a fake version, and every run is given them

Sandy: "whatever you upload there is what the prototype, the smoke test, or the review has access to … we build it
that way on purpose so that when I'm doing the prototype and when I'm doing the smoke test, I'll be experiencing it
just the way the reviewer would"; "on the file itself, we would say we would have a real and a fake version, and
we would say which one to use for which environment. And the reviewer environment can only use the fake one, or if
it's already fake, it's just all the same"; "maybe it belongs in a fixture section where we have database and
then folder structure or files"; and, on what a file is beside the database fixture: "This file … is not a part
of Meridian … This is taking the Meridian as the base and saying … the test is to add stuff to it. Here's the stuff
that you can add."

- **One Fixtures section, two parts: Database and Files.** "Test files" is no longer a section of its own. The
  database is what the app starts with; the files are what a tester adds to it. Files stay the app's or a task's,
  not a named database fixture's.
- **A file has up to two versions**, as an endpoint's data has. Added as made up: that one version, everywhere.
  Added as real: kept on this computer only (this replaces the entry above, where the real file was never kept),
  and a fake is made of it at once when it is text. A real picture or document has no fake until a made-up one is
  added under its name; until then a reviewer does not get that file.
- **Each place says which version it uses.** A prototype and a smoke test: the fake unless turned to the real one.
  A reviewer: the fake, always, not offered a choice.
- **A run is given its files in a folder.** When a prototype or a smoke test starts, the versions chosen are put
  in a folder of its own outside every repository, with a README.md saying what each is for, and the run is told
  where: `$TEST_FILES`. Outside the repository, as the smoke test's set-up is (2026-11-17), so nothing of it can be
  committed. An agent trying a smoke test check is told the folder and what each file is for.

Not done: the review branch does not carry the folder yet (step 6; `placeTestFiles(…, 'review', …)` is what it
will call). An app that runs in a container sees `$TEST_FILES` only if its start script mounts it. The pages for a
prototype and a smoke test do not show the folder's path. Sharing a prototype does not yet look at whether it was
given a real file (step 9). Step 8's cleanup must delete a closed task's real versions.

### 2026-11-23: An endpoint's fields can be mapped from a file

Sandy, on a file with a real and a fake version meeting a mock that answers with one fixed file: "on the endpoint
be able to select fields from either Meridian or a file … it's basically map fields from the fixture, and you can
get it from wherever you want. So if you tried to do it with a PDF, there would be no fields, but if it's a CSV, you
have fields. That means you can fake the data, but map certain fields to the fixture."

- **An endpoint's response is faked data with some fields mapped from a fixture**: a database table (the fill-out
  form, as before) or, now, a CSV among the fixtures' files. "Map fields from a file" on the endpoint's data: pick
  the file, say which columns of the data come from which of its columns. A column the data lacks is added; one
  can be left empty (CEB-90's `tracking_id`, an id the app only makes when the person is brought in, so the app
  matches the row by `work_email`).
- **Only the mapping is kept.** It is worked out each time the mock's data is served, from the version of the file
  that place uses: a prototype or smoke test set to the real file is answered for the real person, a reviewer for
  the fake one. Nothing real is stored in a mock's data. A run answered for a real person counts as on real data
  (not shared).
- **With a database fixture too**: data filled out for a fixture's people keeps those rows, and the file's people
  come after them. Without one, the file's people are all it answers for.
- Agents: `service` op `endpoint_file`.

Considered and left: the mock taking who it answers for from what the app sent it. Not needed while the app matches
by email; it would be a third source in the same mapping.

Not done: tried on CEB-90. A run on the real file writes the real person into the mock's served folder on this
computer (`~/.self-evident/mocks/<app>/<service>/data/served-…`), which step 8's cleanup must remove. JSON data is
not mapped, only CSV.

### 2026-11-23: Data scripts, noted and not built

Sandy: "the last thing we need is like custom scripts that can be used to override things if need be, or to add
custom logic where we're mapping different fields of the data … it would be a data script and you would map it
onto some function in the actual application. It'll be like a function override essentially … the function that in
this case would take the ID, we override that to use the email address, even though the real application didn't
have that … let's add that later."

A third kind of thing on the Data step, after fixtures and services: a script mapped onto one function of the app,
standing in for it while the task is tried. For when mapping fields cannot make made-up data fit (an id the app
makes as it runs). Open when it is built: how a script reaches a function without the app's code changing, which
the goal forbids ("the app's code is exactly what goes live"), and whether a reviewer runs it. The Data step shows
"Data scripts · Coming soon" at its foot; nothing is behind it.

### 2026-11-23: One mapping action, from a table or a file; and what a data script costs

- Sandy: "we need to be able to select a file or a database table." An endpoint's data has one action, "Map fields
  from a fixture", and the source is chosen in it: a table of the fixture's database (pick the people; their
  values are written into the data) or one of its files (everyone in the file; worked out when served). The two
  were separate actions.
- On data scripts replacing a function of the app, against "the app's code is exactly what goes live". Sandy:
  "This is a tradeoff for complex data dependence stuff." So: a last resort, after fixtures, files and mapping
  cannot make the data fit; and a run with an override says which function was replaced, wherever its result is
  shown.

### 2026-11-23: The file mapping lists every column of the response

Sandy: "I should see the fields in the response on the left and the fields in the [file] on the right." The form
had a text box per line, which showed only what matched what was typed. Now every column of the response is listed,
each set "as faked", from a column of the file, or left empty; a column the response lacks is added below them
(CEB-90's sample response has no `work_email` or `tracking_id`, because the service echoes the columns it is sent
and the sample was made from a run that was not sent them).

### 2026-11-23: The mapping lists only what it overrides, and the data says what is overridden

Sandy: "what if the file or the table has like a thousand rows? … you choose which rows you want to override, but
you can either choose a row or you can add a new one"; and "underneath that, say … Overridden fields and then have
it what fields are overridden and where they're overridden from". Taken as the lines of the mapping form (the
response's columns): the form lists only the columns overridden, each picked from a list of the response's columns
or added as a new one. Under an endpoint's data, a line names the overridden fields and the file or table each
comes from.

### 2026-11-23: Notes

Sandy: "Do we have anywhere to save notes? I am having a convo and I want to include that I had it and the outcome
in my daily report"; "you should be able to attach it to a task, and in the task we should have a notes section.
The date will let us know when to include it in a report"; "This could also be part of the decisions that we make.
I don't know where those decisions are stored if we want to enumerate them."

- **A note is the app's**: the day it is about, a title, a body, and the tasks it is about (none, one or several).
  Kept in the database (`note`), so on a computer whose database is its own it stays there.
- **A task shows the notes attached to it** (its Overview, "Notes"); the Reports page shows them all, by day.
- **A report includes the notes dated in its period**, each said briefly under its ticket when it names one. The
  free-text box on the Reports page stays for what is not worth keeping.
- **A note can be marked a decision**, and decisions can be listed alone. This is for what is settled along the
  way, in conversation. The planner's decision cards (a question, options, the one chosen: `decision`) are their
  own thing and are not shown here.
- Agents have `notes` (list, add, edit, remove), to write one down when asked.

### 2026-11-23: A run chooses the fixture it starts from, and its database can be kept as one

Sandy: "the mockup, the smoke test, and the prototype for this were built before we had the data … what we need to
do is basically replace that with the data set that we built"; "I don't know if we want to define it at the data
level. The data is just what's there and available to it"; "we need to be able to save the smoke test or prototype
database as fixtures. Then when we start the smoke test, we choose which fixture to use."

- **The Data step is the library; the run chooses.** No task-level "uses this fixture" setting. A smoke test's page
  says what its database was built from, and "Start from a fixture" drops the database and builds it again from
  the one chosen. Restart leaves the database as it is, as before.
- **A smoke test's database is kept as a fixture** from the same line, by name. A prototype's already could be
  (kept as a scenario shared with the app).
- **A fixture can be real.** One kept from a run that held a real person, or what a real service sent about one, is
  marked so when it is kept: "Real · this computer only". Nothing uses the mark yet; the review branch (step 6)
  must leave such a fixture out.
- **"Empty" and "a prior run" are fixtures like any other**, not kinds of their own.

Not done: nothing checks that a fixture marked made-up holds nothing real. The app's own smoke script decides which
company is signed in to; for the enterprise dashboard that was fixed to one company and is changed in its settings
to follow the database. A prototype has no "start from" line of this kind; it loads a scenario from its Data tab.

### 2026-11-23: A smoke test can start empty

Sandy: "we need to have an 'empty' database option … or maybe we create an empty version in the settings?" Both:
"Start from…" on a smoke test offers **Empty** above the fixtures. The database is dropped and built again from no
fixture, then the smoke test's own seed runs. That seed is already in the app's settings (Settings › Smoke test),
so the settings say what empty means for the app: for the enterprise dashboard, one company with no employees.

### 2026-11-23: Every start of a smoke test goes by what is chosen

Found when Empty was chosen and a plain Restart pressed: only "Start from it" used the choice, so the database was
kept. Now Run, Restart and "Start from it" all start from what the picker says, and the button names it ("Restart
empty", "Restart from Meridian"). Nothing chosen: its database as it is. The choice is used once.

### 2026-11-23: A smoke test's files are a press away from its page

Sandy: "the browse files button in the smoke test is accessing my local file system, not the files we added to the
fixture." It is the browser's own file dialog, and a page cannot say where it opens or what it lists. So the smoke
test's page names the files it was given (a real version marked) and has "Show the folder", which opens their
folder in this computer's file manager, to drag a file onto the app or pick it from; and "Copy its path", for the
dialog's go-to-folder. Not done: the same line for a prototype.

### 2026-11-23: A chooser of the fixture's files, set aside

A prototype or smoke test could show its own chooser of the run's fixture files when the app asks for a file,
through the script the frame proxy already puts in each page. Sandy: "Can we add a note and do it afterwards? I
want to get this built as fast as possible, that I can actually submit the PR." Written into the brief's set-aside
list; CEB-90's pull request comes first.

### 2026-11-23: The frame is on the page's own host name

Found on CEB-90's smoke test: "Start Security Scan" pressed in the framed app was refused (the app's
`csrf_missing_cookie`), the same press in a tab of its own was not. The page was open at `127.0.0.1:5180` and the
engine names the frame `localhost:<port>`. To a browser those are two sites, and it keeps no SameSite cookie for a
frame of another site, so the app lost the cookie it guards every data-changing request with. The frame is now
asked for by the host name the page itself is open under (both are this computer). Checked in a browser from both
addresses: the framed app keeps its cookie.

### 2026-11-23: A fake being made says so, large

Sandy: "When we add a record and the agent is making a fake, we need that to have more prominent processing
animation. It looks like it failed, only a tiny bit of black text says that it is doing it." While the task's agent
makes the fake of a real response just given, the endpoint's data shows a banner with a spinner and a moving bar,
where the fake will appear; "Not faked yet, so nothing of it is served" and the Make fake version button are not
shown meanwhile. The cell asks again every few seconds, so the fake arrives by itself. After five minutes with no
fake it says so and points at the task's conversation. The same banner shows while "Make fake version" runs.

Found the same hour, not changed: asked for the fake of a new real response, CEB-90's agent also wrote a server for
the service ("served: written"), which answers for whoever it is sent. The brief says no server is written per
service; the agent's instructions for a fake still follow the older way. For step 5.

### 2026-11-23: A fake made again under its own name stays its endpoint's

Found on CEB-90: the task's agent worked for eight minutes, said the fake was made, and the endpoint still read
"Not faked yet, so nothing of it is served". The fake was there. The agent had made it again by naming the data set,
and `fakeData` drops the scope (which endpoint, which task) whenever a name is given, so the endpoint could no
longer find it. Fixed: a set made again under its own name keeps the scope it had, or takes the one its real
response says when the name is that endpoint's own. CEB-90's row was put right by hand (its scope set back).

### 2026-11-23: A service saved again keeps what its endpoints had

Found the same hour on CEB-90: the download step was no longer drawn under the call it follows. The agent had saved
the service with its endpoints listed plainly, and saving replaced the list whole, so the step lost what it follows
and the field its link is in. A list said again now keeps, for an endpoint it still has: that it is a next step,
what it is, and that it is sensitive (which a list can never take off). CEB-90's endpoint was put right by hand.

## The name is Evident (Sandy, 2026-11-20: "self-evident is a little bit provocative … Evident is a little bit more ambiguous why it would be called that … It also sounds a little bit more like a product"; "I just want it renamed in every place")

Wherever the name is written as words it now reads Evident: the UI, the docs, what the agents are told, and what
is left on other people's pages (a pull request's "Generated with Claude Code via Evident").

Left as they are, mine to choose: every identifier. The repository (`infinitedusky/self-evident`), the folder that
holds the keys (`~/.self-evident`), the database (`selfevident`), the package, plugin and MCP server names
(`self-evident`, so `self-evident:prototype`), the launch agent and the `/__self-evident/` paths. Each needs a move
on every computer it runs on, and none is read by a person. Nor this log's earlier entries, nor `research/` and
`ideas/`: they say what was said then.

Not decided: the line under the name ("the thing proves itself" was written for Self Evident); whether the
identifiers follow. Text already posted under the old name (pull requests, comments) is not changed; nothing of
ours recognises its own text by the name.

Done again on 2026-11-23: the change above was pull request #329, which was never merged, so the name stayed
Self Evident for three days and everything written since said so. Redone on that day's main with the same rule.
### The review branch comes before the data agent (2026-11-23)

Sandy: step 4 is done, and "can we swap 6 and 5?". The brief's order is now: prove it on CEB-90 (done), the review
branch, the data agent. CEB-90's data was made by hand and by its task's agent, so its pull request needs the review
copy and not the agent that would make such data for the next task. Still open from step 4: the smoke run that proved
the import and scan answered the results call with the real response; the faked version has not been through a scan.

### A review copy, made by hand for CEB-90 (2026-11-23)

Decided by Sandy: the fixture is chosen when the review branch is made (CEB-90: start empty); the branch is on the
app's own repository and is never merged; CEB-90 uses the server its agent wrote, and moving it to the general
server is to be done and tested after. Asked, not decided: whether the data should be downloaded from somewhere
hosted and not kept on the branch. Built so either works: the data is one folder the start command reads from one
setting.

What it took by hand, which is what the tool has to do:

1. Ask the engine what a reviewer is served (`served(m, {form: 'faked', place: 'review'})`) and copy that folder,
   following links. Check it once more against the real response, independently of the faker's own check: no
   email, link, phone number, date, sentence or name of the real one was in it.
2. A branch off the task's branch, `<branch>-review`, with one folder, `review/`: the mock's server and that data,
   the fake versions of the task's files, the fixture (here a seed of one empty company), a Compose file layered
   over the app's own, a start and a stop command, and a README saying what to try.
3. What the smoke test borrows from this computer has to come along: the start script, the Compose changes and
   the demo sign-in live outside the app's repository, and the database is this computer's. The review copy has
   its own of each, and its own database in its own Compose project.
4. Every service of the stack is given the mock's address and a key that is not one, over whatever the checkout's
   own `.env` holds, so a reviewer with a real key in theirs still never calls the vendor.
5. Found on the first start: the app's image binds `::`, which without `--reload` is IPv6 only, and nginx could not
   reach it. The review copy binds `0.0.0.0`.
6. Proved as the reviewer would: started with the one command, the made-up person imported, the scan run. 34
   findings stored (20 fake profiles live; 14 scams, 2 live and 12 reported), none of them carrying the real
   person's name. This was the faked data's first scan.

Not pushed. Open: the demo sign-in is now a file on a branch of the app's repository, which its tooling had kept
out on purpose; and the branch holds data.

The review branch's name (Sandy, 2026-11-23): `REVIEW-` up front, then the pull request's branch name with the task's
id moved to the end, so a reviewer sees at once which pull request it goes with: `REVIEW-<name>-<task id>`. It is
only a branch, with no pull request of its own; the pull request's "Run it yourself" section names it.

### The pull request explains its review copy (2026-11-23)

Sandy: above the record of how the change was built, the description needs "a canned explanation of what the review
is … how we're allowing them to have a review and why they should understand that it's identical", perhaps with a
diff. Written by hand on CEB-90's pull request as a section, "How the review copy works", which the tool is to fill
in the same way: (1) it is the pull request's code at a named commit plus one folder, with a link to GitHub's
comparison of the two branches as the proof (only added files, all in that folder); (2) a table of what the folder
adds and why each is needed; (3) what it cannot show; (4) how it is kept in step when the pull request moves on.
The first and last depend on the review branch being remade whenever the task's branch changes, which nothing does yet.

Its shape on the page (Sandy, 2026-11-23): a section "Review" holding "Run it yourself" and, folded shut under it,
"How the review copy works". The engine's own record of how the change was built stays folded and now closes the
description under a last heading, "Fine print".

### The "making the fake" banner shows when a response is replaced (2026-11-23)

Sandy gave CEB-90's results call a newer real response, over one that already had a fake, and "the status in
progress component never showed up". The fake was being made (it arrived 85 seconds later); the banner was cancelled
the moment it was set, because the page still showed the old response's fake and took it for the new one. The banner
now remembers which real response the page showed when the agent was asked, and holds until the page shows another.
### Taking a call off a task is a bin, and not offered beside an open form (2026-11-23)

Sandy took a call off CEB-90 by mistake: with a call's edit form open, the × of the rows around it read as "close this".
On the task's Data step, a call's and a service's remove is now a bin, and while a call of a service is being edited or
added none of that service's removes show. Taking a single call off still does not ask first (a service does); the other
× buttons in the app are as they were.
### 2026-11-23: The faker keeps what a record says

Found on CEB-90's first scan against the mock: all 86 findings came in with no status, so the page showed none as
live. The faker had replaced the words `live` and `reported` like any other word. Sandy: "we have to update Faker
so that it's only changing identifying fields … if there's a record that says live, it should just change the link
or the name on it, but it doesn't change the actual content of that record which would include live."

- **A word of state is kept wherever it stands alone in lowercase**: live, reported, completed, pending, failed,
  high, medium, low and the like (a fixed list in fake.ts). None is anyone's.
- **A key whose values are a small vocabulary is kept**: said at least four times across the response, in at most
  six different lowercase words. The report names such keys (`keptAsStructure`).
- **Never** a word that is part of an email or a web address in the response, a key that by its name is someone's
  (name, handle, user, title, company…), or a column the plan names as text.
- Tried on CEB-90's real response, counts only: statuses come through as live and reported in every list, the
  leak check passes, and the two kept values are those two words. (A few findings fewer in each list, as before:
  the faker shortens lists so the outline is not the real one.)

A fake made before this keeps its replaced words until it is made again ("Make the fake again" on the endpoint).
Capitalised values (a platform's name) are still replaced unless the plan keeps them.

### The review branch is made by the tool (2026-11-23)

Brief step 5, built from the six by-hand steps above (`engine/src/review-copy.ts`; the task's PR step, "Review copy").

- **The branch is the pull request's pushed head plus one commit that adds `review/`.** Made again whole each time
  and pushed over the branch of that name, so GitHub's comparison of the two always shows only added files in that
  folder. The engine never touches a local branch of that name (a person may have it checked out): it commits in a
  worktree of its own and pushes the commit.
- **The app's own part is a kit**: a folder on this computer named in the app's settings (`setup.review.kit`),
  holding how the app starts for a reviewer (start and stop commands, what it layers over the app's own, a sign-in)
  and a `kit.json` saying what each file is, what a reviewer needs and what the copy cannot show. Evident does not
  know how an app starts; the kit does. For the enterprise dashboard it sits beside the prototype's tooling.
- **Evident adds the rest**: each service's mock and what a reviewer is served (the faked form), `mocks.env`
  (each service's settings pointed at its mock, with a key that is not one), `mocks.compose.yml`, the fake
  versions of the test files, the fixture as `fixture.sql` when one is chosen, a README and `made.json`.
- **Nothing about it is kept in Evident's database.** Where it stands is read back from the branch: `made.json`
  says the commit it was made from, the fixture and what to try. In step means that commit is the pull request's head.
- **The fixture and what to try are chosen when it is made** (the form on the PR step); made again, they stay as
  they were unless changed. A fixture marked real is not offered.
- **The pull request's Review section is the engine's**: written from `made.json` and the kit, put in place of a
  section the writer called "Review" or "Run it yourself", else at the description's end, above Fine print.
- **Kept in step**: when the engine updates a pull request that has a review copy, the copy is made again from the
  new head and the description sent once more, naming the new commit.
- Refused: while any service would answer with a real response; when the pull request's own branch has a `review/`
  folder; for a mock started with anything but python or node.

Proved on CEB-90 without pushing: the tool's copy held the same data and files as the hand-made one, on the pull
request's new head (it had moved one commit, so the hand-made branch was already behind). Started with the one
command, the made-up person imported, the scan run: 41 findings stored (20 fake profiles, 14 scams, 7 doxxing
posts). This was also the first scan of the fake that has doxxing posts.

Not done: the review copy is not checked a second time against the real response when it is made (it relies on
the check made when each fake was made); the gate (step 7) does not ask for it yet; nothing remakes it when
someone other than the engine pushes to the pull request's branch, until the next update from here.

The checkout a reviewer is given (Sandy, 2026-11-23, passed on from CEB-90's agent): two plain commands, `git fetch
origin` then `git checkout <review branch>`, in the pull request and the branch's README. The one-line form that
fetched to FETCH_HEAD worked in any clone but read as a trick. Because the branch is made again whole, a line under
it says how to take it afresh when it was checked out before. The enterprise kit's empty company is now "Sample
Company": the name it had was a real company's.

### The data agent (2026-11-23)

Brief step 6 (`engine/src/data-agent.ts`; the panel at the top of a task's Data step). Decided by Sandy today, each
asked as a question before building:

- **The person approves each step, on the Data step.** The agent proposes; the panel shows what it proposes with
  Approve and "Say what to change". Evident refuses its building tools until step 2 is approved.
- **Only the data agent changes a task's data.** A task's own agent reads the calls, services, data and test files
  and asks the data agent for any change (the `data_agent` tool); its own changing calls are refused with that
  pointer. The app's own agent, a prototype's agent and a person's own session are as they were.
- **What it may build in step 3**: services and endpoints; fakes of real responses; made-up data it writes itself;
  test files and an endpoint's data filled out for a fixture.

How it works:

- One per task: a conversation of its own in the task's folder, which it only reads (no editing tools), listed
  among the task's agents as Data. Started the first time it is asked, by the task's agent or by the person.
- Three steps, a stop after each: 1, what the task calls (it sets the task's services and calls); 2, where each
  call's data comes from (it changes nothing, and names the services it will build for); 3, build, then say what it
  built and what is still the person's to do. Approving the third ends the round; asked again, it starts over.
- Where it stands is read from the task's events (`data_agent.asked`, `.proposed`, `.approved`, `.change`). Nothing
  else keeps it, and there is no new table.
- The wall, by step: step 1 allows only the task's calls; step 2 nothing; step 3 the building tools, and only for
  the services named in the approved step 2. While a step waits for the person, nothing.
- It is not given the folder of real responses, and its instructions say a real value never enters a summary, a
  message or data it writes.

Not proved yet: no live round has been run. The steps, the wall and the page are tested as code and as stories; the
first real task that asks it is the proof. Not walled: a prototype's own agent can still set up a service.

## Proven work: from test plan to production (Sandy, 2026-11-23, from Cloaked's CEB-90)

"In an age of AI, the signals reviewers used to trust mean nothing: every PR arrives with hundreds of tests and a
green CI, and many of those tests check nothing." CEB-90 showed five gaps: 186 new tests and nothing proving any had
been red; a criterion added after the build's check that sat unmarked and looked like a failure; a deploy item on the
Smoke page beside the person's own checks; a description written by hand three times with no way to see the evidence
before it was public; and the worst failure the change can have visible only in telemetry, which nothing here reads
after a merge.

The whole of it is one document, kept as Sandy gave it: [docs/proven-work.md](docs/proven-work.md). It replaces the
separate requests of the same day about the gate, smoke tests, mutation testing and evidence. The flow, in order:
prototype → **test plan** (approved) → **test phase** (every test writable now, run red) → **build sub-tasks** (each
writes its deferred tests red, then its code green) → **Check** → **smoke test** (before merge only) → **pull request
finalizing** (the trajectory, mutation testing, the review environment, the gate, the evidence drafted; results wait
for the person) → push and mark ready → review, merge → **release checks** at deploy → **watch** (telemetry against
the task's promises; Done after a quiet window).

Built in five parts, each a pull request of its own: 1 the Check step tells the truth; 2 smoke, release, watch;
3 test-first builds; 4 the Pull request step finalizes (waits for the review tool, which it calls and whose page it
changes); 5 Watch (needs 2). The Test plan step goes after the Data step, both after the prototype.

### 1. The Check step tells the truth (2026-11-23)

A criterion's build mark was already three-valued in the data (met, not met, none) and the pages folded "none" into
whatever was nearest: the pull request step counted every criterion "not marked as met", the merge guide said one
nobody had looked at was "left for you", and a Check stage whose rounds had ended stayed done whatever was added.

- **Met, not met, not checked yet**, and a fourth that is nobody's failure, **left to the person**. Counted apart
  on the checklist ("7 of 8 met, 1 not checked yet"), on the pull request step (two lines: not met; not checked yet,
  with where to run the check) and in the merge guide ("1 is left for you. 1 is not checked yet."; 👀 for the
  person's, ⬜ "Not checked yet" for the other).
- **The Check stage is done only when nothing on the list is without a mark**: every criterion and requirement met,
  not met with evidence (and sent back), or left to the person. Otherwise it reads "open again: N not checked yet",
  and a smoke test with nothing left to the person is not called done either.
- **What reopens it.** A criterion added after the check has no mark, so it is not checked yet. Changing a
  criterion's statement or how it is checked takes its marks off (the build's, the person's by hand, an agent's
  try): they were said of other words (`unmark`, acceptance.ts). Changing the pull request's description takes the
  mark off the requirements judged from it: Test plan, Risks, and any of the app's own whose sentence speaks of the
  pull request (`fromDescription`, `afterDescription`, verify.ts). `set_acceptance` says so in its answer.
- **Run the check** (`runner.checkAgain`; `POST /issues/:id/check`; the button on the Check stage; `check_again` for
  the task's agent). One more sub-task that only looks, given only what is not checked yet and, where a requirement
  is judged from it, the description as written. Its verdicts are read as any check's. It is not one of the rounds
  (`isRound`): what it finds not done is sent back as a round is; with nothing found, nothing else is run again,
  since no code changed. A project that had landed runs again until it lands.
- **A requirement the check leaves to a person** is kept as left (`Covered.left`), shown as theirs, and does not
  hold the Check stage open. Before, it had no mark and no owner.

Not done: a requirement left to the person is shown on the checklist but cannot be marked on the Smoke page, which
lists criteria only (part 2 moves what the person checks there). The check is not run again by itself when a
criterion is added: it is a press, or the agent's tool. Adding a criterion still takes the brief's approval back, as
before; the check can be run without it.

### 2. Three kinds of check: smoke, release, watch (2026-11-23)

On CEB-90 "SIXTYFOUR_WORKFLOW_ID is set in each environment" sat on the Smoke page beside the person's own checks,
under "After it is merged". It is not theirs and not before the merge.

- **A criterion says how it is proven when not by a test** (`Criterion.kind`, acceptance.ts): **smoke** (the person,
  on the built code, before the merge), **release** (true only at deploy: configuration in each environment, a
  migration run, monitors applied), **watch** (production health after the deploy). Whoever writes the criterion says
  (`set_acceptance`, kind); the person changes it on the brief (a select in a criterion's edit form, a badge on the
  row). It asks for no new approval: it is who proves it and when, not what must be true. One the check says can
  only be seen after the merge (`when: after`) is a release check, and old ones read as that (`proofOf`).
- **The Smoke page is before the merge only.** Its "After it is merged" group is gone. A criterion tagged smoke is
  the person's from the start; the check is told to leave it to them with where to look. Release and watch criteria
  are not given to the check at all, and none of the three keeps the Check stage open: each has an owner.
- **Release checks are deploy steps on the pull request**, numbered, in the order written (`deploySteps`, smoke.ts;
  `withDeploy`, pr.ts): under the description's own heading for them ("Merge Danger", "Deploy steps", "At deploy",
  "Release checks"), before what the writer said there, else in a section "At deploy" at its end. The block is
  between marks of ours, so an update replaces it and nothing of the writer's.
- **And they are listed on the task as owed** (the pull request step, `ReleaseChecks`): whoever deploys says each is
  done, or not done with why (`markRelease`; `POST /issues/:id/release/:criterion`). A task is not closed while one
  is owed (close.ts). The checklist and the merge guide count them apart ("2 are owed at deploy. 1 is watched after
  the deploy."), outside "N of M met".
- **Accepting the smoke test is a press of its own** (`acceptSmoke`; `POST /issues/:id/smoke/accept`; `SmokeAccept`
  on the Smoke page): once none of the person's checks wait or failed and nothing is unchecked. Kept as the event
  `smoke.accepted` with the commit it was said on; a branch that has moved since shows it as accepted before, and
  asks again. What is owed at deploy does not hold it.

Not done: the acceptance starts nothing yet. The Pull request finalizing it starts is part 4, and is hung on
`smoke.accepted`. Watch criteria are only listed (on the pull request step): reading them from telemetry is part 5.
A requirement the check leaves to the person (part 1) is still not markable on the Smoke page. The agents that write
criteria are told about the tags by `set_acceptance`'s own description, not yet by the planner's prompt.

### 3. Test-first builds: plan, red, green (2026-11-23)

"186 new tests, and nothing proved any of them had ever been red." The model is InDusk's Test Trajectory
(`~/code/indusk/apps/docs/src/guide/test-trajectory.md`, `test-levels.md`): a table of every test with where it is
written and where it passes, a test phase first, a register of what is deferred, regression guards declared, real red
told from fake red. One thing is different, and it is the point: there a row's state was the builder's word, reviewed
by a person, because InDusk refused to read a runner's output. Here the engine runs each row's test itself and reads
what it printed.

- **A Test plan step** (`testplan`, steps.ts): last before the build, after the prototype and whatever reads it,
  approved by the person. It holds the build and never the brief (it is made from an approved brief). A workflow
  switches it on (Settings › Workflow); it is off in every workflow saved before today and in a new app's default,
  because it changes how every task of that workflow is built. Skipped on a task, the task is built as before.
- **The trajectory** (trajectory.ts; `set_test_plan`, `test_plan`): slices (what the build is cut into, in order) and
  rows, each with ID, what it asserts, level (unit, integration, component, browser, contract, live), the criteria it
  proves, its test file (and the test's name where rows share a file), Writable at (the test phase or a slice) and
  Passes at. A plan is refused, with every reason, unless: every acceptance criterion has a row or says how else it is
  proven (part 2's smoke, release, watch); a row not written in the test phase says why, and should carry its code; a
  row green when written says why it is a regression guard; no row passes before it can be written; every slice has a
  row turning green at it or says why not.
- **Its agent** (test-plan.ts): wherever a build would start (a press, a project's run, the line after a prototype),
  a task whose workflow has the step sends a fresh agent to read the code and write the plan, and waits for the
  person's approval on the step's page, which shows the table (`TrajectoryView`).
- **The build is the plan's** (`trajectoryProposal`): no planner and no one-go builder. "Write the tests, and see
  them fail", then each slice in order, each waiting on the one before. A slice with tests deferred to it is two
  sub-tasks, "…: its tests first" and then its code, so the engine sees the red between them. Builders have no engine
  tools, so a red inside one run could only have been taken on trust.
- **The engine's own runs** (`gateSubTask`, before a sub-task lands; `classifyRun`): it runs each row due there in
  the sub-task's checkout (`setup.test_row_cmd` with {file} and {name}, else the app's test command with the file
  after it) and keeps each run as an event (`trajectory.run`). **Real red** (the runner counted a failed test) is
  required of a test before its code. **Fake red** (it failed to load: an unresolved import, a collection error, a
  build failure) is refused. **Green on its first run** is refused unless the row is a declared guard. A failure whose
  output does not say how is not taken as red. Once a slice's code is in, every row due by then must be green and
  have been seen red. What is refused sends the sub-task back with what the run printed, as any failed attempt.
  Vitest, Jest, pytest, Go and TAP are read; another runner sets its own command and is judged on an assertion's words.
- **It blocks the Check step**: a row never seen red, never written, or due green and not, keeps the Check stage
  open ("N of M planned tests not proven"). A test file on the branch that no row names is flagged on the step's page.
- **Changing an approved plan asks the person again**; a build under way stays held to the plan they approved.

Kept on the step's own row (`step_work.refs` as `{ plan, approved }`, the table as Markdown in its body) and runs as
events, so no migration: two other branches were adding steps and data the same day.

Not done: it has not run on a real task; the first one will show what the plan's agent gets wrong. The step is off
by default, as said. A changed plan that is approved again does not add sub-tasks for new slices to a build under
way. The Evidence the pull request shows from all this (red before green, tests by level, criteria to tests) is part
4. `set_step` can still mark the step done with no plan, and approving that builds the old way.

### 4. The Pull request step finalizes; the person decides (2026-11-23)

"The PR went out with a description written by hand three times, the review instructions lost once, and no way to
see the evidence before it was public." Sandy, the same day, on whether the review work was far enough along to start:
"I think the review work is far enough."

- **Accepting the smoke test starts it** (`finalize.ts`; the route that accepts starts it, so smoke.ts knows nothing
  of the runner). Five steps, each said as it goes on the task's Pull request step (`Finalize`): the trajectory
  holds; mutation testing; the review copy; the gate; the evidence drafted. On this computer, never in a team's CI.
  It can also be run from the page, and runs again by itself when a task finalized before is built and tested again
  (`afterBuilt`, called where the runner opens the automatic draft).
- **Nothing it does reaches GitHub.** The results wait for the person. This is kept true in one place: a pull
  request's description carries only the evidence the person last sent (`finalize.sent`, `sentEvidence`), never a
  draft. The automatic draft pull request (2026-11-17) is as it was: a draft, opened once the task is built and
  tested, with no evidence in it.
- **Mutation testing** (`mutation.ts`) is of the lines the pull request added or changed, in its source files only
  (not tests, stories, migrations, config), against the tests that cover them: the test plan's files and the test
  files the branch touches. The mutator is the engine's own and reads lines, not a syntax tree, so it works on
  Python, TypeScript and JavaScript with nothing installed: a boundary moved, a comparison turned round, a condition
  joined the other way or not negated, an arithmetic sign, a boolean, a number nudged by one, a return emptied.
  Never inside a string or a comment. The tests are run once with nothing changed and must pass; then each break in
  turn, in a checkout of the head that is the engine's own (`<repo>-worktrees/finalize--<task>`), the file put back
  after each. Out of the score, and said: a break the code will not load with; a survivor on a decorator's flag or a
  limit nudged by one (set aside as equivalent by the engine, listed apart); one the person says no test could
  tell. At most 150 breaks and 25 minutes, spread evenly, and it says when it tried fewer than it found. An app with
  a tool of its own names it (`mutation.tool`: a command and the report it writes, in Stryker's form) and its report
  is read instead, cut to the changed lines. Other settings: `mutation.off`, `mutation.test_cmd` (with {files}),
  `mutation.max`, `finalize.prepare` (what the checkout needs installed).
- **Every survivor is named**: file, line, what became what, the line as written, and what it means in words ("no
  test checks the value exactly at this limit").
- **The gate** (`pr-gate.ts`, six checks, each pure): GitHub's checks green; the app's held commands as they last
  ran, on the head (ones left to the pull request are read from GitHub's checks by name); the title fits the app's
  rule and carries the team's ticket, and not our id; the description has every heading of the app's form, in
  order, with something under it, and nothing of ours in it (our name, our ids, how we built it); the rollback
  agrees with the blast radius (a one-way door called revertable fails, and so does one the description does not
  mention); the smoke test accepted with none of the person's checks open. The cheap ones are read afresh every
  time the page is: the description is often written after the finalizing ran.
- **The evidence** (`evidence.ts`) is drafted from what was measured and nothing else, in the order a reviewer can
  trust it: tests by level; red before green, N of N, with a folded table of each test, where it was seen to fail
  and where it passed; criteria to tests, or how else each is proven; deferrals and guards with their reasons;
  mutation's score and each survivor; and last, in a line, that everything else still passes. It is the engine's
  block in the description, between marks, under the writer's own "Evidence" or "Testing" heading when they have
  one, else in a section at the end. Slices are named by what they build: nothing of ours is in it.
- **What the person can do with the results**: "Fix this" on a survivor, a planned test not proven, failing
  commands or failing GitHub checks sends a sub-task after it (`fixThis`), and the finalizing runs again when it
  lands. A survivor can be left as it is with a reason, which goes into the evidence, or called equivalent, which
  takes it out of the score. A description or a title that fails the gate is theirs or the task's agent's to put
  right: no sub-task is offered, because a builder has no way to write one.
- **Push and mark ready** (`pushReady`; `POST /issues/:id/pr/send`) is the one press: refused unless the finalizing
  is of the head and no gate check fails or waits. It marks the evidence as sent, pushes the branch and sends the
  title and description (submitting if there is none), makes the review copy again from that head and sends it,
  then takes a draft out of draft. The "Ready for review" button it replaces is gone from the step. On a pull
  request that is ready, the same press is "Update pull request", through the same gate. A draft is still brought
  up to date by the old button, with the evidence last sent.
- **Survivors do not hold the press.** The gate is the six checks, as written. An open survivor is named in the
  evidence as not caught. Neither does a trajectory that does not hold: its exceptions are named.
- **Edits made on GitHub are read back** (`editsThere`, `writtenFrom`, pr.ts; the runner's `updatePr`). Each send
  records a mark of the body and of the description it was made from. Before the next: edited only there, it
  becomes the description here (without the engine's own blocks) and is sent as they have it; edited there and
  here, a person's press must say which stands ("Keep GitHub's", "Send this one over it"), and an update nobody
  pressed for sends the branch and leaves GitHub's description alone.

No migration: the finalizing is events (`finalize.started`, `.step`, `.done` with the facts the evidence is drafted
from, `.failed`, `.survivor`, `.fix`, `.sent`).

Not done: it has not run on a real task, and CEB-90 was built before test plans, so its first finalizing will say
"built without a test plan". The review copy's step builds one that does not exist yet without sending it, but one
already on GitHub and behind the head is only reported, and made again at the press: making it locally would take
the Review section out of the description until then. "Its checks run" is what making it already refuses (anything
real in what a reviewer is served); a kit has no checks of its own to run. A push to the pull request's branch by
someone else does not start the finalizing: only a build here does. A title edited on GitHub is not read back,
only the description. Equivalence is two rules and the person's word; "a value already returned" is not detected.
The mutator reads lines and knows nothing of types or syntax, so it makes fewer kinds of break than Stryker or
mutmut would. The task's agent has no tool to read the results.

## ENT-322 a fourth time, as the test of the new tools (Sandy, 2026-11-23: "rebuild 322 once more as a test using all our new tools")

Started 2026-11-24, once the finalizing (#393) was in. A new task, **CEB-111**, beside CEB-90, which is left as it
is with its pull request. Decided with Sandy: it is done again **from the Data step**, and set up from this session,
not by the app's agent.

- **Copied from CEB-90:** the brief, word for word but for the sentence that says which build it is, **not
  approved** (approving the prototype approves it); all 38 criteria with their checks, `buildOnly` and `why`; the
  team ticket and title; the Research, Sketch and Mockup steps, done and **not approved** (the approvals are the
  person's). The sketch's file was copied into the new talk's worktree.
- **Tagged, which CEB-90's never were:** the live run on a real person, the card's looks and the pull request's
  rollback text are `smoke`; the workflow id in each environment is `release`.
- **Done again:** Data (the data agent's first live round), the prototype, the test plan, the build in red then
  green, the check, the smoke test, the finalizing, the review branch.
- **Not copied on purpose:** CEB-90's calls and services on the task (none are set: its agent has to ask the data
  agent), its prototype, its marks.

Known before it starts: the mockup's pictures are stories in CEB-90's prototype worktree, so the new prototype has
to bring them over or the Mockup step shows nothing; every criterion is recorded as written by the person, because
the copy went in through the person's route; watch (section 5 of the proven-work note) is not built, so nothing is
tagged `watch`.

## A script is told its fixture; what it makes of it is the app's (Sandy, 2026-11-24)

CEB-90's smoke test could not be used with the fixture "Meridian": the rows load, but the set-up's script signs the
tester in as another company, so none of them show. I proposed a setting for "sign-in follows the fixture". Sandy:
"this stuff starts to seem very specific to this scenario … this idea that we're automatically logged in, to me,
seems like a very Cloaked specific setup." Right: being signed in at all is that app's workbench, not Evident.

- **Evident says which fixture, and nothing more.** A smoke test's script and a prototype's command are run with
  `$FIXTURE`: the name of the app's fixture the database was built from, empty when none (set only where the app has
  a database of its own). A review kit's files have `{{fixture}}` beside its other names.
- **Who is signed in, and anything else an app does with a fixture, is the app's script's.** Nothing of it is a
  setting of Evident's.

Not done: the workbench's own script still signs in as a fixed company, so Meridian is still unusable in the main
set-up until that script reads the database or `$FIXTURE`. Open with Sandy: whether an app's own scripts like that
one get a place in Settings ("workbench scripts"), instead of living only in a folder the set-ups call.

## Hooks: an app's own scripts, run at Evident's points, kept in its workbench folder (Sandy, 2026-11-24)

After `$FIXTURE`, the question was where an app's own part lives. I offered two shapes: a section in Settings that is
a window onto the app's workbench folder, or hooks kept in Evident's settings. Sandy: "I think both. That hook idea
is really cool … evident has a bunch of different lifecycle events that we can hook into. But they would be defined,
they would be stored … in the workbench … You don't want them in the repo itself."

- **The workbench folder** is an app setting (`setup.workbench.dir`): a folder on this computer outside the app's
  repositories. (The word already meant "an app's repositories worked on together", workbench.ts. Here it is the
  folder of ours beside them. Not renamed; said once.)
- **A hook is a file in its `hooks/`, named for a point** (`before-start`, any extension), found by name: nothing
  is registered. Evident runs it and knows nothing of what it does (`engine/src/hooks.ts`).
- **Three points to begin with**, each where Evident already acts:
  - `before-start`: before a prototype's command or a smoke test's script, with what that script will be given
    (`$PLACE`, `$FIXTURE`, the database, `$PORT`, `$TASK`). Lines it prints as `NAME=value` are laid over the
    script's settings. A failure starts nothing, and says why.
  - `after-stop`, `task-closed`: nothing waits on them; a failure is recorded.
- **Every run is an event** (`hook.ran`): the point, whether it worked, the names of what it gave and never the
  values, and on a failure its last lines. No table.
- **Settings › Workbench** (per app; story first, `Workbench.stories.tsx`): the folder, every point hooked or not
  with what it is given and what follows, the script to read, its last run.

Not done: a script is read in Settings and changed in the folder, not in the page; a review copy runs on a
reviewer's computer, so no hook runs for it (its kit is its own part); a hook's output is not checked for anything
real before its last lines are kept; the smoke set-ups' scripts, seed and the prototype command still live in their
own settings and were not moved into the folder; no agent tool reads or writes hooks; more points (a fixture
loaded, a review copy made, a build finished) are added when something needs one.

## Context: a section above the brief, on an idea, a project and a task (Sandy, 2026-11-24; brief in docs/context-brief.md)

Built from the brief, story first. Sandy approved the layout and the four points below as one ("looks good").

**What it is.** A place to put things ahead of research, and to record what guides every agent on a piece of work.
It is always there, on an idea, a project and a task, and is not a step.

**Decided:**

- **Notes are one set** (Sandy, asked): Context's notes and decisions are the app's notes (`notes.ts`, built
  2026-11-23). What is written in Context is given to the agents and still goes into a report by its day. A task's
  Notes panel left its overview for Context; ideas and projects gained notes; the Reports page keeps the list of
  them all. `note` gained `idea_ids`, `project_ids` and `status`.
- **The order of work**: this came before the gate (7 in reviewable-prs-brief.md).
- **A rejected proposal is kept**, folded under Decisions as "n proposed and rejected". Every agent is told the
  person turned it down, and the engine refuses the same statement proposed again. The person can accept it after
  all, or delete it (then it may be proposed again).
- **Size**: a doc holds up to 200,000 characters; one given to every agent in full, up to 20,000. A longer one
  stays listed and says why the mark is off. A file is up to 20 MB.
- **Assets stay as they are** (`assets.ts`). An asset says where a thing is; a reference doc holds the thing.

**How it works:**

- **In the nav**: a Context row under Overview and above the Brief label and its steps, with how many things it
  holds and "1 for you to decide" when an agent has proposed a decision. On a project it is a panel above Tasks
  (a task on its own has its own, not its hidden project's).
- **The page**, top to bottom: For you to decide (only when something is proposed), Reference docs, Decisions,
  Notes. Each section has one line saying how agents get it.
- **Reference docs** (`context_doc`): text pasted in, a file brought in, or another Linear ticket by its id. The
  ticket the work came from is first and is not a row: it is the origin the work already points at. It is never
  edited or taken out here, and Refresh reads it again from Linear (`keepTicket` in `linear-import.ts`, which
  keeps one ticket and makes nothing from it). The "Where this came from" panel left the overviews; a line there
  points at Context.
- **A PDF is kept as the file it was**, not turned into text. The agent that needs it opens it. So a PDF cannot be
  edited or given in full. Text and Markdown files become text that can be edited.
- **What an agent is given** (`contextPrompt`, added wherever `originPrompt` was: the task's and idea's agents and
  their steps' agents, the planner, every builder): each decision in full as something not to reopen; proposals
  as not settled; rejected ones as not to be done or proposed again; each note in full; docs marked "in full", in
  full; the rest by title and description with a path on this computer to open with Read
  (`~/.self-evident/context/<app>/`, written when the prompt is made). The originating ticket is still given
  whole by `originPrompt`.
- **Agents add to it** with the `context` tool: `note` and `doc` freely, marked as the agent's. `decide` records a
  decision the person agreed to in conversation. `propose` leaves one waiting for the person. Only a person
  accepts or rejects. The planner and the builders are given the context but have no tool to add to it.
- **It moves with the work** (`moveContext`, called by `convertIdea`): an idea that becomes a task takes its
  context to the task. One that becomes a project takes it to the project, so every task in it sees it as "from
  the project". That second part was my reading of "everything goes along"; say if it should go to the first
  task instead.
- **A task in a project sees the project's**, marked and with no Edit. A sub-task has its task's.

Code: `engine/src/context.ts` (+ test), migration `0058_context`, routes `/{ideas,issues,projects}/:id/context…`
in `server.ts`, `app/src/components/Context.tsx` (+ stories), `TaskNav`, `IssuePage`, `IdeaDetail`, `ProjectPage`.

**Looked at for real**: this branch's engine and page on their own ports against a scratch database (made, then
dropped), with a made-up app. An idea's context filled through the routes, the idea converted to a project, and
the task, idea and project pages opened in a browser.

**Not done:**

- A ticket was not brought in from the real Linear (the scratch app had no Linear set). `keepTicket` is tested
  with a made-up tracker only.
- No agent has yet been run with a context: what it is given is checked as text in `context.test.ts`.
- A note written in Context is about that one task. Attaching it to other tasks too is still done from Reports.
- No app-level context (Sandy expects one later).
- A page address that names a section (`/ideas/<id>/context`) opened the tab on its overview when I loaded it
  directly; clicking Context in the nav works. Not looked into: it may be how tabs restore, for any section.

## A fixture loads into a database with computed columns (2026-11-24)

Sandy could not start CEB-90's smoke test from the fixture "Meridian". The cause was not who is signed in, as we
both guessed: the load itself failed. A fixture kept from a database has every column, and the loader put every
column back, including one the database works out itself (`employees.composite_risk_score`, generated), which
Postgres refuses. The start answered with a bare server error, so the page said nothing useful.

- **Only the columns that take a value are loaded** (`prototype-data.ts`, `load`): generated ones are left to the
  database; an identity column keeps the row's own id.
- **The review copy's `fixture.sql` does the same**, reading the columns from the database it is run on
  (`fixtureSql`): it would have failed on a reviewer's machine the same way.
- **A load that fails says which table and why**, as a refusal a page can show.
- The loader's test database has a generated column now, and its scenario carries a value for it.

With it, the Cloaked workbench's `before-start` hook ran for the first time (it gave `DEMO_TENANT_ID`), and the
two smoke set-ups' scripts use what it gives. Tried from a throwaway process, not yet from the page.

## An endpoint's data, a file per fixture; the fixture picks (Sandy, 2026-11-24)

With Meridian's smoke test up, Sandy wanted a mock response with a row for each of its 250 people, and asked:
"should the endpoints be connected to whatever fixture you're on, or should you be able to do multiple of the same
endpoint tied to different fixtures?" The second. Until now an endpoint had one made-up file (and a task's own), and
filling it out for a fixture's people changed that one file, so the data decided the fixture and never the reverse.

- **An endpoint holds several files**, each made for one fixture's people, or for none.
- **The fixture a run starts from picks** (`pickForFixture`, mock-serve.ts): the file made for it; else one made for
  no fixture; else the order there was. Started empty: one made for no fixture first. A prototype (its scenario), a
  smoke test (what its database was built from) and a review copy (its fixture) all say which.
- **Filling out for a fixture adds a file** beside the one it was made from, which is left as it is; filling out
  again for the same fixture changes that fixture's file. (`assignFixture` says `fresh`.)
- **Where the fixture is not known** (the Data step's own view, an export), nothing changes: the order alone.
- The page names an endpoint's other files by fixture, and says the rule.

Not done: the Data step and the smoke page do not yet show, for a fixture chosen there, which file each endpoint
would serve; a fixture's file cannot be removed from the page; `fixtureForTask` still takes the first fixture any
data was made for when the person picks none; a server written by hand that writes over what it is sent (CEB-90's)
gets the right file but may still overwrite its people. Meridian's own file is not made yet: Sandy wants it without
the deep enrichment that makes one person's rows large ("we don't need any of that").

## A response per fixture (Sandy, 2026-11-24)

The file-per-fixture work (#401) only made a copy of one template with other people in it. Sandy, on why that is not
enough: a template is one person at full depth, so all 250 of a company would come out as that person's shape ("how
many of those people we want to have doxing, how many people we don't"); and then the model: "we just want to be
able to have multiple responses … a response per fixture. And then in that response, we can do whatever we want. We
can make it fake or not fake. We can have its own CSV."

So: **an endpoint has a response for any fixture, and may have one for each fixture; each is a whole response.**

Built now, the made-up half:
- **"Add for a fixture"** on an endpoint's data: a file given as that fixture's own, kept beside the data there is.
  A run started from the fixture is served it (`pickForFixture`).
- **Its fields are mapped row by row.** A file given for a fixture has its rows already, one for each person, mixed
  as its writer chose. Mapping from the fixture sets the chosen columns of the first row from the first person and
  so on, adds no row, and leaves what else each row says.
- The limit of 200 people on a mapping is 2000.

Not done, and next: **a real response per fixture, faked** (refused for now: "a file for one fixture is made up").
Whose a response is has two parts today, the endpoint and the task (`Scope`); the fixture is marked on the side
(`madeFor`). Making the fixture a third part of that is what lets a fixture's response be anything the main one can
be: recorded, faked, its own answer to "the faked version?". Also not done: two files for one fixture are not
refused (the newer is served); a fixture's file is removed only with the rest; the page shows one response at a
time and names the others in a line.
