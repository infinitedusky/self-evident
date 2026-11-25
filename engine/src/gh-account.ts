/**
 * Which GitHub account an Evident acts as, when the computer is signed in to more than one (Sandy, 2026-11-25: on a
 * computer whose active `gh` account is an employer's, `pnpm arrive` could not clone the shared Evident's state
 * repository: "Repository not found").
 *
 * `gh`, and git over https through gh's credential helper, use the active account; there is one per computer. Two
 * Evidents on one computer (instance.ts) need two: this computer's own works on an employer's repositories, the
 * shared one on the person's. GH_TOKEN in a process's environment is what `gh` and its credential helper use before
 * the active account, and every `gh` and `git` the engine runs is its child. So the account is chosen once, when the
 * process starts, and nothing is switched for anyone else:
 *
 * - GH_ACCOUNT names it (a `gh` account signed in on this computer). Not a secret; Doppler or the environment.
 * - With none named, the owner of the state repository (STATE_REPO) is tried: the shared Evident's own account.
 * - GH_TOKEN already set is left alone. An account `gh` is not signed in to changes nothing, and is said.
 */
import { execFileSync } from 'node:child_process'

/** `owner` of a GitHub address: https://github.com/owner/name(.git), or git@host:owner/name.git. */
export function ownerOf(remote: string | undefined): string | null {
  const m = remote?.trim().match(/^(?:https?:\/\/[^/]+\/|[^@\s]+@[^:\s]+:)([^/\s]+)\/[^/\s]+?(?:\.git)?\/?$/)
  return m ? m[1] : null
}

type TokenOf = (account: string) => string | null
const fromGh: TokenOf = (account) => { try { return execFileSync('gh', ['auth', 'token', '--user', account], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim() || null } catch { return null } }

/** Choose the account for this process. Returns what it did, in a line for the log; null when there was nothing to do. */
export function useGhAccount(env: NodeJS.ProcessEnv = process.env, tokenOf: TokenOf = fromGh): string | null {
  if (env.GH_TOKEN) return null
  const named = env.GH_ACCOUNT?.trim() || null, account = named ?? ownerOf(env.STATE_REPO)
  if (!account) return null
  const token = tokenOf(account)
  if (!token) return named ? `GH_ACCOUNT is ${named}, and gh is not signed in as ${named} on this computer (gh auth login): the active account is used` : null
  env.GH_TOKEN = token
  return `GitHub: acting as ${account}${named ? '' : ' (the state repository\'s owner; GH_ACCOUNT names another)'}`
}
