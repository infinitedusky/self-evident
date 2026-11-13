/** A unified diff (git's) as rows to draw: each line with its number before and after, so a line of the file as it is now can be found in it. */
export interface DiffRow { kind: 'hunk' | 'add' | 'del' | 'ctx'; text: string; old?: number; now?: number }

export function parsePatch(patch: string): DiffRow[] {
  const rows: DiffRow[] = []
  let old = 0, now = 0, inHunk = false
  for (const line of patch.replace(/\n$/, '').split('\n')) {
    const h = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/.exec(line)
    if (h) { old = Number(h[1]); now = Number(h[2]); inHunk = true; rows.push({ kind: 'hunk', text: line }); continue }
    if (!inHunk || line.startsWith('\\')) continue // the header before the first hunk, and "\ No newline at end of file"
    if (line.startsWith('+')) rows.push({ kind: 'add', text: line.slice(1), now: now++ })
    else if (line.startsWith('-')) rows.push({ kind: 'del', text: line.slice(1), old: old++ })
    else rows.push({ kind: 'ctx', text: line.slice(1), old: old++, now: now++ })
  }
  return rows
}

export const inLines = (n: number | undefined, lines?: { from: number; to: number }[]) => n != null && !!lines?.some((l) => n >= l.from && n <= l.to)
