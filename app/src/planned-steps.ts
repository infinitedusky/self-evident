/** The steps in a sub-task's brief, as the planner wrote them: "### Steps", numbered, each with its technical note under it. */
export function plannedSteps(brief: string | null | undefined): { text: string; technical: string }[] {
  const section = brief?.split(/^### Steps\s*$/m)[1]?.split(/^(?:### |\*\*Done when)/m)[0] ?? ''
  const steps: { text: string; technical: string }[] = []
  for (const line of section.split('\n')) {
    const item = line.match(/^\d+\.\s+(.*)/)
    if (item) steps.push({ text: item[1], technical: '' })
    else if (steps.length && /^\s+-\s+/.test(line)) steps[steps.length - 1].technical = line.replace(/^\s+-\s+/, '')
  }
  return steps
}
