/**
 * The engine's own Doppler scope stays the engine's (Sandy, 2026-11-15: a Homework Gate prototype would not start,
 * "HG_SECRET is not set"). The engine is started with `doppler run`, which puts DOPPLER_PROJECT, DOPPLER_CONFIG and
 * DOPPLER_ENVIRONMENT in its environment. Everything the engine starts inherits them (a prototype's server, a guide's
 * command, a Storybook, an agent and what it runs), and the Doppler CLI obeys them over the folder it is run in. So
 * an app's own `doppler run --` quietly read Evident's secrets in place of the app's.
 *
 * Imported first by the server: the names are gone before anything is started. The engine never calls Doppler
 * itself; its own secrets were already read into its environment.
 */
export const OWN_SCOPE = ['DOPPLER_PROJECT', 'DOPPLER_CONFIG', 'DOPPLER_ENVIRONMENT']

/** Takes the engine's own Doppler scope out of an environment; returns the names it removed. */
export function dropOwnScope(env: Record<string, string | undefined> = process.env): string[] {
  const gone = OWN_SCOPE.filter((k) => k in env)
  for (const k of gone) delete env[k]
  return gone
}

dropOwnScope()
