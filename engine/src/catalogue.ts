/**
 * What we do, as the jobs a skill can cover: the catalogue's categories (research/skills.md), grouped by where they
 * sit in the loop. The jobs are also the tags: a skill tagged with a job could do it, and one installed skill is
 * selected to do it, since two skills for one job compete on their descriptions. `builtIn` is what the engine itself
 * does there, when it does; replacing that is a decision (the catalogue's "borrow"), not a selection. `candidates`
 * are the skills the catalogue saw for the job; `key` (`<plugin id>/<skill>`) is set when the plugin is installable.
 */

export interface Candidate { name: string; by: string; key?: string }
export interface Category { key: string; name: string; for: string; builtIn?: string; candidates?: Candidate[] }
export interface Group { name: string; categories: Category[] }

/** Where each candidate's plugin installs from: a Claude Code marketplace and the plugin's name in it. */
export const SOURCES: Record<string, { marketplace: string; name: string }> = {
  'rea@rea': { marketplace: 'morluto/rea', name: 'rea' },
  'mattpocock-skills@mattpocock': { marketplace: 'mattpocock/skills', name: 'mattpocock-skills' },
  'superpowers@superpowers-marketplace': { marketplace: 'obra/superpowers-marketplace', name: 'superpowers' },
  'example-skills@anthropic-agent-skills': { marketplace: 'anthropics/skills', name: 'example-skills' },
}
const pocock = (skill: string): Candidate => ({ name: skill, by: 'Pocock', key: `mattpocock-skills@mattpocock/${skill}` })
const sp = (skill: string): Candidate => ({ name: skill, by: 'Superpowers', key: `superpowers@superpowers-marketplace/${skill}` })
const anthropic = (skill: string): Candidate => ({ name: skill, by: 'Anthropic', key: `example-skills@anthropic-agent-skills/${skill}` })
const other = (name: string, by: string): Candidate => ({ name, by })

export const CATALOGUE: Group[] = [
  { name: 'Observe and learn', categories: [
    { key: 'study-a-shipped-product', name: 'Study a shipped product', for: 'Learn how someone else built a feature, to move fast on our own', candidates: [{ name: 'reverse-engineer-anything', by: 'REA', key: 'rea@rea/reverse-engineer-anything' }] },
  ] },
  { name: 'Plan', categories: [
    { key: 'interview', name: 'Interview', for: 'Draw out the decisions before anything is built', builtIn: "The planner's open questions, a cost on each", candidates: [pocock('grilling'), pocock('grill-me'), sp('brainstorming'), other('deep-interview', 'OMC'), other('/office-hours', 'gstack')] },
    { key: 'spec-and-slice', name: 'Spec and slice', for: 'Turn decisions into issues', builtIn: 'The planner: sub-issues with brief, files and done-when', candidates: [pocock('to-spec'), pocock('to-tickets'), sp('writing-plans'), other('create-structure-outline', 'HumanLayer')] },
    { key: 'multi-session-planning', name: 'Multi-session planning', for: 'Plans too big for one session', builtIn: 'Initiatives, projects, issues and sub-issues', candidates: [pocock('wayfinder')] },
    { key: 'plan-review', name: 'Plan review', for: 'Challenge a plan before building', candidates: [other('plan --consensus', 'OMC'), other('/autoplan', 'gstack')] },
    { key: 'domain-language', name: 'Domain language', for: 'Keep names and hard decisions consistent', candidates: [pocock('domain-modeling')] },
  ] },
  { name: 'Build', categories: [
    { key: 'build-discipline', name: 'Build discipline', for: 'How a session writes code: test first, small slices', candidates: [pocock('tdd'), sp('test-driven-development')] },
    { key: 'deciding-mid-build', name: 'Deciding mid-build', for: 'Keep going on small calls, and record them', builtIn: 'Provisional decisions', candidates: [sp('subagent-driven-development')] },
    { key: 'debugging', name: 'Debugging', for: 'Find a root cause', candidates: [pocock('diagnosing-bugs'), sp('systematic-debugging'), other('debug', 'OMC')] },
  ] },
  { name: 'Prove', categories: [
    { key: 'demonstration', name: 'Demonstration and evidence', for: 'Show the change working on the real app', candidates: [anthropic('webapp-testing')] },
    { key: 'verify-before-done', name: 'Verify before done', for: 'Checks pass before claiming done', candidates: [sp('verification-before-completion'), other('verify', 'OMC')] },
    { key: 'falsify', name: 'Falsify', for: 'Try to break it' },
  ] },
  { name: 'Review', categories: [
    { key: 'review-a-diff', name: 'Review a diff', for: 'Find bugs before merge', candidates: [pocock('code-review'), sp('requesting-code-review'), other('CodeRabbit', 'CodeRabbit')] },
    { key: 'answer-a-review', name: 'Answer a review', for: 'Act on comments without obeying wrong ones', builtIn: 'GitHub sync reads reviews and checks', candidates: [sp('receiving-code-review')] },
    { key: 'simplify', name: 'Simplify', for: "Remove what isn't needed", candidates: [other('ai-slop-cleaner', 'OMC')] },
  ] },
  { name: 'Ship', categories: [
    { key: 'prs-and-commits', name: 'PRs and commits', for: 'Branch, commit, PR description', builtIn: 'Stacked PRs', candidates: [pocock('pr')] },
    { key: 'release-safety', name: 'Release safety', for: "Don't break production" },
  ] },
  { name: 'Context', categories: [
    { key: 'session-handoff', name: 'Session handoff', for: 'Pick up where the last session stopped', builtIn: 'Runs resume the agent\'s session', candidates: [pocock('handoff'), other('/context-save', 'gstack')] },
    { key: 'project-memory', name: 'Project memory', for: 'Keep CLAUDE.md and AGENTS.md true', candidates: [pocock('retro')] },
    { key: 'learning-from-sessions', name: 'Learning from sessions', for: 'Turn what happened into lessons', candidates: [pocock('retro'), other('self-improve', 'OMC')] },
  ] },
  { name: 'Environment', categories: [
    { key: 'dev-setup', name: 'Dev setup', for: 'Get the app running for an agent', builtIn: 'Modules, each with a manifest', candidates: [other('setup-pre-commit', 'Pocock')] },
    { key: 'observability', name: 'Observability', for: 'See what the app and agents did', builtIn: 'PostHog' },
  ] },
  { name: 'Communicate', categories: [
    { key: 'readable-writing', name: 'Readable writing', for: 'Writing people can read quickly', candidates: [pocock('wait-what')] },
    { key: 'teaching', name: 'Teaching', for: 'Explain in pieces and check understanding', candidates: [pocock('teach')] },
    { key: 'diagrams', name: 'Diagrams and visuals', for: 'Show the plan or system' },
    { key: 'ui-design', name: 'UI design', for: 'Taste for interfaces', candidates: [anthropic('frontend-design')] },
  ] },
  { name: 'Meta', categories: [
    { key: 'writing-skills', name: 'Writing skills', for: 'Make and test our own skills', candidates: [anthropic('skill-creator'), pocock('writing-for-agents'), sp('writing-skills')] },
  ] },
]

export const CATEGORY_KEYS = new Set(CATALOGUE.flatMap((g) => g.categories.map((c) => c.key)))
