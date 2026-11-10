<!-- rogs-skills config v1: domain -->
# Domain docs

How skills read this project's domain language and recorded decisions. Self Evident wrote it for the app {{FILL: the app's name}}: Set up what's missing under Integrations › tkt writes it again from the app and the repository, and leaves it alone once this line is gone.

## Glossary

{{FILL: "One context: `GLOSSARY.md` at the repository root." or "Several contexts: `GLOSSARY-MAP.md` at the repository root lists each context and where its glossary lives." Use the existing file names when the repository keeps its glossary under another name.}}

## ADRs

{{FILL: "`docs/adr/`", plus any context-level ADR directories}}

## Consumer rules

- Before exploring an area, read the glossary and the ADRs that touch it. When a file does not exist yet, proceed silently: it is created when a term or a decision is first resolved.
- Name domain concepts with the glossary's terms, in ticket titles, plans, test names and commit messages, and avoid the synonyms it lists under `_Avoid_`. A concept the glossary lacks is either language the project does not use or a gap worth noting.
- When your output contradicts an ADR, say so instead of overriding it: "Contradicts ADR-0007 (event-sourced orders), but worth reopening because ...".

## Recording decisions

Record an ADR only when all three hold: the decision is hard to reverse, it would surprise a reader without context, and it came from a real trade-off between genuine alternatives. Architectural shape, integration patterns, technology choices with lock-in, boundary and scope decisions, deliberate deviations from the obvious path, and constraints that the code does not show all qualify. A choice that is easy to reverse or obvious does not.

Write it as `NNNN-slug.md` in the ADR directory, numbered one above the highest existing number:

```md
# {Short title of the decision}

{1-3 sentences: what's the context, what did we decide, and why.}
```

Add `Status` frontmatter (`proposed | accepted | deprecated | superseded by ADR-NNNN`), considered options, or consequences only when they add real value.
