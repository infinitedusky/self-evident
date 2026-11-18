/** The repository's conventions for branches and commits: the names made, and the commit check against a throwaway repository. */
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile, chmod, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { beforeAll, describe, expect, it } from 'vitest'
import { branchName, commitOk, commitRule, hookEnv, installCommitCheck, ticketOf } from './conventions.js'
import { commitLine } from './executor.js'
import { branchOf, issueStart } from './branches.js'
import { git } from './git.js'

const run = promisify(execFile)
const who = { GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com' }
beforeAll(async () => { process.env.HOOKS_HOME = await mkdtemp(join(tmpdir(), 'se-hooks-')) })

describe('the ticket', () => {
  it('is the team\'s when the task came from their tracker, else our task id', () => {
    expect(ticketOf({ identifier: 'CEB-79', sourceRef: { linear: { identifier: 'ENT-412' } } })).toBe('ENT-412')
    expect(ticketOf({ identifier: 'CEB-79', sourceRef: { sessionId: 's1' } })).toBe('CEB-79')
  })
})

describe('branchName', () => {
  const v = { ticket: 'ENT-412', id: 'CEB-79', title: 'Export the audit log (CSV & PDF)!', project: 'Audit' }
  it('fills the template, the title and project as slugs', () => {
    expect(branchName({ branch_name: 'feature/{ticket}-{title}' }, v)).toBe('feature/ENT-412-export-the-audit-log-csv-pdf')
    expect(branchName({ branch_name: '{project}/{id}' }, v)).toBe('audit/CEB-79')
  })
  it('uses our id where the team has no ticket', () => expect(branchName({ branch_name: '{ticket}' }, { id: 'CEB-79' })).toBe('CEB-79'))
  it('is null with no template, or one git would not take', () => {
    expect(branchName({}, v)).toBeNull()
    expect(branchName({ branch_name: 'feature/{ticket}..x' }, v)).toBeNull()
    expect(branchName({ branch_name: '-{ticket}' }, v)).toBeNull()
  })
  it('a task keeps the branch it was given; one without keeps the engine\'s own name', () => {
    expect(branchOf('project/p1', { identifier: 'CEB-79', branch: 'feature/ENT-412-x' })).toBe('feature/ENT-412-x')
    expect(branchOf('project/p1', { identifier: 'CEB-79', branch: null })).toBe('project/p1--ceb-79')
    const issues = [{ id: 'a', identifier: 'CEB-79', sortOrder: 0, branch: 'feature/ENT-412-x' }, { id: 'b', identifier: 'CEB-80', sortOrder: 1 }]
    expect(issueStart('project/p1', issues[1], issues, new Set(['feature/ENT-412-x']))).toBe('feature/ENT-412-x') // stacked on the named one
  })
})

describe('commitRule', () => {
  const rule = commitRule({ commit_format: '{type}({ticket}): {subject}' }, { ticket: 'CEB-79', id: 'CEB-79' })
  it('tells the builder the format with the ticket filled in', () => expect(rule.format).toBe('{type}(CEB-79): {subject}'))
  it('holds a first line to it', () => {
    expect(commitOk('feat(CEB-79): export the audit log', rule.pattern!)).toBe(true)
    expect(commitOk('feat(CEB-84): export the audit log', rule.pattern!)).toBe(false) // the sub-task's number, as on CEB-79
    expect(commitOk('export the audit log', rule.pattern!)).toBe(false)
    expect(commitOk('Merge branch \'main\' into x', rule.pattern!)).toBe(true)
  })
  it('is nothing when the app has no format', () => expect(commitRule({}, { id: 'CEB-79' })).toEqual({ format: null, pattern: null }))
  it('takes a format with characters a pattern would read', () => {
    const r = commitRule({ commit_format: '[{ticket}] {subject}' }, { id: 'HG-1' })
    expect(commitOk('[HG-1] add a thing', r.pattern!)).toBe(true)
    expect(commitOk('HG-1 add a thing', r.pattern!)).toBe(false)
  })
})

describe('the builder is told', () => {
  const base = { subIssue: { id: 's', identifier: 'CEB-84', title: 't', brief: null }, issue: { identifier: 'CEB-79', title: 't', brief: null } }
  it('the format, the ticket, and that the sub-task\'s number is ours', () => {
    const line = commitLine({ ...base, ticket: 'CEB-79', commitFormat: '{type}(CEB-79): {subject}', hooksPath: '/x' })
    expect(line).toContain('`{type}(CEB-79): {subject}`'); expect(line).toContain('The ticket is CEB-79'); expect(line).toContain('CEB-84 is a number of ours'); expect(line).toContain('is refused')
  })
  it('the ticket even with no format', () => expect(commitLine({ ...base, ticket: 'ENT-412' })).toContain('it is ENT-412'))
})

describe('installCommitCheck', () => {
  it('refuses a commit outside the format as it is made, lets one in it through, and still runs the repository\'s own hooks', async () => {
    const repo = await mkdtemp(join(tmpdir(), 'se-conv-'))
    await git(repo, ['init', '-q', '-b', 'main'])
    await mkdir(join(repo, '.git', 'hooks'), { recursive: true })
    await writeFile(join(repo, '.git', 'hooks', 'commit-msg'), `#!/bin/sh\necho ran >> "${repo}/.git/theirs"\n`); await chmod(join(repo, '.git', 'hooks', 'commit-msg'), 0o755)
    await writeFile(join(repo, '.git', 'hooks', 'pre-commit'), `#!/bin/sh\necho ran >> "${repo}/.git/pre"\n`); await chmod(join(repo, '.git', 'hooks', 'pre-commit'), 0o755)
    const rule = commitRule({ commit_format: '{type}({ticket}): {subject}' }, { id: 'CEB-79' })
    const env = hookEnv(await installCommitCheck(repo, { pattern: rule.pattern!, format: rule.format }), { ...process.env, ...who })
    const commit = (m: string) => run('git', ['commit', '-q', '--allow-empty', '-m', m], { cwd: repo, env }).then(() => null, (e: { stderr: string }) => e.stderr)
    const refused = await commit('feat(CEB-84): the wrong ticket')
    expect(refused).toContain('refused'); expect(refused).toContain('{type}(CEB-79): {subject}')
    expect(await commit('feat(CEB-79): the right one')).toBeNull()
    expect((await git(repo, ['log', '--format=%s'])).stdout).toBe('feat(CEB-79): the right one')
    const { readFile } = await import('node:fs/promises')
    expect((await readFile(join(repo, '.git', 'theirs'), 'utf8')).trim()).toBe('ran') // theirs ran for the commit ours let through, not the refused one
    expect((await readFile(join(repo, '.git', 'pre'), 'utf8')).trim().split('\n').length).toBe(2)
    expect((await git(repo, ['config', '--get', 'core.hooksPath'], { allowFail: true })).stdout).toBe('') // the repository's config is untouched
  })
})
