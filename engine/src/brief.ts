/**
 * What a task's brief is, and how long. A brief says what to build and why, for the person who approves it (Sandy,
 * 2026-11-14: "a brief used to be literally brief, and it was the thing … we want to build. How to build it … is a
 * question for the architecture and the planner"; "we need less text so that people can actually consume it"). The
 * how is the ADR's and the plan's; how we will know it is done is the acceptance criteria, a list of their own.
 *
 * The size is held, not asked for: an agent cannot save a task's brief that is over the limit. A person can write what
 * they like, and the page tells them when it has grown. A sub-task's brief is another thing (the builder's
 * instructions, written by the planner for an agent) and has no limit.
 */
export const BRIEF_WORDS = 200
/** How far over an agent may go before it is refused: a brief of 205 words is not worth a round trip. */
export const BRIEF_HARD = 250

export const briefWords = (text: string | null | undefined) => (text?.trim() ? text.trim().split(/\s+/).length : 0)

/** The form, as told to every agent that writes one. */
export const BRIEF_FORM = `A task's brief is for the person who approves it, and is short enough that they read every word: at most ${BRIEF_WORDS} words, in three parts. **What**: what will exist or be different when this is done, in plain words. **Why**: the problem it solves, or who it is for. **Not in this task**: what someone might expect and will not get. No file names, functions, tables, libraries, steps or instructions to a builder: how it is built belongs to the ADR and the plan, which are made from the brief, and how we will know it is done is the acceptance criteria, a list of their own (set_acceptance). If it will not fit in ${BRIEF_WORDS} words, the task is two tasks or the brief is saying how.`

/** Why an agent's brief was refused, or null when it is fine. */
export function briefTooLong(text: string | null | undefined): string | null {
  const n = briefWords(text)
  return n > BRIEF_HARD ? `this brief is ${n} words. ${BRIEF_FORM}` : null
}
