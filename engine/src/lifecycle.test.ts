/**
 * The house configuration: the repo's facts read without failing, every blank in the seeds answered, the files
 * written only where they are Self Evident's, the block placed once.
 */
import { describe, expect, it } from 'vitest'
import { BEGIN, dropSections, END, FILL, houseConfig, OWNED, pathFilters, repoFacts, writeHouse, type Facts } from './lifecycle.js'
import type { Run, TktContext } from './tkt.js'

const ctx: TktContext = { app: { id: 'app_x1', key: 'RG', name: 'Ragdoll Golf', defaultBranch: 'main' }, repoPath: '/code/ragdoll-golf', engineUrl: 'http://localhost:4000/api', uiUrl: 'https://idea.dawn' }
const root = '/code/ragdoll-golf'

/** A checkout as git, gh and the files see it; `files` are relative paths. */
const checkout = (files: Record<string, string>, o: { remote?: string | null; gh?: string | null; head?: string } = {}) => {
  const remote = o.remote === undefined ? 'https://github.com/infinitedusky/ragdoll-golf.git' : o.remote
  const gh = o.gh === undefined ? JSON.stringify({ defaultBranchRef: { name: 'main' }, mergeCommitAllowed: true, squashMergeAllowed: true, pullRequestTemplates: [] }) : o.gh
  const cmds: string[] = []
  const run: Run = async (file, args) => {
    cmds.push([file, ...args].join(' '))
    const a = args.join(' ')
    if (file === 'git' && a === 'ls-files --cached --others --exclude-standard') return { stdout: Object.keys(files).join('\n'), stderr: '' }
    if (file === 'git' && a === 'remote') return { stdout: remote ? 'origin' : '', stderr: '' }
    if (file === 'git' && a === 'remote get-url origin' && remote) return { stdout: remote, stderr: '' }
    if (file === 'git' && a.startsWith('symbolic-ref')) { if (o.head) return { stdout: o.head, stderr: '' }; throw new Error('not a symbolic ref') }
    if (file === 'gh') { if (gh === null) throw new Error('gh: not logged in'); return { stdout: gh, stderr: '' } }
    throw new Error(`unexpected ${file} ${a}`)
  }
  const read = async (p: string) => { const rel = p.startsWith(`${root}/`) ? p.slice(root.length + 1) : p; if (rel in files) return files[rel]; throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' }) }
  return { run, read, cmds }
}

const noFill = (t: string) => expect(t.match(FILL) ?? []).toEqual([])

describe('the repo\'s facts', () => {
  it('reads the forge from git and gh, the tools from the files, and the block\'s home from CLAUDE.md', async () => {
    const c = checkout({
      'package.json': JSON.stringify({ scripts: { lint: 'eslint .', typecheck: 'tsc -b', test: 'vitest run', format: 'prettier -w .' }, devDependencies: { vitest: '^3' } }),
      'pnpm-lock.yaml': '', 'pnpm-workspace.yaml': 'packages:\n  - engine\n  - app\n  - "tools/*"\n',
      'engine/package.json': JSON.stringify({ name: '@x/engine', scripts: { test: 'vitest run' } }),
      'app/package.json': JSON.stringify({ name: '@x/app', scripts: { test: 'vitest run' } }),
      'tools/one/package.json': JSON.stringify({ name: '@x/one', scripts: {} }),
      '.husky/pre-commit': 'pnpm lint', '.husky/_/h': '', 'CONTEXT.md': '# Terms', 'CLAUDE.md': '# Hi\n\nLots of guidance here.\n\nMore.\n\nAnd more.\n',
      '.github/workflows/ci.yml': 'on:\n  pull_request:\n    paths:\n      - "engine/**"\n      - app/**\n  push:\n', '.github/workflows/docs.yml': 'on:\n  push:\n',
      '.github/PULL_REQUEST_TEMPLATE.md': '## Summary\n',
    }, { gh: JSON.stringify({ defaultBranchRef: { name: 'trunk' }, mergeCommitAllowed: false, squashMergeAllowed: true, pullRequestTemplates: [{ filename: 'PULL_REQUEST_TEMPLATE.md' }] }) })
    const f = await repoFacts(root, 'main', c)
    expect(f).toMatchObject({ dir: 'ragdoll-golf', remote: { name: 'origin', host: 'github.com', fullName: 'infinitedusky/ragdoll-golf' }, base: 'trunk', mergeStyle: 'squash', prTemplate: '.github/PULL_REQUEST_TEMPLATE.md', pm: 'pnpm', glossary: 'CONTEXT.md', blockFile: 'CLAUDE.md' })
    expect(f.ci).toEqual([{ file: '.github/workflows/ci.yml', paths: ['engine/**', 'app/**'] }])
    expect(f.workspaces.map((w) => w.dir)).toEqual(['engine', 'app', 'tools/one'])
    expect(f.hooks).toMatch(/^husky/); expect(f.deps).toContain('vitest')
  })

  it('falls back when there is no remote, no gh, no package.json, and puts the block where it can', async () => {
    const f = await repoFacts(root, 'develop', checkout({ 'AGENTS.md': '# Agents\n', 'CLAUDE.md': '@AGENTS.md\n' }, { remote: null, gh: null }))
    expect(f).toMatchObject({ remote: null, base: 'develop', mergeStyle: 'merge', prTemplate: null, ci: [], pm: null, scripts: {}, workspaces: [], hooks: null, glossary: 'GLOSSARY.md', blockFile: 'AGENTS.md' })
    expect((await repoFacts(root, undefined, checkout({}, { remote: 'git@github.com:acme/widgets.git', gh: null, head: 'origin/release' }))).remote?.fullName).toBe('acme/widgets')
    expect((await repoFacts(root, undefined, checkout({}, { remote: 'git@github.com:acme/widgets.git', gh: null, head: 'origin/release' }))).base).toBe('release')
    expect((await repoFacts(root, undefined, checkout({}, { gh: null }))).blockFile).toBe('CLAUDE.md') // neither file: CLAUDE.md gets created
  })

  it('reads path filters as list items or inline, and never paths-ignore', () => {
    expect(pathFilters('on:\n  pull_request:\n    paths-ignore:\n      - docs/**\n    paths:\n      - "src/**"\n\n      - \'lib/**\' # core\n    branches: [main]\n')).toEqual(['src/**', 'lib/**'])
    expect(pathFilters('on:\n  pull_request:\n    paths: [a/**, "b/**"]\n')).toEqual(['a/**', 'b/**'])
    expect(pathFilters('on: push\n')).toEqual([])
  })
})

const facts = (over: Partial<Facts> = {}): Facts => ({
  dir: 'ragdoll-golf', remote: { name: 'origin', host: 'github.com', fullName: 'infinitedusky/ragdoll-golf' }, base: 'main', mergeStyle: 'merge', prTemplate: null, ci: [],
  pm: 'npm', scripts: { dev: 'vite', build: 'vite build' }, deps: [], workspaces: [], hooks: null, glossary: 'GLOSSARY.md', blockFile: 'CLAUDE.md', ...over,
})

describe('the house configuration', () => {
  it('answers every blank for a plain GitHub repo: the forge from the facts, the house defaults for the rest', async () => {
    const h = await houseConfig(ctx, facts())
    expect(Object.keys(h.files).sort()).toEqual(['domain.md', 'forge.md', 'pull-request.md', 'workflow.md'])
    for (const t of [...Object.values(h.files), h.block]) noFill(t)
    const forge = h.files['forge.md']
    expect(forge.split('\n')[0]).toBe('<!-- rogs-skills config v1: forge -->')
    expect(forge).toContain('- Kind: GitHub\n- Host: github.com\n- Repository: infinitedusky/ragdoll-golf\n- Remote: origin\n')
    expect(forge).toContain('- Base branch: main; re-read with'); expect(forge).toContain('- Merge style: merge; re-read with')
    expect(forge).toContain('### merge\n'); expect(forge).toContain('- Gate checks: none.'); expect(forge).toContain("this repository has no CI; write 'no CI configured'")
    expect(forge).toContain('- Body format: docs/agents/pull-request.md.'); expect(forge).toContain('`Ticket: [RG-123](https://idea.dawn/tasks/RG-123)`')
    expect(forge).toContain(OWNED); expect(forge).toContain('Ragdoll Golf')
    const wf = h.files['workflow.md']
    expect(wf.match(/\| off \|/g)).toHaveLength(11); expect(wf).not.toMatch(/\| on \|/)
    expect(wf).toContain('Usual location: `../ragdoll-golf-wt/<ticket id>`, beside the primary checkout.')
    expect(wf).toContain('| Format | not configured |\n| Full check | not configured |'); expect(wf).toContain('| ** | not configured |')
    expect(wf).toContain('Hooks: none.'); expect(wf).toContain('Notes: run `npm ci` after a sync that changes the lockfile.')
    expect(h.files['domain.md']).toContain('One context: `GLOSSARY.md` at the repository root.'); expect(h.files['domain.md']).toContain('`docs/adr/`')
    expect(h.files['pull-request.md']).not.toContain('## Screenshots'); expect(h.files['pull-request.md']).not.toContain('## Changelog'); expect(h.files['pull-request.md']).toContain('## Human verification')
    expect(h.block.startsWith(BEGIN)).toBe(true); expect(h.block.trimEnd().endsWith(END)).toBe(true)
    expect(h.block).toContain('`issue-tracker.md` (Self Evident, the app Ragdoll Golf (RG)), `forge.md` (GitHub, infinitedusky/ragdoll-golf)'); expect(h.block).toContain('the features that are on: none')
    expect(h.block).not.toContain('/setup-rogs'); expect(h.skipped).toEqual([])
  })

  it('writes the project\'s own commands: the scripts, the workspaces, CI with its filters, the repo\'s template', async () => {
    const h = await houseConfig(ctx, facts({
      pm: 'pnpm', scripts: { lint: 'eslint .', typecheck: 'tsc', test: 'vitest run', format: 'prettier -w .' }, deps: ['vitest'],
      workspaces: [{ dir: 'engine', name: '@x/engine', scripts: { test: 'vitest run' } }, { dir: 'app', name: '@x/app', scripts: {} }],
      ci: [{ file: '.github/workflows/ci.yml', paths: ['engine/**'] }, { file: '.github/workflows/lint.yml', paths: [] }], prTemplate: '.github/PULL_REQUEST_TEMPLATE.md', hooks: 'husky runs the scripts in .husky/ on commit; a failing hook aborts the commit', mergeStyle: 'squash',
    }))
    const wf = h.files['workflow.md']
    expect(wf).toContain('| Format | pnpm format |\n| Full check | pnpm lint && pnpm typecheck && pnpm test |')
    expect(wf).toContain('| engine/** | pnpm --filter @x/engine test |'); expect(wf).not.toContain('@x/app test')
    expect(wf).toContain('one test: `pnpm vitest run <file>`; a dependency\'s version: `pnpm list <name>` in the package that depends on it')
    expect(wf).toContain('Hooks: husky runs'); expect(wf).toContain('run `pnpm install --frozen-lockfile` after')
    const forge = h.files['forge.md']
    expect(forge).toContain('- Merge style: squash;'); expect(forge).toContain('- Gate checks: every check reported for the head.'); expect(forge).toContain('- No CI: not applicable.')
    expect(forge).toContain('- Path filters: .github/workflows/ci.yml: `engine/**`.'); expect(forge).toContain('- Body format: the template at .github/PULL_REQUEST_TEMPLATE.md on the base branch.')
    expect(h.files['pull-request.md']).toBeUndefined()
  })

  it('skips the forge without a remote, or on a forge it does not know, and says why', async () => {
    const none = await houseConfig(ctx, facts({ remote: null }))
    expect(none.files['forge.md']).toBeUndefined(); expect(none.skipped[0]).toMatch(/no git remote/); expect(none.block).toContain('`forge.md` (no forge yet)')
    const lab = await houseConfig(ctx, facts({ remote: { name: 'origin', host: 'gitlab.com', fullName: 'rogs/tkt' } }))
    expect(lab.files['forge.md']).toBeUndefined(); expect(lab.skipped[0]).toMatch(/gitlab\.com isn't a forge Self Evident writes yet/)
  })

  it('drops whole sections and nothing else', () => {
    expect(dropSections('## A\n\na\n\n## B\n\nb\n\n## C\n\nc\n', ['B'])).toBe('## A\n\na\n\n## C\n\nc\n')
  })
})

describe('writing it into the checkout', () => {
  const fs = (map: Record<string, string>) => {
    const w = { ...map }
    return { w, read: async (p: string) => { if (p in w) return w[p]; throw Object.assign(new Error(`ENOENT ${p}`), { code: 'ENOENT' }) }, write: async (p: string, t: string) => { w[p] = t } }
  }
  it('writes new files and its own, leaves the person\'s alone, and starts CLAUDE.md when there is none', async () => {
    const h = await houseConfig(ctx, facts())
    const f = fs({ [`${root}/docs/agents/workflow.md`]: '<!-- rogs-skills config v1: workflow -->\n# Workflow\n\nHand-written.\n' })
    const r = await writeHouse(root, 'Ragdoll Golf', h, f)
    expect(r.wrote).toEqual(['docs/agents/forge.md', 'docs/agents/domain.md', 'docs/agents/pull-request.md']); expect(r.kept).toEqual(['docs/agents/workflow.md'])
    expect(r.paths).toEqual([...r.wrote, 'CLAUDE.md']); expect(r.blockChanged).toBe(true)
    expect(f.w[`${root}/docs/agents/pull-request.md`].split('\n')[1]).toMatch(/^<!-- Self Evident wrote it for the app Ragdoll Golf: .* -->$/)
    expect((await writeHouse(root, 'Ragdoll Golf', h, f))).toMatchObject({ wrote: [], blockChanged: false, paths: r.paths }) // again: nothing changed, everything still to commit
    expect(f.w[`${root}/docs/agents/workflow.md`]).toContain('Hand-written.')
    expect(f.w[`${root}/CLAUDE.md`]).toBe(`# Ragdoll Golf\n\n${h.block.trimEnd()}\n`)
  })
  it('replaces the block in place and appends it to a file without one', async () => {
    const h = await houseConfig(ctx, facts())
    const f = fs({ [`${root}/CLAUDE.md`]: `# App\n\nAbove.\n\n${BEGIN}\nold block\n${END}\n\nBelow.\n` })
    await writeHouse(root, 'Ragdoll Golf', h, f)
    expect(f.w[`${root}/CLAUDE.md`]).toBe(`# App\n\nAbove.\n\n${h.block.trimEnd()}\n\nBelow.\n`)
    const g = fs({ [`${root}/CLAUDE.md`]: '# App\n\nGuidance.\n' })
    await writeHouse(root, 'Ragdoll Golf', h, g)
    expect(g.w[`${root}/CLAUDE.md`]).toBe(`# App\n\nGuidance.\n\n${h.block.trimEnd()}\n`)
    await writeHouse(root, 'Ragdoll Golf', h, g) // again: the same bytes, nothing doubled
    expect(g.w[`${root}/CLAUDE.md`].split(BEGIN)).toHaveLength(2)
  })
})
