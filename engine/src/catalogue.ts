/**
 * What we do, as the jobs a skill can cover: the catalogue's categories (research/skills.md), grouped by where they
 * sit in the loop. A skill is filed under one, and one skill holds a category at a time: two skills for the same job
 * compete on their descriptions, so filing a new one replaces the old. `builtIn` is what the engine itself does there,
 * when it does; replacing that is a decision (the catalogue's "borrow"), not a switch.
 */

export interface Category { key: string; name: string; for: string; builtIn?: string }
export interface Group { name: string; categories: Category[] }

export const CATALOGUE: Group[] = [
  { name: 'Observe and learn', categories: [
    { key: 'study-a-shipped-product', name: 'Study a shipped product', for: 'Learn how someone else built a feature, to move fast on our own' },
  ] },
  { name: 'Plan', categories: [
    { key: 'interview', name: 'Interview', for: 'Draw out the decisions before anything is built', builtIn: "The planner's open questions, a cost on each" },
    { key: 'spec-and-slice', name: 'Spec and slice', for: 'Turn decisions into tasks', builtIn: 'The planner: sub-tasks with brief, files and done-when' },
    { key: 'multi-session-planning', name: 'Multi-session planning', for: 'Plans too big for one session', builtIn: 'Initiatives, projects, tasks and sub-tasks' },
    { key: 'plan-review', name: 'Plan review', for: 'Challenge a plan before building' },
    { key: 'domain-language', name: 'Domain language', for: 'Keep names and hard decisions consistent' },
  ] },
  { name: 'Build', categories: [
    { key: 'build-discipline', name: 'Build discipline', for: 'How a session writes code: test first, small slices' },
    { key: 'deciding-mid-build', name: 'Deciding mid-build', for: 'Keep going on small calls, and record them', builtIn: 'Provisional decisions' },
    { key: 'debugging', name: 'Debugging', for: 'Find a root cause' },
  ] },
  { name: 'Prove', categories: [
    { key: 'demonstration', name: 'Demonstration and evidence', for: 'Show the change working on the real app' },
    { key: 'verify-before-done', name: 'Verify before done', for: 'Checks pass before claiming done' },
    { key: 'falsify', name: 'Falsify', for: 'Try to break it' },
  ] },
  { name: 'Review', categories: [
    { key: 'review-a-diff', name: 'Review a diff', for: 'Find bugs before merge' },
    { key: 'answer-a-review', name: 'Answer a review', for: 'Act on comments without obeying wrong ones', builtIn: 'GitHub sync reads reviews and checks' },
    { key: 'simplify', name: 'Simplify', for: "Remove what isn't needed" },
  ] },
  { name: 'Ship', categories: [
    { key: 'prs-and-commits', name: 'PRs and commits', for: 'Branch, commit, PR description', builtIn: 'Stacked PRs' },
    { key: 'release-safety', name: 'Release safety', for: "Don't break production" },
  ] },
  { name: 'Context', categories: [
    { key: 'session-handoff', name: 'Session handoff', for: 'Pick up where the last session stopped', builtIn: 'Runs resume the agent\'s session' },
    { key: 'project-memory', name: 'Project memory', for: 'Keep CLAUDE.md and AGENTS.md true' },
    { key: 'learning-from-sessions', name: 'Learning from sessions', for: 'Turn what happened into lessons' },
  ] },
  { name: 'Environment', categories: [
    { key: 'dev-setup', name: 'Dev setup', for: 'Get the app running for an agent', builtIn: 'Modules, each with a manifest' },
    { key: 'observability', name: 'Observability', for: 'See what the app and agents did', builtIn: 'PostHog' },
  ] },
  { name: 'Communicate', categories: [
    { key: 'readable-writing', name: 'Readable writing', for: 'Writing people can read quickly' },
    { key: 'teaching', name: 'Teaching', for: 'Explain in pieces and check understanding' },
    { key: 'diagrams', name: 'Diagrams and visuals', for: 'Show the plan or system' },
    { key: 'ui-design', name: 'UI design', for: 'Taste for interfaces' },
  ] },
  { name: 'Meta', categories: [
    { key: 'writing-skills', name: 'Writing skills', for: 'Make and test our own skills' },
  ] },
]

export const CATEGORY_KEYS = new Set(CATALOGUE.flatMap((g) => g.categories.map((c) => c.key)))
